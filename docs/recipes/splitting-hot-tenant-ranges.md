# Splitting Hot Tenant Ranges

Use partition splits when one tenant, customer segment, or key range becomes much hotter than the rest of the cluster.

This recipe shows how to treat elastic partitioning as an application scaling tool instead of just an infrastructure feature.

## Problem

A partitioned system usually scales well until one partition becomes disproportionately busy.

Typical signs:

- one tenant receives far more traffic than the others
- one partition leader has much higher latency
- queue depth grows mainly on one partition
- one key range causes repeated backpressure while other partitions stay idle.

At that point, simply adding more nodes may not help enough if the hot range still routes to one partition.

## When This Is a Good Fit

Use this pattern when:

- workload is skewed, not uniform
- the hot data can be divided into smaller key ranges
- your application already routes by stable keys
- callers can refresh routing when the partition map changes.

## Kommander Pattern

Split the overloaded user partition into two hash ranges and let the updated partition map spread future work across both.

```csharp
RaftPartitionLifecycleResult split = await raft.SplitPartitionAsync(
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

Passing `targetPartitionId: 0` tells Kommander to assign a new user partition id automatically. Partition `0` itself remains reserved for the system partition.

## Applying State

Once the split finishes, your application should:

1. refresh the partition map
2. update any cached routing decisions
3. retry stale writes that fail with `PartitionMoved`
4. move or rebuild local state for the new partition if needed.

```csharp
raft.OnPartitionMapChanged += ranges =>
{
    routingCache.Replace(ranges);
};
```

If your state machine keeps partition-local data, register a state transfer implementation so the new partition receives the right application state.

## What Your Application Owns

Kommander changes the replicated partition map. Your application still owns:

- the decision that a partition is hot enough to split
- the routing cache refresh
- any state transfer needed for the new partition
- client retry behavior when stale generation information is rejected.

## Notes

- Split only user partitions with ids greater than `0`.
- The caller must be leader of the source partition.
- Treat `PartitionMoved` as a normal reroute signal, not an exceptional failure.
- Watch metrics after the split to verify load actually spreads across partitions.
