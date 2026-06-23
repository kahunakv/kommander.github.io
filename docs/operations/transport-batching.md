# Transport Batching

Kommander transport code uses `BatchRequests` for grouped transport work.

## What Gets Batched

Batched transport traffic includes:

- append-log traffic
- append completions
- vote and handshake traffic
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

You do not usually call `BatchRequests` directly from application code. It is part of the transport layer. Internal Raft traffic shares this batching path, which reduces transport churn under load.

## gRPC Append-Log Coalescing

The gRPC transport can also coalesce append-log stream writes.

When `GrpcEnableAppendLogsCoalescing = true`, Kommander watches each outbound append-log stream. If a write to that stream is already in flight, later append-log items queue behind it. When the stream becomes available, the flusher drains up to `GrpcAppendLogsMaxCoalesceBatch` queued items into one `GrpcBatchRequestsRequest`.

This is driven by natural backpressure. Kommander does not delay an idle stream to wait for a larger batch. A single isolated append still sends immediately as a batch of one.

| Property | Default | Description |
| --- | ---: | --- |
| `GrpcEnableAppendLogsCoalescing` | `false` | Enables per-stream append-log coalescing for gRPC transport. |
| `GrpcAppendLogsMaxCoalesceBatch` | `256` | Maximum append-log items included in one coalesced gRPC batch frame. |

Enable this for write-heavy clusters where per-peer gRPC stream writes or HTTP/2 frame overhead show up in profiling. If log entries are large, lower `GrpcAppendLogsMaxCoalesceBatch` so a batch does not approach the receiver's maximum message size.
