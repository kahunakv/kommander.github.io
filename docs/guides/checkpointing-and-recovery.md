# Checkpointing And Recovery

A checkpoint gives your application a durable safe point inside the log of a partition.

In Kommander, Raft replicates a checkpoint in the same way as a normal write. After the commit, the WAL can compact the entries that are older than that checkpoint. The WAL is the write-ahead log.

This guide tells you three things. It tells you when to write a checkpoint. It tells you what a checkpoint does during a restore. It tells you how a checkpoint relates to compaction.

## What A Checkpoint Means

A checkpoint is a marker. It says this:

"The system applied everything before this point. The partition can recover from this point."

This does **not** mean that Kommander serializes your domain state for you. Your application still owns its state machine and its restore logic.

Kommander gives these parts:

- replicated checkpoint entries
- a restore that starts at the last committed checkpoint boundary in the WAL
- eligibility for automatic compaction of the older log history.

## When To Write A Checkpoint

Write a checkpoint at these times:

- after a meaningful batch of committed work
- after you rebuild or refresh a derived local snapshot
- after a workflow phase, when a replay of the older history is no longer useful
- before a partition receives a large quantity of more traffic.

These patterns are less useful:

- a checkpoint after each single command
- no checkpoint at all
- a checkpoint in place of the restore logic of the application.

Without a checkpoint, compaction can reclaim little or nothing.

## Basic Flow

The usual sequence is:

1. Replicate the normal application entries.
2. Apply them through your state machine.
3. Replicate a checkpoint at intervals.
4. Let automatic compaction remove the older WAL history with time.

Example:

```csharp
RaftReplicationResult write = await raft.ReplicateLogs(
    partitionId: 2,
    type: "OrderPlaced",
    data: payload,
    cancellationToken: cancellationToken
);

if (write.Status != RaftOperationStatus.Success)
    return;

RaftReplicationResult checkpoint = await raft.ReplicateCheckpoint(
    partitionId: 2,
    cancellationToken: cancellationToken
);
```

`ReplicateCheckpoint` uses the same quorum path as a regular replication. Therefore, it still needs the partition leader and the follower acknowledgements before the commit.

## What Occurs During A Restore

At a restore, Kommander replays the WAL forward from the last committed checkpoint boundary.

For the application, the result is simple:

- A newer checkpoint reduces the history that the node can replay.
- The older history can disappear after compaction.
- Your restore code must still be correct from the retained checkpoint boundary forward.

Your rebuild behavior can need to be deterministic. Keep your restore path compatible with this sequence: start at the newest retained checkpoint, then replay the remaining committed entries.

## Relationship To Compaction

The checkpoints drive the automatic compaction.

The primary settings are:

- `CompactEveryOperations`
- `CompactNumberEntries`
- `MaxEntriesPerCompaction`

At each compaction, Kommander does these steps:

1. It finds the last committed checkpoint of the partition.
2. It removes the entries that are older than that checkpoint, in batches.
3. It stops when no eligible work remains, or when it reaches the limit of the pass.

Therefore, the checkpoints control **how much** old WAL data the system can remove. The compaction settings control **how fast** the system removes it.

## A Practical Strategy

For most applications, start with this approach:

- Write the normal commands freely.
- Add a checkpoint at a stable milestone. Do not add one at each write.
- Observe the WAL growth and the restore time.
- Increase the checkpoint frequency only if the replay time or the storage growth becomes a problem.

Examples of a stable milestone:

- each few hundred or few thousand applied operations
- the end of an accounting period
- the end of a tenant import
- the end of a durable workflow stage.

## What Your Application Still Owns

Kommander does not create a business snapshot file automatically. It does not serialize your in-memory domain objects.

Your application still decides these items:

- the state that it reconstructs during `OnLogRestored`
- the local snapshot representation, if it keeps one
- the point at which a checkpoint has a meaning for your domain
- the restore time and the WAL growth that are acceptable.

## Related Reading

- [Checkpoints And Compaction](../operations/checkpoints-and-compaction.md)
- [WAL Internals](../internals/wal.md)
- [Compaction Internals](../internals/compaction.md)
