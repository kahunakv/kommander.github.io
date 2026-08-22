# Replicating Logs

A leader replicates the application payloads as ordered log entries. The `type` field is a string that the application defines. Your state machine uses it to interpret `LogData`.

Partition `0` is reserved for the system partition of Kommander. Use partition `1` or a higher number for application replication.

`ReplicateLogs` asks the cluster to remember a decision. The call is successful only after Raft accepts the proposal by its quorum rules. Each node then receives the committed entry through `OnReplicationReceived`.

Kommander does not examine the payload. Most applications serialize a command object to JSON, MessagePack, Protobuf, or another format. They then use `type` as the name of the command.

## Single Entry

```csharp
RaftReplicationResult result = await raft.ReplicateLogs(
    partitionId: 1,
    type: "OrderCreated",
    data: payload,
    cancellationToken: cancellationToken
);
```

## Multiple Entries

```csharp
RaftReplicationResult result = await raft.ReplicateLogs(
    partitionId: 1,
    type: "OrderEvent",
    logs: new[] { createdPayload, paidPayload, shippedPayload },
    cancellationToken: cancellationToken
);
```

Use this overload when all the entries share one application `type`.

Use [`ReplicateEntries`](./heterogeneous-write-coalescing.md) if one burst contains different entry types or different generation fences. That method accepts a type for each entry. It returns a result for each entry. It still coalesces the work into fewer proposals.

## Result

| Property | Description |
| --- | --- |
| `Success` | `true` when the operation completed correctly. |
| `Status` | The detailed `RaftOperationStatus`. |
| `TicketId` | The timestamp from the hybrid logical clock that identifies the proposal. |
| `LogIndex` | The last log index that the runtime assigned to the proposal. |

Examine `Success` and `Status` in your first integration. Use `TicketId` when you disable the auto-commit and must commit or roll back manually. Use `LogIndex` when your application tracks the committed order position.

## Manual Commit And Rollback

`ReplicateLogs` commits automatically by default. Set `autoCommit: false` to stop after the quorum proposal completes. Then commit or roll back explicitly:

```csharp
RaftReplicationResult proposal = await raft.ReplicateLogs(
    partitionId: 1,
    type: "PaymentReserved",
    data: payload,
    autoCommit: false,
    cancellationToken: cancellationToken
);

if (proposal.Success)
{
    (bool committed, RaftOperationStatus status, long commitLogId) =
        await raft.CommitLogs(1, proposal.TicketId);
}
```

A generation fence protects a partition from a write with an old generation number. Pass `expectedGeneration` explicitly if you use a generation fence with elastic partitions. Prefer named arguments. The order of the optional parameters then stays clear:

```csharp
RaftReplicationResult proposal = await raft.ReplicateLogs(
    partitionId: 1,
    type: "PaymentReserved",
    data: payload,
    autoCommit: false,
    expectedGeneration: generation,
    cancellationToken: cancellationToken
);
```

A rollback uses the same ticket:

```csharp
(bool rolledBack, RaftOperationStatus status, long rollbackLogId) =
    await raft.RollbackLogs(1, proposal.TicketId);
```

## Checkpoints

Replicate a checkpoint for a user partition:

```csharp
RaftReplicationResult checkpoint = await raft.ReplicateCheckpoint(1, cancellationToken);
```

Internally, a checkpoint entry uses `RaftLogType.ProposedCheckpoint`, `CommittedCheckpoint`, or `RolledBackCheckpoint`.

## Leadership

Only the partition leader can accept a proposal:

```csharp
bool quick = await raft.AmILeaderQuick(1);
bool leader = await raft.AmILeader(1, cancellationToken);
string endpoint = await raft.WaitForLeader(1, cancellationToken);
```

`AmILeaderQuick` examines the cached partition state. `AmILeader` waits for a maximum of the internal leadership timeout. `WaitForLeader` returns the endpoint of the elected leader, or it throws a `RaftException`.

Do not write to the WAL directly if the local node is not the leader. The WAL is the write-ahead log. Route the request to the leader, or retry later. Raft safety depends on writes through the partition leader.
