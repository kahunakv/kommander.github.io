# Hosting Endpoints

Each process must give the equivalent Raft endpoints from its host application. This requirement applies to a network transport.

## gRPC

```csharp
using Kommander.Communication.Grpc;

WebApplication app = builder.Build();
app.MapGrpcRaftRoutes();
app.Run();
```

Use `GrpcCommunication` on the `RaftManager`:

```csharp
ICommunication communication = new GrpcCommunication();
```

## REST/JSON

```csharp
using Kommander.Communication.Rest;

WebApplication app = builder.Build();
app.MapRestRaftRoutes();
app.Run();
```

Use `RestCommunication` on the `RaftManager`:

```csharp
ICommunication communication = new RestCommunication();
```

For REST, configure `HttpScheme`, `HttpTimeout`, and `HttpVersion` on `RaftConfiguration`. For the transport authentication and the TLS settings, see [Security And Authentication](security-and-authentication.md).

`MapRestRaftRoutes` maps these protocol endpoints now:

| Method | Route |
| --- | --- |
| `POST` | `/v1/raft/handshake` |
| `POST` | `/v1/raft/request-vote` |
| `POST` | `/v1/raft/vote` |
| `POST` | `/v1/raft/append-logs` |
| `POST` | `/v1/raft/append-logs-batch` |
| `POST` | `/v1/raft/complete-append-logs` |
| `POST` | `/v1/raft/complete-append-logs-batch` |
| `POST` | `/v1/raft/batch-requests` |
| `GET` | `/v1/raft/get-leader/{partitionId}` |

## In-Memory

`InMemoryCommunication` is for tests and in-process simulations. It does not need a route map from ASP.NET Core.
