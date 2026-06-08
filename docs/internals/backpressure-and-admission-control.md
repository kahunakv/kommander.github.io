# Backpressure And Admission Control

Kommander uses several layers of backpressure and admission control to keep one hot partition or a burst of client traffic from overwhelming the runtime.

The goal is simple: preserve Raft correctness work first, then bound memory growth for lower-priority work.

## Why This Exists

Without admission control, a leader could keep accepting more client proposals than its partition executor or WAL scheduler can safely drain. That would let memory usage grow without bound and could delay heartbeats, vote handling, append completions, and other control-plane work that Raft needs to stay healthy.

Kommander addresses that in three places:

1. the partition executor admission gate for client proposals,
2. the WAL write scheduler queue limits,
3. the read scheduler queue limits.

## Layer 1: Client Proposal Admission

The first gate is inside `RaftPartitionExecutor`.

Each partition executor has four work classes:

- control,
- replication,
- client,
- maintenance.

Only the client queue is admission-limited. Control, replication, and maintenance work remain structurally separate so client traffic cannot starve Raft protocol traffic.

The main configuration knob is:

- `MaxQueuedClientProposalsPerPartition`

When a client request such as `ReplicateLogs` enters the executor, the executor atomically reserves a client slot. If the post-increment depth exceeds the configured limit, the slot is released immediately and the request is rejected with `RaftOperationStatus.ProposalQueueFull`.

That means Kommander prefers fast rejection over silent queue growth.

## How Rejection Surfaces

For application callers, a full per-partition client queue appears as:

- `RaftOperationStatus.ProposalQueueFull`

The expected response is to back off and retry after a delay. This is an overload signal, not a permanent partition failure.

## Layer 2: WAL Scheduler Backpressure

Passing the executor admission gate does not guarantee the proposal can be persisted immediately. WAL work is handled by `FairWalScheduler`, which has its own bounded queues.

Relevant configuration:

- `MaxWalQueueDepthPerPartition`
- `MaxGlobalWalQueueDepth`
- `MaxWalBatchSize`

`FairWalScheduler` enforces:

- a per-partition pending-write depth limit,
- an optional global pending-write depth limit across all partitions,
- FIFO write order within each partition,
- fair rotation across active partitions,
- batching of compatible writes up to `MaxWalBatchSize`.

If the scheduler cannot accept more write work, it throws `BackpressureExceededException`.

The Raft state machine and WAL code are written to treat that as a real admission failure. Mutable proposal state is snapshotted before WAL enqueue, so if the enqueue fails, the code restores the original log metadata instead of leaving half-mutated in-memory state behind.

## Layer 3: Read Scheduler Backpressure

`FairReadScheduler` also has bounded per-partition queues.

If too many reads are already queued for one partition, the scheduler throws:

- `ReadBackpressureExceededException`

This is currently an internal scheduler guard, not a user-facing `RaftConfiguration` field. The scheduler uses its own per-partition default limit.

This matters because reads such as restore, range reads, and compaction bookkeeping still consume bounded resources. Kommander does not assume reads are free.

## Fairness And Drain Quanta

Admission control works together with weighted draining in `RaftPartitionExecutor`.

The executor drains work in this priority order:

1. control,
2. replication,
3. client,
4. maintenance.

Recent configuration fields let you tune how many operations each class drains per wake cycle:

- `MaxDrainQuantumControl`
- `MaxDrainQuantumReplication`
- `MaxDrainQuantumClient`
- `MaxDrainQuantumMaintenance`

These settings do not replace admission control. They control how accepted work is scheduled after it is already in the executor.

In practice:

- higher control and replication quanta help heartbeats and append processing stay ahead of client floods,
- a lower client quantum helps prevent proposal bursts from delaying follower catch-up,
- maintenance stays lowest priority so normal consensus traffic keeps moving.

## Typical Flow Under Load

When a partition gets hot, Kommander pushes back in stages:

1. If too many client proposals are already waiting in the partition executor, new proposals are rejected with `ProposalQueueFull`.
2. If proposals reach the WAL path but the WAL scheduler is saturated, WAL enqueue can fail with backpressure.
3. If the system is doing too much synchronous WAL read work for one partition, the read scheduler can reject more reads for that partition.

This layered design is deliberate. It stops overload near the source when possible, but still protects deeper subsystems if earlier gates are not enough.

## Operational Guidance

- Leave the defaults in place unless you have measured a real problem.
- Treat `ProposalQueueFull` as a normal overload signal and retry with backoff.
- Do not disable queue limits casually. Setting proposal or WAL depth limits to unbounded values removes an important safety valve.
- If you increase queue depths, verify that heartbeat latency and election behavior remain healthy under load.

## Related Settings

For the tunable fields, see [Configuration](../reference/configuration.md).

For scheduler structure, see [Scheduler Internals](scheduler.md).
