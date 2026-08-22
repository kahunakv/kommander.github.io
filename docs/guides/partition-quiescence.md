# Partition Quiescence

Partition quiescence reduces the heartbeat traffic of idle partitions.

In normal Raft, a leader sends periodic heartbeats to every follower, for every partition that it leads. That behavior is useful while a partition is active. It is expensive when a cluster has many idle partitions.

Quiescence lets an idle partition become quiet. The partition keeps safe failover.

## What Quiescence Does

A partition leader can find that a partition was idle for a sufficient time. The leader then sends one final quiesce marker to the followers. After that, it stops the periodic heartbeats for that partition.

A follower that receives the marker changes its behavior. It no longer treats a missing heartbeat for that partition as a reason to start an election. Instead, it uses SWIM node liveness to decide if the node of the leader is still alive. SWIM is the failure detector of Kommander.

The leader is still the leader. The partition is only quiet.

For the failure detector itself, see [SWIM Failure Detection](./swim-failure-detection.md).

## Why This Matters

Without quiescence, the heartbeat traffic grows with two values:

- the node count
- the partition count.

A cluster with many mostly idle partitions can then do a large quantity of network work and CPU work. That work carries no application data.

Quiescence changes the idle case. The old idle case sends a heartbeat for every partition forever. The new idle case watches the node liveness one time through SWIM.

For the CPU side and the timer side of scaling with many partitions, see [Partition Scaling](../operations/partition-scaling.md).

## How A Partition Quiesces

A leader can quiesce a partition when all of these conditions are true:

- `EnableQuiescence` is `true`.
- The partition is not already quiesced.
- There are no active proposals.
- The idle time of the partition is more than `QuiesceAfter`.

The leader then sends an `AppendLogs` message with `Quiesce = true`. Each follower sets its local quiesced flag for that partition.

Quiescence is local runtime state. It is not a replicated application log entry. It does not change the quorum math.

## How A Partition Wakes Up

Each real write wakes the partition.

On the leader, the sequence is:

1. A client proposal arrives.
2. The leader clears the local quiesced state.
3. The runtime replicates the entry in the normal way.
4. The periodic heartbeats start again.

On a follower, any normal append with `Quiesce = false` clears the quiesced state.

The burst of writes ends. The partition can quiesce again when its idle time is more than `QuiesceAfter`.

## Failover While Quiesced

A quiesced follower does not use the election timeout of that partition while the node of the leader is still `Alive`.

Instead, the follower watches the SWIM node state:

- `Alive`: the follower stays quiet.
- `Suspect` or `Dead`: the follower leaves the quiesced state and starts the normal pre-vote path and election path.

The failover starts at `Suspect`, not at `Dead`. Therefore, it depends on approximately one `PingInterval`. It does not wait for the full `SuspicionTimeout`.

## Timing Requirements

Quiescence depends on SWIM.

Kommander validates these conditions when `EnableQuiescence = true`:

- `PingInterval > 0`
- `PingInterval < StartElectionTimeout`.

With SWIM disabled, a quiesced follower has no signal that the node of the leader died. With a `PingInterval` that is too high, the failover of a quiesced partition is slower than the ordinary election timeout.

The defaults are valid:

- `EnableQuiescence = true`
- `QuiesceAfter = 1500 ms`
- `PingInterval = 1 s`
- `StartElectionTimeout = 2000 ms`.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `EnableQuiescence` | `true` | Enables quiescence for idle partitions. Set it to `false` to keep the classic heartbeat of each partition at every interval. |
| `QuiesceAfter` | `1500 ms` | The idle time with no active proposals before the leader sends a quiesce marker and stops the heartbeats. |
| `PingInterval` | `1 s` | The SWIM probe cadence. It must be more than `0` and less than `StartElectionTimeout` when quiescence is enabled. |
| `SuspicionTimeout` | `5 s` | The time from `Suspect` to `Dead`. Quiesced failover starts at `Suspect`. Therefore, this value does not gate the quiesced failover latency directly. |
| `StartElectionTimeout` | `2000 ms` | The lower bound of the election timeout. `PingInterval` must be below this value while quiescence is enabled. |

## Operational Notes

- Quiescence is useful when you run many partitions and many of them are idle.
- A quiesced partition must wake immediately when a write arrives.
- A node can stay SWIM-alive while one partition executor stops its progress. Quiesced followers can then fail to elect a replacement for that partition. This is a known limit of node-level liveness for the suppression of idle partitions.
- Set `EnableQuiescence = false` in a test or a deployment where you disable SWIM with `PingInterval = 0`.

## Related Reading

- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Partition Scaling](../operations/partition-scaling.md)
- [SWIM Failure Detection](./swim-failure-detection.md)
- [Leader Election Internals](../internals/leader-election.md)
- [Configuration](../reference/configuration.md)
