# IRaft API

`IRaft` is the primary application-facing interface.

| Area | Members |
| --- | --- |
| Lifecycle | `JoinCluster`, `LeaveCluster`, `UpdateNodes` |
| Cluster state | `Joined`, `IsInitialized`, `GetNodes`, `GetLocalEndpoint`, `GetLocalNodeId`, `GetLocalNodeName`, `GetLastNodeActivity`, `GetActiveNodes` |
| Leadership | `AmILeaderQuick`, `AmILeader`, `WaitForLeader`, `WaitForLeaderStableAsync` |
| Replication | `ReplicateLogs`, `ReplicateCheckpoint`, `CommitLogs`, `RollbackLogs` |
| Elastic partitions | `CreatePartitionAsync`, `RemovePartitionAsync`, `SplitPartitionAsync`, `MergePartitionsAsync`, `GetPartitionGeneration`, `GetPartitionMap`, `RegisterStateMachineTransfer` |
| Partition routing | `GetPartitionKey`, `GetPrefixPartitionKey` |
| Transport entry points | `Handshake`, `RequestVote`, `Vote`, `AppendLogs`, `CompleteAppendLogs` |
| Components | `WalAdapter`, `Communication`, `Discovery`, `Configuration`, `HybridLogicalClock`, `ReadScheduler`, `WalScheduler` |
| Events | `OnRestoreStarted`, `OnRestoreFinished`, `OnReplicationError`, `OnLogRestored`, `OnReplicationReceived`, `OnLeaderChanged`, `OnPartitionMapChanged` |

The transport entry points are intended for communication adapters and HTTP/gRPC endpoint handlers. Normal application writes should use the replication APIs.

`RaftManager` also exposes system-partition callbacks on the concrete type for internal configuration replication. They are not part of `IRaft`.

## Cluster Activity

`GetLastNodeActivity` returns the last HLC timestamp when the local node observed activity from a specific endpoint.

`GetActiveNodes` returns non-local endpoints seen within a time window. This is useful for diagnostics, health displays, and tests that need to confirm recent follower activity.

```csharp
HLCTimestamp lastSeen = raft.GetLastNodeActivity("node-b:2070");
IReadOnlyList<string> activeNodes = raft.GetActiveNodes(TimeSpan.FromSeconds(2));
```

## Events

Subscribe before `JoinCluster` if you need restore callbacks.

```csharp
raft.OnRestoreStarted += partitionId => { };
raft.OnRestoreFinished += partitionId => { };

raft.OnLogRestored += (partitionId, log) =>
{
    return Task.FromResult(true);
};

raft.OnReplicationReceived += (partitionId, log) =>
{
    return Task.FromResult(true);
};

raft.OnReplicationError += (partitionId, log) => { };

raft.OnLeaderChanged += (partitionId, leaderEndpoint) =>
{
    return Task.FromResult(true);
};

raft.OnPartitionMapChanged += ranges =>
{
};
```

## Leadership Helpers

Use `WaitForLeader` when you need the current leader endpoint before routing a request. Use `WaitForLeaderStableAsync` when you need the same non-empty leader to remain stable for a minimum duration.

```csharp
string leader = await raft.WaitForLeader(1, cancellationToken);

string stableLeader = await raft.WaitForLeaderStableAsync(
    1,
    TimeSpan.FromMilliseconds(500),
    cancellationToken
);
```

`WaitForLeaderStableAsync` is especially useful in tests and operational flows where you want to avoid reacting to a leader that is still flapping.

## Test Hooks

Recent Kommander builds expose several advanced members on `IRaft` marked with `EditorBrowsable(EditorBrowsableState.Never)`:

- `ForceLeaderForTestingAsync`
- `StepDownAsync`
- `TransferLeadershipAsync`
- `SuspendHeartbeatsAsync`
- `ResumeHeartbeatsAsync`

These are intended for deterministic tests and fault-injection scenarios, not ordinary application traffic or public API endpoints.

## Operation Status Values

| Status | Meaning |
| --- | --- |
| `Success` | Operation completed successfully. |
| `Errored` | Operation failed with an internal error. |
| `NodeIsNotLeader` | The local node is not leader for the requested partition. |
| `LeaderInOldTerm` | A request came from a leader with an old term. |
| `LeaderAlreadyElected` | A leader was already known for the term. |
| `LogsFromAnotherLeader` | A follower received logs from a node other than the expected leader. |
| `ActiveProposal` | Another proposal is still active. |
| `ProposalNotFound` | The supplied proposal ticket was not found. |
| `ProposalTimeout` | The proposal did not complete in time. |
| `ReplicationFailed` | Replication failed before commit. |
| `Pending` | Internal state used while asynchronous work is in progress. |
| `ProposalQueueFull` | The per-partition client proposal queue is full. Retry with backoff. |
| `RestoreInProgress` | The partition is still restoring from the WAL. Retry after a short delay. |
| `PartitionMoved` | The partition generation changed. Refresh the partition map and retry on the current owner. |

## Elastic Partition APIs

Kommander also exposes runtime partition lifecycle operations:

```csharp
RaftPartitionLifecycleResult created = await raft.CreatePartitionAsync(10);
RaftPartitionLifecycleResult split = await raft.SplitPartitionAsync(2);
RaftPartitionLifecycleResult merged = await raft.MergePartitionsAsync(2, 3);
RaftPartitionLifecycleResult removed = await raft.RemovePartitionAsync(10);
```

Useful companion APIs:

```csharp
long generation = raft.GetPartitionGeneration(2);
IReadOnlyList<RaftPartitionRange> map = raft.GetPartitionMap();
raft.RegisterStateMachineTransfer(new MyTransfer());
```

See [Elastic Partitions](../guides/elastic-partitions.md) for the full behavior and application responsibilities.
