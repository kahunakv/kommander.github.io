# Partition Load Signals

Kommander exposes three advisory signals for deciding whether a partition's replicated log is busy or saturated:

| Signal | Meaning | Idle behavior |
| --- | --- | --- |
| `LogOpsPerSecond` | Smoothed rate of leader-side operations that enter the replicated log | Decays toward `0` |
| `WalQueueDepth` | Pending or in-flight WAL writes for the partition | Drains to `0` |
| `CommitWaitMs` | Smoothed enqueue-to-durable latency for WAL writes | Holds its last observed value |

These signals are measurements only. They do not split partitions, transfer leaders, or participate in consensus.

## Why Rate Is Not Enough

Throughput can plateau when storage reaches its fsync limit. A partition offered slightly more work than it can commit and one offered far more work can report the same `LogOpsPerSecond` because both are pinned at the storage ceiling.

The difference appears in saturation:

- high rate with low queue depth means the partition is busy but keeping up
- high rate with sustained queue depth means work is arriving faster than the WAL pipeline can finish it
- high rate with increasing commit wait confirms that writes are spending longer waiting for durability
- low rate means the partition is not currently hot, even if `CommitWaitMs` still contains an older high value.

For split decisions, require high rate and sustained saturation. Do not split from one high rate sample.

## Read The Signals

All three methods are available on `IRaft` and can be called from any node:

```csharp
int partitionId = 14;

double logOpsPerSecond = raft.GetPartitionLogOpsPerSecond(partitionId);
int walQueueDepth = raft.GetPartitionWalQueueDepth(partitionId);
double commitWaitMs = raft.GetPartitionCommitWaitMs(partitionId);
```

`GetPartitionLogOpsPerSecond` counts the leader-side `ReplicateLogs` path. Follower `AppendLogs`, checkpoints, maintenance work, and operations that do not enter the replicated log are not included. This makes the rate useful for estimating work that an additional partition log could redistribute.

The rate is an exponentially weighted moving average with a half-life of roughly seven seconds. It responds to sustained traffic without treating every short spike as a lasting change.

`GetPartitionWalQueueDepth` is an approximate snapshot of pending or in-flight work in `FairWalScheduler`. `GetPartitionCommitWaitMs` is an EWMA of the time from WAL enqueue to durable completion.

## Local And Remote Values

When the local node leads the partition, each accessor reads the in-process measurement directly.

When another node leads the partition, the accessor reads that leader's latest gossiped load report. Cluster-wide remote visibility requires:

```csharp
RaftConfiguration configuration = new()
{
    EnableLeaderBalancer = true,
    GossipFanout = 2
};
```

`EnableLeaderBalancer` controls both automatic balancing and publication of the load report carrying these signals. If it is disabled, local leader reads still work but remote reads normally return `0`.

Remote values can trail reality by approximately `LeaderBalancerReportInterval` plus gossip propagation. The default report interval is five seconds, and the rate itself is smoothed, so consumers should react over a sustained window rather than expecting instant changes.

## Understand A Zero Result

All accessors return `0` when the partition is unknown or when no usable report from its leader has arrived. Therefore, `0` can mean either:

- the partition is genuinely idle
- the value is not available on this node yet.

For an automatic split trigger, both should mean "do nothing." Do not interpret `0` as proof that the remote leader has no work.

`CommitWaitMs` has a separate caveat: after writes stop, it retains its last estimate until another batch completes. Always combine it with `LogOpsPerSecond` so an old latency observation cannot make an idle partition look hot.

## Build A Conservative Split Trigger

Use a sustained condition instead of a single threshold crossing:

```csharp
bool splitCandidate =
    raft.GetPartitionLogOpsPerSecond(partitionId) >= minimumLogRate &&
    raft.GetPartitionWalQueueDepth(partitionId) >= minimumWalDepth;
```

Your application should require that condition across multiple samples covering at least one report-and-gossip window. Add a cooldown after a split so routing changes and new leadership have time to stabilize.

Start with `WalQueueDepth` as the saturation signal because it clears when the backlog drains. Add `CommitWaitMs` only when batching drains queues too quickly for depth sampling to capture pressure reliably.

## Splitting And Shared Fsync

Kommander's WAL scheduler batches writes across partitions. Partitions sharing one node can also share the same storage flush path. Splitting one hot partition into two partitions on the same node may therefore add another Raft group without adding fsync capacity.

After a split, verify that the new partition is led by a different node when the goal is to relieve disk saturation. Automatic [leader balancing](../operations/leader-balancing.md) can redistribute leadership, but placement still needs to be observed and validated against your workload.

The signals answer "is this partition hot or saturated?" They do not decide whether the key range can be split safely, how application state moves, or where the new leader should run.

## Metrics

The .NET meter named `Kommander` exports the WAL saturation signal directly:

| Metric | Type | Tags | Meaning |
| --- | --- | --- | --- |
| `raft.wal.queue_depth` | Observable gauge | `partition_id` | Pending or in-flight WAL operations per partition |

`LogOpsPerSecond` and `CommitWaitMs` are currently available through the `IRaft` accessors and gossiped reports rather than dedicated metrics.

## Related Reading

- [Splitting A Hot Partition](./splitting-a-hot-partition.md)
- [Elastic Partitions](./elastic-partitions.md)
- [Automatic Leader Balancing](../operations/leader-balancing.md)
- [Metrics And Diagnostics](../internals/metrics-and-diagnostics.md)
- [WAL Internals](../internals/wal.md)
