# Log Backfill And Catch-Up

Backfill is how a leader catches a lagging follower up without creating gaps in the follower's log.

Followers can fall behind when they are slow, paused, briefly disconnected, or newly joined as learners. Normal live replication handles small delays. Backfill handles larger gaps.

## The Mental Model

A follower log must stay contiguous and consistent with the leader.

If the leader has committed entries `1..10` and a follower only has `1..3`, the leader cannot simply send entry `10`. That would leave a hole from `4..9`.

Backfill fills the missing range in bounded chunks:

1. the leader detects that a follower is behind
2. it reads a slice of missing committed entries from its WAL
3. it sends that slice with a log-matching anchor
4. the follower accepts only if the anchor matches
5. the process repeats until the follower is close enough for normal live replication.

## Live Replication vs Backfill

Kommander has two replication paths.

| Path | Used when | Log matching anchor | Bound |
| --- | --- | --- | --- |
| Live replication | A follower is keeping up with current traffic. | No. `PrevLogIndex = 0`. | Ordinary proposal, commit, or rollback traffic. |
| Backfill | A follower lags by more than `BackfillThreshold`. | Yes. Uses `PrevLogIndex` and `PrevLogTerm`. | Up to `MaxBackfillEntriesPerRound` entries per round. |

The live path is intentionally not anchored. A slightly slow follower may not have the latest anchor yet, and rejecting ordinary live appends without the backfill recovery loop can stall proposals.

The backfill path is anchored because its job is specifically to repair missing history and replace divergent uncommitted tails.

## Detecting Lag

The leader tracks follower progress.

When a follower is behind the leader's committed index by more than:

- `BackfillThreshold`

the leader starts sending bounded backfill rounds.

You can inspect observed follower lag with:

```csharp
long? lag = await raft.GetFollowerLagAsync(
    partitionId: 1,
    followerEndpoint: "node-b:7000"
);
```

`null` means the local node does not have a recorded lag value for that follower and partition.

## Anchored Backfill

A backfill batch carries:

- `PrevLogIndex`
- `PrevLogTerm`
- the missing committed entries after that index.

The follower checks:

"Do I already have the entry at `PrevLogIndex` with term `PrevLogTerm`?"

If yes, it appends the batch. If it has an uncommitted divergent tail after that anchor, the tail is truncated and replaced by the leader's entries.

If no, the follower rejects with `LogMismatch`. The leader backs up and retries from an earlier point.

## Bounded Rounds

Backfill is intentionally bounded by:

- `MaxBackfillEntriesPerRound`

That keeps one slow follower from forcing the leader to read and ship a huge amount of WAL history in one operation. Large catch-ups happen across multiple rounds while normal replication and heartbeat traffic continue.

## Compaction Floor And SnapshotRequired

Backfill can only send entries that the leader still has.

Automatic compaction removes older log history below committed checkpoints. That creates a compaction floor: the earliest retained log index.

If a follower needs entries below that floor, the leader cannot backfill them. In that case the runtime reports:

- `RaftOperationStatus.SnapshotRequired`

That status means the follower needs a snapshot-style install path rather than ordinary log backfill.

This matters for dynamic membership: a brand-new learner joining a heavily compacted cluster may not be able to catch up from logs alone.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `BackfillThreshold` | `10` | Follower lag must exceed this before backfill starts. Smaller values start backfill earlier. |
| `MaxBackfillEntriesPerRound` | `128` | Maximum committed entries sent in one backfill round. Larger values catch up faster but send larger batches. |

Compaction settings also affect catch-up indirectly:

- `CompactEveryOperations`
- `CompactNumberEntries`
- `MaxEntriesPerCompaction`.

More aggressive compaction can make `SnapshotRequired` more likely for far-behind followers.

## Operational Notes

- Small follower delays should settle through live replication.
- Persistent lag beyond `BackfillThreshold` should trigger backfill.
- If lag does not shrink, inspect WAL read latency, transport failures, and follower health.
- If `SnapshotRequired` appears, the follower needs state below the retained WAL floor.
- For learner promotion, lag must stay within `LearnerPromotionLag` for `LearnerPromotionStableWindow`.

## Related Reading

- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Configuration](../reference/configuration.md)
- [WAL Internals](../internals/wal.md)
- [Compaction Internals](../internals/compaction.md)
