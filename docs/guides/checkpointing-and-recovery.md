# Checkpointing And Recovery

Checkpoints give your application a durable "safe point" inside a partition's log.

In Kommander, a checkpoint is replicated through Raft just like a normal write. Once it is committed, the WAL can eventually compact entries older than that checkpoint.

This guide explains when to write checkpoints, what they do during restore, and how they relate to compaction.

## What A Checkpoint Means

Think of a checkpoint as a marker that says:

"Everything before this point has been applied, and the partition can recover starting from here."

That does **not** mean Kommander serializes your domain state for you. Your application still owns its state machine and restore logic.

What Kommander provides is:

- replicated checkpoint entries
- restore that starts from the latest committed checkpoint boundary in the WAL
- automatic compaction eligibility for older log history.

## When To Write A Checkpoint

Good times to write a checkpoint:

- after a meaningful batch of committed work
- after rebuilding or refreshing a derived local snapshot
- after a workflow phase where replaying older history is no longer useful
- before expecting a partition to accumulate a large amount of additional traffic.

Less useful patterns:

- writing a checkpoint after every single command
- never writing checkpoints at all
- treating checkpoints as a replacement for application restore logic.

If you never write checkpoints, compaction has little or nothing to reclaim.

## Basic Flow

The usual sequence is:

1. replicate normal application entries
2. apply them through your state machine
3. periodically replicate a checkpoint
4. let automatic compaction remove older WAL history over time.

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

`ReplicateCheckpoint` uses the same quorum path as regular replication. That means it still needs the partition leader and follower acknowledgements to commit.

## What Happens During Restore

On restore, Kommander replays the WAL from the latest committed checkpoint boundary forward.

From the application's point of view, the important implication is simple:

- newer checkpoints reduce how much history may need to be replayed
- older history may disappear after compaction
- your restore code must still be correct from the retained checkpoint boundary onward.

If you need deterministic rebuild behavior, keep your restore path compatible with starting from the newest retained checkpoint and replaying the remaining committed entries.

## Compaction Relationship

Automatic compaction is checkpoint-driven.

The main settings are:

- `CompactEveryOperations`
- `CompactNumberEntries`
- `MaxEntriesPerCompaction`

When compaction runs, Kommander:

1. finds the last committed checkpoint for the partition
2. removes entries older than that checkpoint in batches
3. stops when there is no more eligible work or the pass limit is reached.

This means checkpoints influence **how much** old WAL can be removed, while the compaction settings influence **how fast** that removal happens.

## A Practical Strategy

For most applications, start with this approach:

- write normal commands freely
- add checkpoints at stable milestones rather than every write
- observe WAL growth and restore time
- increase checkpoint frequency only if replay or storage growth becomes a problem.

Examples of stable milestones:

- every few hundred or few thousand applied operations
- after closing an accounting period
- after finishing a tenant import
- after completing a durable workflow stage.

## What Your Application Still Owns

Kommander does not automatically create a business snapshot file or serialize your in-memory domain objects.

Your application still decides:

- what state is reconstructed during `OnLogRestored`
- whether you maintain your own local snapshot representation
- when a checkpoint is meaningful for your domain
- whether restore time or WAL growth is acceptable.

## Related Reading

- [Checkpoints And Compaction](../operations/checkpoints-and-compaction.md)
- [WAL Internals](../internals/wal.md)
- [Compaction Internals](../internals/compaction.md)
