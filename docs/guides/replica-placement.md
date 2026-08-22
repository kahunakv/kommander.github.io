# Replica Placement

Kommander can keep each user partition on a subset of the cluster nodes. It does not replicate every partition to every voter.

The replication factor (RF) controls this behavior. For example, with `ReplicationFactor = 3`, each user partition range targets three voter replicas. A write to that range commits after a quorum of those replicas stores it. Therefore, the range uses a quorum of 2 from 3, even in a much larger cluster.

Partition `0` is the system partition. It still replicates to all the nodes. Replica placement applies to user partition `1` and above.

## Why It Matters

Full replication is simple. Every voter stores every user partition. That is still the default behavior. It is a good fit for a small cluster.

Full replication has costs in a large cluster:

- Every node stores every range.
- Every node runs every partition executor.
- Every partition sends Raft traffic to every voter.
- The quorum width grows with the cluster size.

Replica placement lets a large cluster keep a fixed number of copies of each range. More nodes can then spread the partitions across more machines. Each write does not wait for a larger quorum of the full cluster.

## Enable The Replication Factor

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

`ReplicationFactor = 0` is the default. It means full replication. An existing partition map with no replica set also behaves as full replication. Therefore, an existing cluster continues to work.

Prefer an odd replication factor. RF 3 commits with 2 from 3. It tolerates the failure of one replica. RF 4 commits with 3 from 4. It also tolerates the failure of one replica only, but it pays for one more copy.

The cluster can have fewer voters than the configured RF. Kommander then uses all the available voters for that range. The safety does not change. The range behaves as full replication until the cluster has sufficient voters.

Partition `0`, the system partition, always replicates fully across the committed roster. Replica placement changes the user partitions only.

## Replica Roles

Each `RaftPartitionRange` can include a `Replicas` list. Each replica records an endpoint, a node id, a role, and the generation of that role assignment.

| Role | Counts toward the quorum? | Meaning |
| --- | --- | --- |
| `Voter` | Yes | A full voting replica of that partition range. |
| `Learner` | No | A replica in catch-up. It receives appends. It cannot vote or lead yet. |
| `Removing` | No | A replica in removal. It exists until the final committed drop. |

An empty `Replicas` list means legacy full replication. Every voter in the committed roster hosts the range.

## Routing With Placement

Any node can still read the committed partition map. It can still route a key to a partition id. With placement enabled, that node can host no copy of the selected partition.

Use these APIs when you build a routing cache:

```csharp
IReadOnlyList<RaftPartitionRange> map = raft.GetPartitionMap();
IReadOnlyList<RaftReplica> replicas = raft.GetPartitionReplicas(partitionId);
long generation = raft.GetPartitionGeneration(partitionId);
```

`GetPartitionReplicas(partitionId)` returns the committed replica set of the partition. An empty list means that all the roster voters are replicas.

Refresh the routing caches in these conditions:

- `OnPartitionMapChanged` fires.
- A write returns `RaftOperationStatus.PartitionMoved`.
- A selected endpoint is unavailable, or it is no longer the leader.

In a gRPC deployment or a REST deployment, route the client writes directly to a replica of the partition. Prefer the current leader. A node that is not a replica can forward a request on the in-memory transport only.

## Change The RF Of One Partition

You can set an override for one partition:

```csharp
RaftPartitionLifecycleResult result =
    await raft.SetReplicationFactorAsync(
        partitionId: 12,
        replicationFactor: 5,
        ct: cancellationToken
    );
```

Use `replicationFactor: 0` to clear the override. The partition then inherits `RaftConfiguration.ReplicationFactor`.

A change of the target RF does not move the replicas immediately. The placement controller moves toward the new target on the later passes. This needs `EnablePlacementRebalancer` enabled. The override does not increment the partition generation, because the routing did not change yet. The generation changes when a committed placement change modifies the replica set.

Therefore, you can roll an RF change out through your configuration management safely. Kommander commits the target first. The placement changes then use the same learner, voter, and removing roles as an ordinary repair.

## Placement Rebalancer

The placement rebalancer runs on the current system-partition leader.

With the rebalancer enabled, it does these tasks:

- It repairs an under-replicated range after a node removal or a node failure.
- It reduces an over-replicated range after an RF decrease or a merge.
- It spreads the replicas across the nodes to reduce the placement skew.
- It prefers distinct zones when `Zone` hints are available.

The rebalancer is conservative by design. One range has a maximum of one replica in transition at a time. Global move limits keep the catch-up traffic bounded.

The placement passes run on their own `PlacementPassInterval` cadence. That cadence is independent of the leader balancer. Tune the interval when the convergence checks must run more often or less often.

A transition in flight continues even with `EnablePlacementRebalancer = false`. Therefore, an interrupted add, promote, or remove sequence can converge after a restart or a change of the leader on partition `0`.

## Splits, Merges, And Membership

Replica placement composes with elastic partitions:

- A new partition receives a replica set of the RF size when `ReplicationFactor > 0`.
- A split child partition inherits the replica set of the parent, because the data is already on those nodes.
- A merged partition uses the union of both replica sets. The rebalancer can remove the extra replicas later.

Dynamic membership also composes with placement:

- A new voter that joins becomes a candidate for future replica placement.
- A member removal makes each range with a replica on that node under-replicated.
- The planner repairs the under-replicated ranges before the ordinary balance moves.

For a partition that you create dynamically, Kommander selects the committed voter nodes with the lowest load. This applies when `ReplicationFactor > 0`. The voter count can be less than the RF target or equal to it. The new range then keeps the empty representation of the replica set. That representation means full replication across every committed voter.

Kommander can remove a replica that leads a partition now. It first tries a transfer of the leadership to another voter replica. It then discounts the old leader from the quorum. The transfer is a best effort, because a normal election still recovers after a failed handoff. The transfer prevents an unnecessary loss of availability during a planned removal.

A planned member removal through `RequestLeaveAsync` uses a drain-first decommission. Kommander commits the member as `Leaving` first. The placement passes then move its hosted replicas to the nodes that stay. The final roster removal commits after that. A dead-member eviction is different. That member is already gone, and placement repairs the ranges afterward.

Only one member can drain at a time. A drain can exceed `DecommissionDrainTimeout`. Kommander then returns the member to the `Voter` role. The replicas that already moved stay in their new place. Therefore, a retry can continue from the committed map.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `ReplicationFactor` | `0` | The target number of voter replicas for each user partition. `0` means full replication across every roster voter. |
| `EnablePlacementRebalancer` | `false` | Enables the continuous repair, trim, and balance moves. The initial placement still uses `ReplicationFactor` with this setting disabled. |
| `PlacementPassInterval` | `5 s` | The cadence of the placement controller on the system-partition leader. A value of zero or lower disables the timer. Event-driven passes can still run. |
| `MaxReplicaMovesPerPass` | `4` | The maximum number of new placement moves that one controller pass starts. The limit covers the repair priority and the balance priority. |
| `MaxConcurrentReplicaTransfers` | `1` | The budget of balance-class moves for a range with a transitional learner or a removing replica. |
| `MaxConcurrentReplicaRepairs` | `3` | The budget of repair-class moves. It covers an under-replicated range, the shed of an evicted node, and a decommission evacuation. |
| `DecommissionDrainTimeout` | `2 min` | The maximum time of a drain-first leave. After that time, a `Leaving` member returns to the `Voter` role. |
| `ReplicaCountDeadband` | `1` | The permitted imbalance in the replica count before Kommander emits a balance move. A repair ignores this deadband. |
| `Zone` | `null` | An optional locality hint for the local node. The planner prefers replicas in distinct zones when the hints exist. |
| `LearnerPromotionLag` | `10` | The maximum lag of a learner replica that Kommander still treats as caught up. |
| `LearnerPromotionStableWindow` | `3 s` | The time that a learner replica must stay inside the lag threshold before its promotion. |

## Practical Guidance

- Keep `ReplicationFactor = 0` for a small cluster where every node carries every partition.
- Use RF 3 as the first scale-out setting for a production-like cluster. It tolerates the failure of one replica.
- Enable `EnablePlacementRebalancer` when nodes can join or leave, or when the replica counts are uneven.
- Route your gRPC clients and REST clients with `GetPartitionReplicas`. Do not depend on the forward path of a node that is not a replica.
- Keep the apply logic of the application idempotent. A learner catch-up and a snapshot repair use the ordinary replay paths.
- Use replica placement together with leader balancing. The data placement and the leadership load then spread together.
- Do not use RF 1 for a planned decommission. The node that leaves can be the only voter of a range. That range cannot elect a replacement after a loss of leadership during the drain. It waits for the rollback of the drain.

## Related Reading

- [Elastic Partitions](./elastic-partitions.md)
- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Automatic Leader Balancing](../operations/leader-balancing.md)
- [Configuration](../reference/configuration.md)
- [IRaft API](../reference/iraft-api.md)
