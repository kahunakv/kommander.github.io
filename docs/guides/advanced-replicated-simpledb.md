# Advanced Tutorial: Build A Replicated Key/Value Service

This tutorial studies [Kommander SimpleDB](https://github.com/kahunakv/kommander-simpledb), a small but complete three-node service built with ASP.NET Core, Kommander, gRPC, and SQLite.

Unlike the minimal Getting Started example, SimpleDB includes the application concerns that appear around consensus:

- partitioning keys across independent Raft groups
- routing HTTP requests to the correct partition leader
- replicating typed application commands
- maintaining a local materialized view on every node
- restoring that view after restart
- running separate public REST and internal gRPC endpoints
- shutting the cluster down cleanly.

The result is intentionally small, not a production database. Its value is showing where Kommander ends and application design begins.

## What You Will Build

The service exposes:

```text
PUT /keys/{key}   Store a string value
GET /keys/{key}   Read a string value
GET /health       Report whether the local Raft node is initialized
```

Three processes participate in eight user partitions. `raft.GetPartitionKey(key)` maps each key to a partition. Because every partition elects its own leader, the node responsible for one key may be a follower for another key.

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

The project references Kommander and the SQLite provider:

```xml
<ItemGroup>
  <PackageReference Include="Kommander" Version="0.17.1" />
  <PackageReference Include="Microsoft.Data.Sqlite" Version="10.0.9" />
</ItemGroup>
```

Use versions appropriate for your application when adapting the design.

## Understand The Two Durable Stores

SimpleDB keeps two different forms of durable state.

### Kommander WAL

Each node creates a `SqliteWAL` under its `raft` directory. This stores Raft proposals, terms, commit state, and checkpoints. Kommander uses it to recover the replicated log and consensus state.

### Application Database

`KeyValueStore` owns a separate `values.db` containing the latest value for every key:

```sql
CREATE TABLE IF NOT EXISTS key_values (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

This is a materialized view of committed commands, not the Raft log itself. Keeping the two responsibilities separate is important:

- Kommander decides which commands are committed and in what order
- the application decides how those commands become queryable domain state.

The example uses an idempotent SQLite upsert:

```sql
INSERT INTO key_values(key, value) VALUES ($key, $value)
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
```

Idempotency makes restore and repeated application harmless. A production state machine should make every command safe to replay or detect duplicates explicitly.

## Configure One Node

Each process has a public HTTP port and a separate Raft gRPC port. The gRPC endpoint is the address advertised to Kommander peers:

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

The short election values and disabled quiescence are development choices, not general production recommendations. Production timing must account for network latency, storage stalls, scheduler pressure, and SWIM timing.

Construct `RaftManager` with static discovery, SQLite WAL storage, gRPC communication, and an HLC:

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

Static discovery supplies initial contact points. It does not replace the committed membership roster used by dynamic membership.

## Host REST And gRPC Separately

Kestrel listens for HTTP/1 requests on the public API port and HTTP/2 requests on the Raft port:

```csharp
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.Listen(IPAddress.Parse(options.Host), options.HttpPort,
        listen => listen.Protocols = HttpProtocols.Http1);

    kestrel.Listen(IPAddress.Parse(options.Host), options.GrpcPort,
        listen => listen.Protocols = HttpProtocols.Http2);
});
```

Register and map Kommander's gRPC endpoints:

```csharp
builder.Services.AddKommanderGrpc();

WebApplication app = builder.Build();
app.MapGrpcRaftRoutes();
```

The REST API belongs to SimpleDB. The gRPC routes belong to Kommander's node-to-node protocol.

## Define A Replicated Command

The application models a write as a deterministic command:

```csharp
public sealed record PutCommand(string Key, string Value);
```

It assigns a stable application log type:

```csharp
public const string PutLogType = "simpledb.put";
```

The type lets one state-machine callback distinguish commands when the application adds more operations later.

Avoid putting nondeterministic decisions inside the apply callback. If a command needs an identifier, timestamp, price, or selected target, choose that value before replication and include it in the payload. Every node must derive the same state from the same committed bytes.

## Register The State Machine Before Joining

`ClusterService` subscribes to both live follower commits and startup restore before calling `JoinCluster`:

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

This establishes one state transition for restored and newly replicated commands. Returning `false` tells Kommander that the application could not apply the entry.

Keep callbacks deterministic and reasonably fast. Slow database or network work delays the partition executor. External side effects such as email, payments, or webhooks should be performed by a separate idempotent worker after the committed decision has been recorded.

## Join And Leave With The Host Lifecycle

The background service joins the cluster when ASP.NET Core starts:

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    await raft.JoinCluster(stoppingToken);
    await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
}
```

On shutdown it leaves cleanly:

```csharp
public override async Task StopAsync(CancellationToken cancellationToken)
{
    if (raft.Joined)
        await raft.LeaveCluster(cancellationToken: cancellationToken);

    await base.StopAsync(cancellationToken);
}
```

The API checks `raft.IsInitialized` and returns `503` until partitions have restored and initialized.

## Route A Key To Its Partition

Every request calculates the partition from the same stable key:

```csharp
int partition = raft.GetPartitionKey(key);
```

Do not change key normalization casually. If different callers hash different representations of the same logical key, related commands can land in different partitions and lose their expected ordering.

Partition `0` remains reserved for Kommander system state. `GetPartitionKey` returns a user partition from the replicated partition map.

## Redirect Requests To The Leader

Only the partition leader accepts the write. The example also sends reads to that leader so clients do not read an arbitrary follower's local view.

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

Kommander identifies leaders by their advertised Raft endpoint, such as `127.0.0.1:7102`. SimpleDB therefore keeps an application mapping from each Raft endpoint to its public REST base URL.

The redirect is HTTP `307 Temporary Redirect`. Preserving the method matters because a normal `302` can turn a redirected `PUT` into a `GET` in some clients.

If no leader appears within three seconds, the API returns `503`. That is the correct behavior during an election or loss of quorum: retry later instead of pretending the write succeeded.

## Replicate A PUT

Once the request reaches the partition leader, serialize the complete command and replicate it:

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

`ReplicateLogs` returns success after the proposal reaches quorum and commits. Followers receive committed entries through `OnReplicationReceived`. The proposing leader applies its own command explicitly after success, which is why the final `store.Put` is required in this example.

Do not update the application database before `ReplicateLogs` succeeds. Doing so would expose state that the cluster has not committed and might later reject.

## Serve A GET

After routing to the partition leader, a read uses the local materialized view:

```csharp
string? value = store.Get(key);

return value is null
    ? Results.NotFound()
    : Results.Ok(new { key, value, partition });
```

This is a practical leader-routed read, but it is not a formal Raft read barrier. There is also a small interval between quorum commit and the leader's explicit `store.Put` where a concurrent read could observe the previous value. Applications requiring strict linearizable-read semantics should design and test an explicit read protocol rather than assuming leader routing alone provides it.

## Consistent Results From Any Entry Point

A client can begin a request at any SimpleDB REST endpoint. The contacted node calculates the key's partition and either serves the request as that partition's leader or redirects the client to the node that currently leads it.

Provided the client follows the `307` redirect, it never intentionally reads from an arbitrary follower. All entry points therefore converge on the same committed, leader-owned view for that key. During an election or loss of quorum, the service returns `503` instead of serving a follower value that may be stale.

```text
GET node 1 ─┐
GET node 2 ─┼─► current leader for the key's partition ─► committed local view
GET node 3 ─┘
```

This consistency choice is important. A simple eventual replicator may accept writes independently on several nodes and reconcile them later. During that interval, two endpoints can return different answers, and the application must define conflict resolution. Kommander makes the opposite tradeoff: a partition accepts ordered writes through one leader and commits through quorum before success is returned. When the cluster cannot identify or support an authoritative leader, it fails the request instead of returning a knowingly divergent answer.

That does not override the read-barrier caveat above. The example demonstrates one committed order and avoids follower reads, but applications requiring strict linearizability must close the leader apply window and implement an explicit Raft read protocol.

## Run The Three-Node Cluster

The repository includes a script that publishes once and starts three processes:

```shell
./scripts/run-cluster.sh
```

| Node | REST API | Raft gRPC |
| --- | --- | --- |
| 1 | `http://127.0.0.1:7001` | `127.0.0.1:7101` |
| 2 | `http://127.0.0.1:7002` | `127.0.0.1:7102` |
| 3 | `http://127.0.0.1:7003` | `127.0.0.1:7103` |

Write through any node and allow `curl` to follow the leader redirect:

```shell
curl -L -X PUT http://127.0.0.1:7001/keys/name \
  -H 'Content-Type: application/json' \
  -d '{"value":"Ada"}'
```

Read through another node:

```shell
curl -L http://127.0.0.1:7002/keys/name
```

Try several keys and inspect the returned `partition` field. Different keys can route to different partitions and leaders.

Data persists under `/tmp/simpledb-cluster` by default. Set `SIMPLEDB_DATA_DIR` to use another location. Remove that directory only when you intentionally want a clean cluster.

## Grow It Into A Small Distributed Store

This pattern is a useful foundation for small, correctness-sensitive datasets such as:

- application configuration
- feature flags
- service routing metadata
- scheduler assignments
- workflow coordination state
- tenant or resource placement.

SQLite provides the local queryable view while Kommander provides ordered replication, failover, partition leadership, and durable consensus. Together they form a simple distributed state service whose schema and API remain under application control.

Kommander can add nodes through dynamic membership. A new node joins as a non-voting learner, catches up, and is promoted to a voter only after it stays within the configured lag threshold. This avoids counting an empty node toward quorum before it has the replicated history.

The SimpleDB sample itself is fixed to three nodes: `NodeOptions.Validate` expects three REST mappings and `run-cluster.sh` starts exactly three processes. To expand it:

1. replace the fixed validation and endpoint map with configuration for the full deployed roster
2. give every node a unique id, gRPC endpoint, REST endpoint, and data directory
3. use Kommander's dynamic membership join flow instead of treating static discovery as authoritative membership
4. ensure the new node can rebuild `values.db` from retained logs or an application snapshot
5. update clients or service discovery so any healthy REST endpoint can be used as the entry point.

Adding voters improves failure tolerance only when quorum remains available. It also increases replication work and may increase commit latency. Prefer an odd voter count and choose it from the failure budget instead of adding replicas without a quorum plan.

This example replicates the materialized key/value state to every node. More nodes do not automatically shard `values.db` or increase storage capacity. User partitions distribute leadership and write coordination; application state placement and transfer remain your responsibility if you want true data sharding.

## Test Failure And Recovery

Use these exercises to understand the behavior beyond the happy path.

### Stop A Non-Leader

Find which node serves a key, then stop a different node. With two of three voters still available, the leader should continue committing writes.

### Stop The Leader

Stop the process serving a key. Requests can briefly return `503` while that partition elects another leader. Retrying through a surviving node should redirect to the new leader and continue.

Because partitions elect independently, losing one process may trigger leadership changes for several partitions while others were already led elsewhere.

### Restart A Node

Restart a stopped node with the same id, ports, and data directory. Kommander restores its WAL and calls `OnLogRestored` for retained committed application entries. The idempotent upsert reconciles those entries with `values.db`, then normal replication or backfill catches up later commits.

### Lose Quorum

Stop two nodes. The remaining process cannot safely commit a new write and should return a replication failure or leader-unavailable response. Reads from its local SQLite file may contain old data, but the example's leader routing prevents presenting that node as an authoritative leader.

## Recovery Boundaries

The example persists `values.db`, so replaying retained commands is an idempotent reconciliation path. It does not implement application snapshots or state transfer.

That matters when adding compaction or elastic partitions:

- after old Raft entries are compacted, deleting `values.db` may leave too little retained history to rebuild from the beginning
- a split changes routing but application rows may also need to move to the new partition's state
- a new learner that cannot catch up from retained logs needs snapshot installation support.

Before enabling aggressive compaction or partition splits, define a durable snapshot format and implement the relevant checkpoint and state-transfer behavior.

## Production Hardening

Treat SimpleDB as an architectural example. A production service should address:

- TLS and node authentication instead of cleartext loopback gRPC
- externally reachable advertised endpoints and a durable REST-to-Raft endpoint mapping
- production election, heartbeat, SWIM, and timeout values
- request authentication and authorization at the application API
- payload size limits and input validation
- idempotency keys and retry behavior for ambiguous client timeouts
- explicit read-consistency requirements
- checkpoints, snapshots, compaction, and disaster recovery
- state transfer before elastic splits and merges
- admission-control responses such as `ProposalQueueFull`
- metrics, logs, health checks, and alerting
- rolling-upgrade and schema-migration behavior.

## Next Extensions

Once the basic cluster works, useful exercises are:

1. add a `simpledb.delete` command and keep the apply handler deterministic
2. return `ProposalQueueFull` as HTTP `429` with retry guidance
3. enable transport authentication and TLS
4. emit checkpoints and measure restart replay time
5. add a snapshot format for rebuilding `values.db`
6. implement state transfer and split a hot key range
7. expose partition load signals and enable automatic leader balancing
8. add integration tests that stop leaders and verify committed values survive.

## Related Documentation

- [Getting Started](../getting-started.md)
- [Replicating Logs](./replicating-logs.md)
- [Hosting Endpoints](./hosting-endpoints.md)
- [Security And Authentication](./security-and-authentication.md)
- [Checkpointing And Recovery](./checkpointing-and-recovery.md)
- [Elastic Partitions](./elastic-partitions.md)
- [Backpressure And Admission Control](../internals/backpressure-and-admission-control.md)
- [Metrics And Diagnostics](../internals/metrics-and-diagnostics.md)
