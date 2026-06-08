# Replicated Configuration

Use Kommander to replicate operational configuration changes across all nodes in a service.

In this recipe, configuration is not edited independently on every node. Instead, each change is recorded as a command in Kommander. Every node applies the same commands in the same order, so they build the same configuration view.

## Problem

Service replicas often need a consistent view of runtime settings:

- feature flags,
- routing weights,
- throttling limits,
- cluster-local service metadata,
- maintenance-mode switches.

If every node updates independently, requests can see inconsistent behavior.

## When This Is a Good Fit

Use this pattern for small, important settings that affect how a service behaves while it is running. Good examples include feature flags, rollout percentages, routing weights, and maintenance switches.

Avoid storing large files, secrets, or high-churn metrics directly in the log. For large data, store the data somewhere else and replicate a reference, checksum, and version through Kommander.

## Kommander Pattern

Represent each configuration change as an append-only command. The leader commits the command, and every node applies it in the same order.

The command should describe the change, not just the final in-memory object. This makes startup recovery simpler because a node can replay the committed changes to rebuild its local configuration cache.

```csharp
record SetConfigValue(string Key, string Value, long Version);

int partitionId = raft.GetPrefixPartitionKey("config");

await raft.ReplicateLogs(
    partitionId,
    "SetConfigValue",
    JsonSerializer.SerializeToUtf8Bytes(new SetConfigValue(
        "routing.us-east.weight",
        "75",
        version: 42
    )),
    cancellationToken: cancellationToken
);
```

## Applying State

The state machine stores the latest value after the command is committed.

This local store can be an in-memory dictionary, a database table, or another projection owned by your application. Kommander only delivers the ordered command.

```csharp
raft.OnReplicationReceived += (partitionId, log) =>
{
    if (log.Type == "SetConfigValue")
    {
        SetConfigValue command =
            JsonSerializer.Deserialize<SetConfigValue>(log.LogData!)!;

        configurationStore.Set(command.Key, command.Value, command.Version);
    }

    return Task.FromResult(true);
};
```

## What Your Application Owns

Your service owns validation, authorization, schema choices, and how configuration is exposed to callers. For example, Kommander can replicate `routing.us-east.weight = 75`, but your application decides whether that value is valid and how it affects request routing.

## Notes

- Include versions in your payload if clients need optimistic checks.
- Keep command payloads small. Large binary configuration should live in object storage, with Kommander replicating the reference and version.
- Rebuild the in-memory configuration cache from `OnLogRestored` during startup.
