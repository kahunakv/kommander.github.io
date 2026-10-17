# Support Types

This page lists public helper types. You meet most of them as parameter types or return types of the [elastic partition APIs](../guides/elastic-partitions.md), so you read about them when you split, merge, or place partitions. The other types are general helpers that Kommander uses internally. You can use them in your own code, but you do not need them to use Kommander.

## Parallelization Extensions

`Kommander.Support.Parallelization` contains `ForEachAsync` extensions for `IEnumerable<T>`, `IAsyncEnumerable<T>`, `List<T>`, arrays, and `HashSet<T>`.

```csharp
using Kommander.Support.Parallelization;

await items.ForEachAsync(maxDegreeOfParallelism: 8, async item =>
{
    await Process(item);
});
```

## SmallDictionary

`SmallDictionary<TKey, TValue>` is a fixed-capacity, non-thread-safe dictionary optimized for very small maps.

Use it where the expected key count is small and predictable.

## Partition Types

Elastic partition APIs use a few public support types:

- `RaftPartitionRange`: one partition-map entry, including `PartitionId`, hash range, `Generation`, `State`, `RoutingMode`, `Replicas`, and `ReplicationFactor`.
- `RaftReplica`: one node that hosts a partition range when replica placement is enabled.
- `RaftReplicaRole`: `Voter`, `Learner`, or `Removing`.
- `RaftPartitionLifecycleResult`: result from create, remove, split, and merge operations.
- `RaftSplitPlan`: optional split configuration such as target partition id, routing mode, and hash boundary.
- `RaftMergePlan`: identifies the survivor and source partitions during merge.
- `RaftPartitionState`: `Active`, `Splitting`, `Draining`, `Removed`.
- `RaftRoutingMode`: `HashRange`, `Unrouted`.

See [Elastic Partitions](../guides/elastic-partitions.md) and [Replica Placement](../guides/replica-placement.md) for when applications should use these types.
