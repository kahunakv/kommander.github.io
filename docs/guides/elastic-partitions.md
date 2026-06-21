# Elastic Partitions

Kommander can change the user partition layout at runtime.

That means an application can:

- create a new partition
- split a hot partition into two
- merge lightly loaded partitions
- remove a partition that is no longer needed.

This page documents the user-facing APIs and the application behavior you need to plan for.

Partition `0` is still reserved for Kommander system configuration. Elastic partition APIs apply to user partitions `1` and above.

If you want task-oriented walkthroughs instead of the whole API surface, also read:

- [Splitting A Hot Partition](./splitting-a-hot-partition.md)
- [Merging Idle Partitions](./merging-idle-partitions.md)

## Why You Would Use This

Elastic partitions are useful when the right partition count is not known up front.

Typical cases:

- one tenant or key range becomes much hotter than the others
- a new workload segment should be isolated in its own partition
- two partitions are mostly idle and can be merged
- an unrouted, application-managed partition is no longer needed.

## Routing Modes

Each partition in the map uses one of two routing modes:

- `HashRange`
- `Unrouted`

### HashRange

`HashRange` partitions participate in normal key-based routing.

They are returned by:

- `GetPartitionKey`
- `GetPrefixPartitionKey`

Use this mode when the application wants Kommander to route keys automatically.

`GetPartitionKey` and `GetPrefixPartitionKey` do not behave the same way:

- `GetPartitionKey("tenant-42/order-1001")` hashes the prefix before the last `/`, so the effective routing key is `tenant-42`.
- `GetPrefixPartitionKey("tenant-42/order-1001")` hashes the full string exactly as provided.

That means `GetPartitionKey` is useful when related records should stay together by a shared prefix, while `GetPrefixPartitionKey` is useful when the whole supplied key should decide placement.

Examples:

```csharp
int tenantPartition = raft.GetPartitionKey("tenant-42/order-1001");
int exactKeyPartition = raft.GetPrefixPartitionKey("tenant-42/order-1001");
```

In the first call, all keys that share the `tenant-42` prefix before the last slash route to the same partition. In the second call, different full keys can land in different partitions even if they share the same prefix.

### Unrouted

`Unrouted` partitions exist in the partition map but are never returned by hash-based routing helpers.

Use this mode when the application addresses a partition directly by id instead of routing through a hash key.

## Main APIs

Elastic partitioning is exposed through `IRaft`.

### Create a Partition

```csharp
RaftPartitionLifecycleResult created = await raft.CreatePartitionAsync(
    partitionId: 10,
    mode: RaftRoutingMode.Unrouted,
    ct: cancellationToken
);
```

For a `HashRange` partition, provide the range explicitly:

```csharp
RaftPartitionLifecycleResult created = await raft.CreatePartitionAsync(
    partitionId: 10,
    mode: RaftRoutingMode.HashRange,
    hashRange: (start: 1000, end: 1999),
    ct: cancellationToken
);
```

Important behavior:

- leader-only
- idempotent when the partition already exists in `Active` state
- rejects overlapping `HashRange` ranges.

### Remove a Partition

```csharp
RaftPartitionLifecycleResult removed = await raft.RemovePartitionAsync(
    partitionId: 10,
    ct: cancellationToken
);
```

Important behavior:

- leader-only
- idempotent when the partition is already `Removed`
- re-attempts WAL reclamation on repeated removal calls
- rejects removal while the partition is mid-split or mid-merge.

### Split a Partition

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

Key points:

- leader-only
- `targetPartitionId = 0` means auto-assign the next available id
- `HashBoundary = null` means split at the midpoint
- the new partition inherits or uses the requested routing mode.

For `HashRange` partitions:

- the source becomes the left half
- the target becomes the right half.

### Merge Partitions

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

Key points:

- the caller must be leader of both partitions
- the partitions must both be `Active`
- for `HashRange`, they must be adjacent
- the source is drained and removed
- the survivor absorbs the source's range.

## Return Type

Partition lifecycle APIs return `RaftPartitionLifecycleResult`:

```csharp
public sealed class RaftPartitionLifecycleResult
{
    public bool Success { get; init; }
    public RaftOperationStatus Status { get; init; }
    public long Generation { get; init; }
}
```

In practice:

- `Success` tells you whether the operation finished successfully
- `Status` explains the failure or success condition
- `Generation` is the committed generation of the partition entry after the change.

## Reading the Partition Map

Two APIs let applications inspect the current partition layout:

```csharp
IReadOnlyList<RaftPartitionRange> map = raft.GetPartitionMap();
long generation = raft.GetPartitionGeneration(partitionId: 2);
```

`GetPartitionMap()` returns a snapshot copy of the current map. Mutating the returned list does not affect Kommander.

Each `RaftPartitionRange` includes:

- `PartitionId`
- `StartRange`
- `EndRange`
- `Generation`
- `State`
- `RoutingMode`

Lifecycle states are:

- `Active`
- `Splitting`
- `Draining`
- `Removed`

## Partition Map Change Event

Applications can subscribe to:

```csharp
raft.OnPartitionMapChanged += ranges =>
{
    return;
};
```

This fires every time a new partition map is applied, including:

- startup restore
- system configuration replication
- split phase transitions
- merge phase transitions
- create and remove operations.

Use it when your application needs to refresh routing caches, rebalance local workers, or update operational views of the current partition layout.

Handlers should stay quick and should not block the coordinator path.

## Generation Fence And PartitionMoved

The main user-facing safety feature for elastic partitions is the generation fence.

`ReplicateLogs` accepts an optional `expectedGeneration`:

```csharp
long generation = raft.GetPartitionGeneration(partitionId);

RaftReplicationResult result = await raft.ReplicateLogs(
    partitionId,
    type: "OrderCreated",
    data: payload,
    cancellationToken: cancellationToken,
    expectedGeneration: generation
);
```

If the partition has moved to a newer generation before the write is accepted, Kommander rejects the request with:

- `RaftOperationStatus.PartitionMoved`

That protects callers that cached an old partition id before a split or merge completed.

The application response should be:

1. refresh the partition map or generation
2. re-route the key
3. retry against the current owner.

## State Transfer During Split

Elastic partitioning changes the routing map. It does not magically move your application state unless you provide a transfer implementation.

You can register:

```csharp
raft.RegisterStateMachineTransfer(new MyTransfer());
```

through `IRaftStateMachineTransfer`.

If registered, the coordinator can:

1. export a source range snapshot
2. import it into the target partition
3. replicate a checkpoint into the target partition.

If no transfer implementation is registered, the coordinator falls back to log-shipping behavior, and your application is responsible for moving state before phase 2 completes.

## What Your Application Still Owns

Elastic partitions change Kommander's partition map and WAL ownership boundaries. Your application still owns:

- how state is moved during split
- whether direct partition ids or routed keys are used
- how local caches are refreshed
- how to retry after `PartitionMoved`
- any external indexes or projections that must follow the new partition layout.

## Practical Rules

- Use `HashRange` when keys should route automatically through Kommander.
- Use `GetPartitionKey` when the prefix before the last `/` should define the shard.
- Use `GetPrefixPartitionKey` when the full supplied key should define the shard.
- Use `Unrouted` when the application addresses partitions directly.
- Treat `Generation` as part of the write contract when routing information may be stale.
- Subscribe to `OnPartitionMapChanged` if the application caches partition layout.
- Do not assume split or merge automatically migrates your application state.
- Do not use partition `0` for application data.
