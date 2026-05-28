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

## In-Memory

`InMemoryCommunication` is intended for tests and in-process simulations. It does not require ASP.NET Core route mapping.
