# Creating A Node

A node is one member of a Kommander cluster. In code, a node is one `RaftManager` instance, and each process in a real cluster usually runs one node. This page shows how to build a node, start it, and stop it. At the end, your process can join a cluster and receive committed entries.

You choose each part of the node yourself: where it stores the log, how it sends messages, and how it finds its peers. You can therefore embed Kommander in the host and the infrastructure that your service already uses.

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

Kommander includes RocksDB, SQLite, and in-memory WAL adapters. The external [Solarium WAL](../operations/solarium-wal.md) is another durable `IWAL` option and is passed to the same `RaftManager` constructor.

<ArchDiagram
  group="One Kommander node"
  sources={[
    {label: 'RaftConfiguration', icon: 'chip'},
    {label: 'IDiscovery', icon: 'server'},
    {label: 'IWAL', icon: 'database'},
    {label: 'ICommunication', icon: 'server'},
    {label: 'HybridLogicalClock', icon: 'chip'},
  ]}
  hub={{label: 'RaftManager', icon: 'layers'}}
  targets={[
    {label: 'Partition executors', sub: 'One serial owner for each partition', icon: 'log'},
    {label: 'ReadScheduler / WalScheduler', sub: 'Fair, partition-aware WAL I/O queues', icon: 'database'},
  ]}
  title="The RaftManager constructor combines RaftConfiguration, IDiscovery, IWAL, ICommunication, and a HybridLogicalClock. The RaftManager then runs the partition executors and the ReadScheduler and WalScheduler."
/>

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
