# Snapshot Installation

Snapshot installation is the path Kommander uses when ordinary log backfill cannot repair a lagging node.

Backfill works while the leader still has the missing committed log entries. After compaction removes those entries, a follower or learner needs a compact application snapshot instead of individual log records.

## When It Runs

Snapshot installation can run when:

- a follower is behind the leader's compaction floor
- a learner joins after old history has been compacted
- partition `0` application deltas need whole-state repair
- a user partition split or merge needs range state movement.

Kommander chooses the snapshot kind from the partition and registered transfer hooks:

| Snapshot kind | Used for | Required hook |
| --- | --- | --- |
| `Range` | User-partition range movement for splits and merges. | `IRaftStateMachineTransfer` |
| `SystemState` | Whole application state on partition `0`. | `IRaftSystemStateTransfer` |

Partition `0` is still reserved for system-wide state. Application writes there must use their own log type, never `_RaftSystem`.

## Receive Contract

Large snapshots are split into bounded chunks. Every chunk in one transfer carries the same session metadata:

- `SessionId`
- `PartitionId`
- `SnapshotIndex`
- `LeaderTerm`
- `LeaderEndpoint`
- `LastIncludedTerm`
- `SnapshotKind`.

The receiver accepts chunks only in order. An exact duplicate of the immediately previous chunk is treated as idempotent success. Skipped, reordered, negative, or metadata-changing chunks reject and drop the session.

## Bounded Memory

The follower keeps in-progress snapshot sessions bounded.

| Setting | Default | Description |
| --- | ---: | --- |
| `SnapshotReceiveSessionTtl` | `30 s` | Idle time before an incomplete receive session is expired on the next receive sweep. |
| `SnapshotMaxPendingSessions` | `8` | Maximum concurrent receive sessions across all partitions on one node. |
| `SnapshotMaxPendingBytes` | `512 MiB` | Maximum total bytes buffered by active and installing snapshot sessions. |
| `AllowLegacySnapshotSenders` | `false` | Temporarily accepts snapshot senders that do not populate the leader and boundary metadata fields. |

When a new session or chunk would exceed the count or byte cap, Kommander evicts the least recently active pending sessions first. A single snapshot that cannot fit inside `SnapshotMaxPendingBytes` is rejected.

Completed snapshot buffers remain charged against the byte cap while their install is running, so a slow application import cannot let memory grow without bound.

## Durable Install Ordering

The final chunk is not imported directly on the transport thread. Kommander stages the complete snapshot and sends the install to that partition's single-writer executor.

The executor performs the durable sequence:

1. reject stale leaders by term and accepted leader endpoint
2. adopt a higher leader term using the same step-down rule as other leader RPCs
3. call the application import hook
4. install a durable `CommittedCheckpoint` boundary in the WAL
5. seed the in-memory commit and apply frontiers from the snapshot boundary
6. allow normal backfill to resume after `SnapshotIndex`.

This keeps snapshot import, term changes, WAL mutation, and application delivery serialized with every other partition operation.

## Application Import Requirements

Your import method must be idempotent for the snapshot identity:

```text
(partitionId, SnapshotIndex, LastIncludedTerm)
```

If the application import succeeds but the WAL boundary write fails, the sender sees failure and retries the snapshot. The second import must leave the same final state.

Prefer an atomic replace pattern for snapshot files or embedded stores:

1. write imported state to a temporary location
2. validate it
3. atomically swap it into place
4. record the snapshot index with the state.

## WAL Boundary Behavior

Installing a snapshot boundary writes a durable `CommittedCheckpoint` at `SnapshotIndex`.

If the follower already has a log entry at that index with the same term, Kommander keeps the suffix above the boundary. If the term does not match, the suffix is truncated and normal backfill repairs it from the leader.

The boundary write is implemented across the built-in WAL backends:

| WAL | Boundary behavior |
| --- | --- |
| `RocksDbWAL` | Deletes conflicting suffix entries and writes the checkpoint in one RocksDB `WriteBatch`. |
| `SqliteWAL` | Probes the boundary term, deletes conflicting suffix entries, and upserts the checkpoint in one SQLite transaction under the shard lock. |
| `InMemoryWAL` | Applies the same retain-or-truncate rule under its in-memory partition guard. |

## Operational Notes

- Register snapshot transfer hooks before `JoinCluster`.
- Keep `SnapshotMaxPendingBytes` comfortably above your largest snapshot plus one in-flight install.
- Enable `GrpcEnableSnapshotCompression` when snapshots are large and network bandwidth is tighter than CPU.
- Keep `AllowLegacySnapshotSenders = false` for normal clusters.
- If a learner join times out after heavy compaction, verify the relevant transfer hook is registered on every node.

## Related Reading

- [System Partition State Snapshots](../guides/system-partition-state-snapshots.md)
- [Elastic Partitions](../guides/elastic-partitions.md)
- [Log Backfill And Catch-Up](../guides/log-backfill-and-catch-up.md)
- [Checkpoints And Compaction](./checkpoints-and-compaction.md)
- [Configuration](../reference/configuration.md)
