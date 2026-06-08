# Metrics And Diagnostics

Kommander exposes runtime diagnostics through two main channels:

- metrics from the `Kommander` .NET `Meter`,
- structured logs from the Raft runtime.

Together, they help answer practical questions such as:

- why a proposal is slow,
- whether a partition is overloaded,
- whether scheduler fairness is holding under load,
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

`raft.wal.batch_size` records how many WAL write operations were grouped into one storage flush.

This helps validate scheduler fairness and batching efficiency under load:

- very small batches can mean poor batching opportunities or low traffic,
- consistently large batches can mean good amortization,
- large batches paired with rising latency can mean the system is absorbing bursts but paying for them in per-flush delay.

## Stale Completion Drops

Counter:

- `raft.stale_completions_total`

This counts WAL completions that were discarded because they were stale, such as:

- wrong partition,
- wrong term,
- mismatched operation id.

A sustained rise here usually points to leadership churn, delayed completions, or retries arriving after the partition has already moved on.

## Elections And Heartbeats

Counters:

- `raft.elections_started_total`
- `raft.heartbeats_sent_total`

Histogram:

- `raft.election_delay_ms`

`raft.election_delay_ms` records how long it had been since the last received heartbeat when an election started.

This is the direct delay metric currently exported in the codebase. The current `KommanderMetrics` implementation does not expose a separate `heartbeat delay` histogram by name. Heartbeat behavior is instead observed through:

- `raft.heartbeats_sent_total`,
- `raft.election_delay_ms`,
- slow-dispatch logs,
- proposal and append latency patterns.

## What The Logs Add

Metrics tell you that something is slow. Logs help explain which request or partition was slow.

Two existing configuration thresholds remain especially useful:

- `SlowRaftStateMachineLog`
- `SlowRaftWALMachineLog`

After the actor runtime removal, the state machine still runs behind the serial partition executor. Slow dispatch logs are emitted from `RaftPartitionExecutor`, so the old “slow Raft state machine” idea is still useful even though the implementation is no longer actor-based.

Typical useful log patterns include:

- slow dispatch warnings from the partition executor,
- election start warnings that include time since last heartbeat,
- stale WAL completion warnings,
- WAL restore and proposal completion timing,
- WAL write timing logs in the storage path.

## How To Reason About Slow Operations

When an operation is slow, check the signals in this order:

1. `raft.executor.client_queue_depth`
2. `raft.executor.rejections_total`
3. `raft.executor.operation_duration_ms`
4. `raft.wal.batch_size`
5. `raft.stale_completions_total`
6. `raft.election_delay_ms`

That usually lets you distinguish between:

- client admission pressure,
- WAL batching or storage pressure,
- election churn,
- stale-completion cleanup after leadership changes.

## Validating Scheduler Fairness

Scheduler fairness is not one single metric. You validate it by looking at the shape of several signals together:

- `Control` and `Replication` latency should remain bounded even when `Client` traffic spikes.
- client queue depth may grow, but heartbeats and elections should still progress.
- WAL batch sizes should increase under load without one hot partition causing total starvation elsewhere.
- `ProposalQueueFull` rejections are preferable to runaway memory growth or broken Raft responsiveness.

In load tests, the important question is not “did the queue grow?” but “did control-plane work stay healthy while load increased?”

## Important Limits

Two distinctions matter when reading the current diagnostics surface:

- Kommander currently exports direct metrics for partition executor queue depth, not a full family of per-scheduler queue-depth gauges.
- Kommander currently exports direct election-delay telemetry, but not a separate heartbeat-delay histogram.

That still gives enough visibility to diagnose most overload and fairness problems when you combine the metrics with slow-dispatch and election logs.
