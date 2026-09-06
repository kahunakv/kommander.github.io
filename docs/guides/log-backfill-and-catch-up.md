# Log Backfill And Catch-Up

Backfill is how a leader catches a lagging follower up without creating gaps in the follower's log.

Followers can fall behind when they are slow, paused, briefly disconnected, or newly joined as learners. Normal live replication handles small delays. Backfill handles larger gaps.

## How It Works

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
| Backfill | A follower lags by more than `BackfillThreshold`. | Yes. Uses `PrevLogIndex` and `PrevLogTerm`. | Up to `MaxBackfillEntriesPerRound` entries and `MaxBackfillBytesPerRound` payload bytes per round. |

The live path is intentionally not anchored. A slightly slow follower may not have the latest anchor yet, and rejecting ordinary live appends without the backfill recovery loop can stall proposals.

The backfill path is anchored because its job is specifically to repair missing history and replace divergent uncommitted tails.

## Detecting Lag

The leader tracks follower progress.

When a follower is behind the leader's committed index by more than:

- `BackfillThreshold`

the leader starts sending bounded backfill rounds.

`BackfillThreshold` is not a disable switch. It controls the actively-behind trigger, but idle-tail and crash-restart repair paths can still need backfill. Set `BackfillEnabled = false` only when a deployment intentionally does not want Kommander to catch lagging followers up through log shipping or snapshot fallback.

You can inspect observed follower lag with:

```csharp
long? lag = await raft.GetFollowerLagAsync(
    partitionId: 1,
    followerEndpoint: "node-b:7000"
);
```

`null` means the local node does not have a recorded lag value for that follower and partition.

Leaders also expose refusal diagnostics:

```csharp
IReadOnlyList<RaftBackfillStatus> statuses =
    raft.GetBackfillStatuses(partitionId);
```

An entry means the leader cannot safely send an anchored batch to that follower because no committed entry exists at the follower's anchor. `AnchorIndex`, `FirstAvailableIndex`, and `LastCheckpoint` help separate two cases:

- the anchor sits in an unresolved proposed range that must be repaired before backfill can continue
- the anchor is below the compaction floor and the follower needs snapshot installation.

This is diagnostic only. It is a point-in-time leader-side view and should not be used as a correctness gate.

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
- `MaxBackfillBytesPerRound`

That keeps one slow follower from forcing the leader to read and ship a huge amount of WAL history in one operation. The byte bound matters when log entries are large: an entry-count limit alone can still materialize a very large batch. Kommander always allows one entry through, even if that single entry is larger than the byte limit, so an oversized command does not block convergence forever.

Large catch-ups happen across multiple rounds while normal replication and heartbeat traffic continue.

## No-Progress Pacing

A follower can acknowledge a backfill batch without advancing its committed frontier. For example, it may have accepted duplicate entries while still missing the commit marker or a lower anchor needed to make the range contiguous.

Kommander treats that as a no-progress episode only after a later success acknowledgement proves the frontier did not move. It then backs off before sending the same kind of batch again:

- the pause starts around `HeartbeatInterval`
- it doubles while the follower keeps proving no progress
- it is capped by `BackfillNoProgressPauseCap`
- a real frontier advance resets the pause.

After `BackfillNoProgressAnchorFallbackShips` fruitless ships, the leader stops anchoring the next repair at `nextIndex` and anchors at the follower's reported committed frontier instead. Anchoring lower may resend idempotent entries, but it is safer than repeatedly anchoring above the entry the follower actually needs.

## Shared Backfill Reads

When several followers are behind at the same anchor in one heartbeat round, the leader reads that missing range from the WAL once and fans the same immutable batch out to each follower.

For gRPC, the encoded form is also shared for the round. This reduces repeated WAL reads, repeated RocksDB decode work, and repeated Protobuf encoding when a group of learners or restarted followers is catching up from the same point.

The cache is intentionally short-lived. It exists only for the current heartbeat round, so it does not need invalidation when new commits, truncation, or compaction happen later.

Empty reads are shared too. If the leader has compacted past a requested range, every follower waiting at that same anchor can move to the snapshot decision without repeating the same empty WAL read.

## Compaction Floor And Snapshot Repair

Backfill can only send entries that the leader still has.

Automatic compaction removes older log history below committed checkpoints. That creates a compaction floor: the earliest retained log index.

If a follower needs entries below that floor, the leader cannot backfill them. The runtime falls through to snapshot installation when the relevant transfer hook is registered. If snapshot transfer cannot proceed or keeps failing, inspect `GetSnapshotStatuses(partitionId)`.

This matters for dynamic membership: a brand-new learner joining a heavily compacted cluster may need `IRaftSystemStateTransfer` for partition `0` state or `IRaftStateMachineTransfer` for user-partition range state.

## Contiguous Delivery

Kommander delivers committed entries to application callbacks in log order.

If a follower sees a committed entry above a missing retained index, it withholds the later entry and waits for backfill to repair the gap. It does not skip forward and permanently lose the missing callback.

If the missing index is at or below the checkpoint floor, the gap is treated as compacted history. Snapshot installation seeds the checkpoint boundary, and delivery resumes after that boundary.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `BackfillEnabled` | `true` | Master switch for leader-driven backfill and snapshot fallback. `false` leaves lagging followers stale unless another path catches them up. |
| `BackfillThreshold` | `10` | Follower lag must exceed this before the actively-behind backfill trigger starts. Smaller values start active backfill earlier. |
| `FollowerSaturationBackoff` | `1 s` | Pause entry-carrying backfill to a follower after it reports WAL saturation. Heartbeats continue. |
| `MaxBackfillEntriesPerRound` | `128` | Maximum committed entries sent in one backfill round. Larger values catch up faster but send larger batches. |
| `MaxBackfillBytesPerRound` | `4 MiB` | Maximum log-payload bytes materialized for one backfill batch. One entry is still sent if a single entry exceeds the limit. |
| `BackfillNoProgressPauseCap` | `30 s` | Maximum pause between fruitless backfill batches to the same follower. |
| `BackfillNoProgressAnchorFallbackShips` | `2` | Number of fruitless ships before the next repair anchors at the follower's reported commit frontier. Values at or below `0` disable this fallback. |

Compaction settings also affect catch-up indirectly:

- `CompactEveryOperations`
- `CompactNumberEntries`
- `MaxEntriesPerCompaction`.

More aggressive compaction can make snapshot repair more likely for far-behind followers.

## Operational Notes

- Small follower delays should settle through live replication.
- Persistent lag beyond `BackfillThreshold` should trigger backfill.
- Raising `BackfillThreshold` very high does not disable every repair path; use `BackfillEnabled = false` for that.
- If lag does not shrink, inspect WAL read latency, transport failures, and follower health.
- If lag is stuck but the leader is not busy, check `raft.backfill.no_progress_pauses_total`. It means Kommander is pacing duplicate backfill work that the follower keeps acknowledging without progress.
- If `GetBackfillStatuses(partitionId)` stays non-empty, compare `LastCheckpoint` with `FirstAvailableIndex` to decide whether you are waiting on unresolved proposed entries or need snapshot repair.
- If `GetSnapshotStatuses(partitionId)` stays non-empty, the follower likely needs state below the retained WAL floor and snapshot repair is stuck or retrying.
- If several learners join at once, shared backfill reads reduce leader-side storage and encoding work, but `MaxBackfillEntriesPerRound` still controls per-round catch-up size.
- For learner promotion, lag must stay within `LearnerPromotionLag` for `LearnerPromotionStableWindow`.

## Related Reading

- [Dynamic Cluster Membership](./dynamic-cluster-membership.md)
- [Snapshot Installation](../operations/snapshot-installation.md)
- [Configuration](../reference/configuration.md)
- [WAL Internals](../internals/wal.md)
- [Compaction Internals](../internals/compaction.md)
