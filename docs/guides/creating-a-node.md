# Creating A Node

`RaftManager` is the primary implementation of `IRaft`. A node combines these parts: the configuration, the discovery, the storage, the communication, a hybrid logical clock, the partition executors, and the fair WAL schedulers. The WAL is the write-ahead log.

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

Use a unique `NodeId` when you can. Kommander derives one from `NodeName` if `NodeId` is `0`.

## Core Components

| Component | Purpose |
| --- | --- |
| `RaftConfiguration` | The local node identity, the advertised endpoint, the timings, and the I/O settings. |
| `IDiscovery` | Gives the other visible nodes in the cluster. |
| `IWAL` | Persists the proposed, committed, rolled-back, and checkpoint log entries. |
| `ICommunication` | Sends the Raft protocol messages to the remote nodes. |
| `HybridLogicalClock` | Makes the timestamps for the proposal tickets. |
| Partition executors | Run the state machine of each partition serially. The Raft state then has one owner. |
| `ReadScheduler` / `WalScheduler` | Run the synchronous WAL reads and writes on fair worker queues. The queues are partition-aware. |

## Lifecycle

Subscribe to the restore callback and the replication callback first. Then call `JoinCluster`:

```csharp
raft.OnLogRestored += RestoreLog;
raft.OnReplicationReceived += ApplyCommittedLog;

using CancellationTokenSource joinTimeout = new(TimeSpan.FromSeconds(30));
await raft.JoinCluster(joinTimeout.Token);
```

You can pass no cancellation token of your own. `JoinCluster` then uses an internal timeout of 60 seconds. The timeout applies to the wait for the system partition to initialize the user partitions.

Call `LeaveCluster` at shutdown:

```csharp
await raft.LeaveCluster(dispose: true);
```

## Cluster Visibility

Use `GetNodes`, `GetLocalEndpoint`, `GetLocalNodeId`, and `GetLocalNodeName` to examine the local view:

```csharp
IList<RaftNode> visibleNodes = raft.GetNodes();
string endpoint = raft.GetLocalEndpoint();
int nodeId = raft.GetLocalNodeId();
```
