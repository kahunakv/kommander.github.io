# Metrics And Diagnostics

Kommander gives runtime diagnostics through two channels:

- metrics from the `Kommander` .NET `Meter`
- structured logs from the Raft runtime.

Together, the two channels answer practical questions:

- Why is a proposal slow?
- Is a partition overloaded?
- Does the scheduler keep its fairness under load?
- Does leadership churn cause stale completions or elections?

## Meter Name

Kommander publishes metrics through the .NET `Meter` with this name:

```text
Kommander
```

Each OpenTelemetry consumer or `MeterListener` consumer must subscribe to that meter name.

## What Is Tracked

The current code exports these core signals.

### Partition Queue Depth

Observable gauge:

- `raft.executor.client_queue_depth`

This gauge reports the current depth of the client proposal queue for each partition executor. The tag is:

- `partition_id`

This is the primary queue-depth metric that `KommanderMetrics` exports directly.

## Operation Throughput And Latency

Counters:

- `raft.executor.operations_total`
- `raft.executor.rejections_total`

Histogram:

- `raft.executor.operation_duration_ms`

The tags are:

- `partition_id`
- `operation_class`

`operation_class` is equivalent to the work classes of the executor:

- `Control`
- `Replication`
- `Client`
- `Maintenance`

Examine these signals first when an operation feels slow. A rise in `Client` latency with healthy `Control` and `Replication` latency shows that the system keeps the Raft priority correctly. A rise in control-plane latency usually shows deeper scheduler pressure or storage pressure.

## WAL Batch Metrics And Throughput

The WAL is the write-ahead log. It is the durable store for Raft log entries.

Counters:

- `raft.wal.batches_total`
- `raft.wal.operations_total`
- `raft.wal.compaction_passes_total`
- `raft.wal.compaction_blocked_by_durability_floor_total`

Histogram:

- `raft.wal.batch_size`
- `raft.wal.durability_floor_lag`

Observable gauge:

- `raft.wal.queue_depth`, with the tag `partition_id`

`raft.wal.queue_depth` reports the pending or in-flight WAL operations for each partition. A constant rise with flat replicated-log throughput shows WAL saturation or fsync saturation. An fsync is a durable flush to disk. `IRaft.GetPartitionWalQueueDepth` gives the same advisory value.

`raft.wal.batches_total` increments one time for each scheduler group write. One group write can cover more than one partition.

`raft.wal.batch_size` records the number of WAL write operations that the scheduler drains for each partition inside that group write. It is a per-partition distribution of the batch size. It is not the number of partitions in the group.

These signals validate the fairness of the scheduler and the efficiency of the batches under load:

- Very small batches can mean poor batch opportunities or low traffic.
- Large batches at all times can mean good amortization.
- Large batches together with a rise in latency can mean that the system absorbs bursts. The system then pays for them in the delay of each flush.
- A rise in `raft.wal.operations_total` that is faster than the rise in `raft.wal.batches_total` usually means that the batches reduce the storage calls.

For WAL durability tuning, `FairWalScheduler` also keeps internal counters such as `TotalBatchesWritten`, `TotalSyncBatchesWritten`, and `TotalPartitionsBatched`. Use them for two checks. The first check shows if `WalSingleFsyncCommit` reduces true sync batches. The second check shows if `WalGroupCommitLingerMs` increases the partitions in each group write.

Compaction metrics tell you why the WAL shrinks or does not shrink:

- `raft.wal.compaction_passes_total` has the tags `partition_id` and `outcome`.
- `outcome=no_checkpoint` means that no checkpoint exists yet. Therefore, there is no compaction boundary.
- `outcome=floor_not_positive` means that the retention floors left nothing to remove.
- `outcome=effective` means that the pass reached the WAL adapter.
- `outcome=failed` means that the pass failed.
- `raft.wal.durability_floor_lag` records the gap between the application durability floor and the last checkpoint. It applies only with a configured `ApplicationDurabilityProvider`.
- `raft.wal.compaction_blocked_by_durability_floor_total` increments when the application durability floor keeps entries that are otherwise removable.

Storage can continue to grow with compaction configured. These metrics then separate three causes: no checkpoint was written, the application durability floor keeps the tail on purpose, or the compaction failed.

## Snapshot And Backfill Diagnostics

Counter:

- `raft.snapshot.transfer_failures_total`

The tags are `partition_id` and the failure `cause`. A constant rate usually means that a follower is below the compaction floor and the snapshot install cannot complete.

The public API also gives point-in-time diagnostic views:

```csharp
IReadOnlyList<RaftSnapshotStatus> snapshotStatuses =
    raft.GetSnapshotStatuses(partitionId);

IReadOnlyList<RaftBackfillStatus> backfillStatuses =
    raft.GetBackfillStatuses(partitionId);
```

Use `GetSnapshotStatuses` to identify the follower with an in-flight snapshot transfer or a transfer that fails again and again. Use `GetBackfillStatuses` when the leader refuses an anchored backfill. The leader refuses it when it cannot read a committed entry at the anchor of the follower.

`GetStaleProposedSkippedCount(partitionId)` reports the number of stale proposed duplicates that this node refused. The count starts at the last start of the hosted partition. The method returns `-1` when the node does not host the partition. A value above zero is diagnostic, but it is not always a problem. Duplicates occur when an old leader continues to broadcast in-flight proposals. They also occur when a retry races a commit.

## Stale Completion Drops

Counter:

- `raft.stale_completions_total`

This counter counts the WAL completions that the runtime discarded because they were stale. The causes are:

- wrong partition
- wrong term
- mismatched operation id.

A constant rise usually points to leadership churn, delayed completions, or retries that arrive after the partition moved on.

## Elections And Heartbeats

Counters:

- `raft.elections_started_total`
- `raft.heartbeats_sent_total`

Histogram:

- `raft.heartbeat_delay_ms`
- `raft.election_delay_ms`

`raft.heartbeat_delay_ms` records the interval between two consecutive heartbeats from a leader partition. High values can show scheduler pressure or CPU starvation.

`raft.election_delay_ms` records the time from the last received heartbeat to the start of an election.

You can also correlate heartbeat behavior through these sources:

- `raft.heartbeats_sent_total`
- `raft.heartbeat_delay_ms`
- `raft.election_delay_ms`
- slow-dispatch logs
- latency patterns of proposals and appends.

## Leader Balancing

Kommander exports these metrics when you enable the automatic leader balancer.

Counters:

- `raft.balancer.moves_total`, with the tag `outcome=planned`, `succeeded`, or `timed_out`
- `raft.balancer.skipped_passes_total`

Observable gauges:

- `raft.balancer.count_imbalance`
- `raft.balancer.load_imbalance`

Planned moves, then successful moves, then a fall in the imbalance gauges show normal convergence. Frequent timeouts have two usual causes. Nodes reject the suggestions, or `SuggestionTimeout` is too short for the transfer and the gossip propagation. Frequent skipped passes mean that the system-partition leader has no fresh report from a minimum of one live voter.

The imbalance gauges have a meaning on the process that hosts the system-partition leader. See [Automatic Leader Balancing](../operations/leader-balancing.md) for the full operational model.

## What The Logs Add

Metrics tell you that something is slow. Logs tell you which request or which partition was slow.

Two configuration thresholds stay especially useful:

- `SlowRaftStateMachineLog`
- `SlowRaftWALMachineLog`

The state machine still runs behind the serial partition executor after the removal of the actor runtime. `RaftPartitionExecutor` emits the slow-dispatch logs. Therefore, the old idea of a slow Raft state machine is still useful, although the implementation is no longer actor-based.

Typical useful log patterns are:

- slow-dispatch warnings from the partition executor
- election-start warnings with the time since the last heartbeat
- stale WAL completion warnings
- times for WAL restore and proposal completion
- WAL write times in the storage path.

## How To Reason About Slow Operations

Examine the signals in this order when an operation is slow:

1. `raft.executor.client_queue_depth`
2. `raft.executor.rejections_total`
3. `raft.executor.operation_duration_ms`
4. `raft.wal.queue_depth`
5. `raft.wal.batch_size`
6. `raft.stale_completions_total`
7. `raft.heartbeat_delay_ms`
8. `raft.election_delay_ms`

That order usually separates these causes:

- client admission pressure
- WAL batch pressure or storage pressure
- election churn
- cleanup of stale completions after a change of leader.

## How To Validate Scheduler Fairness

Scheduler fairness is not one metric. Examine the shape of several signals together:

- `Control` latency and `Replication` latency must stay bounded, even when `Client` traffic spikes.
- The client queue depth can grow, but heartbeats and elections must continue to make progress.
- WAL batch sizes must increase under load. One hot partition must not starve the other partitions.
- `ProposalQueueFull` rejections are better than unbounded memory growth or broken Raft response times.

In a load test, the important question is not "did the queue grow?" The important question is "did the control-plane work stay healthy while the load increased?"

## Partition Load Accessors

`IRaft` also gives `GetPartitionLogOpsPerSecond`, `GetPartitionWalQueueDepth`, and `GetPartitionCommitWaitMs`. The log rate and the commit wait have no dedicated meter instruments now. See [Partition Load Signals](../guides/partition-load-signals.md) for local behavior, remote behavior, freshness, and the ambiguous `0` sentinel.
