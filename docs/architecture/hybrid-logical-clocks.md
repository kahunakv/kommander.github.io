# Hybrid Logical Clocks

Kommander uses hybrid logical clock timestamps as proposal tickets. An HLC timestamp combines physical time with a logical counter so events retain causal ordering even when clocks are close together or slightly skewed.

`RaftReplicationResult.TicketId` contains the HLC timestamp for a proposal. Use this ticket when manually committing or rolling back a proposal:

```csharp
RaftReplicationResult proposal = await raft.ReplicateLogs(
    partitionId: 1,
    type: "Reservation",
    data: payload,
    autoCommit: false,
    cancellationToken: cancellationToken
);

await raft.CommitLogs(1, proposal.TicketId);
```

The clock is also available directly:

```csharp
HybridLogicalClock clock = new();
HLCTimestamp timestamp = clock.SendOrLocalEvent(nodeId: 1);
```
