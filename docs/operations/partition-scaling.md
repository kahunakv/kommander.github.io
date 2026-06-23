# Partition Scaling

Kommander is designed for clusters with many partitions where only a smaller set is active at any moment.

Two runtime features make that practical:

- a shared executor pool so every partition does not need its own operating-system thread
- hot-set leader checks so idle partitions do not receive high-frequency `CheckLeader` ticks.

These features are separate from elastic partition APIs. Elastic partitions change the partition map. Partition scaling controls the CPU and thread cost of keeping many partitions resident.

## Why This Matters

Each user partition is a serial Raft state machine. Work for one partition must run one operation at a time and in order.

The simple implementation is one thread per partition, but that becomes expensive quickly. A cluster with thousands of mostly idle partitions should not need thousands of parked threads or thousands of timer wakeups every few hundred milliseconds.

With the shared executor pool enabled, idle partitions keep their state but do not own dedicated worker threads. Active partitions raise their hand when they have work, a bounded pool drains a slice of work, and the worker moves on to another ready partition.

## Shared Executor Pool

`RaftPartitionExecutor` still owns the queues and serial execution for one partition. The change is how the queued work is drained.

With `EnableSharedExecutorPool = true`, all partition executors share a fixed pool of worker threads:

1. a producer posts work to a partition executor
2. the executor marks itself runnable and enters the global ready queue
3. one pool worker acquires that partition's run-lock
4. the worker drains a bounded quantum of control, replication, client, and maintenance work
5. if more work remains, the partition is requeued.

The important guarantee is unchanged: no two workers drain the same partition concurrently. That single-owner rule lets the Raft state machine stay serial and avoid application-visible concurrency surprises inside one partition.

## Hot-Set Leader Checks

Kommander periodically runs `CheckLeader` to send heartbeats, notice missing leaders, and start elections.

When the shared executor pool is enabled, Kommander avoids posting this fast timer work to every user partition on every tick. Instead:

- partition `0`, the system partition, is always checked
- active user partitions are checked on every `CheckLeaderInterval`
- idle quiesced partitions are skipped on the fast cycle
- a full safety sweep checks all partitions every `UpdateNodesInterval`.

With the defaults, `CheckLeaderInterval` is `250 ms` and `UpdateNodesInterval` is `5 s`, so the fast cycle runs four times per second and the full sweep runs about every five seconds.

## Relationship To Quiescence

Partition scaling and partition quiescence solve different parts of the same many-partition problem.

| Feature | Reduces | How |
| --- | --- | --- |
| Shared executor pool | Thread and scheduler cost | Many partitions share a bounded worker pool instead of one thread each. |
| Hot-set leader checks | Timer wakeups and CPU overhead | Only active partitions receive fast `CheckLeader` ticks. |
| Partition quiescence | Network heartbeat traffic | Idle leaders stop sending per-partition heartbeats and followers rely on SWIM node liveness. |

Hot-set membership follows quiescence state. When a partition quiesces, it leaves the hot set. When a write, append, vote, or relevant failure signal wakes it, it returns to the hot set.

See [Partition Quiescence](../guides/partition-quiescence.md) for the network side.

## Failover For Quiet Partitions

Skipping fast ticks for idle partitions does not mean quiet partitions are forgotten.

Kommander has two wake paths:

- SWIM marks the leader node `Suspect` or `Dead`, and partitions that believed that node was leader are returned to the hot set
- the periodic full safety sweep checks every partition as a backstop.

In normal operation, quiet-partition failover is tied to SWIM detection rather than waiting only for the slower sweep.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `EnableSharedExecutorPool` | `true` | Enables the shared partition executor pool and hot-set `CheckLeader` optimization. Set to `false` only when isolating scheduler behavior or intentionally returning to one thread per partition. |
| `PartitionExecutorPoolSize` | `0` | Worker count for the shared executor pool. `0` means `Environment.ProcessorCount`. Values below `0` are clamped to `1`. |
| `CheckLeaderInterval` | `250 ms` | Fast leader-check cadence for the system partition and hot user partitions. |
| `UpdateNodesInterval` | `5000 ms` | Membership refresh cadence and the approximate full safety-sweep cadence for checking all partitions. |
| `EnableQuiescence` | `true` | Lets idle partitions leave the hot set and suppress per-partition heartbeats. |
| `QuiesceAfter` | `1500 ms` | Idle time before a partition can quiesce. |

There is no separate hot-set interval setting. The fast and slow cadence comes from `CheckLeaderInterval` and `UpdateNodesInterval`.

## Sizing The Pool

Start with the default `PartitionExecutorPoolSize = 0`, which uses the machine's processor count.

The pool size should track how many partitions are actively doing CPU-side Raft work at the same time, not the total partition count. Ten thousand idle partitions do not need ten thousand executor threads.

Use these signals when tuning:

- raise `PartitionExecutorPoolSize` only if operation latency rises while CPU is not saturated
- leave it alone when CPU is saturated because more threads will mainly add context switching
- tune `WriteIOThreads` when WAL writes are the bottleneck
- do not set the pool size to the partition count because that recreates the thread-per-partition cost.

WAL fsync work is handled by the WAL scheduler and its write I/O threads. Partition executor workers should spend most of their time on state-machine scheduling and callbacks, not parked on disk.

## What This Does Not Change

Partition scaling does not change Raft safety rules, quorum math, log format, terms, or commit behavior.

It also does not unload partition metadata or close per-partition WAL handles. Kommander keeps resident partitions in memory, and WAL adapters handle storage through their own shared or sharded structures. The optimization is about threads, scheduling, periodic checks, and idle overhead.

## Operational Notes

- Keep `EnableSharedExecutorPool = true` for large partition counts.
- Watch partition queue depths, scheduler queue depths, and operation latency when sizing the pool.
- Control-plane work keeps priority over client work inside each executor drain cycle.
- A stopped or removed partition is evicted from the hot set as part of the partition lifecycle.
- If SWIM is disabled, also disable quiescence so quiet partitions do not depend on unavailable node-liveness signals.

## Related Reading

- [Partition Quiescence](../guides/partition-quiescence.md)
- [SWIM Failure Detection](../guides/swim-failure-detection.md)
- [Scheduler Internals](../internals/scheduler.md)
- [Metrics And Diagnostics](../internals/metrics-and-diagnostics.md)
- [Configuration](../reference/configuration.md)
