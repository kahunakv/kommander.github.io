# Partition Quiescence

Partition quiescence reduces idle heartbeat traffic.

In normal Raft, a leader sends periodic heartbeats to every follower for every partition it leads. That is useful while a partition is active, but expensive when a cluster has many idle partitions.

Quiescence lets an idle partition go quiet without giving up safe failover.

## What Quiescence Does

When a partition leader sees that a partition has been idle for long enough, it sends one final quiesce marker to followers and then stops sending periodic heartbeats for that partition.

Followers that receive the marker stop treating missing per-partition heartbeats as a reason to start an election. Instead, they use SWIM node liveness to decide whether the leader's node is still alive.

The leader is still the leader. The partition is only quiet.

For the failure detector itself, see [SWIM Failure Detection](./swim-failure-detection.md).

## Why This Matters

Without quiescence, heartbeat traffic grows with both:

- node count
- partition count.

For a cluster with many mostly idle partitions, that can produce a large amount of network and CPU work that carries no application data.

Quiescence changes the idle case from "heartbeat every partition forever" to "watch node liveness once through SWIM."

For the CPU and timer side of many-partition scaling, see [Partition Scaling](../operations/partition-scaling.md).

## How A Partition Quiesces

A leader may quiesce a partition when all of these are true:

- `EnableQuiescence` is `true`
- the partition is not already quiesced
- there are no active proposals
- the partition has been idle longer than `QuiesceAfter`.

When that happens, the leader sends an `AppendLogs` message with `Quiesce = true`. Followers set their local quiesced flag for that partition.

Quiescence is local runtime state. It is not a replicated application log entry and it does not change quorum math.

## How A Partition Wakes Up

Any real write wakes the partition.

On the leader:

1. a client proposal arrives
2. the leader clears the local quiesced state
3. the entry is replicated normally
4. periodic heartbeats resume.

On followers, any normal append with `Quiesce = false` clears the quiesced state.

After the burst of writes ends and the partition stays idle past `QuiesceAfter`, it can quiesce again.

## Failover While Quiesced

Quiesced followers do not rely on the per-partition election timeout while the leader's node is still considered alive.

Instead, they watch SWIM node state:

- `Alive`: stay quiet
- `Suspect` or `Dead`: un-quiesce and start the normal pre-vote/election path.

Failover is triggered on `Suspect`, not `Dead`, so it is tied to roughly one `PingInterval` rather than waiting for the full `SuspicionTimeout`.

## Timing Requirements

Quiescence depends on SWIM.

When `EnableQuiescence = true`, Kommander validates:

- `PingInterval > 0`
- `PingInterval < StartElectionTimeout`.

If SWIM is disabled, a quiesced follower would have no signal that the leader's node died. If `PingInterval` is too high, failover from a quiesced partition would be slower than ordinary election timeout.

The defaults are valid:

- `EnableQuiescence = true`
- `QuiesceAfter = 1500 ms`
- `PingInterval = 1 s`
- `StartElectionTimeout = 2000 ms`.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `EnableQuiescence` | `true` | Enables idle partition quiescence. Set to `false` to keep classic per-partition heartbeats on every interval. |
| `QuiesceAfter` | `1500 ms` | How long a partition must be idle, with no active proposals, before the leader sends a quiesce marker and suppresses heartbeats. |
| `PingInterval` | `1 s` | SWIM probe cadence. Must be greater than `0` and lower than `StartElectionTimeout` when quiescence is enabled. |
| `SuspicionTimeout` | `5 s` | Time from `Suspect` to `Dead`. Quiesced failover starts on `Suspect`, so this does not directly gate quiesced failover latency. |
| `StartElectionTimeout` | `2000 ms` | Lower election timeout bound. `PingInterval` must be below this while quiescence is enabled. |

## Operational Notes

- Quiescence is useful when you run many partitions and many of them are idle.
- A quiesced partition should wake immediately when a write arrives.
- If a node stays SWIM-alive but one specific partition executor stops making progress, quiesced followers may not elect a replacement for that partition. This is a known limitation of using node-level liveness for idle partition suppression.
- Set `EnableQuiescence = false` in tests or deployments where you intentionally disable SWIM with `PingInterval = 0`.

## Related Reading

- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Partition Scaling](../operations/partition-scaling.md)
- [SWIM Failure Detection](./swim-failure-detection.md)
- [Leader Election Internals](../internals/leader-election.md)
- [Configuration](../reference/configuration.md)
