# Partitioned Metadata

Use Kommander to build metadata services where each tenant, resource, or namespace maps to a Raft partition.

## Problem

Metadata services often need stronger ordering than a cache but more control than a general database abstraction:

- tenant placement,
- resource ownership,
- service discovery metadata,
- shard maps,
- routing tables.

The data model is application-specific, but updates still need to be ordered and replicated.

## Kommander Pattern

Choose a stable key and route it to a partition. The partition leader accepts metadata commands for that key range.

```csharp
record AssignResource(string TenantId, string ResourceId, string Node);

string key = $"tenants/{tenantId}/resources/{resourceId}";
int partitionId = raft.GetPartitionKey(key);

await raft.ReplicateLogs(
    partitionId,
    "AssignResource",
    JsonSerializer.SerializeToUtf8Bytes(new AssignResource(
        tenantId,
        resourceId,
        "node-a"
    )),
    cancellationToken: cancellationToken
);
```

## Applying State

Each node applies committed commands to its own metadata projection.

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "AssignResource")
        metadataProjection.ApplyAssignment(log.LogData!);

    return Task.FromResult(true);
};
```

## Notes

- Use `GetPartitionKey` when related keys share a prefix before the final `/`.
- Use `GetPrefixPartitionKey` when the whole routing key should be hashed.
- Keep projections rebuildable from `OnLogRestored`.
- If you need query indexes, build them in your application state machine.
