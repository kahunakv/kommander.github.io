# Idempotent Job Processing

Use Kommander to make job state transitions explicit before workers perform side effects.

## Problem

Distributed workers can crash at awkward times:

- after claiming a job but before persisting ownership,
- after calling an external API but before marking the job complete,
- after timing out while another node takes over.

Without a replicated decision log, nodes may disagree about whether a job is pending, running, completed, or failed.

## Kommander Pattern

Replicate job state transitions as commands. Workers consult the committed state before doing work.

```csharp
record JobStarted(string JobId, string WorkerId, DateTimeOffset StartedAt);

int partitionId = raft.GetPartitionKey($"jobs/{jobId}");

RaftReplicationResult result = await raft.ReplicateLogs(
    partitionId,
    "JobStarted",
    JsonSerializer.SerializeToUtf8Bytes(new JobStarted(
        jobId,
        raft.GetLocalNodeName(),
        DateTimeOffset.UtcNow
    )),
    cancellationToken: cancellationToken
);

if (!result.Success)
    return;
```

## Applying State

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    switch (log.Type)
    {
        case "JobStarted":
            jobState.ApplyStarted(log.LogData!);
            break;
        case "JobCompleted":
            jobState.ApplyCompleted(log.LogData!);
            break;
        case "JobFailed":
            jobState.ApplyFailed(log.LogData!);
            break;
    }

    return Task.FromResult(true);
};
```

## Notes

- External side effects still need idempotency keys.
- Commit the intent before performing the side effect.
- Commit the result after the side effect completes.
- On recovery, inspect the committed job state and decide whether timed-out work should be retried.
