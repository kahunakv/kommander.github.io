# Replica Placement

Kommander can keep each user partition on a subset of cluster nodes instead of replicating every partition to every voter.

This is controlled by the replication factor, or RF. For example, with `ReplicationFactor = 3`, each user partition range targets three voter replicas. A write to that range commits after a quorum of those replicas stores it, so the range uses a 2-of-3 quorum even if the whole cluster has many more nodes.

Partition `0`, the system partition, still replicates everywhere. Replica placement applies to user partitions `1` and above.

## Why It Matters

Full replication is simple: every voter stores every user partition. That is still the default behavior, and it is a good fit for small clusters.

As clusters grow, full replication has costs:

- every node stores every range
- every node runs every partition executor
- every partition sends Raft traffic to every voter
- quorum width grows with the cluster size.

Replica placement lets a large cluster keep a fixed number of copies per range. Adding nodes can then spread partitions across more machines instead of making every write wait on a larger whole-cluster quorum.

## Enable Replication Factor

Set `ReplicationFactor` on every node:

```csharp
RaftConfiguration configuration = new()
{
    InitialPartitions = 16,
    ReplicationFactor = 3,
    EnablePlacementRebalancer = true,
    Zone = "rack-a"
};
```

`ReplicationFactor = 0` is the default and means full replication. Existing partition maps with no replica set also behave as full replication, so existing clusters continue to work.

Prefer odd replication factors. RF 3 commits with 2-of-3 and tolerates one replica failure. RF 4 commits with 3-of-4 and still tolerates only one failure, while paying for another copy.

If the cluster has fewer voters than the configured RF, Kommander uses all available voters for that range. Safety is preserved; the range simply behaves like full replication until enough voters exist.

## Replica Roles

Each `RaftPartitionRange` can include a `Replicas` list. Every replica records an endpoint, node id, role, and the generation when that role was assigned.

| Role | Counts toward quorum? | Meaning |
| --- | --- | --- |
| `Voter` | Yes | A full voting replica for that partition range. |
| `Learner` | No | A catching-up replica that receives appends but cannot vote or lead yet. |
| `Removing` | No | A replica being removed. It still exists until the final committed drop. |

An empty `Replicas` list means legacy full replication: every committed roster voter hosts the range.

## Routing With Placement

Any node can still read the committed partition map and route a key to a partition id. With placement enabled, that node might not host the selected partition.

Use these APIs when building routing caches:

```csharp
IReadOnlyList<RaftPartitionRange> map = raft.GetPartitionMap();
IReadOnlyList<RaftReplica> replicas = raft.GetPartitionReplicas(partitionId);
long generation = raft.GetPartitionGeneration(partitionId);
```

`GetPartitionReplicas(partitionId)` returns the committed replica set for the partition. An empty list means all roster voters are replicas.

Refresh routing caches when:

- `OnPartitionMapChanged` fires
- a write returns `RaftOperationStatus.PartitionMoved`
- a chosen endpoint is unavailable or no longer leader.

For gRPC and REST deployments, route client writes directly to one of the partition's replicas, preferably the current leader. The non-replica forwarding fallback is currently implemented for in-memory transport only.

## Changing A Partition's RF

You can set a per-partition override:

```csharp
RaftPartitionLifecycleResult result =
    await raft.SetReplicationFactorAsync(
        partitionId: 12,
        replicationFactor: 5,
        ct: cancellationToken
    );
```

Use `replicationFactor: 0` to clear the override and inherit `RaftConfiguration.ReplicationFactor`.

Changing the target RF does not immediately move replicas. The placement controller moves toward the new target on later passes when `EnablePlacementRebalancer` is enabled. The override itself does not bump the partition generation because routing has not changed yet; generation changes when committed placement mutations actually change the replica set.

## Placement Rebalancer

The placement rebalancer runs on the current system-partition leader.

When enabled, it:

- repairs under-replicated ranges after node removal or failure
- trims over-replicated ranges after RF decreases or merges
- spreads replicas across nodes to reduce placement skew
- prefers distinct zones when `Zone` hints are available.

It is conservative by design. At most one replica per range is in transition at a time, and global move limits keep catch-up traffic bounded.

Placement passes share the leader-balancer timer cadence. Tune `LeaderBalancerInterval` if you need placement convergence checks to run more or less often.

In-flight transitions continue even when `EnablePlacementRebalancer = false`. That lets an interrupted add, promote, or remove sequence converge after a restart or P0 leadership change.

## Splits, Merges, And Membership

Replica placement composes with elastic partitions:

- created partitions receive an RF-sized replica set when `ReplicationFactor > 0`
- split child partitions inherit the parent's replica set, because the data already lives on those nodes
- merged partitions use the union of both replica sets, then the rebalancer can trim excess replicas later.

Dynamic membership composes with placement too:

- when a new voter joins, it becomes a candidate for future replica placement
- when a member is removed, ranges that had a replica on that node become under-replicated
- the planner repairs under-replicated ranges before ordinary balancing.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `ReplicationFactor` | `0` | Target voter replicas per user partition. `0` means full replication across every roster voter. |
| `EnablePlacementRebalancer` | `false` | Enables ongoing repair, trim, and balancing moves. Initial placement still uses `ReplicationFactor` even when this is disabled. |
| `MaxReplicaMovesPerPass` | `2` | Maximum new placement moves started in one controller pass. |
| `MaxConcurrentReplicaTransfers` | `1` | Maximum ranges allowed to have a transitional learner or removing replica at once. |
| `ReplicaCountDeadband` | `1` | Replica-count imbalance tolerated before balance moves are emitted. Repairs ignore this deadband. |
| `Zone` | `null` | Optional locality hint for the local node. The planner prefers spreading replicas across distinct zones when hints exist. |
| `LeaderBalancerInterval` | `30 s` | Cadence used for placement controller passes. Placement shares the balancer timer path. |
| `LearnerPromotionLag` | `10` | Maximum lag a learner replica may have and still be considered caught up. |
| `LearnerPromotionStableWindow` | `3 s` | How long a learner replica must stay within the lag threshold before promotion. |

## Practical Guidance

- Keep `ReplicationFactor = 0` for small clusters where every node should carry every partition.
- Use RF 3 as the first scale-out setting for production-like clusters that need one-replica failure tolerance.
- Enable `EnablePlacementRebalancer` when nodes can join, leave, or have uneven replica counts.
- Route gRPC and REST clients using `GetPartitionReplicas` rather than relying on non-replica forwarding.
- Keep application apply logic idempotent, because learner catch-up and snapshot repair reuse the ordinary replay paths.
- Pair replica placement with leader balancing when you want both data placement and leadership load to spread.

## Related Reading

- [Elastic Partitions](./elastic-partitions.md)
- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Automatic Leader Balancing](../operations/leader-balancing.md)
- [Configuration](../reference/configuration.md)
- [IRaft API](../reference/iraft-api.md)
