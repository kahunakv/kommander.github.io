# Leader Election Internals

Each partition elects its own leader.

## Node States

A partition state machine can be in one of the usual Raft roles:

| State | Meaning |
| --- | --- |
| Follower | Accepts leader messages and votes for candidates. |
| Candidate | Requests votes after the leader appears unavailable. |
| Leader | Accepts proposals and sends heartbeats or append-log messages. |

## Heartbeats

Leaders periodically send heartbeats. In Kommander, an empty append-log request acts as the heartbeat path.

Followers track the last heartbeat using hybrid logical clock timestamps. If the leader is quiet for longer than the election timeout, a follower may start an election.

## Election Timeout

Each partition chooses a randomized election timeout between:

- `StartElectionTimeout`
- `EndElectionTimeout`

Randomized timeouts reduce the chance that many followers become candidates at the same time.

If an election fails to find quorum, Kommander increases the timeout using:

- `StartElectionTimeoutIncrement`
- `EndElectionTimeoutIncrement`

## Becoming Candidate

Before becoming a candidate, a node checks whether it appears outdated compared with known commit indexes from other nodes. If it is behind, it does not start leadership and backs off.

When a follower becomes a candidate:

1. it clears the known leader,
2. increments the term,
3. votes for itself,
4. asks peers for votes,
5. waits for `VotingTimeout`.

## Becoming Leader

A candidate becomes leader when it reaches quorum. After leadership is established, it begins sending heartbeats and can accept proposals for that partition.

The term protects against stale messages. Requests from old leaders or old terms are rejected so an outdated node cannot continue committing work.

## Cross-Partition Activity Hints

`RaftManager` tracks recent activity per node. A partition can use recent heartbeat activity seen elsewhere to avoid unnecessary elections when processing is delayed but the node is known to be alive.
