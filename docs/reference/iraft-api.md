# IRaft API

`IRaft` is the primary application-facing interface.

| Area | Members |
| --- | --- |
| Lifecycle | `JoinCluster`, `LeaveCluster`, `UpdateNodes` |
| Membership | `GetMembership`, `LocalRole`, `OnMembershipChanged` |
| Cluster state | `Joined`, `IsInitialized`, `GetNodes`, `GetLocalEndpoint`, `GetLocalNodeId`, `GetLocalNodeName`, `GetLastNodeActivity`, `GetActiveNodes`, `GetFollowerLagAsync` |
| Leadership | `AmILeaderQuick`, `AmILeader`, `ConfirmLeadershipAsync`, `WaitForLeader`, `WaitForLeaderStableAsync` |
| Replication | `ReplicateLogs`, `ReplicateEntries`, `ReplicateCheckpoint`, `CommitLogs`, `RollbackLogs` |
| Elastic partitions | `CreatePartitionAsync`, `RemovePartitionAsync`, `SplitPartitionAsync`, `MergePartitionsAsync`, `GetPartitionGeneration`, `GetPartitionMap`, `RegisterStateMachineTransfer` |
| System partition state | `RegisterSystemStateTransfer`, `SetMinRetainIndex`, `AcquireRetentionHold` |
| Partition load | `GetPartitionLogOpsPerSecond`, `GetPartitionWalQueueDepth`, `GetPartitionCommitWaitMs` |
| Partition routing | `GetPartitionKey`, `GetPrefixPartitionKey` |
| Transport entry points | `Handshake`, `RequestVote`, `Vote`, `AppendLogs`, `CompleteAppendLogs` |
| Components | `WalAdapter`, `Communication`, `Discovery`, `Configuration`, `HybridLogicalClock`, `ReadScheduler`, `WalScheduler` |
| Events | `OnRestoreStarted`, `OnRestoreFinished`, `OnReplicationError`, `OnLogRestored`, `OnReplicationReceived`, `OnLeaderChanged`, `OnPartitionMapChanged` |

The transport entry points are intended for communication adapters and HTTP/gRPC endpoint handlers. Normal application writes should use the replication APIs.

`RaftManager` also exposes system-partition callbacks on the concrete type for internal configuration replication. They are not part of `IRaft`.

## Lifecycle Notes

`JoinCluster` accepts an optional cancellation token:

```csharp
using CancellationTokenSource joinTimeout = new(TimeSpan.FromSeconds(30));
await raft.JoinCluster(joinTimeout.Token);
```

If you do not supply your own cancellation, `RaftManager` still applies an internal 60-second timeout while waiting for cluster initialization to complete.

There is also a seed-based overload:

```csharp
await raft.JoinCluster(
    new[] { "node-a:7000", "node-b:7000" },
    joinTimeout.Token
);
```

Current membership-capable builds join new nodes as learners first and only return once the node has been promoted to a committed voter.

## Membership

`GetMembership` returns a point-in-time snapshot of the committed cluster roster.

`LocalRole` tells you whether the local node is currently a:

- `Voter`
- `Learner`
- `Leaving`
- `NotMember`

```csharp
ClusterMembership roster = raft.GetMembership();
ClusterMemberRole localRole = raft.LocalRole;
```

Use `OnMembershipChanged` to observe roster version changes:

```csharp
raft.OnMembershipChanged += membership =>
{
};
```

`MembershipVersion` is monotonic for the life of the cluster and is the main fence for membership updates.

## Cluster Activity

`GetLastNodeActivity` returns the last HLC timestamp when the local node observed activity from a specific endpoint.

`GetActiveNodes` returns non-local endpoints seen within a time window. This is useful for diagnostics, health displays, and tests that need to confirm recent follower activity.

```csharp
HLCTimestamp lastSeen = raft.GetLastNodeActivity("node-b:2070");
IReadOnlyList<string> activeNodes = raft.GetActiveNodes(TimeSpan.FromSeconds(2));
```

`GetFollowerLagAsync` returns the observed lag for a follower on a partition when the local node has that progress information:

```csharp
long? lag = await raft.GetFollowerLagAsync(
    partitionId: 1,
    followerEndpoint: "node-b:2070"
);
```

`null` means there is no recorded lag value for that follower and partition on this node.

## Partition Load Signals

Use the partition-load accessors to observe leader-side replicated-log throughput and WAL saturation:

```csharp
double rate = raft.GetPartitionLogOpsPerSecond(partitionId);
int depth = raft.GetPartitionWalQueueDepth(partitionId);
double waitMs = raft.GetPartitionCommitWaitMs(partitionId);
```

The local leader reads live in-process values. Other nodes read the latest gossiped leader report, which requires `EnableLeaderBalancer = true` and can lag by one report interval plus propagation time.

All three methods return `0` for an unknown partition or when no leader report is available. `CommitWaitMs` retains its last value while idle, so use it with a nonzero log rate rather than as a standalone trigger.

See [Partition Load Signals](../guides/partition-load-signals.md) for signal semantics and split-trigger guidance.

## Replication APIs

Use `ReplicateLogs` when every payload in the call shares one type, one `autoCommit` value, and one generation fence.

Use `ReplicateEntries` when a consumer has a mixed batch of per-entry-typed writes for one partition:

```csharp
RaftBatchReplicationResult result = await raft.ReplicateEntries(
    partitionId: 1,
    entries:
    [
        new RaftProposalEntry("kv", keyValueBytes),
        new RaftProposalEntry("lock", lockBytes),
        new RaftProposalEntry("receipt", receiptBytes),
    ],
    cancellationToken: cancellationToken
);
```

`ReplicateEntries` returns one `RaftEntryResult` per input entry, index-aligned to the input list. It supports a leading auto-commit group plus one optional trailing manual group. Per-entry `ExpectedGeneration` fences let stale entries return `PartitionMoved` without necessarily failing their siblings.

See [Heterogeneous Write Coalescing](../guides/heterogeneous-write-coalescing.md) for the full result contract and batching rules.

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

raft.OnMembershipChanged += membership =>
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

`WaitForLeader` waits for the partition restore task to complete before starting its election wait. That means a large WAL restore is bounded by your cancellation token, not by the fixed leader-election polling budget. If restore fails, the method throws a `RaftException` that wraps the underlying restore failure.

`WaitForLeaderStableAsync` is especially useful in tests and operational flows where you want to avoid reacting to a leader that is still flapping.

Prefer the overload that includes an overall timeout when you want a bounded wait:

```csharp
string stableLeader = await raft.WaitForLeaderStableAsync(
    partitionId: 1,
    minStableFor: TimeSpan.FromMilliseconds(500),
    timeout: TimeSpan.FromSeconds(10),
    cancellationToken: cancellationToken
);
```

The overload without `timeout` treats `minStableFor` as a required stability window, not a deadline. It can wait indefinitely if leadership keeps changing and the cancellation token is not cancelled.

Use `ConfirmLeadershipAsync` before serving authoritative reads from local leader-owned state:

```csharp
if (!await raft.ConfirmLeadershipAsync(partitionId, cancellationToken))
    throw new InvalidOperationException("Leadership could not be confirmed; retry or redirect.");

OrderView order = localProjection.Get(orderId);
```

`AmILeaderQuick` and `AmILeader` report local leadership belief. They are useful for routing hints and quick checks, but a minority-partitioned leader can continue believing it is leader until it observes a higher term. `ConfirmLeadershipAsync` performs a same-term quorum acknowledgement round and waits until the local applied frontier covers the confirmed commit index. A read served after a `true` result is linearizable with respect to committed writes.

Concurrent confirmations coalesce into one in-flight round, and a fresh confirmation can be reused within the heartbeat interval. A `false` result means the node is not the published leader, quorum could not be confirmed within `LeadershipConfirmationTimeout`, apply catch-up did not finish in time, or admission control rejected the request.

## Test Hooks

`IRaft` exposes several advanced members marked with `EditorBrowsable(EditorBrowsableState.Never)`:

- `ForceLeaderForTestingAsync`
- `StepDownAsync`
- `TransferLeadershipAsync`
- `SuspendHeartbeatsAsync`
- `ResumeHeartbeatsAsync`

These are intended for deterministic tests and fault-injection scenarios, not ordinary application traffic or public API endpoints.

## System Partition State

Partition `0` can carry application-owned cluster-wide control state under application log types. The `_RaftSystem` log type is reserved for Kommander's own metadata and must not be used by application writes.

When application entries on partition `0` are deltas instead of full snapshots, register `IRaftSystemStateTransfer` on every node:

```csharp
raft.RegisterSystemStateTransfer(new ControlStateTransfer(store));
```

The transfer lets Kommander repair a node that has fallen below the partition `0` compaction floor by exporting and importing the whole application state. Registration is local process state and is not replicated.

Use `SetMinRetainIndex(0, snapshotIndex + 1)` after your application persists a local snapshot. This protects the unsnapshotted WAL tail from compaction for offline restart replay. The retain floor is in-memory and must be reasserted after restart.

Use `AcquireRetentionHold(partitionId, index)` when multiple independent consumers need temporary retention at the same time:

```csharp
using IDisposable hold = raft.AcquireRetentionHold(
    partitionId: 0,
    index: snapshotIndex + 1
);

await backup.CopyRetainedTailAsync(cancellationToken);
```

Unlike `SetMinRetainIndex`, retention holds compose. Kommander retains down to the minimum active hold index, and disposing a handle releases exactly that hold. A hold is synchronous, local to the process, idempotent on dispose, and resets on restart.

See [System Partition State Snapshots](../guides/system-partition-state-snapshots.md) for the full contract.

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
| `StaleMembership` | The roster version changed. Re-read membership and retry against the current version. |
| `ConcurrentMembershipChange` | Another membership change is already in flight. Retry after it commits. |
| `InsufficientVoters` | The requested removal would leave the cluster unavailable. Do not retry blindly. |
| `LogMismatch` | A follower rejected an anchored backfill append because its log did not match `PrevLogIndex` / `PrevLogTerm`. The leader backs up and retries. |
| `SnapshotRequired` | The follower needs entries below the leader's compaction floor. Ordinary log backfill cannot catch it up. |

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

## Replication Signature Note

`ReplicateLogs` takes `expectedGeneration` before `cancellationToken` in the optional-parameter list.

That makes named arguments the safest style for most callers:

```csharp
RaftReplicationResult result = await raft.ReplicateLogs(
    partitionId: 1,
    type: "OrderCreated",
    data: payload,
    expectedGeneration: generation,
    cancellationToken: cancellationToken
);
```
