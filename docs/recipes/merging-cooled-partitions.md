# Merging Cooled Partitions

Use partition merges when traffic has cooled down and the cluster is carrying more user partitions than it needs.

This is the natural companion to the split recipe. A system that can expand partitions under load should also be able to simplify itself when the pressure is gone.

## Problem

After a scale event, promotion, migration, or temporary traffic spike, a cluster can be left with many lightly used partitions.

That usually means:

- extra leaders to monitor,
- more partition-local workers or caches,
- more routing entries than the workload justifies,
- more operational noise than necessary.

## When This Is a Good Fit

Use this pattern when:

- adjacent hash-range partitions are both quiet,
- a previous split is no longer justified,
- fewer active leaders would simplify operations,
- the application can consolidate work under one survivor partition.

## Kommander Pattern

Merge the quiet source partition into a survivor partition that will continue serving the combined range.

```csharp
RaftPartitionLifecycleResult merged = await raft.MergePartitionsAsync(
    survivorPartitionId: 2,
    sourcePartitionId: 3,
    plan: new RaftMergePlan
    {
        SurvivorPartitionId = 2,
        SourcePartitionId = 3
    },
    ct: cancellationToken
);
```

The source partition is drained and removed. The survivor remains the active partition for the combined hash range.

## Applying State

After the merge:

1. refresh the partition map,
2. stop routing new requests to the removed source partition,
3. retry stale requests that return `PartitionMoved`,
4. consolidate local state under the survivor partition.

```csharp
raft.OnPartitionMapChanged += ranges =>
{
    routingCache.Replace(ranges);
    workerAssignments.Rebalance(ranges);
};
```

If the application keeps per-partition projections or workers, this is the point where the source partition's local state should be folded into the survivor or rebuilt there.

## What Your Application Owns

Kommander coordinates the replicated merge. Your application still owns:

- deciding that the partitions are quiet enough to merge,
- ensuring the right node initiates the merge,
- tearing down source-partition local workers,
- consolidating application state and read models.

## Notes

- Partition `0` is reserved and cannot be merged.
- The local node must be leader for both the survivor and the source partition.
- For hash-range partitions, the ranges must be adjacent.
- Merging is often easiest after leadership has been intentionally concentrated on one node.
