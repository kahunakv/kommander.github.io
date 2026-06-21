# Merging Idle Partitions

Merge partitions when the cluster has more user partitions than the workload really needs.

Typical reasons:

- two adjacent hash ranges are both lightly loaded
- a past split solved a traffic spike that no longer exists
- you want fewer active leaders and less partition overhead
- a drained source partition should be folded back into its neighbor.

This guide explains the application-facing merge flow. For the full lifecycle API, see [Elastic Partitions](./elastic-partitions.md).

## What A Merge Does

A merge combines two user partitions into one survivor partition.

For `HashRange` partitions:

- the ranges must be adjacent
- the survivor absorbs the source range
- the source partition is drained and then removed.

Kommander does not merge the system partition. Partition `0` is reserved and cannot participate in user merges.

## Leadership Requirement

Unlike create and remove, merge needs leadership on **both** partitions involved.

That means the local node must be leader for:

- the survivor partition
- the source partition.

If leadership is split across nodes, move leadership first or call the merge from the node that already leads both partitions.

## Basic Merge Example

```csharp
RaftPartitionLifecycleResult result = await raft.MergePartitionsAsync(
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

In this example:

- partition `2` survives
- partition `3` is drained
- the final active hash range belongs to partition `2`.

## What Changes For Callers

After a merge:

1. refresh the partition map
2. stop routing new work to the removed source partition
3. retry stale writes that fail with `PartitionMoved`
4. rebalance any local workers or caches keyed by partition id.

If your application caches `partitionId -> worker` assignments, this is the moment to tear down the source worker and move traffic to the survivor.

## State Transfer Considerations

Like splits, merges can require application-level state transfer.

If your state machine keeps partition-local indexes, projections, or caches, the survivor may need to absorb state that previously belonged to the source partition.

Use:

```csharp
raft.RegisterStateMachineTransfer(new MyStateMachineTransfer());
```

Treat the merge as both:

- a partition-map change
- an application-state movement event.

## A Safe Merge Workflow

For most applications, this is the practical sequence:

1. verify both partitions are lightly loaded
2. verify the local node leads both partitions
3. call `MergePartitionsAsync`
4. refresh partition routing everywhere
5. watch for `PartitionMoved` retries to settle
6. verify only the survivor remains active.

## Good Fit

Merges are a good fit when:

- earlier splits left too many mostly idle partitions
- the cluster has unnecessary leadership overhead
- adjacent ranges can be recombined cleanly
- the application can update routing and state ownership after the change.

## Related Reading

- [Elastic Partitions](./elastic-partitions.md)
- [Leadership Control](../operations/leadership-control.md)
- [Partitions And Splitting Internals](../internals/partitions-and-splitting.md)
