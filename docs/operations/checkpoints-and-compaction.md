# Checkpoints And Compaction

Checkpoint replication is part of the main flow that the application uses.

## Replicate A Checkpoint

Use `ReplicateCheckpoint` to write a checkpoint entry. It uses the same Raft quorum path as a normal proposal:

```csharp
RaftReplicationResult checkpoint = await raft.ReplicateCheckpoint(
    partitionId: 1,
    cancellationToken: cancellationToken
);
```

Internally, a checkpoint uses these log types:

- `ProposedCheckpoint`
- `CommittedCheckpoint`
- `RolledBackCheckpoint`

## Why Checkpoints Matter

Automatic WAL compaction removes only the history that is older than the last committed checkpoint. The WAL is the write-ahead log. If an application writes no checkpoint, there is little or nothing to compact.

A checkpoint is a marker. It says that the application has a stable point here. Older WAL history can become removable later.

## Automatic Compaction

Kommander can start automatic WAL compaction for each partition after a configured number of committed operations.

The relevant settings are:

- `CompactEveryOperations`
- `CompactNumberEntries`
- `MaxEntriesPerCompaction`
- `CompactionLiveReplicaLagBudget`

A compaction pass does these steps:

1. It reads the last committed checkpoint.
2. It asks the WAL adapter to remove the entries that are older than that checkpoint.
3. It repeats in batches until no eligible work remains, or until it reaches the configured limit for one pass.

Because of the limit, one compaction trigger cannot hold the partition for an unbounded time.

## Live Replica Lag Hold

Compaction also considers live follower progress. If a follower is alive, still acknowledging the leader, and has not yet replicated entries below the checkpoint, the leader can temporarily hold the compaction floor behind that follower.

`CompactionLiveReplicaLagBudget` controls the maximum number of below-checkpoint entries retained for this purpose. The default is `100000`. This makes ordinary log backfill more likely to repair a live lagging replica before compaction forces a snapshot rescue.

Values at or below `0` disable this hold. Disabling it is safe for correctness, but it can make snapshot installation more common when followers are healthy but temporarily behind.

## Retain Floors

`SetMinRetainIndex(partitionId, index)` can protect a WAL tail from compaction.

This is useful when an application keeps its own local snapshot. The application then needs only the deltas after that snapshot for an offline replay:

```csharp
raft.SetMinRetainIndex(partitionId, snapshotIndex + 1);
```

For the application deltas on partition `0`, this call is part of the contract for system-state snapshots. The retain floor is in memory. You must set it again after a process restart.

A value of `0` or lower gives no protection. The effective compaction boundary is the lower of two values: the last committed checkpoint and the retain floor.

## Retention Holds

Use `AcquireRetentionHold(partitionId, index)` when the retention is temporary. Also use it when several independent consumers can protect different WAL ranges at the same time.

```csharp
using IDisposable hold = raft.AcquireRetentionHold(
    partitionId: 1,
    index: firstLogIndexNeeded
);

await copyJob.CopyLogsAsync(cancellationToken);
```

Retention holds compose safely:

- Each hold protects the entries down to its own index.
- The effective hold floor is the minimum index of the active holds.
- The disposal of a handle releases exactly one hold.
- A second disposal of the same handle does nothing.
- The holds are in memory. You must acquire them again after a restart.

`SetMinRetainIndex` is useful for one owner that publishes a local snapshot boundary continuously. `AcquireRetentionHold` is safer for short work such as a point-in-time recovery capture, a backup export, or concurrent consumers. Those consumers must not overwrite the floor of each other.

See [System Partition State Snapshots](../guides/system-partition-state-snapshots.md) for the delta pattern on partition `0`.

## Snapshot Boundaries

A follower installs a snapshot. Kommander then writes a durable `CommittedCheckpoint` at the snapshot index. That checkpoint says that the snapshot covers every committed entry up to that index and includes it.

The WAL backend decides atomically to keep or to truncate the suffix above the boundary:

- It retains the suffix if the local entry at the snapshot index has the same term.
- It truncates the suffix if the term is different. Normal backfill then repairs the suffix from the leader.

The snapshot import of the application must be idempotent for the same snapshot identity. The application import can succeed while the durable boundary write fails. The leader can then retry the snapshot.

See [Snapshot Installation](./snapshot-installation.md) for the full install sequence.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `CompactEveryOperations` | `10000` | Committed operations between automatic compaction triggers. Set to `0` or lower to disable automatic compaction. |
| `CompactNumberEntries` | `100` | Maximum entries removed per adapter delete batch. |
| `MaxEntriesPerCompaction` | `5000` | Maximum entries removed during one triggered compaction pass before yielding. |
| `CompactionLiveReplicaLagBudget` | `100000` | Maximum entries retained below a checkpoint for a live, acking follower that still needs ordinary backfill. |
