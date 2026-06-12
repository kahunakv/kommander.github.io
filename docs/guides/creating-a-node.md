# Creating A Node

`RaftManager` is the main implementation of `IRaft`. A node combines configuration, discovery, storage, communication, a hybrid logical clock, partition executors, and fair WAL schedulers.

```csharp
IRaft raft = new RaftManager(
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
| Partition executors | Run each partition state machine serially so Raft state has one owner. |
| `ReadScheduler` / `WalScheduler` | Run synchronous WAL reads and writes on fair, partition-aware worker queues. |

## Lifecycle

Call `JoinCluster` after subscribing to restore and replication callbacks:

```csharp
raft.OnLogRestored += RestoreLog;
raft.OnReplicationReceived += ApplyCommittedLog;

using CancellationTokenSource joinTimeout = new(TimeSpan.FromSeconds(30));
await raft.JoinCluster(joinTimeout.Token);
```

If you do not pass your own cancellation token, `JoinCluster` still uses an internal 60-second timeout while waiting for the system partition to initialize user partitions.

Call `LeaveCluster` when shutting down:

```csharp
await raft.LeaveCluster(dispose: true);
```

## Cluster Visibility

Use `GetNodes`, `GetLocalEndpoint`, `GetLocalNodeId`, and `GetLocalNodeName` to inspect the local view:

```csharp
IList<RaftNode> visibleNodes = raft.GetNodes();
string endpoint = raft.GetLocalEndpoint();
int nodeId = raft.GetLocalNodeId();
```
