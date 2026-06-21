# Checkpointed Projections

Use Kommander checkpoints when your projection can always be rebuilt from the log, but replay time starts becoming a real operational cost.

This recipe is useful for services that keep a local read model in memory or in a small embedded store and want faster recovery without treating every single log entry as permanent history forever.

## Problem

A projection can be correct and still become expensive to rebuild if a busy partition accumulates a long WAL history.

Common symptoms:

- node restart takes too long
- restore callbacks replay a large amount of old history
- WAL storage keeps growing even though older state is no longer useful
- recovery time becomes harder to predict.

## When This Is a Good Fit

Use this pattern when your application state is naturally incremental and older history is less important than fast restore from a recent stable point.

Good examples:

- counters and quotas
- tenant metadata indexes
- job status tables
- workflow summaries
- leader-owned coordination state.

## Kommander Pattern

Replicate ordinary commands as usual, update your projection in the callbacks, and periodically commit a checkpoint after a stable batch of work.

```csharp
RaftReplicationResult write = await raft.ReplicateLogs(
    partitionId: 2,
    type: "QuotaAdjusted",
    data: payload,
    cancellationToken: cancellationToken
);

if (write.Status != RaftOperationStatus.Success)
    return;

if (shouldCheckpoint)
{
    await raft.ReplicateCheckpoint(
        partitionId: 2,
        cancellationToken: cancellationToken
    );
}
```

The checkpoint becomes a durable boundary. Later, automatic compaction can remove WAL entries older than the last committed checkpoint.

## Applying State

Your callbacks stay the same. The important part is that they remain deterministic and replayable.

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "QuotaAdjusted")
        quotaProjection.Apply(log.LogData!);

    return Task.FromResult(true);
};
```

After restart, Kommander restores from the latest committed checkpoint boundary and replays the remaining retained entries.

## What Your Application Owns

Kommander records the checkpoint entry. Your application still owns:

- the projection structure
- the rule for deciding when a checkpoint is worth writing
- restore behavior in `OnLogRestored`
- any local snapshot or persisted read-model format.

## Notes

- Do not checkpoint after every command unless you have measured a real need.
- Good checkpoint moments are batch boundaries, closed workflow stages, or periodic milestones.
- If you never write checkpoints, compaction cannot reclaim much history.
- Checkpointing helps restore and storage behavior, but it does not replace correct replay logic.
