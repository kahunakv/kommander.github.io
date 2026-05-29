# Hosting Endpoints

When using network transports, each process must expose matching Raft endpoints from the hosting application.

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

For REST, configure `HttpScheme`, `HttpAuthBearerToken`, `HttpTimeout`, and `HttpVersion` on `RaftConfiguration`.

`MapRestRaftRoutes` currently maps these protocol endpoints:

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

`InMemoryCommunication` is intended for tests and in-process simulations. It does not require ASP.NET Core route mapping.
