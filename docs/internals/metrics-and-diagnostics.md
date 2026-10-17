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
- `raft.round.stage_ms`, when round-stage instrumentation is enabled

The tags are:

- `partition_id`
- `operation_class`

`operation_class` is equivalent to the work classes of the executor:

- `Control`
- `Replication`
- `Client`
- `Maintenance`

Examine these signals first when an operation feels slow. A rise in `Client` latency with healthy `Control` and `Replication` latency shows that the system keeps the Raft priority correctly. A rise in control-plane latency usually shows deeper scheduler pressure or storage pressure.

`raft.round.stage_ms` is an opt-in diagnostic histogram for breaking one replication round into named stages. Enable it with the `KOMMANDER_ROUND_STAGES=1` environment variable or by enabling `RoundStageInstrumentation` in an embedded host. Each measurement has a `stage` tag.

Useful stages include:

- `leader.queue`
- `leader.propose`
- `leader.wal`
- `leader.wal_completion`
- `leader.fanout`
- `leader.replication`
- `leader.ack_queue`
- `leader.ack`
- `leader.resume`
- `leader.round`
- `leader.commit_wal`
- `follower.queue`
- `follower.append`
- `follower.wal`
- `follower.wal_completion`
- `follower.ack`
- `transport.dispatch`

Use this histogram when a proposal is slow but the broad queue and WAL metrics do not isolate the delay. Stage means can be added to approximate average round cost. Percentiles from different stages should not be added, because each percentile can come from a different request. `Kommander.Benchmark` can enable the same instrumentation with `--stages`; it is useful for comparing `--fan-out-before-local-write true` and `false` under the same workload.

## WAL Batch Metrics And Throughput

The WAL is the write-ahead log. It is the durable store for Raft log entries.

Counters:

- `raft.wal.batches_total`
- `raft.wal.operations_total`
- `raft.wal.engine_reopens_total`
- `raft.leader.wal_stall_step_downs_total`
- `raft.wal.compaction_passes_total`
- `raft.wal.compaction_blocked_by_durability_floor_total`
- `raft.wal.restore_narrowed_by_soft_floor_total`

Histogram:

- `raft.wal.batch_size`
- `raft.wal.write_duration_ms`
- `raft.wal.durability_floor_lag`
- `raft.wal.compaction_live_replica_hold_entries`
- `raft.wal.compaction_live_replica_budget_entries`

Observable gauge:

- `raft.wal.queue_depth`, with the tag `partition_id`
- `raft.wal.delayed_write_rate`
- `raft.wal.write_stalled`
- `raft.wal.shard_live_sst_bytes`
- `raft.wal.shard_l0_files`
- `raft.wal.shard_l6_files`
- `raft.wal.alive_log_bytes`
- `raft.wal.table_readers_memory`
- `raft.wal.memtable_memory`
- `raft.wal.block_cache_usage`
- `raft.wal.block_cache_pinned_usage`
- `raft.wal.oldest_pending_write_age_ms`, with the tag `partition_id`

`raft.wal.queue_depth` reports the pending or in-flight WAL operations for each partition. A constant rise with flat replicated-log throughput shows WAL saturation or fsync saturation. An fsync is a durable flush to disk. `IRaft.GetPartitionWalQueueDepth` gives the same advisory value.

`raft.wal.oldest_pending_write_age_ms` reports the oldest WAL operation accepted for a partition but not yet completed by storage. A rising value is the direct durable-write stall signal. `raft.wal.write_duration_ms` records completed group-write duration, so it shows the tail of writes that eventually return.

`raft.leader.wal_stall_step_downs_total` increments when a leader steps down because its local WAL write stayed pending past `WalStallStepDownTimeout`.

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
- `raft.wal.compaction_live_replica_hold_entries` records entries retained below a checkpoint for a live, acking follower that still needs ordinary backfill.
- `raft.wal.compaction_live_replica_budget_entries` records the effective count-and-time retention budget used by that pass. Compare it with the held entries to see whether the fixed count, recent write rate, or configured cap is governing retention.
- `raft.wal.restore_narrowed_by_soft_floor_total` counts restores that could replay from the application's durability floor instead of the older hard checkpoint.
- `raft.wal.engine_reopens_total` counts RocksDB WAL engine reopens after a latched storage error, tagged by `outcome=success` or `outcome=failed`.

Storage can continue to grow with compaction configured. These metrics then separate three causes: no checkpoint was written, the application durability floor keeps the tail on purpose, or the compaction failed.

For `RocksDbWAL`, the storage-engine gauges show write stalls and physical reclamation:

- `raft.wal.delayed_write_rate` is the current RocksDB throttled write rate in bytes per second. Nonzero means the storage engine is slowing the Raft write path.
- `raft.wal.write_stalled` is `1` while RocksDB has stopped writes.
- `raft.wal.shard_live_sst_bytes` is live SST bytes across the Raft-log shard column families.
- `raft.wal.shard_l0_files` is the L0 file count across Raft-log shards. Growth toward the slowdown or stop trigger is a storage pressure signal.
- `raft.wal.shard_l6_files` is the bottom-level file count across Raft-log shards.
- `raft.wal.alive_log_bytes` is live RocksDB `.log` file bytes for the Raft WAL engine. Growth here affects restart replay even when SST reclamation looks healthy.
- `raft.wal.table_readers_memory` is native memory held by open RocksDB table readers, including index and filter blocks. Without shared resources this can grow with live SST bytes outside a configured cache budget.
- `raft.wal.memtable_memory` is native memtable memory across the WAL engine's column families. A shared write-buffer manager bounds this value.
- `raft.wal.block_cache_usage` is the block-cache occupancy backing the WAL engine. With `RocksDbSharedResources`, this reports the whole shared cache, not only Kommander's share.
- `raft.wal.block_cache_pinned_usage` is block-cache memory that cannot be evicted, such as blocks held by iterators or pinned index/filter blocks.

Use these with `RocksDbWalTuning` and shared-memory sizing. A too-small shared write-buffer budget can force early flushes, increasing write amplification without changing consensus safety. A high `table_readers_memory` value without shared resources usually means index/filter blocks are outside your intended memory budget; a high pinned-cache value means the cache may be unable to evict enough data even when the nominal cache size looks large.

## Consensus Invariant Checks

Counter:

- `raft.invariant.violations_total`

The tags are `partition_id` and `invariant`. Any increment is a correctness bug, not a tuning signal. The checks run in product code and are controlled by `InvariantChecks`: debug builds throw by default, while release builds log and count by default.

Use `InvariantChecks = RaftInvariantPolicy.Throw` in a release chaos run when you want the first violation to crash at the transition that caused it. Use `Off` only for a narrow benchmark where even the check branch matters.

## Snapshot And Backfill Diagnostics

Counter:

- `raft.backfill.no_progress_pauses_total`
- `raft.backfill.no_progress_episodes_total`
- `raft.backfill.no_progress_escalations_deferred_total`
- `raft.backfill.wal_stall_pauses_total`
- `raft.snapshot.transfers_started_total`
- `raft.snapshot.transfer_failures_total`
- `raft.snapshot.transfers_deferred_wal_stall_total`
- `raft.snapshot.installs_refused_wal_stall_total`
- `raft.snapshot.rescue_breaker_tripped_total`
- `raft.snapshot.receive_sessions_superseded_total`
- `raft.snapshot.receive_sessions_spilled_total`
- `raft.snapshot.receive_sessions_refused_installing_total`

Histogram:

- `raft.snapshot.install_duration_ms`

Observable gauge:

- `raft.snapshot.receive_staged_bytes`
- `raft.snapshot.receive_installing_bytes`
- `raft.snapshot.receive_in_memory_bytes`
- `raft.snapshot.install_peak_heap_bytes`

The backfill counters are tagged by `partition_id`. `raft.snapshot.transfer_failures_total` is tagged by `partition_id` and failure `cause`. A constant snapshot failure rate usually means that a follower is below the compaction floor and the snapshot install cannot complete.

`raft.backfill.no_progress_pauses_total` increments when the leader skips a backfill batch because the follower has been acknowledging batches without advancing its commit frontier. This protects the WAL read path from a network-speed duplicate repair loop.

`raft.backfill.no_progress_episodes_total` increments when a no-progress episode crosses the warning threshold. Pair it with the leader log line that names the peer and the frontier.

`raft.backfill.no_progress_escalations_deferred_total` increments when a follower is still inside the post-snapshot catch-up grace and the no-progress probe would otherwise start another snapshot.

`raft.backfill.wal_stall_pauses_total` increments when the leader skips entry-carrying backfill because the peer reports a durable-write stall.

`raft.snapshot.transfers_deferred_wal_stall_total` increments when a below-floor follower would normally receive a snapshot, but the leader defers transfer because the peer reports a durable-write stall. `raft.snapshot.installs_refused_wal_stall_total` increments on the receiver when it refuses to open a snapshot session because its own WAL is stalled.

`raft.snapshot.rescue_breaker_tripped_total` increments when repeated successful snapshot installs do not bring a follower above the compaction floor. Pair it with `GetSnapshotStatuses(partitionId)` and look for `RescueNotConverging`.

`raft.snapshot.transfers_started_total` has `partition_id` and `trigger` tags. Use the trigger to separate below-floor retention problems, no-progress convergence problems, compacted anchors, and application-requested reseeds.

The receive-session counters are tagged by `partition_id`. A rise in `receive_sessions_spilled_total` is expected when the resident staging budget is smaller than incoming snapshots. Repeated superseded sessions indicate retries or leader changes. Repeated refusals while installing mean another transfer is arriving before the current partition install finishes.

The receive gauges separate total staged data, bytes held by queued or running installs, and the resident subset. With `SnapshotStagingDirectory` configured, `receive_in_memory_bytes` should stay near the configured resident budget even when total staged bytes are much larger. `snapshot.install_peak_heap_bytes` helps size the application's importer because its working set exists on top of staged data.

`raft.snapshot.install_duration_ms` is tagged by `partition_id` and install `outcome`. It includes the wait for the partition executor as well as the import and durable boundary work.

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

## Replica Placement

Use these signals while converting full-replication ranges or diagnosing placement convergence:

- `raft.placement.initial_assignments_total`
- `raft.placement.ranges_awaiting_initial`

`raft.placement.initial_assignments_total` counts ranges converted from an empty legacy replica set to an explicit set containing the current roster voters. `raft.placement.ranges_awaiting_initial` is an observable gauge on the system-partition leader. A nonzero value that does not fall usually means `EnablePlacementRebalancer` is disabled, the roster is not committed yet, or partition `0` cannot commit the conversion.

The public `GetPartitionsAwaitingPlacement()` API provides the exact partition ids behind the gauge.

## Leader Balancing

Kommander exports these metrics when you enable the automatic leader balancer.

Counters:

- `raft.balancer.moves_total`, with the tag `outcome=planned`, `drain`, `succeeded`, or `timed_out`
- `raft.balancer.skipped_passes_total`

Observable gauges:

- `raft.balancer.count_imbalance`
- `raft.balancer.load_imbalance`
- `raft.balancer.slow_nodes`

Planned moves, then successful moves, then a fall in the imbalance gauges show normal convergence. Frequent timeouts have two usual causes. Nodes reject the suggestions, or `SuggestionTimeout` is too short for the transfer and the gossip propagation. Frequent skipped passes mean that the system-partition leader has no fresh report from a minimum of one live voter.

`raft.balancer.slow_nodes` is meaningful on the system-partition leader when `EnableSlowNodeAvoidance` is enabled. A nonzero value means leadership is being drained away from nodes with unusually high WAL commit wait.

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
