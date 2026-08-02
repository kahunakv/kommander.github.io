# Checkpoints And Compaction

Checkpoint replication is part of the main application-facing flow.

## Replicating A Checkpoint

Use `ReplicateCheckpoint` to write a checkpoint entry through the same Raft quorum path as normal proposals:

```csharp
RaftReplicationResult checkpoint = await raft.ReplicateCheckpoint(
    partitionId: 1,
    cancellationToken: cancellationToken
);
```

Internally, checkpoints use:

- `ProposedCheckpoint`
- `CommittedCheckpoint`
- `RolledBackCheckpoint`

## Why Checkpoints Matter

Automatic WAL compaction only removes history that is older than the last committed checkpoint. If an application never writes checkpoints, there is little or nothing eligible to compact.

Think of a checkpoint as a marker that says: the application has a stable point here, and older WAL history may eventually become removable.

## Automatic Compaction

Kommander can trigger automatic WAL compaction per partition after a configured number of committed operations.

The relevant settings are:

- `CompactEveryOperations`
- `CompactNumberEntries`
- `MaxEntriesPerCompaction`

The compaction pass:

1. reads the last committed checkpoint
2. asks the WAL adapter to remove entries older than that checkpoint
3. repeats in batches until there is no more eligible work or the configured pass limit is reached.

This keeps one compaction trigger from monopolizing the partition indefinitely.

## Retain Floors

`SetMinRetainIndex(partitionId, index)` can protect a WAL tail from compaction.

This is useful when an application has persisted its own local snapshot and needs to keep only the deltas after that snapshot for offline replay:

```csharp
raft.SetMinRetainIndex(partitionId, snapshotIndex + 1);
```

For partition `0` application deltas, this is part of the system-state snapshot contract. The retain floor is in-memory and must be reasserted after process restart.

Values `0` or lower mean no protection. The effective compaction boundary is the lower of the last committed checkpoint and the retain floor.

## Retention Holds

Use `AcquireRetentionHold(partitionId, index)` when retention is temporary or when several independent consumers may protect different WAL ranges at the same time.

```csharp
using IDisposable hold = raft.AcquireRetentionHold(
    partitionId: 1,
    index: firstLogIndexNeeded
);

await copyJob.CopyLogsAsync(cancellationToken);
```

Retention holds compose safely:

- each hold protects entries down to its own index
- the effective hold floor is the minimum active hold index
- disposing a handle releases exactly one hold
- disposing a handle more than once is a no-op
- holds are in-memory and must be re-acquired after restart.

`SetMinRetainIndex` is useful for one owner that continuously publishes a local snapshot boundary. `AcquireRetentionHold` is safer for short-lived work such as point-in-time recovery capture, backup export, or concurrent consumers that should not overwrite each other's floor.

See [System Partition State Snapshots](../guides/system-partition-state-snapshots.md) for the partition `0` delta pattern.

## Snapshot Boundaries

When a follower installs a snapshot, Kommander writes a durable `CommittedCheckpoint` at the snapshot index. That checkpoint says the snapshot covers every committed entry up to and including that index.

The WAL backend decides atomically whether to keep or truncate the suffix above the boundary:

- if the local entry at the snapshot index has the same term, the suffix is retained
- if the term differs, the suffix is truncated and normal backfill repairs it from the leader.

Application snapshot imports must be idempotent for the same snapshot identity, because the leader can retry if the application import succeeds but the durable boundary write fails.

See [Snapshot Installation](./snapshot-installation.md) for the full install sequence.
