# Leader-Owned Workers

Use Kommander when a cluster should have exactly one active coordinator for a shard of work, while still allowing another node to take over after failure.

## Problem

Many systems need background workers that should not run everywhere at once:

- polling an external API for one customer,
- assigning queue partitions,
- scheduling jobs for a tenant,
- refreshing derived data for a resource group.

Running the worker on every node can duplicate work. Running it on one fixed node creates a single point of failure.

## Kommander Pattern

Map each work shard to a Kommander partition. Only the leader for that partition runs the coordinator loop.

```csharp
int partitionId = raft.GetPrefixPartitionKey("tenant-42");

if (!await raft.AmILeader(partitionId, cancellationToken))
    return;

RaftReplicationResult result = await raft.ReplicateLogs(
    partitionId,
    "WorkerTick",
    JsonSerializer.SerializeToUtf8Bytes(new WorkerTick("tenant-42")),
    cancellationToken: cancellationToken
);
```

## Applying State

Use `OnReplicationReceived` to record that a worker decision was committed. The callback should update your local state machine, not perform unbounded external side effects inline.

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "WorkerTick")
        workerState.ApplyTick(log.LogData!);

    return Task.FromResult(true);
};
```

## Notes

- Recheck leadership before each coordination cycle.
- Make side effects idempotent because a leader can fail after committing a decision but before completing external work.
- Keep work partition keys stable so leadership maps predictably.
