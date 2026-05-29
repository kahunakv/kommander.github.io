# Replicating Logs

Leaders replicate application payloads as ordered log entries. The `type` field is an application-defined string that helps your state machine decide how to interpret `LogData`.

Partition `0` is reserved for Kommander's system partition. Use partition `1` or higher for application replication.

Think of `ReplicateLogs` as "ask the cluster to remember this decision." The call succeeds only after Raft has accepted the proposal according to its quorum rules. After that, each node receives the committed entry through `OnReplicationReceived`.

Kommander does not inspect the payload. Most applications serialize a command object to JSON, MessagePack, Protobuf, or another format and use `type` as the command name.

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

## Result

| Property | Description |
| --- | --- |
| `Success` | `true` when the operation completed successfully. |
| `Status` | Detailed `RaftOperationStatus`. |
| `TicketId` | Hybrid logical clock timestamp that identifies the proposal. |
| `LogIndex` | Last log index assigned to the proposal. |

For most first integrations, check `Success` and `Status`. Use `TicketId` when you disable auto-commit and need to commit or roll back manually. Use `LogIndex` when your application wants to track the committed ordering position.

## Manual Commit And Rollback

`ReplicateLogs` auto-commits by default. Set `autoCommit: false` to stop after quorum proposal completion, then explicitly commit or roll back:

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

Rollback uses the same ticket:

```csharp
(bool rolledBack, RaftOperationStatus status, long rollbackLogId) =
    await raft.RollbackLogs(1, proposal.TicketId);
```

## Checkpoints

Replicate a checkpoint for a user partition:

```csharp
RaftReplicationResult checkpoint = await raft.ReplicateCheckpoint(1, cancellationToken);
```

Checkpoint entries use `RaftLogType.ProposedCheckpoint`, `CommittedCheckpoint`, or `RolledBackCheckpoint` internally.

## Leadership

Only the partition leader can accept proposals:

```csharp
bool quick = await raft.AmILeaderQuick(1);
bool leader = await raft.AmILeader(1, cancellationToken);
string endpoint = await raft.WaitForLeader(1, cancellationToken);
```

`AmILeaderQuick` checks cached partition state. `AmILeader` waits up to the internal leadership timeout. `WaitForLeader` returns the elected leader endpoint or throws `RaftException`.

If the local node is not leader, do not write directly to the WAL yourself. Route the request to the leader or retry later. Raft safety depends on writes going through the partition leader.
