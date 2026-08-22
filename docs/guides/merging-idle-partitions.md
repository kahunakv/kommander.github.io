# Merging Idle Partitions

Merge two partitions when the cluster has more user partitions than the workload needs.

Typical reasons are:

- Two adjacent hash ranges both have a light load.
- An earlier split solved a traffic spike that no longer exists.
- You want fewer active leaders and less partition overhead.
- A drained source partition must go back into its neighbor.

This guide gives the merge flow for the application. For the full lifecycle API, see [Elastic Partitions](./elastic-partitions.md).

## What A Merge Does

A merge combines two user partitions into one survivor partition.

For a `HashRange` partition:

- The two ranges must be adjacent.
- The survivor absorbs the source range.
- Kommander drains the source partition, then removes it.

Kommander does not merge the system partition. Partition `0` is reserved. It can never take part in a user merge.

## Leadership Requirement

A create operation and a remove operation need one leader. A merge needs the leadership of **both** partitions.

Therefore, the local node must be the leader of these partitions:

- the survivor partition
- the source partition.

Two different nodes can hold the two leaderships. Move one leadership first. You can also call the merge from the node that already leads both partitions.

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

- Partition `2` survives.
- Kommander drains partition `3`.
- The final active hash range belongs to partition `2`.

## What Changes For The Callers

Do these steps after a merge:

1. Refresh the partition map.
2. Stop the route of new work to the removed source partition.
3. Retry each stale write that fails with `PartitionMoved`.
4. Rebalance the local workers or the caches that use the partition id as their key.

Your application can cache an assignment from a partition id to a worker. This is the moment to stop the source worker. Move that traffic to the survivor.

## State Transfer Considerations

A merge can need a state transfer at the application level. A split has the same requirement.

Your state machine can keep an index, a projection, or a cache for each partition. The survivor then can need the state of the source partition.

Use this method:

```csharp
raft.RegisterStateMachineTransfer(new MyStateMachineTransfer());
```

Treat the merge as two events:

- a change of the partition map
- a move of the application state.

## A Safe Merge Workflow

For most applications, this is the practical sequence:

1. Make sure that both partitions have a light load.
2. Make sure that the local node leads both partitions.
3. Call `MergePartitionsAsync`.
4. Refresh the partition routing on all the nodes.
5. Watch the `PartitionMoved` retries until they stop.
6. Make sure that only the survivor stays active.

## Good Fit

A merge is a good fit in these conditions:

- Earlier splits left too many mostly idle partitions.
- The cluster has unnecessary leadership overhead.
- You can recombine the adjacent ranges cleanly.
- The application can update its routing and its state ownership after the change.

## Related Reading

- [Elastic Partitions](./elastic-partitions.md)
- [Leadership Control](../operations/leadership-control.md)
- [Partitions And Splitting Internals](../internals/partitions-and-splitting.md)
