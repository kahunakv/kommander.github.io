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

Recent versions batch outbound Raft transport messages through `BatchRequests`. That includes append traffic and control traffic such as step-down notices and leadership-transfer requests.

Custom transports implement `ICommunication`.

```csharp
public interface ICommunication
{
    Task<HandshakeResponse> Handshake(RaftManager manager, RaftNode node, HandshakeRequest request);
    Task<RequestVotesResponse> RequestVotes(RaftManager manager, RaftNode node, RequestVotesRequest request);
    Task<VoteResponse> Vote(RaftManager manager, RaftNode node, VoteRequest request);
    Task<AppendLogsResponse> AppendLogs(RaftManager manager, RaftNode node, AppendLogsRequest request);
    Task<CompleteAppendLogsResponse> CompleteAppendLogs(RaftManager manager, RaftNode node, CompleteAppendLogsRequest request);
    Task<BatchRequestsResponse> BatchRequests(RaftManager manager, RaftNode node, BatchRequestsRequest request);
}
```

### Dynamic Membership Support

Current dynamic membership support is not identical across transports.

Practical state today:

- membership roster commits and join flow work on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`,
- graceful leave RPCs are wired on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`,
- cross-partition remote lag lookup for learner promotion is wired on `InMemoryCommunication`, `GrpcCommunication`, and `RestCommunication`,
- gossip anti-entropy is currently only wired on `InMemoryCommunication`,
- SWIM ping probing is currently only wired on `InMemoryCommunication`.

That means:

- gRPC and REST can still run membership commits and joins through Raft replication,
- gRPC and REST can use graceful leave through their transport RPCs,
- gRPC and REST can use remote follower lag lookups for learner promotion,
- gRPC and REST should keep `PingInterval = 0`,
- gossip and SWIM behavior are still more limited than in-process transport.

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
