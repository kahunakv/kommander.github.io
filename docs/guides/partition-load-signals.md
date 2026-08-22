# Partition Load Signals

Kommander gives three advisory signals. The signals tell you if the replicated log of a partition is busy or saturated. The WAL is the write-ahead log. It is the durable store for log entries.

| Signal | Meaning | Idle behavior |
| --- | --- | --- |
| `LogOpsPerSecond` | Smoothed rate of leader-side operations that enter the replicated log | Decays toward `0` |
| `WalQueueDepth` | Pending or in-flight WAL writes for the partition | Drains to `0` |
| `CommitWaitMs` | Smoothed enqueue-to-durable latency for WAL writes | Holds its last observed value |

These signals are measurements only. They do not split partitions. They do not transfer leaders. They do not take part in consensus.

## Why Rate Is Not Enough

Throughput can stay flat when the storage reaches its fsync limit. An fsync is a durable flush to disk. Two partitions can report the same `LogOpsPerSecond` at that limit. The first partition gets slightly more work than it can commit. The second partition gets much more work. The storage ceiling hides the difference between them.

Saturation shows the difference:

- A high rate with a low queue depth means that the partition is busy, but it keeps up.
- A high rate with a constant queue depth means that work arrives faster than the WAL pipeline completes it.
- A high rate with an increased commit wait shows that writes wait longer for durability.
- A low rate means that the partition is not hot now. This is true even if `CommitWaitMs` still holds an older high value.

Require a high rate and constant saturation before a split. Do not split after one high rate sample.

## Read The Signals

`IRaft` gives all three methods. You can call them from any node.

```csharp
int partitionId = 14;

double logOpsPerSecond = raft.GetPartitionLogOpsPerSecond(partitionId);
int walQueueDepth = raft.GetPartitionWalQueueDepth(partitionId);
double commitWaitMs = raft.GetPartitionCommitWaitMs(partitionId);
```

`GetPartitionLogOpsPerSecond` counts the leader-side `ReplicateLogs` path. It does not count follower `AppendLogs`, checkpoints, or maintenance work. It also does not count operations that stay out of the replicated log. Thus the rate helps you estimate the work that one more partition log can take.

The rate is an exponentially weighted moving average (EWMA). Its half-life is approximately seven seconds. The rate answers to constant traffic. It does not treat a short spike as a permanent change.

`GetPartitionWalQueueDepth` gives an approximate snapshot of the pending or in-flight work in `FairWalScheduler`. `GetPartitionCommitWaitMs` gives an EWMA of the time from WAL enqueue to durable completion.

## Local And Remote Values

When the local node leads the partition, each accessor reads the in-process measurement directly.

When another node leads the partition, the accessor reads the latest load report of that leader. Gossip carries the report. Gossip is the exchange of membership messages between nodes. Remote visibility across the cluster needs this configuration:

```csharp
RaftConfiguration configuration = new()
{
    EnableLeaderBalancer = true,
    GossipFanout = 2
};
```

`EnableLeaderBalancer` controls the automatic balance passes. It also controls the publication of the load report that carries these signals. If you disable it, local leader reads continue to work. Remote reads then usually return `0`.

Remote values can lag behind reality. The lag is approximately `LeaderBalancerReportInterval` plus the gossip propagation time. The default report interval is five seconds. The rate is also smoothed. Therefore, act on a constant window. Do not expect immediate changes.

## Understand A Zero Result

All accessors return `0` when the partition is unknown. They also return `0` when no usable report from its leader arrived. Therefore, `0` has two possible meanings:

- The partition is truly idle.
- The value is not available on this node yet.

For an automatic split trigger, both meanings must cause no action. Do not read `0` as proof that the remote leader has no work.

`CommitWaitMs` has one more caveat. After the writes stop, it holds its last estimate until another batch completes. Always use it together with `LogOpsPerSecond`. An old latency value must not make an idle partition look hot.

## Build A Conservative Split Trigger

Use a constant condition. Do not use one crossing of a threshold.

```csharp
bool splitCandidate =
    raft.GetPartitionLogOpsPerSecond(partitionId) >= minimumLogRate &&
    raft.GetPartitionWalQueueDepth(partitionId) >= minimumWalDepth;
```

Your application must test that condition across several samples. The samples must cover a minimum of one report-and-gossip window. Add a cooldown after a split. The cooldown gives the route changes and the new leadership time to become stable.

Start with `WalQueueDepth` as the saturation signal, because it clears when the backlog drains. Add `CommitWaitMs` only if the batches drain the queues too fast for reliable depth samples.

## Splits And Shared Fsync

The Kommander WAL scheduler batches writes across partitions. Partitions on one node can also share the same storage flush path. A split of one hot partition into two partitions on the same node adds one more Raft group. It does not add fsync capacity.

After a split, make sure that a different node leads the new partition, if your goal is less disk saturation. Automatic [leader balancing](../operations/leader-balancing.md) can move leadership. You must still observe the placement. You must also validate it against your workload.

The signals answer one question: is this partition hot or saturated? They do not tell you if you can split the key range safely. They do not move the application state. They do not select the node for the new leader.

## Metrics

The .NET meter with the name `Kommander` exports the WAL saturation signal directly:

| Metric | Type | Tags | Meaning |
| --- | --- | --- | --- |
| `raft.wal.queue_depth` | Observable gauge | `partition_id` | Pending or in-flight WAL operations per partition |

`LogOpsPerSecond` and `CommitWaitMs` have no dedicated metrics now. Read them through the `IRaft` accessors and the gossiped reports.

## Related Reading

- [Splitting A Hot Partition](./splitting-a-hot-partition.md)
- [Elastic Partitions](./elastic-partitions.md)
- [Automatic Leader Balancing](../operations/leader-balancing.md)
- [Metrics And Diagnostics](../internals/metrics-and-diagnostics.md)
- [WAL Internals](../internals/wal.md)
