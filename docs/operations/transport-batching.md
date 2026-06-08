# Transport Batching

Recent Kommander transport code relies more heavily on `BatchRequests`.

## What Gets Batched

Batched transport traffic includes:

- append-log traffic,
- append completions,
- vote and handshake traffic,
- control-plane messages such as step-down notices and leadership-transfer requests.

This reduces per-message overhead and gives transports one place to send mixed Raft traffic efficiently.

## Transport Adapters

The communication contract includes:

```csharp
Task<BatchRequestsResponse> BatchRequests(
    RaftManager manager,
    RaftNode node,
    BatchRequestsRequest request
);
```

Current adapters use that contract in different ways:

- `GrpcCommunication`: streaming batch requests.
- `RestCommunication`: HTTP JSON batch endpoint.
- `InMemoryCommunication`: in-process batch dispatch for tests and simulations.

## Operational Meaning

You do not usually call `BatchRequests` directly from application code. It is part of the transport layer. The important operational change is that more internal Raft traffic now shares the same batching path, which reduces transport churn under load.
