# Partitioned Metadata

Use Kommander to build metadata services where each tenant, resource, or namespace maps to a Raft partition.

In this recipe, "metadata" means small control-plane data your service uses to make decisions: where a resource lives, who owns it, how traffic is routed, or which node should serve it.

## Problem

Metadata services often need stronger ordering than a cache but more control than a general database abstraction:

- tenant placement,
- resource ownership,
- service discovery metadata,
- shard maps,
- routing tables.

The data model is application-specific, but updates still need to be ordered and replicated.

## When This Is a Good Fit

Use this pattern when you have small, important records that are read often and updated through well-defined commands. It is a good fit for control-plane state, not large user documents or analytics data.

Partitioning lets independent groups of metadata make progress separately. One tenant's metadata changes do not need to share the same Raft partition as every other tenant.

## Kommander Pattern

Choose a stable key and route it to a partition. The partition leader accepts metadata commands for that key range.

The key should describe the thing whose ordering matters. In the example below, all commands for one tenant/resource pair use the same key, so they route consistently.

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

A projection is your application's local read model. It might be a dictionary, a database table, or a set of indexes optimized for reads. The important part is that it can be rebuilt from committed logs.

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "AssignResource")
        metadataProjection.ApplyAssignment(log.LogData!);

    return Task.FromResult(true);
};
```

## What Your Application Owns

Kommander gives you ordered metadata updates. Your application owns the metadata schema, validation rules, lookup APIs, secondary indexes, and any persistence used for projections.

## Notes

- Use `GetPartitionKey` when related keys share a prefix before the final `/`.
- Use `GetPrefixPartitionKey` when the whole routing key should be hashed.
- Keep projections rebuildable from `OnLogRestored`.
- If you need query indexes, build them in your application state machine.
