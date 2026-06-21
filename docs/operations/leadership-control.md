# Leadership Control

Kommander includes leadership-control support in the runtime and tests.

## Stable Leader Waiting

`WaitForLeaderStableAsync` waits until the same non-empty leader endpoint has remained stable for a minimum duration:

```csharp
string stableLeader = await raft.WaitForLeaderStableAsync(
    partitionId: 1,
    minStableFor: TimeSpan.FromMilliseconds(500),
    cancellationToken: cancellationToken
);
```

This is useful when you do not want to react to a leader that is still flapping during startup or failover.

## Step Down

`StepDownAsync` asks the local leader to step down while keeping the node online as a follower:

```csharp
RaftOperationStatus status = await raft.StepDownAsync(
    partitionId: 1,
    cancellationToken: cancellationToken
);
```

The runtime can notify other nodes with a step-down notice so a new election can start promptly.

## Leadership Transfer

`TransferLeadershipAsync` asks the local leader to hand leadership to a specific up-to-date follower:

```csharp
RaftOperationStatus status = await raft.TransferLeadershipAsync(
    partitionId: 1,
    targetEndpoint: "node-b:2070",
    cancellationToken: cancellationToken
);
```

If the target is stale or unknown, the transfer can fail with a non-success `RaftOperationStatus`.

## Heartbeat Suspension

Two additional hooks exist for fault-injection tests:

- `SuspendHeartbeatsAsync`
- `ResumeHeartbeatsAsync`

These let tests pause and resume periodic outbound heartbeats for a partition without disabling all Raft traffic.

## Scope

These APIs are exposed on `IRaft`, but they are marked as advanced test hooks in the codebase. Treat them as deterministic-test and controlled-experiment tools, not normal application write APIs.
