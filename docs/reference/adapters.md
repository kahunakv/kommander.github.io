# Adapters

Kommander keeps persistence, transport, and discovery pluggable.

## WAL Adapters

| Adapter | Use case |
| --- | --- |
| `RocksDbWAL` | Durable production-oriented storage backed by RocksDB. |
| `SqliteWAL` | Durable embedded storage backed by SQLite. |
| `InMemoryWAL` | Tests and simulations only. Data is lost when the process exits. |

```csharp
IWAL rocks = new RocksDbWAL("./data", "node-1", logger);
IWAL sqlite = new SqliteWAL("./data", "node-1", logger);
IWAL memory = new InMemoryWAL(logger);
```

`SqliteWAL` uses a fixed pool of SQLite shard databases. Partitions map to shards with `partitionId mod shardCount`, so `FairWalScheduler` group batches can be committed as one transaction per shard instead of one transaction per partition.

You can choose the shard count for a fresh WAL directory:

```csharp
IWAL sqlite = new SqliteWAL(
    path: "./data",
    revision: "node-1",
    logger: logger,
    syncWrites: true,
    shardCount: 4
);
```

Use fewer shards when write batching and fsync reduction matter most. Use more shards when independent SQLite shard concurrency matters more. The shard count is persisted the first time the directory is initialized; changing it later would remap partitions, so reopening an existing directory with a different non-zero shard count fails fast.

Both durable adapters also support `syncWrites: false` for benchmarks and some CI scenarios:

```csharp
IWAL fastRocks = new RocksDbWAL("./data", "node-1", logger, syncWrites: false);
IWAL fastSqlite = new SqliteWAL("./data", "node-1", logger, syncWrites: false);
```

With `syncWrites: false`, acknowledged writes may still be lost on process or machine crash. Use that mode only when crash durability is not part of what you are validating.

Custom adapters implement `IWAL`.

```csharp
public interface IWAL : IDisposable
{
    List<RaftLog> ReadLogs(int partitionId);
    List<RaftLog> ReadLogsRange(int partitionId, long startLogIndex);
    RaftOperationStatus Write(List<(int partitionId, List<RaftLog> logs)> logs);
    long GetMaxLog(int partitionId);
    long GetCurrentTerm(int partitionId);
    long GetLastCheckpoint(int partitionId);
    int CountPersistedLogs(int partitionId);
    int CountRemovableLogs(int partitionId);
    string? GetMetaData(string key);
    bool SetMetaData(string key, string value);
    (RaftOperationStatus Status, int Removed) CompactLogsOlderThan(
        int partitionId,
        long lastCheckpoint,
        int compactNumberEntries
    );
}
```

The counting methods are useful for tests, diagnostics, and compaction visibility:

- `CountPersistedLogs`: total persisted log rows for the partition.
- `CountRemovableLogs`: persisted rows strictly below the last committed checkpoint.

## Communication Adapters

| Adapter | Use case |
| --- | --- |
| `GrpcCommunication` | Networked clusters using gRPC streaming. |
| `RestCommunication` | Networked clusters using REST/JSON endpoints. |
| `InMemoryCommunication` | Unit tests and in-process simulations. |

Outbound Raft transport messages can be batched through `BatchRequests`. That includes append traffic and control traffic such as step-down notices and leadership-transfer requests.

Custom transports implement `ICommunication`.

At minimum, production transports should cover:

- core Raft RPCs: `Handshake`, `RequestVotes`, `Vote`, `AppendLogs`, `CompleteAppendLogs`, `BatchRequests`
- dynamic membership RPCs: `SendJoin`, `SendLeave`
- SWIM liveness RPCs: `SendPing`, `SendPingReq`
- learner and backfill support: `GetRemoteFollowerLag`, `SendInstallSnapshot`
- optional membership anti-entropy: `SendGossip`
- join failure notification: `NotifyJoinBlocked`.

Some methods have default no-op or failure-returning implementations, but relying on those defaults disables the corresponding runtime behavior.

### Dynamic Membership Support

Practical state today:

- membership roster commits and join flow work on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`
- graceful leave RPCs are wired on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`
- cross-partition remote lag lookup for learner promotion is wired on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`
- SWIM direct and indirect ping probing is wired on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`
- gossip anti-entropy and leader-balancer load reports are wired on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`.

That means:

- gRPC and REST can still run membership commits and joins through Raft replication
- gRPC and REST can use graceful leave through their transport RPCs
- gRPC and REST can use remote follower lag lookups for learner promotion
- gRPC and REST can use SWIM probing and partition quiescence
- gRPC and REST can exchange membership gossip and leader-balancer load reports.

## Discovery Adapters

| Adapter | Use case |
| --- | --- |
| `StaticDiscovery` | Fixed seed/contact list. Useful for bootstrap, not as the live membership authority. |
| `DynamicDiscovery` | Mutable in-memory contact list controlled by the application. Useful for tests and programmatic bootstrap. |
| `MulticastDiscovery` | UDP multicast discovery on local networks. |

`RedisDiscovery` is present in source as a placeholder and returns no nodes in this release. Do not use it for cluster formation.

Custom discovery providers implement `IDiscovery`:

```csharp
public interface IDiscovery
{
    Task Register(RaftConfiguration configuration);
    List<RaftNode> GetNodes();
}
```

With dynamic membership enabled, discovery helps nodes find contact points. The committed roster on partition `0` remains the source of truth for who actually belongs to the cluster and who counts toward quorum.
