# Advanced Tutorial: Build A Replicated Key/Value Service

This tutorial examines [Kommander SimpleDB](https://github.com/kahunakv/kommander-simpledb). SimpleDB is a small but complete service with three nodes. It uses ASP.NET Core, Kommander, gRPC, and SQLite.

The Getting Started example is minimal. SimpleDB adds the application concerns around consensus:

- the division of keys across independent Raft groups
- the route from an HTTP request to the correct partition leader
- the replication of typed application commands
- a local materialized view on every node
- the restore of that view after a restart
- separate public REST endpoints and internal gRPC endpoints
- a clean shutdown of the cluster.

The result is small on purpose. It is not a production database. Its value is the boundary that it shows. Kommander ends at that boundary, and the application design starts.

## What You Will Build

The service gives these routes:

```text
PUT /keys/{key}   Store a string value
GET /keys/{key}   Read a string value
GET /health       Report whether the local Raft node is initialized
```

Three processes take part in eight user partitions. `raft.GetPartitionKey(key)` maps each key to a partition. Each partition elects its own leader. Therefore, the node that is responsible for one key can be a follower for another key.

```text
Client
  |
  | REST :7001/:7002/:7003
  v
SimpleDB node
  |-- leader routing by key
  |-- Kommander RaftManager
  |-- values.db         application materialized state
  `-- raft/             Kommander SQLite WAL
          |
          | gRPC :7101/:7102/:7103
          v
      peer nodes
```

## Prerequisites

- .NET SDK 10
- `curl`
- a local clone of `kommander-simpledb`

```shell
git clone https://github.com/kahunakv/kommander-simpledb.git
cd kommander-simpledb
```

The project refers to Kommander and to the SQLite provider:

```xml
<ItemGroup>
  <PackageReference Include="Kommander" Version="0.17.1" />
  <PackageReference Include="Microsoft.Data.Sqlite" Version="10.0.9" />
</ItemGroup>
```

Use the versions that are correct for your application when you adapt this design.

## Understand The Two Durable Stores

SimpleDB keeps two different forms of durable state.

### Kommander WAL

Each node creates a `SqliteWAL` in its `raft` directory. The WAL is the write-ahead log. It stores the Raft proposals, the terms, the commit state, and the checkpoints. Kommander uses it to recover the replicated log and the consensus state.

### Application Database

`KeyValueStore` owns a separate `values.db` file. That file contains the latest value of every key:

```sql
CREATE TABLE IF NOT EXISTS key_values (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

This file is a materialized view of the committed commands. It is not the Raft log. The separation of the two responsibilities is important:

- Kommander decides the commands that commit and their order.
- The application decides how those commands become domain state that you can query.

The example uses an idempotent SQLite upsert:

```sql
INSERT INTO key_values(key, value) VALUES ($key, $value)
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
```

Idempotency makes a restore and a repeated application harmless. A production state machine must make each command safe for a replay. It can also detect the duplicates explicitly.

## Configure One Node

Each process has a public HTTP port and a separate Raft gRPC port. The gRPC endpoint is the address that Kommander advertises to its peers:

```csharp
RaftConfiguration configuration = new()
{
    NodeName = $"simpledb-{options.NodeId}",
    NodeId = options.NodeId,
    Host = options.Host,
    Port = options.GrpcPort,
    InitialPartitions = options.Partitions,

    // This sample runs cleartext HTTP/2 only on loopback.
    GrpcScheme = "http://",
    TransportSecurity = new() { RequireTls = false },

    // Short timings make local failover demonstrations quicker.
    HeartbeatInterval = TimeSpan.FromMilliseconds(100),
    VotingTimeout = TimeSpan.FromMilliseconds(500),
    StartElectionTimeout = 300,
    EndElectionTimeout = 700,
    EnableQuiescence = false
};
```

The short election values and the disabled quiescence are development choices. They are not general production recommendations. Production timings must include the network latency, the storage stalls, the scheduler pressure, and the SWIM timings. SWIM is the failure detector of Kommander.

Construct `RaftManager` with static discovery, the SQLite WAL storage, the gRPC communication, and a hybrid logical clock:

```csharp
IRaft raft = new RaftManager(
    configuration,
    new StaticDiscovery([
        .. options.Peers.Select(endpoint => new RaftNode(endpoint))
    ]),
    new SqliteWAL(walDirectory, "v1", logger),
    new GrpcCommunication(),
    new HybridLogicalClock(),
    logger
);
```

Static discovery gives the initial contact points. It does not replace the committed membership roster of dynamic membership.

## Host REST And gRPC Separately

Kestrel listens for HTTP/1 requests on the public API port. It listens for HTTP/2 requests on the Raft port:

```csharp
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.Listen(IPAddress.Parse(options.Host), options.HttpPort,
        listen => listen.Protocols = HttpProtocols.Http1);

    kestrel.Listen(IPAddress.Parse(options.Host), options.GrpcPort,
        listen => listen.Protocols = HttpProtocols.Http2);
});
```

Register the gRPC endpoints of Kommander. Then map them:

```csharp
builder.Services.AddKommanderGrpc();

WebApplication app = builder.Build();
app.MapGrpcRaftRoutes();
```

The REST API belongs to SimpleDB. The gRPC routes belong to the node-to-node protocol of Kommander.

## Define A Replicated Command

The application models a write as a deterministic command:

```csharp
public sealed record PutCommand(string Key, string Value);
```

It assigns a stable log type for the application:

```csharp
public const string PutLogType = "simpledb.put";
```

The type lets one callback of the state machine identify the commands. This is useful when the application adds more operations later.

Do not put a nondeterministic decision inside the apply callback. A command can need an identifier, a timestamp, a price, or a selected target. Select that value before the replication. Then include it in the payload. Every node must derive the same state from the same committed bytes.

## Register The State Machine Before The Join

`ClusterService` subscribes to the live follower commits and to the startup restore. It does this before the call to `JoinCluster`:

```csharp
public ClusterService(IRaft raft, KeyValueStore store)
{
    this.raft = raft;
    this.store = store;

    raft.OnReplicationReceived += Apply;
    raft.OnLogRestored += Apply;
}
```

Both paths use the same handler:

```csharp
private Task<bool> Apply(int partitionId, RaftLog log)
{
    if (log.LogType != PutLogType || log.LogData is null)
        return Task.FromResult(true);

    PutCommand? command = JsonSerializer.Deserialize<PutCommand>(log.LogData);
    if (command is null)
        return Task.FromResult(false);

    store.Put(command.Key, command.Value);
    return Task.FromResult(true);
}
```

This gives one state transition for a restored command and for a newly replicated command. A return value of `false` tells Kommander that the application could not apply the entry.

Keep the callbacks deterministic and sufficiently fast. Slow database work or network work delays the partition executor. Use a separate idempotent worker for an external side effect such as an email, a payment, or a webhook. That worker must run after the system records the committed decision.

## Join And Leave With The Host Lifecycle

The background service joins the cluster at the start of ASP.NET Core:

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    await raft.JoinCluster(stoppingToken);
    await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
}
```

At shutdown, it leaves cleanly:

```csharp
public override async Task StopAsync(CancellationToken cancellationToken)
{
    if (raft.Joined)
        await raft.LeaveCluster(cancellationToken: cancellationToken);

    await base.StopAsync(cancellationToken);
}
```

The API examines `raft.IsInitialized`. It returns `503` until the partitions restore and initialize.

## Route A Key To Its Partition

Each request calculates the partition from the same stable key:

```csharp
int partition = raft.GetPartitionKey(key);
```

Do not change the key normalization without care. Two callers can hash different forms of the same logical key. The related commands then go to different partitions. They also lose their expected order.

Partition `0` stays reserved for the system state of Kommander. `GetPartitionKey` returns a user partition from the replicated partition map.

## Redirect A Request To The Leader

Only the partition leader accepts the write. The example also sends the reads to that leader. A client then does not read the local view of an arbitrary follower.

```csharp
if (await raft.AmILeaderQuick(partition))
    return null;

string leader = await raft.WaitForLeader(partition, timeout.Token);

if (!options.RestEndpoints.TryGetValue(leader, out string? restBase))
    return Results.Json(
        new { error = $"No REST endpoint is configured for leader {leader}." },
        statusCode: StatusCodes.Status503ServiceUnavailable
    );

string location = $"{restBase.TrimEnd('/')}/keys/{Uri.EscapeDataString(key)}";
return Results.Redirect(location, permanent: false, preserveMethod: true);
```

Kommander identifies a leader by its advertised Raft endpoint, such as `127.0.0.1:7102`. Therefore, SimpleDB keeps an application map. The map gives the public REST base URL of each Raft endpoint.

The redirect is an HTTP `307 Temporary Redirect`. The preserved method is important. A normal `302` can change a redirected `PUT` into a `GET` in some clients.

The API returns `503` if no leader appears in three seconds. That behavior is correct during an election or a loss of quorum. The client must retry later. The service must not report a write as successful.

## Replicate A PUT

The request reaches the partition leader. Serialize the complete command. Then replicate it:

```csharp
byte[] payload = JsonSerializer.SerializeToUtf8Bytes(
    new PutCommand(key, body.Value)
);

RaftReplicationResult result = await raft.ReplicateLogs(
    partition,
    ClusterService.PutLogType,
    payload,
    cancellationToken: cancellationToken
);

if (!result.Success)
{
    return Results.Json(
        new { error = $"Replication failed: {result.Status}" },
        statusCode: StatusCodes.Status503ServiceUnavailable
    );
}

store.Put(key, body.Value);
```

`ReplicateLogs` returns success after the proposal reaches quorum and commits. Each follower receives the committed entry through `OnReplicationReceived`. The leader that proposes the command applies it explicitly after the success. That is the reason for the final `store.Put` in this example.

Do not update the application database before `ReplicateLogs` is successful. That update shows state that the cluster did not commit. The cluster can also reject that state later.

## Serve A GET

The request goes to the partition leader first. The read then uses the local materialized view:

```csharp
string? value = store.Get(key);

return value is null
    ? Results.NotFound()
    : Results.Ok(new { key, value, partition });
```

This is a practical read through the leader. It is not a formal Raft read barrier. There is also a small interval between the quorum commit and the explicit `store.Put` of the leader. A concurrent read in that interval can see the previous value. Your application can need strict linearizable reads. Design and test an explicit read protocol for that requirement. Leader routing alone does not give it.

## Consistent Results From Any Entry Point

A client can start a request at any SimpleDB REST endpoint. The contacted node calculates the partition of the key. It then serves the request as the leader of that partition, or it redirects the client to the current leader.

The client must follow the `307` redirect. It then never reads from an arbitrary follower on purpose. Therefore, all entry points converge on the same committed view of that key. The leader owns that view. During an election or a loss of quorum, the service returns `503`. It does not serve a follower value that can be stale.

```text
GET node 1 ─┐
GET node 2 ─┼─► current leader for the key's partition ─► committed local view
GET node 3 ─┘
```

This choice about consistency is important. A simple eventual replicator can accept writes on several nodes independently. It then reconciles them later. During that interval, two endpoints can return different answers. The application must then define the conflict resolution. Kommander makes the opposite tradeoff. A partition accepts ordered writes through one leader. It commits through quorum before it returns success. The cluster can fail to identify or support an authoritative leader. It then fails the request. It does not return a knowingly divergent answer.

That behavior does not remove the caveat about the read barrier above. The example shows one committed order and prevents follower reads. An application that needs strict linearizability must close the apply window of the leader. It must also implement an explicit Raft read protocol.

## Run The Three-Node Cluster

The repository includes a script. The script publishes one time and starts three processes:

```shell
./scripts/run-cluster.sh
```

| Node | REST API | Raft gRPC |
| --- | --- | --- |
| 1 | `http://127.0.0.1:7001` | `127.0.0.1:7101` |
| 2 | `http://127.0.0.1:7002` | `127.0.0.1:7102` |
| 3 | `http://127.0.0.1:7003` | `127.0.0.1:7103` |

Write through any node. Let `curl` follow the leader redirect:

```shell
curl -L -X PUT http://127.0.0.1:7001/keys/name \
  -H 'Content-Type: application/json' \
  -d '{"value":"Ada"}'
```

Read through another node:

```shell
curl -L http://127.0.0.1:7002/keys/name
```

Try several keys. Examine the `partition` field in the result. Different keys can go to different partitions and different leaders.

The data persists in `/tmp/simpledb-cluster` by default. Set `SIMPLEDB_DATA_DIR` for another location. Remove that directory only when you want a clean cluster.

## Grow It Into A Small Distributed Store

This pattern is a useful base for a small dataset that is sensitive to correctness. Examples are:

- application configuration
- feature flags
- routing metadata for a service
- scheduler assignments
- coordination state for a workflow
- placement of a tenant or a resource.

SQLite gives the local view that you can query. Kommander gives the ordered replication, the failover, the partition leadership, and the durable consensus. Together they make a simple distributed state service. The application still controls the schema and the API.

Kommander can add a node through dynamic membership. A new node joins as a non-voting learner. It catches up. The cluster promotes it to a voter only after its lag stays inside the configured threshold. This prevents an empty node in the quorum count before it has the replicated history.

The SimpleDB sample is fixed at three nodes. `NodeOptions.Validate` expects three REST maps. `run-cluster.sh` starts exactly three processes. Do these steps to expand it:

1. Replace the fixed validation and the endpoint map with the configuration of the full deployed roster.
2. Give every node a unique id, gRPC endpoint, REST endpoint, and data directory.
3. Use the dynamic membership join flow of Kommander. Do not treat static discovery as the authoritative membership.
4. Make sure that the new node can rebuild `values.db` from the retained logs or from an application snapshot.
5. Update the clients or the service discovery. Any healthy REST endpoint can then be the entry point.

More voters improve the failure tolerance only while the quorum stays available. More voters also increase the replication work. They can increase the commit latency. Prefer an odd number of voters. Select that number from your failure budget. Do not add a replica without a plan for the quorum.

This example uses the default behavior of full replication. Therefore, the materialized key/value state is on every node. With the replica placement of Kommander enabled, a user partition can target a replication factor such as RF 3 instead of every voter. A client can then route to the replicas from `GetPartitionReplicas`. Your application still owns the SQLite schema, the query API, the snapshots, and the transfer of state after a change of the partition layout.

## Test Failure And Recovery

Use these exercises to understand the behavior after the normal path.

### Stop A Node That Is Not The Leader

Find the node that serves a key. Then stop a different node. Two voters of three stay available. The leader must continue to commit writes.

### Stop The Leader

Stop the process that serves a key. The requests can return `503` for a short time. That partition elects another leader. A retry through a node that survives must redirect to the new leader and continue.

Each partition elects a leader independently. The loss of one process can cause a change of leader for several partitions. Other partitions already had a leader in another place.

### Restart A Node

Restart a stopped node with the same id, the same ports, and the same data directory. Kommander restores its WAL. It then calls `OnLogRestored` for the retained committed application entries. The idempotent upsert reconciles those entries with `values.db`. Normal replication or backfill then catches up on the later commits. Backfill is the transfer of missing committed log entries from the leader.

### Lose The Quorum

Stop two nodes. The remaining process cannot commit a new write safely. It must return a replication failure or a leader-unavailable response. A read from its local SQLite file can contain old data. The leader routing of the example prevents the presentation of that node as an authoritative leader.

## Recovery Boundaries

The example persists `values.db`. Therefore, a replay of the retained commands is an idempotent reconciliation path. The example does not implement application snapshots or state transfer.

That limit is important for compaction and for elastic partitions:

- Compaction removes old Raft entries. A deletion of `values.db` after that can leave too little retained history for a rebuild from the start.
- A split changes the routes. The application rows can also need a move to the state of the new partition.
- A new learner that cannot catch up from the retained logs needs support for snapshot installation.

Define a durable snapshot format before you enable aggressive compaction or partition splits. Also implement the relevant checkpoint behavior and state-transfer behavior.

## Production Hardening

Treat SimpleDB as an architectural example. A production service must address these items:

- TLS and node authentication in place of cleartext loopback gRPC
- advertised endpoints that are reachable from outside, and a durable map from a REST endpoint to a Raft endpoint
- production values for the elections, the heartbeats, SWIM, and the timeouts
- request authentication and authorization at the application API
- limits on the payload size, and input validation
- idempotency keys and retry behavior for an ambiguous client timeout
- explicit requirements for the read consistency
- checkpoints, snapshots, compaction, and disaster recovery
- state transfer before an elastic split or merge
- admission-control responses such as `ProposalQueueFull`
- metrics, logs, health checks, and alerts
- behavior for a rolling upgrade and a schema migration.

## Next Extensions

The basic cluster works. These exercises are then useful:

1. Add a `simpledb.delete` command. Keep the apply handler deterministic.
2. Return `ProposalQueueFull` as the HTTP status `429` with retry guidance.
3. Enable the transport authentication and TLS.
4. Emit checkpoints. Measure the replay time at restart.
5. Add a snapshot format for a rebuild of `values.db`.
6. Implement state transfer. Split a hot key range.
7. Publish the partition load signals. Enable automatic leader balancing.
8. Add integration tests that stop a leader. Verify that the committed values survive.

## Related Documentation

- [Getting Started](../getting-started.md)
- [Replicating Logs](./replicating-logs.md)
- [Hosting Endpoints](./hosting-endpoints.md)
- [Security And Authentication](./security-and-authentication.md)
- [Checkpointing And Recovery](./checkpointing-and-recovery.md)
- [Elastic Partitions](./elastic-partitions.md)
- [Backpressure And Admission Control](../internals/backpressure-and-admission-control.md)
- [Metrics And Diagnostics](../internals/metrics-and-diagnostics.md)
