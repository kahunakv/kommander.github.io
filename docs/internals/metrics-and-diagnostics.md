# Metrics And Diagnostics

Kommander exposes runtime diagnostics through two main channels:

- metrics from the `Kommander` .NET `Meter`
- structured logs from the Raft runtime.

Together, they help answer practical questions such as:

- why a proposal is slow
- whether a partition is overloaded
- whether scheduler fairness is holding under load
- whether leadership churn is causing stale completions or elections.

## Meter Name

Kommander publishes metrics through the .NET `Meter` named:

```text
Kommander
```

Any OpenTelemetry or `MeterListener` consumer should subscribe to that meter name.

## What Is Tracked

The current code exports these core signals.

### Partition Queue Depth

Observable gauge:

- `raft.executor.client_queue_depth`

This reports the current client proposal queue depth per partition executor, tagged by:

- `partition_id`

This is the main queue-depth metric currently exported directly by `KommanderMetrics`.

## Operation Throughput And Latency

Counters:

- `raft.executor.operations_total`
- `raft.executor.rejections_total`

Histogram:

- `raft.executor.operation_duration_ms`

These are tagged by:

- `partition_id`
- `operation_class`

`operation_class` corresponds to the executor work classes:

- `Control`
- `Replication`
- `Client`
- `Maintenance`

This is the most useful place to look when an operation feels slow. If `Client` latency climbs while `Control` and `Replication` stay healthy, the system is preserving Raft priority correctly. If control-plane latency also climbs, you likely have deeper scheduler or storage pressure.

## WAL Batching And Throughput

Counters:

- `raft.wal.batches_total`
- `raft.wal.operations_total`

Histogram:

- `raft.wal.batch_size`

Observable gauge:

- `raft.wal.queue_depth`, tagged by `partition_id`

`raft.wal.queue_depth` reports pending or in-flight WAL operations for each partition. A sustained rise while replicated-log throughput plateaus indicates WAL or fsync saturation. The same advisory value is available through `IRaft.GetPartitionWalQueueDepth`.

`raft.wal.batches_total` increments once per scheduler group write. A group write may span more than one partition.

`raft.wal.batch_size` records the number of WAL write operations drained for each partition inside that group write. It is a per-partition batch-size distribution, not the number of partitions included in the group.

This helps validate scheduler fairness and batching efficiency under load:

- very small batches can mean poor batching opportunities or low traffic
- consistently large batches can mean good amortization
- large batches paired with rising latency can mean the system is absorbing bursts but paying for them in per-flush delay.
- increasing `raft.wal.operations_total` faster than `raft.wal.batches_total` usually means batching is reducing storage calls.

For WAL durability tuning, `FairWalScheduler` also maintains internal counters such as `TotalBatchesWritten`, `TotalSyncBatchesWritten`, and `TotalPartitionsBatched`. They help validate whether `WalSingleFsyncCommit` is reducing true sync batches and whether `WalGroupCommitLingerMs` is increasing partitions per group write.

## Stale Completion Drops

Counter:

- `raft.stale_completions_total`

This counts WAL completions that were discarded because they were stale, such as:

- wrong partition
- wrong term
- mismatched operation id.

A sustained rise here usually points to leadership churn, delayed completions, or retries arriving after the partition has already moved on.

## Elections And Heartbeats

Counters:

- `raft.elections_started_total`
- `raft.heartbeats_sent_total`

Histogram:

- `raft.heartbeat_delay_ms`
- `raft.election_delay_ms`

`raft.heartbeat_delay_ms` records the interval between consecutive heartbeats sent by a leader partition. High values can indicate scheduler pressure or CPU starvation.

`raft.election_delay_ms` records how long it had been since the last received heartbeat when an election started.

Heartbeat behavior can also be correlated through:

- `raft.heartbeats_sent_total`
- `raft.heartbeat_delay_ms`
- `raft.election_delay_ms`
- slow-dispatch logs
- proposal and append latency patterns.

## Leader Balancing

When automatic leader balancing is enabled, Kommander exports:

Counters:

- `raft.balancer.moves_total`, tagged with `outcome=planned`, `succeeded`, or `timed_out`
- `raft.balancer.skipped_passes_total`

Observable gauges:

- `raft.balancer.count_imbalance`
- `raft.balancer.load_imbalance`

Planned moves followed by successful moves and falling imbalance gauges indicate normal convergence. Frequent timeouts can mean suggestions are rejected or `SuggestionTimeout` is too short for transfer and gossip propagation. Frequent skipped passes mean the system-partition leader is missing a fresh report from at least one live voter.

The imbalance gauges are meaningful on the process hosting the system-partition leader. See [Automatic Leader Balancing](../operations/leader-balancing.md) for the full operational model.

## What The Logs Add

Metrics tell you that something is slow. Logs help explain which request or partition was slow.

Two existing configuration thresholds remain especially useful:

- `SlowRaftStateMachineLog`
- `SlowRaftWALMachineLog`

After the actor runtime removal, the state machine still runs behind the serial partition executor. Slow dispatch logs are emitted from `RaftPartitionExecutor`, so the old “slow Raft state machine” idea is still useful even though the implementation is no longer actor-based.

Typical useful log patterns include:

- slow dispatch warnings from the partition executor
- election start warnings that include time since last heartbeat
- stale WAL completion warnings
- WAL restore and proposal completion timing
- WAL write timing logs in the storage path.

## How To Reason About Slow Operations

When an operation is slow, check the signals in this order:

1. `raft.executor.client_queue_depth`
2. `raft.executor.rejections_total`
3. `raft.executor.operation_duration_ms`
4. `raft.wal.queue_depth`
5. `raft.wal.batch_size`
6. `raft.stale_completions_total`
7. `raft.heartbeat_delay_ms`
8. `raft.election_delay_ms`

That usually lets you distinguish between:

- client admission pressure
- WAL batching or storage pressure
- election churn
- stale-completion cleanup after leadership changes.

## Validating Scheduler Fairness

Scheduler fairness is not one single metric. You validate it by looking at the shape of several signals together:

- `Control` and `Replication` latency should remain bounded even when `Client` traffic spikes.
- client queue depth may grow, but heartbeats and elections should still progress.
- WAL batch sizes should increase under load without one hot partition causing total starvation elsewhere.
- `ProposalQueueFull` rejections are preferable to runaway memory growth or broken Raft responsiveness.

In load tests, the important question is not “did the queue grow?” but “did control-plane work stay healthy while load increased?”

## Partition Load Accessors

`IRaft` also exposes `GetPartitionLogOpsPerSecond`, `GetPartitionWalQueueDepth`, and `GetPartitionCommitWaitMs`. Log rate and commit wait do not currently have dedicated meter instruments. See [Partition Load Signals](../guides/partition-load-signals.md) for local versus remote behavior, freshness, and the ambiguous `0` sentinel.
