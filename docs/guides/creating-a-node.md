# Creating A Node

`RaftManager` is the main implementation of `IRaft`. A node combines configuration, discovery, storage, communication, a hybrid logical clock, and an actor system.

```csharp
IRaft raft = new RaftManager(
    actorSystem,
    configuration,
    discovery,
    walAdapter,
    communication,
    new HybridLogicalClock(),
    logger
);
```

Use a unique `NodeId` when possible. If `NodeId` is `0`, Kommander derives one from `NodeName`.

## Core Components

| Component | Purpose |
| --- | --- |
| `RaftConfiguration` | Local node identity, advertised endpoint, timing, and I/O settings. |
| `IDiscovery` | Provides the other visible nodes in the cluster. |
| `IWAL` | Persists proposed, committed, rolled-back, and checkpoint log entries. |
| `ICommunication` | Sends Raft protocol messages to remote nodes. |
| `HybridLogicalClock` | Produces proposal ticket timestamps. |
| `ActorSystem` | Runs Kommander's internal state machines. |

## Lifecycle

Call `JoinCluster` after subscribing to restore and replication callbacks:

```csharp
raft.OnLogRestored += RestoreLog;
raft.OnReplicationReceived += ApplyCommittedLog;

await raft.JoinCluster();
```

Call `LeaveCluster` when shutting down:

```csharp
await raft.LeaveCluster(disposeActorSystem: true);
```

## Cluster Visibility

Use `GetNodes`, `GetLocalEndpoint`, `GetLocalNodeId`, and `GetLocalNodeName` to inspect the local view:

```csharp
IList<RaftNode> visibleNodes = raft.GetNodes();
string endpoint = raft.GetLocalEndpoint();
int nodeId = raft.GetLocalNodeId();
```
