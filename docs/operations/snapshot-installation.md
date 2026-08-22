# Snapshot Installation

Kommander uses snapshot installation when ordinary log backfill cannot repair a node that lags behind. Backfill is the transfer of missing committed log entries from the leader.

Backfill works while the leader still holds the missing committed log entries. Compaction removes those entries. A follower or a learner then needs a compact snapshot of the application state instead of the individual log records.

## When It Runs

Snapshot installation can run in these conditions:

- A follower is below the compaction floor of the leader.
- A learner joins after the compaction of old history.
- The application deltas on partition `0` need a repair of the whole state.
- A split or a merge of a user partition needs a move of the range state.

Kommander selects the snapshot kind from the partition and the registered transfer hooks:

| Snapshot kind | Used for | Required hook |
| --- | --- | --- |
| `Range` | The move of a user-partition range for a split or a merge. | `IRaftStateMachineTransfer` |
| `SystemState` | The whole application state on partition `0`. | `IRaftSystemStateTransfer` |

Partition `0` stays reserved for system-wide state. An application write there must use its own log type. It must never use `_RaftSystem`.

## Receive Contract

Kommander divides a large snapshot into bounded chunks. Every chunk in one transfer carries the same session metadata:

- `SessionId`
- `PartitionId`
- `SnapshotIndex`
- `LeaderTerm`
- `LeaderEndpoint`
- `LastIncludedTerm`
- `SnapshotKind`.

The receiver accepts the chunks in order only. It treats an exact duplicate of the immediately previous chunk as an idempotent success. It rejects a skipped, reordered, or negative chunk and drops the session. It also rejects a chunk that changes the metadata.

## Bounded Memory

The follower keeps the in-progress receive sessions bounded.

| Setting | Default | Description |
| --- | ---: | --- |
| `SnapshotReceiveSessionTtl` | `30 s` | The idle time before the next receive sweep expires an incomplete receive session. |
| `SnapshotMaxPendingSessions` | `8` | The maximum number of concurrent receive sessions across all partitions on one node. |
| `SnapshotMaxPendingBytes` | `512 MiB` | The maximum total bytes that the active sessions and the sessions in install hold in a buffer. |
| `AllowLegacySnapshotSenders` | `false` | Accepts snapshot senders that do not fill the leader fields and the boundary fields. Use it temporarily. |

A new session or a new chunk can exceed the count cap or the byte cap. Kommander then evicts the pending sessions with the oldest activity first. Kommander rejects one snapshot that cannot fit inside `SnapshotMaxPendingBytes`.

A completed snapshot buffer stays charged against the byte cap during its install. Therefore, a slow application import cannot let the memory grow without a bound.

## Durable Install Order

Kommander does not import the final chunk directly on the transport thread. It stages the complete snapshot. It then sends the install to the single-writer executor of that partition.

The executor does the durable sequence:

1. It rejects a stale leader by the term and the accepted leader endpoint.
2. It adopts a higher leader term with the same step-down rule as the other leader RPCs.
3. It calls the import hook of the application.
4. It installs a durable `CommittedCheckpoint` boundary in the WAL. The WAL is the write-ahead log.
5. It seeds the in-memory commit frontier and apply frontier from the snapshot boundary.
6. It permits normal backfill again after `SnapshotIndex`.

This order keeps the snapshot import, the term changes, the WAL changes, and the application delivery serial with every other partition operation.

## Application Import Requirements

Your import method must be idempotent for the snapshot identity:

```text
(partitionId, SnapshotIndex, LastIncludedTerm)
```

The application import can succeed while the WAL boundary write fails. The sender then sees a failure and retries the snapshot. The second import must leave the same final state.

Prefer an atomic replace pattern for a snapshot file or an embedded store:

1. Write the imported state to a temporary location.
2. Validate it.
3. Swap it into place atomically.
4. Record the snapshot index with the state.

## WAL Boundary Behavior

An install of a snapshot boundary writes a durable `CommittedCheckpoint` at `SnapshotIndex`.

The follower can already have a log entry at that index with the same term. Kommander then keeps the suffix above the boundary. If the term is different, Kommander truncates the suffix. Normal backfill then repairs the suffix from the leader.

Each built-in WAL backend implements the boundary write:

| WAL | Boundary behavior |
| --- | --- |
| `RocksDbWAL` | Deletes the conflicting suffix entries and writes the checkpoint in one RocksDB `WriteBatch`. |
| `SqliteWAL` | Probes the boundary term, deletes the conflicting suffix entries, and upserts the checkpoint. It uses one SQLite transaction under the shard lock. |
| `InMemoryWAL` | Applies the same retain-or-truncate rule under its in-memory partition guard. |

## Operational Notes

- Register the snapshot transfer hooks before `JoinCluster`.
- Keep `SnapshotMaxPendingBytes` well above the size of your largest snapshot plus one install in flight.
- Enable `GrpcEnableSnapshotCompression` when the snapshots are large and the network bandwidth is tighter than the CPU.
- Keep `AllowLegacySnapshotSenders = false` for a normal cluster.
- A learner join can time out after heavy compaction. Register the relevant transfer hook on every node.

## Related Reading

- [System Partition State Snapshots](../guides/system-partition-state-snapshots.md)
- [Elastic Partitions](../guides/elastic-partitions.md)
- [Log Backfill And Catch-Up](../guides/log-backfill-and-catch-up.md)
- [Checkpoints And Compaction](./checkpoints-and-compaction.md)
- [Configuration](../reference/configuration.md)
