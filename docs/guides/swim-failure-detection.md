# SWIM Failure Detection

Kommander uses a SWIM-style failure detector to track whether cluster nodes appear alive.

SWIM is node-level liveness. It answers questions like:

- is `node-a:7000` reachable?
- should this node be considered `Suspect`?
- has it stayed unreachable long enough to be considered `Dead`?

It does not decide Raft leadership and it does not directly change quorum membership. Those decisions still go through Raft.

## Where SWIM Is Used

SWIM supports two user-visible behaviors:

- dynamic membership can evict a dead member after the system-partition leader commits a `RemoveMember`
- partition quiescence lets idle partitions stop per-partition heartbeats while followers use SWIM to notice leader-node failure.

The important boundary is:

- SWIM detects liveness
- Raft commits membership changes
- Raft elections still decide partition leadership.

## How Probing Works

Each node periodically probes another node.

The normal flow is:

1. send a direct `Ping`
2. if direct ping times out, ask a few peers to relay indirect `PingReq` probes
3. if direct and indirect probes fail, mark the target `Suspect`
4. if it remains suspect for `SuspicionTimeout`, mark it `Dead`.

Indirect probing reduces false positives caused by one bad network path between two nodes.

## Liveness States

| State | Meaning |
| --- | --- |
| `Alive` | The node responded recently or refuted suspicion. |
| `Suspect` | Probes failed, but the node still has time to refute suspicion. |
| `Dead` | The node stayed unreachable past the suspicion window. |

Quiesced partitions react as soon as the leader node becomes not-`Alive`, so failover starts on `Suspect` rather than waiting for `Dead`.

## Incarnation And Refutation

SWIM uses an incarnation counter to avoid stale suspicion winning forever.

If a healthy node learns that others marked it `Suspect`, it increments its incarnation and gossips a newer `Alive` record. Other nodes accept the newer incarnation and clear the stale suspicion.

`Dead` is terminal locally. A falsely-dead node should rejoin through dynamic membership rather than trying to refute the old state.

## Eviction Is Still Raft

SWIM does not remove voters by itself.

When a voter is `Dead` for longer than `DeadMemberEvictionGrace`, the system-partition leader may commit a `RemoveMember` entry.

That keeps the safety boundary clear:

- SWIM is advisory liveness
- the committed roster on partition `0` remains the source of truth
- quorum changes happen only through Raft.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `PingInterval` | `1 s` | How often a node probes a random peer. Set to `0` or lower to disable SWIM. |
| `PingTimeout` | `500 ms` | Direct or indirect probe timeout. Lower values detect failures faster but can increase false positives on slow networks. |
| `IndirectPingFanout` | `2` | Number of relay peers used after a direct ping timeout. |
| `SuspicionTimeout` | `5 s` | Time a node may remain `Suspect` before becoming `Dead`. |
| `DeadMemberEvictionGrace` | `30 s` | How long a node must remain `Dead` before the system-partition leader may evict it. |

When `EnableQuiescence = true`, `PingInterval` must also be:

- greater than `0`
- lower than `StartElectionTimeout`.

Kommander validates these constraints at startup.

## Transport Support

Built-in transports support direct and indirect SWIM probing:

- `InMemoryCommunication`
- `GrpcCommunication`
- `RestCommunication`.

Custom transports should implement:

- `SendPing`
- `SendPingReq`.

If a custom transport falls back to the default failure-returning implementations, SWIM will treat probes as failed.

## Operational Notes

- Use `PingInterval` and `PingTimeout` that fit your network latency.
- Increase `SuspicionTimeout` if transient network stalls create false `Dead` transitions.
- Do not disable SWIM while quiescence is enabled.
- Watch membership changes and liveness logs together when diagnosing evictions.

## Related Reading

- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Partition Quiescence](./partition-quiescence.md)
- [Configuration](../reference/configuration.md)
- [Adapters](../reference/adapters.md)
