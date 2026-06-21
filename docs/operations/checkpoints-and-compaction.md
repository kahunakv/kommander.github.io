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
