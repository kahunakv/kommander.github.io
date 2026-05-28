---
sidebar_position: 2
---

# Getting Started

Install Kommander from NuGet:

```shell
dotnet add package Kommander
```

Or with the NuGet Package Manager Console:

```powershell
Install-Package Kommander
```

## Minimal Node

This example creates one node using static discovery, RocksDB storage, and gRPC communication. In a real cluster, run one `RaftManager` per node with a unique host, port, node id, and a discovery list containing the other nodes.

```csharp
using System.Text;
using Kommander;
using Kommander.Communication.Grpc;
using Kommander.Data;
using Kommander.Discovery;
using Kommander.Time;
using Kommander.WAL;
using Microsoft.Extensions.Logging;
using Nixie;

ILoggerFactory loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
ILogger<IRaft> logger = loggerFactory.CreateLogger<IRaft>();

// Every node needs a stable identity and an advertised endpoint.
// Partition 0 is reserved for Kommander internals; user partitions start at 1.
RaftConfiguration configuration = new()
{
    NodeName = "node-1",
    NodeId = 1,
    Host = "localhost",
    Port = 8001,
    InitialPartitions = 8
};

IRaft raft = new RaftManager(
    // Kommander runs each Raft partition through lightweight actors.
    new ActorSystem(logger: logger),
    configuration,
    // StaticDiscovery is the simplest cluster membership option: list the peers
    // this node should contact. Do not include the local node in this list.
    new StaticDiscovery([
        new RaftNode("localhost:8002"),
        new RaftNode("localhost:8003")
    ]),
    // The WAL stores Raft log entries before they are applied to your state
    // machine, so committed work can be restored after a restart.
    new RocksDbWAL(path: "./data", revision: "node-1", logger),
    // The communication adapter must match the endpoints exposed by your host.
    // For gRPC, map the routes shown in the Hosting Endpoints guide.
    new GrpcCommunication(),
    // Proposal tickets use hybrid logical clock timestamps for causal ordering.
    new HybridLogicalClock(),
    logger
);

// This is where your application applies committed replicated entries.
// In a real service, decode log.LogData and update your own state machine.
raft.OnReplicationReceived += (partitionId, log) =>
{
    string payload = Encoding.UTF8.GetString(log.LogData ?? []);
    Console.WriteLine($"{partitionId}: {log.Id} {log.Type} {payload}");
    return Task.FromResult(true);
};

// Join starts discovery, restores WAL state, initializes partitions, and begins
// leader election and heartbeat processing.
await raft.JoinCluster();

using CancellationTokenSource timeout = new(TimeSpan.FromSeconds(10));

// Only the leader for a partition can accept new proposals for that partition.
if (await raft.AmILeader(1, timeout.Token))
{
    // ReplicateLogs writes the payload to the leader WAL, sends it to followers,
    // and auto-commits after quorum because autoCommit defaults to true.
    RaftReplicationResult result = await raft.ReplicateLogs(
        partitionId: 1,
        type: "Greeting",
        data: Encoding.UTF8.GetBytes("Hello from Kommander"),
        cancellationToken: timeout.Token
    );

    Console.WriteLine(result.Success
        ? $"Committed log #{result.LogIndex}"
        : $"Replication failed: {result.Status}");
}

// LeaveCluster stops Raft processing. Passing disposeActorSystem disposes the
// actor runtime created for this sample.
await raft.LeaveCluster(disposeActorSystem: true);
```

## Next Steps

- Create and configure a node in [Creating A Node](guides/creating-a-node.md).
- Replicate proposals in [Replicating Logs](guides/replicating-logs.md).
- Expose transport routes in [Hosting Endpoints](guides/hosting-endpoints.md).
