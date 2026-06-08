# Durable Workflow State

Use Kommander to replicate workflow decisions so a process can recover and continue after crashes.

In this recipe, a workflow is a sequence of named states such as `Created`, `PaymentAuthorized`, `ShipmentRequested`, and `Completed`. Kommander records the transitions between those states so another node can recover the same view after a crash.

## Problem

Long-running workflows often span multiple process lifetimes:

- order fulfillment,
- billing retries,
- deployment rollouts,
- approval flows,
- data import pipelines.

If workflow state lives only in memory, a crash loses progress. If several nodes update the same workflow independently, they can make conflicting decisions.

## When This Is a Good Fit

Use this pattern when the important part is agreeing on the workflow's state transitions. For example, a deployment rollout should not move from `CanaryStarted` to `FullRollout` on one node while another node still thinks it is waiting for approval.

Kommander is not a full workflow engine. Your application still schedules timers, calls external services, manages retries, and decides which transition is allowed next.

## Kommander Pattern

Treat workflow transitions as committed decisions. The leader for a workflow partition appends each transition before the workflow runner moves forward.

The usual flow is:

1. Load the current workflow state from your projection.
2. Decide the next valid transition.
3. Commit that transition through Kommander.
4. Let workers perform any follow-up activity after the transition is committed.

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

The callback updates the local workflow projection. On restart, `OnLogRestored` can replay the same transitions so the process knows where each workflow stopped.

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "WorkflowTransition")
        workflowProjection.ApplyTransition(log.LogData!);

    return Task.FromResult(true);
};
```

## What Your Application Owns

Kommander stores the ordered transitions. Your application owns the state machine rules, timers, activity execution, retry policy, compensation logic, and any external calls.

## Notes

- Keep external calls outside the callback. The callback should update state quickly.
- Store enough transition data to resume safely after restart.
- Use idempotency keys when workflow steps call external systems.
- Rehydrate workflow projections from `OnLogRestored` before accepting new work.
