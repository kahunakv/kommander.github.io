# Splitting A Hot Partition

Split a partition when one user partition does much more work than the other partitions in the cluster.

Typical signals are:

- One tenant or key range dominates the request volume.
- The queue depth of one partition stays high.
- The leader of one partition is much hotter than the other leaders.
- The latency of one key range grows while the other partitions stay healthy.

This guide gives the operational flow of a split. For the full API, see [Elastic Partitions](./elastic-partitions.md).

Kommander gives `GetPartitionLogOpsPerSecond`, `GetPartitionWalQueueDepth`, and `GetPartitionCommitWaitMs`. They help you separate a busy partition from a saturated partition. Read [Partition Load Signals](./partition-load-signals.md) before you build an automatic split trigger.

## What A Split Does

For a `HashRange` partition, a split creates a second partition. It then divides the original hash range in two parts.

In simple terms:

- The source partition keeps one part of the keyspace.
- The target partition receives the other part.
- New writes must use the updated partition map.

Kommander can assign the id of the target partition. Pass `0` for that behavior.

Partition `0` stays reserved for the system metadata. It can never be the target of a user split.

## Before You Split

Check these conditions first:

- The source partition is a user partition. Its id is more than `0`.
- The local node is the leader of the source partition.
- Your application is ready to refresh its routing state.
- Your application registered a state-transfer behavior, if the data must move with the new partition.

The split request is easy. The difficult parts are usually the transfer of the application state and the clean reroute of the cached keys.

## Basic Split Example

```csharp
RaftPartitionLifecycleResult result = await raft.SplitPartitionAsync(
    sourcePartitionId: 2,
    targetPartitionId: 0,
    plan: new RaftSplitPlan
    {
        HashBoundary = null,
        TargetRoutingMode = RaftRoutingMode.HashRange
    },
    ct: cancellationToken
);
```

The parameters mean this:

- `sourcePartitionId: 2` splits partition `2`.
- `targetPartitionId: 0` asks Kommander to assign a new user partition id.
- `HashBoundary = null` uses the midpoint of the current hash range.
- `TargetRoutingMode = HashRange` keeps the new partition in the normal hash-based routing.

## After The Split Completes

Do these steps after a successful split:

1. Refresh your partition map.
2. Update each routing cache.
3. Expect a `PartitionMoved` status for a caller with stale generation information.
4. Route those requests again with the latest map.

Example:

```csharp
IReadOnlyList<RaftPartitionRange> map = raft.GetPartitionMap();
```

Pass `expectedGeneration` on your writes. A stale caller then fails safely. It does not write to an old partition layout without a warning.

## State Transfer Is Important

Your state machine can keep local domain state for each partition. A split is then more than a routing event. Some data can need a move from the state of the old partition to the state of the new partition.

That is the reason for this method:

```csharp
raft.RegisterStateMachineTransfer(new MyStateMachineTransfer());
```

Without a state transfer, a split changes the routing. The new partition can then have no application state.

## A Simple Operating Pattern

Use this sequence for a first implementation:

1. Detect a constant high rate in the replicated log and WAL saturation. The WAL is the write-ahead log.
2. Split the partition at the leader.
3. Refresh the partition map on all the application nodes.
4. Retry each `PartitionMoved` write with the new map.
5. Make sure that different nodes lead the two partitions, if your goal is less fsync pressure. An fsync is a durable flush to disk.
6. Make sure that the rate, the queue depth, and the latency improve after the routing becomes stable.

The WAL group commit can combine writes from several partitions on one node. Therefore, a split in place does not always add fsync capacity. The new partition needs a leader on another node when the disk saturation is the problem.

## Good Fit

A split is a good fit in these conditions:

- The traffic is skewed toward one partition.
- You can divide the keys cleanly.
- The application can tolerate a reroute during the change of the topology.
- You want to spread the leadership and the write load across more partitions.

## Related Reading

- [Elastic Partitions](./elastic-partitions.md)
- [Partition Load Signals](./partition-load-signals.md)
- [Partitioning](../architecture/partitioning.md)
- [Partitions And Splitting Internals](../internals/partitions-and-splitting.md)
