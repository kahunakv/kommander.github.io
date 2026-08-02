# Compaction Internals

Compaction removes old WAL entries that are older than a checkpoint.

## Checkpoints

A checkpoint is a replicated log marker that says "the application has a stable point here." In Kommander, checkpoint entries use the same proposal and commit flow as other Raft log entries:

- `ProposedCheckpoint`
- `CommittedCheckpoint`
- `RolledBackCheckpoint`

Checkpoints do not replace application snapshots by themselves. They are markers that make it possible to remove old WAL entries once your application has enough durable state to recover without replaying everything before the checkpoint.

## Compaction Flow

`RaftWriteAhead.Compact`:

1. reads the last checkpoint for the partition through `ReadScheduler`
2. returns immediately if no checkpoint exists
3. calls `IWAL.CompactLogsOlderThan`
4. asks the adapter to remove up to `CompactNumberEntries` entries older than the checkpoint
5. repeats adapter calls until there is no more eligible work, the adapter removes fewer than `CompactNumberEntries`, or `MaxEntriesPerCompaction` is reached.

The relevant configuration values are:

| Setting | Meaning |
| --- | --- |
| `CompactEveryOperations` | Committed operations between automatic compaction triggers per partition. Set to `0` or lower to disable automatic compaction. |
| `CompactNumberEntries` | Maximum number of old entries the adapter should remove per `CompactLogsOlderThan` call. Values below `1` are clamped to `1`. |
| `MaxEntriesPerCompaction` | Maximum entries removed during one triggered compaction pass before yielding. Values below `CompactNumberEntries` are clamped up to the effective batch size. |

## Retain Floor

Each partition can also have in-memory retention floors:

- a single floor set through `IRaft.SetMinRetainIndex`
- zero or more composable holds from `IRaft.AcquireRetentionHold`.

Compaction uses the lower of:

- the last committed checkpoint
- the `SetMinRetainIndex` floor, when one is set
- the lowest active retention hold, when holds exist.

That lets an application retain the WAL tail that is newer than its own durable local snapshot, while temporary consumers can acquire independent holds without overwriting each other.

Values `0` or lower clear `SetMinRetainIndex` protection or create a hold that contributes no protection. Retention floors are local in-memory state. They reset on process restart and must be reasserted by the application.

## Checkpoint Lookup And Seek Hints

WAL backends maintain the last committed checkpoint as indexed metadata rather than rediscovering it with an unbounded log scan during restore and compaction checks.

RocksDB also keeps a per-partition compaction seek hint. After a compaction pass removes an old prefix, the next pass starts near the previous removal boundary instead of repeatedly seeking from the beginning of a large retained partition log.

## Safety Boundary

Compaction should only remove entries older than a committed checkpoint. Removing newer entries can break restore and follower catch-up.

Before relying heavily on compaction, make sure your application has a recovery strategy for state before the checkpoint. Kommander persists and replicates the Raft log; your application still owns its own domain snapshots or projections.

For partition `0` application deltas, `IRaftSystemStateTransfer` provides the whole-state repair path when a follower falls below the compaction floor. See [System Partition State Snapshots](../guides/system-partition-state-snapshots.md).
