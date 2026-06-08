# Leader-Owned Workers

Use Kommander when a cluster should have exactly one active coordinator for a shard of work, while still allowing another node to take over after failure.

In this recipe, a "coordinator" is a loop that decides what should happen next. It might assign queue work, start a polling cycle, or schedule the next batch. The goal is not to make one process special forever. The goal is to let the current Raft leader act, and let another node take over if leadership changes.

## Problem

Many systems need background workers that should not run everywhere at once:

- polling an external API for one customer,
- assigning queue partitions,
- scheduling jobs for a tenant,
- refreshing derived data for a resource group.

Running the worker on every node can duplicate work. Running it on one fixed node creates a single point of failure.

## When This Is a Good Fit

Use this pattern when work can be divided into stable shards, such as a tenant, account, queue, region, or resource group. Each shard maps to one Kommander partition, and the leader for that partition is the only node allowed to coordinate that shard.

This is especially useful when duplicate coordination would be expensive or confusing, but temporary failover is acceptable. For example, if node-a crashes, node-b can become leader and continue after reading the committed decisions.

## Kommander Pattern

Map each work shard to a Kommander partition. Only the leader for that partition runs the coordinator loop.

The loop usually looks like this:

1. Pick the shard you want to coordinate.
2. Find the partition for that shard.
3. Check whether this node is currently the leader.
4. Commit a small command that records the decision.
5. Let application code perform the actual work after the decision is committed.

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

For example, a callback can mark that tenant `tenant-42` is ready for a polling cycle. A separate worker can then notice that state and call the external API with an idempotency key.

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "WorkerTick")
        workerState.ApplyTick(log.LogData!);

    return Task.FromResult(true);
};
```

## What Your Application Owns

Kommander decides which commands are committed and in what order. Your application still owns the worker implementation, retry policy, side-effect idempotency, rate limits, and any business rules about what work should happen next.

## Notes

- Recheck leadership before each coordination cycle.
- Make side effects idempotent because a leader can fail after committing a decision but before completing external work.
- Keep work partition keys stable so leadership maps predictably.
