# Durable Workflow State

Use Kommander to replicate workflow decisions so a process can recover and continue after crashes.

## Problem

Long-running workflows often span multiple process lifetimes:

- order fulfillment,
- billing retries,
- deployment rollouts,
- approval flows,
- data import pipelines.

If workflow state lives only in memory, a crash loses progress. If several nodes update the same workflow independently, they can make conflicting decisions.

## Kommander Pattern

Treat workflow transitions as committed decisions. The leader for a workflow partition appends each transition before the workflow runner moves forward.

```csharp
record WorkflowTransition(
    string WorkflowId,
    string FromState,
    string ToState,
    string Reason
);

int partitionId = raft.GetPartitionKey($"workflows/{workflowId}");

await raft.ReplicateLogs(
    partitionId,
    "WorkflowTransition",
    JsonSerializer.SerializeToUtf8Bytes(new WorkflowTransition(
        workflowId,
        "PaymentAuthorized",
        "ShipmentRequested",
        "Inventory reserved"
    )),
    cancellationToken: cancellationToken
);
```

## Applying State

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "WorkflowTransition")
        workflowProjection.ApplyTransition(log.LogData!);

    return Task.FromResult(true);
};
```

## Notes

- Keep external calls outside the callback. The callback should update state quickly.
- Store enough transition data to resume safely after restart.
- Use idempotency keys when workflow steps call external systems.
- Rehydrate workflow projections from `OnLogRestored` before accepting new work.
