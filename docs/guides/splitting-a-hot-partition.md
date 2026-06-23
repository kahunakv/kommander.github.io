# Splitting A Hot Partition

Split a partition when one user partition is doing too much work compared with the rest of the cluster.

Typical signals:

- one tenant or key range dominates request volume
- one partition's queue depth stays high
- one partition's leader is much hotter than the others
- latency for a specific key range grows while the rest of the cluster stays healthy.

This guide focuses on the operational flow for a split. For the full API surface, see [Elastic Partitions](./elastic-partitions.md).

Kommander exposes `GetPartitionLogOpsPerSecond`, `GetPartitionWalQueueDepth`, and `GetPartitionCommitWaitMs` to help distinguish a busy partition from a saturated one. See [Partition Load Signals](./partition-load-signals.md) before building an automatic split trigger.

## What A Split Does

For a `HashRange` partition, a split creates a second partition and divides the original hash range in two.

In plain terms:

- the source partition keeps part of the keyspace
- the target partition receives the other part
- new writes must eventually route using the updated partition map.

Kommander can auto-assign the target partition id when you pass `0`.

Partition `0` remains reserved for system metadata and can never be used as a user split target.

## Before You Split

Check these conditions first:

- the source partition is a user partition with id greater than `0`
- the local node is leader for the source partition
- your application is prepared to refresh routing state
- your application has registered state-transfer behavior if split data must move with the new partition.

The split request itself is easy. The hard part is usually application state transfer and rerouting cached keys cleanly.

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

What this means:

- `sourcePartitionId: 2` splits partition `2`
- `targetPartitionId: 0` asks Kommander to assign a new user partition id
- `HashBoundary = null` uses the midpoint of the current hash range
- `TargetRoutingMode = HashRange` keeps the new partition in normal hash-based routing.

## After The Split Completes

After a successful split:

1. refresh your partition map
2. update any routing caches
3. expect some callers using stale generation information to get `PartitionMoved`
4. re-route those requests using the latest map.

Example:

```csharp
IReadOnlyList<RaftPartitionRange> map = raft.GetPartitionMap();
```

If you pass `expectedGeneration` on writes, stale callers fail safely instead of silently writing to an outdated partition layout.

## State Transfer Matters

If your state machine keeps local domain state per partition, a split is not only a routing event. Some data may need to move from the old partition's state into the new partition's state.

That is why Kommander exposes:

```csharp
raft.RegisterStateMachineTransfer(new MyStateMachineTransfer());
```

Without state transfer, a split may change routing but leave the new partition without the application state it needs.

## A Simple Operating Pattern

For a beginner-friendly first implementation:

1. detect sustained high replicated-log rate and WAL saturation
2. split it at the leader
3. refresh the partition map on all application nodes
4. retry `PartitionMoved` writes using the new map
5. verify the two partitions are led on different nodes when relieving fsync pressure
6. verify rate, queue depth, and latency improve after routing settles.

Because WAL group commit can combine writes from multiple partitions on one node, splitting in place does not necessarily add fsync capacity. The new partition should ultimately have a leader on another node when disk saturation is the problem.

## Good Fit

Splits are a good fit when:

- traffic is skewed toward one partition
- keys can be cleanly divided
- the application can tolerate rerouting during the topology change
- you want to spread leadership and write load across more partitions.

## Related Reading

- [Elastic Partitions](./elastic-partitions.md)
- [Partition Load Signals](./partition-load-signals.md)
- [Partitioning](../architecture/partitioning.md)
- [Partitions And Splitting Internals](../internals/partitions-and-splitting.md)
