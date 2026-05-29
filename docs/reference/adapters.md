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
    string? GetMetaData(string key);
    bool SetMetaData(string key, string value);
    RaftOperationStatus CompactLogsOlderThan(
        int partitionId,
        long lastCheckpoint,
        int compactNumberEntries
    );
}
```

## Communication Adapters

| Adapter | Use case |
| --- | --- |
| `GrpcCommunication` | Networked clusters using gRPC. |
| `RestCommunication` | Networked clusters using REST/JSON endpoints. |
| `InMemoryCommunication` | Unit tests and in-process simulations. |

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

## Discovery Adapters

| Adapter | Use case |
| --- | --- |
| `StaticDiscovery` | Fixed cluster membership. |
| `DynamicDiscovery` | Mutable in-memory node list controlled by the application. |
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
