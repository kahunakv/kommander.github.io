# Dynamic Cluster Membership

Kommander can change the cluster roster at runtime.

That means a node can:

- join an existing cluster
- start as a non-voting learner
- catch up
- be promoted automatically to a voter
- leave gracefully
- be evicted later if failure detection is enabled and supported by the transport.

This page covers the user-facing behavior.

## The Core Idea

Kommander keeps one authoritative cluster roster on the system partition, partition `0`.

That roster is a committed Raft record, not just a discovery snapshot and not just gossip state.

The practical implication is:

- quorum is computed from the committed roster
- learners do not count toward quorum
- discovery helps nodes find contact points but does not define live membership
- gossip can spread the roster faster but does not decide who may vote.

If you only remember one thing, remember this: membership truth comes from Raft, not from discovery or gossip.

## Member Roles

Each member is in one of these roles:

- `Learner`: receives replication but does not vote and cannot win elections.
- `Voter`: counts toward quorum and participates fully in elections.
- `Leaving`: a graceful-leave state. The node stops campaigning immediately, but it still counts toward quorum until removal commits.
- `NotMember`: only returned locally by `LocalRole` when the node is not present in the committed roster.

Typical lifecycle:

`Learner -> Voter -> Leaving -> removed`

## Public API Surface

The main membership-facing APIs are on `IRaft`:

```csharp
ClusterMembership roster = raft.GetMembership();
ClusterMemberRole role = raft.LocalRole;

raft.OnMembershipChanged += membership =>
{
    Console.WriteLine($"Roster version: {membership.MembershipVersion}");
};
```

`ClusterMembership` contains:

- `MembershipVersion`
- `Members`

Each `ClusterMember` contains:

- `Endpoint`
- `NodeId`
- `Role`
- `JoinedVersion`

`MembershipVersion` is the monotonic roster version. Every committed add, promote, or remove increments it.

## Watching Membership Changes

Use `OnMembershipChanged` when your application needs to observe roster changes for logging, metrics, dashboards, or automation.

```csharp
raft.OnMembershipChanged += membership =>
{
    foreach (ClusterMember member in membership.Members)
        Console.WriteLine($"{member.Endpoint} -> {member.Role}");
};
```

Important behavior:

- the callback receives a snapshot of the full roster
- it fires when this node advances to a newer committed membership version
- handlers must stay quick and must not block the system coordinator loop.

## Joining A Cluster

You can join either through discovery or through explicit seed endpoints.

Seed-based join:

```csharp
using CancellationTokenSource joinTimeout = new(TimeSpan.FromSeconds(30));

await raft.JoinCluster(
    seeds: ["node-a:7000", "node-b:7000", "node-c:7000"],
    cancellationToken: joinTimeout.Token
);
```

Discovery-based join:

```csharp
using CancellationTokenSource joinTimeout = new(TimeSpan.FromSeconds(30));

await raft.JoinCluster(joinTimeout.Token);
```

What happens conceptually:

1. the existing cluster commits `AddMember` for the new endpoint
2. the new node enters as a `Learner`
3. the leader replicates state to it
4. once it stays sufficiently caught up, the leader promotes it to `Voter`.

`JoinCluster(...)` does not return as soon as the node is merely known. It waits until the node becomes a committed voter, or until timeout/cancellation triggers.

## Graceful Leave

A node can leave with:

```csharp
await raft.LeaveCluster(dispose: true);
```

Behavior:

1. the node marks itself `Leaving`
2. it stops campaigning immediately
3. the cluster commits `RemoveMember(self)` on partition `0`
4. the node shuts down.

If the node is the system-partition leader, it removes itself under the old quorum and then steps down.

## Automatic Promotion

Promotion from learner to voter is automatic.

The leader promotes a learner only after it stays close enough to the committed log for long enough. That is controlled by:

- `LearnerPromotionLag`
- `LearnerPromotionStableWindow`

This is what lets nodes join without harming quorum availability during catch-up.

## Catch-Up Limitation You Should Know

Kommander uses bounded log backfill to catch learners up.

That works only while the learner still needs entries above the current compaction floor. If the WAL has already compacted away the history a fresh learner needs, there is not yet a snapshot-install path wired into learner catch-up.

In practical terms:

- joining works for learners that can still be caught up from retained log history
- a heavily compacted cluster may prevent a fresh learner from reaching voter status
- a join timeout can therefore mean the learner could not catch up from the retained WAL.

See [Log Backfill And Catch-Up](./log-backfill-and-catch-up.md) for the follower catch-up path, `GetFollowerLagAsync`, and the `SnapshotRequired` handoff.

## Failure Detection And Eviction

Kommander also has a SWIM-style failure detector:

- direct ping
- indirect ping through peers
- `Suspect`
- then `Dead`
- then eventual eviction by the system-partition leader.

For the full liveness model, see [SWIM Failure Detection](./swim-failure-detection.md).

Kommander enables SWIM by default:

`PingInterval` defaults to `1 second`.

Set `PingInterval` to `0` or lower only when you intentionally want to disable failure detection. If you do that, also set `EnableQuiescence = false`, because quiesced partitions rely on SWIM to notice a dead leader node.

## Transport Support Today

Current practical state:

- roster commits and join flow work on `InMemory`, `gRPC`, and `REST`
- graceful leave RPCs are wired on `InMemory`, `gRPC`, and `REST`
- cross-partition remote lag checks for learner promotion are wired on `InMemory`, `gRPC`, and `REST`
- SWIM direct and indirect ping probing is wired on `InMemory`, `gRPC`, and `REST`
- gossip anti-entropy is wired on `InMemory`, `gRPC`, and `REST`.

What that means for gRPC and REST clusters today:

- joining works
- graceful leave works through the transport RPC path
- learner promotion can use remote follower lag checks instead of relying only on local observations
- committed membership changes still replicate through Raft
- SWIM failure detection works through the transport
- gossip-based roster convergence and leader-balancer load reports work through the transport.

## Important Status Values

Membership operations can surface these relevant statuses:

- `Success`
- `StaleMembership`
- `ConcurrentMembershipChange`
- `InsufficientVoters`

How to interpret them:

- `StaleMembership`: the roster changed since the operation was computed. Re-read membership and retry.
- `ConcurrentMembershipChange`: another membership change is already in flight. Retry after it commits.
- `InsufficientVoters`: removal would make the cluster unavailable. Do not retry blindly.

## Configuration Knobs

The main membership-related settings are:

- `BackfillThreshold`
- `MaxBackfillEntriesPerRound`
- `LearnerPromotionLag`
- `LearnerPromotionStableWindow`
- `GossipInterval`
- `GossipFanout`
- `PingInterval`
- `PingTimeout`
- `IndirectPingFanout`
- `SuspicionTimeout`
- `DeadMemberEvictionGrace`
- `EnableQuiescence`
- `QuiesceAfter`

See [Configuration](../reference/configuration.md) for defaults and operational notes.

## Practical Advice

- Treat discovery as a way to find contact points, not as the source of truth for who can vote.
- Wire `OnMembershipChanged` into logs or metrics so every roster change is observable.
- Keep `EnableQuiescence = false` if you intentionally disable SWIM with `PingInterval = 0`.
- If a learner never becomes a voter, inspect catch-up and compaction behavior before assuming elections are broken.
- Partition `0` is reserved for Kommander system state. Membership changes are committed there, not through user partitions.

## Related Reading

- [Creating A Node](./creating-a-node.md)
- [SWIM Failure Detection](./swim-failure-detection.md)
- [Partition Quiescence](./partition-quiescence.md)
- [Configuration](../reference/configuration.md)
- [IRaft API](../reference/iraft-api.md)
- [Adapters](../reference/adapters.md)
