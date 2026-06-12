# Configuration

`RaftConfiguration` controls node identity, network behavior, election timing, and fair WAL scheduler workers.

| Property | Default | Description |
| --- | ---: | --- |
| `NodeName` | machine name | Stable node name used when deriving a node id. |
| `NodeId` | `0` | Integer node id. `0` means derive from `NodeName`. |
| `Host` | `null` | Host advertised as part of the node endpoint. |
| `Port` | `0` | Port advertised as part of the node endpoint. |
| `InitialPartitions` | `1` | Number of initial user partitions. Partition `0` is reserved; application partitions start at `1`. |
| `HttpScheme` | `https://` | Scheme used by `RestCommunication`. |
| `TransportSecurity` | new options object | Transport security and node authentication settings for network transports. |
| `HttpAuthBearerToken` | empty | Legacy bearer token for REST requests. Prefer `TransportSecurity.SharedSecret` or other `TransportSecurity` settings instead. |
| `HttpTimeout` | `5` | REST request timeout in seconds. |
| `HttpVersion` | `2.0` | REST HTTP version. |
| `HeartbeatInterval` | `500 ms` | Leader heartbeat interval. |
| `RecentHeartbeat` | `100 ms` | Per-partition heartbeat throttle window for leader heartbeats sent to a follower. |
| `VotingTimeout` | `1500 ms` | Candidate vote wait timeout. |
| `CheckLeaderInterval` | `250 ms` | Leader election supervision interval. |
| `TimerInitialDelay` | `2500 ms` | Initial delay before periodic Raft timers start firing. |
| `UpdateNodesInterval` | `5000 ms` | Discovery refresh interval. |
| `StartElectionTimeout` | `2000 ms` | Lower election timeout bound. |
| `EndElectionTimeout` | `4000 ms` | Upper election timeout bound. |
| `StartElectionTimeoutIncrement` | `100 ms` | Lower timeout backoff increment. |
| `EndElectionTimeoutIncrement` | `200 ms` | Upper timeout backoff increment. |
| `ElectionTimeoutSeed` | `null` | Optional deterministic seed for partition election timeout randomization. Use in tests and simulations when you need reproducible leader-election timing. |
| `SlowRaftStateMachineLog` | `50 ms` | Slow partition state-machine operation warning threshold. |
| `SlowRaftWALMachineLog` | `25 ms` | Slow WAL warning threshold. |
| `ReadIOThreads` | `8` | Fair scheduler workers for synchronous WAL reads. |
| `WriteIOThreads` | `4` | Fair scheduler workers for synchronous WAL writes. |
| `MaxQueuedClientProposalsPerPartition` | `2048` | Per-partition client proposal queue limit. When full, new proposals are rejected with `ProposalQueueFull`. Set to `0` or lower to disable the limit. |
| `MaxWalQueueDepthPerPartition` | `4096` | Per-partition WAL scheduler pending-write depth limit. When exceeded, WAL backpressure is propagated instead of allowing unbounded growth. |
| `MaxGlobalWalQueueDepth` | `0` | Global WAL scheduler pending-write depth limit across all partitions. `0` disables the global cap and keeps only per-partition limits. |
| `MaxWalBatchSize` | `256` | Maximum WAL write operations grouped into one storage flush. Larger batches reduce call overhead but can increase individual write latency. |
| `MaxDrainQuantumControl` | `8` | Maximum control-plane operations drained per partition-executor wake cycle. |
| `MaxDrainQuantumReplication` | `4` | Maximum replication operations drained per partition-executor wake cycle. |
| `MaxDrainQuantumClient` | `2` | Maximum client operations drained per partition-executor wake cycle. |
| `MaxDrainQuantumMaintenance` | `1` | Maximum maintenance operations drained per partition-executor wake cycle. |
| `CompactEveryOperations` | `10000` | Committed operations between automatic WAL compaction triggers per partition. Set to `0` or lower to disable automatic compaction. |
| `CompactNumberEntries` | `100` | Max entries the WAL adapter is asked to remove per `CompactLogsOlderThan` call. Values below `1` are treated as `1`. |
| `MaxEntriesPerCompaction` | `5000` | Upper bound on entries removed during one triggered compaction pass before yielding. Values below `CompactNumberEntries` are treated as `CompactNumberEntries`. |

## Transport Security

`TransportSecurity` is a nested `RaftTransportSecurityOptions` object used by network transports such as REST and gRPC.

| Property | Default | Description |
| --- | ---: | --- |
| `NodeAuthenticationMode` | `Disabled` | Node-to-node authentication mode. Supported values are `Disabled`, `SharedSecret`, and `MutualTls`. |
| `SharedSecret` | `null` | Shared cluster secret used for signed node-to-node requests when `NodeAuthenticationMode` is `SharedSecret`. |
| `HeaderName` | `X-Kommander-Cluster-Auth` | HTTP header or transport metadata name that carries the request signature. |
| `RequireTls` | `true` | Reject non-TLS network transport requests when authentication requires secure transport. |
| `AllowInsecureCertificateValidation` | `false` | Development-only certificate validation bypass for client transports. Do not enable in production. |
| `AllowedClockSkew` | `60 s` | Maximum clock skew allowed when validating signed requests. |
| `TrustedServerCertificateThumbprints` | empty | Optional allow-list of trusted server certificate thumbprints. |
| `TrustedClientCertificateThumbprints` | empty | Optional allow-list of trusted client certificate thumbprints. |

The configuration still supports `HttpAuthBearerToken` for legacy compatibility. Internally, `GetEffectiveTransportSecurity()` falls back to that bearer token when `TransportSecurity.SharedSecret` is not set.

## Queueing And Backpressure

Recent Kommander releases added explicit admission control so client traffic and WAL pressure cannot grow without bound.

- `MaxQueuedClientProposalsPerPartition` limits pending client proposals inside a partition executor.
- `MaxWalQueueDepthPerPartition` and `MaxGlobalWalQueueDepth` limit queued WAL writes before scheduler backpressure is raised.
- `MaxWalBatchSize` controls how many WAL write operations may be combined into one flush.

If a client proposal limit is hit, the runtime can reject new work with `RaftOperationStatus.ProposalQueueFull` instead of letting memory usage grow indefinitely.

## Executor Drain Quanta

The `MaxDrainQuantum*` settings tune how many operations each partition executor drains per wake cycle for each work class:

- control,
- replication,
- client,
- maintenance.

Higher control and replication quanta help Raft protocol traffic stay ahead of client floods. In most deployments, the defaults are the right starting point.

## Recent Timing Notes

Two recent timing-related changes matter for operators and test authors:

- `ElectionTimeoutSeed` lets each partition derive its election timeout randomness from a deterministic seed combined with the partition id. That makes election behavior reproducible in tests without making every partition use the exact same sequence.
- `RecentHeartbeat` now throttles heartbeats per `(node, partition)` pair instead of only per node. That avoids one busy partition suppressing heartbeats for every other partition on the same follower.
