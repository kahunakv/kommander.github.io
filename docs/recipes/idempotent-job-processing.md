# Idempotent Job Processing

Use Kommander to make job state transitions explicit before workers perform side effects.

In this recipe, Kommander is the shared memory of the job lifecycle. It does not run the job for you. It helps every node agree that a job moved from pending to started, completed, or failed.

## Problem

Distributed workers can crash at awkward times:

- after claiming a job but before persisting ownership
- after calling an external API but before marking the job complete
- after timing out while another node takes over.

Without a replicated decision log, nodes may disagree about whether a job is pending, running, completed, or failed.

## When This Is a Good Fit

Use this pattern when work can be retried, but duplicate side effects would be harmful. Examples include sending notifications, charging a customer, indexing a document, or importing a batch of data.

The key idea is to separate "record the intent" from "do the side effect". First commit that the job started. Then perform the external work with an idempotency key. Finally commit whether the job completed or failed.

## Kommander Pattern

Replicate job state transitions as commands. Workers consult the committed state before doing work.

An idempotency key is a stable identifier that lets an external system recognize a repeated request. For example, `charge/order-123/payment-1` tells a payment provider that retries are the same logical charge, not new charges.

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

Each committed job event updates your local job projection. That projection is what workers check before deciding whether to start, retry, or skip a job.

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

## What Your Application Owns

Kommander orders the job transitions. Your application owns the job queue, timeout policy, retry limits, dead-letter handling, idempotency keys, and the actual side effects.

## Notes

- External side effects still need idempotency keys.
- Commit the intent before performing the side effect.
- Commit the result after the side effect completes.
- On recovery, inspect the committed job state and decide whether timed-out work should be retried.
