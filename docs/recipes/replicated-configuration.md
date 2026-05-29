# Replicated Configuration

Use Kommander to replicate operational configuration changes across all nodes in a service.

## Problem

Service replicas often need a consistent view of runtime settings:

- feature flags,
- routing weights,
- throttling limits,
- cluster-local service metadata,
- maintenance-mode switches.

If every node updates independently, requests can see inconsistent behavior.

## Kommander Pattern

Represent each configuration change as an append-only command. The leader commits the command, and every node applies it in the same order.

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

## Notes

- Include versions in your payload if clients need optimistic checks.
- Keep command payloads small. Large binary configuration should live in object storage, with Kommander replicating the reference and version.
- Rebuild the in-memory configuration cache from `OnLogRestored` during startup.
