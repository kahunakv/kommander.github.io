# SWIM Failure Detection

Kommander uses a failure detector in the SWIM style. The detector tracks the apparent liveness of each cluster node.

SWIM gives node-level liveness. It answers questions of this type:

- Is `node-a:7000` reachable?
- Must this node be `Suspect`?
- Was it unreachable long enough to be `Dead`?

SWIM does not decide Raft leadership. It does not change the quorum membership directly. Raft still makes those decisions.

## Where Kommander Uses SWIM

SWIM supports two behaviors that a user can see:

- Dynamic membership can evict a dead member after the system-partition leader commits a `RemoveMember` entry.
- Partition quiescence lets an idle partition stop the heartbeats of that partition. Followers then use SWIM to detect the failure of the leader node.

The boundary is important:

- SWIM detects liveness.
- Raft commits the membership changes.
- Raft elections still decide the partition leadership.

## How A Probe Works

Each node probes another node at regular intervals.

The normal flow is:

1. The node sends a direct `Ping`.
2. The node asks a few peers to relay indirect `PingReq` probes if the direct ping times out.
3. The node marks the target `Suspect` if the direct probe and the indirect probes fail.
4. The node marks the target `Dead` if the target stays suspect for `SuspicionTimeout`.

An indirect probe reduces the false positives that one bad network path between two nodes causes.

## Liveness States

| State | Meaning |
| --- | --- |
| `Alive` | The node responded recently, or it refuted the suspicion. |
| `Suspect` | The probes failed, but the node still has time to refute the suspicion. |
| `Dead` | The node stayed unreachable after the suspicion window. |

A quiesced partition reacts as soon as the leader node is no longer `Alive`. Therefore, the failover starts at `Suspect`. It does not wait for `Dead`.

## Incarnation And Refutation

SWIM uses an incarnation counter. The counter prevents a stale suspicion that wins forever.

A healthy node can learn that other nodes marked it `Suspect`. It then increments its incarnation and gossips a newer `Alive` record. Gossip is the exchange of membership messages between nodes. The other nodes accept the newer incarnation and clear the stale suspicion.

`Dead` is terminal for ordinary refutation through gossip. The eviction path still makes one final direct probe before the removal. If the node responds, Kommander restores the liveness entry and skips that eviction pass.

## Raft Still Controls Eviction

SWIM does not remove a voter by itself.

The system-partition leader can commit a `RemoveMember` entry when a voter is `Dead` for longer than `DeadMemberEvictionGrace`.

Before the leader commits the removal, it makes one direct last-chance probe. `PingTimeout` bounds that probe. This closes the common restart race. In that race, a node becomes reachable again after the `Dead` mark, but before the end of the grace period.

That keeps the safety boundary clear:

- SWIM gives advisory liveness.
- The committed roster on partition `0` stays the source of truth.
- Quorum changes occur only through Raft.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `PingInterval` | `1 s` | The interval at which a node probes a random peer. Set it to `0` or lower to disable SWIM. |
| `PingTimeout` | `500 ms` | The timeout of a direct probe or an indirect probe. A lower value detects a failure faster. It can also cause more false positives on a slow network. |
| `IndirectPingFanout` | `2` | The number of relay peers used after a direct ping times out. |
| `SuspicionTimeout` | `5 s` | The time that a node can stay `Suspect` before it becomes `Dead`. |
| `DeadMemberEvictionGrace` | `2 min` | The time that a node must stay `Dead` before the system-partition leader can evict it. |
| `EnableAutoRejoin` | `true` | Permits an evicted node that still runs to rejoin automatically through dynamic membership. |

When `EnableQuiescence = true`, `PingInterval` must also be:

- more than `0`
- less than `StartElectionTimeout`.

Kommander validates these constraints at startup.

## Transport Support

The built-in transports support the direct SWIM probe and the indirect SWIM probe:

- `InMemoryCommunication`
- `GrpcCommunication`
- `RestCommunication`.

A custom transport must implement these methods:

- `SendPing`
- `SendPingReq`.

A custom transport can keep the default implementations that return a failure. SWIM then treats every probe as a failed probe.

## Operational Notes

- Use a `PingInterval` and a `PingTimeout` that fit the latency of your network.
- Increase `SuspicionTimeout` if a temporary network stall causes a false `Dead` transition.
- Keep `DeadMemberEvictionGrace` long enough for routine restarts and cold WAL opens. The WAL is the write-ahead log.
- Do not disable SWIM while quiescence is enabled.
- Examine the membership changes and the liveness logs together when you diagnose an eviction.

## Related Reading

- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Partition Quiescence](./partition-quiescence.md)
- [Configuration](../reference/configuration.md)
- [Adapters](../reference/adapters.md)
