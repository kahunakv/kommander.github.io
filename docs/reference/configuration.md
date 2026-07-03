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
| `GrpcScheme` | `https://` | Scheme prepended to peer endpoints when opening gRPC channels. Use `http://` only for cleartext HTTP/2 test environments. |
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
| `SqliteWalShardCount` | `0` | SQLite shard databases used to distribute partitions. `0` resolves to `Environment.ProcessorCount` when initializing a new WAL directory or accepts the persisted value when reopening one. |
| `MaxWalGroupBatchPartitions` | `64` | Maximum number of ready partitions coalesced into one cross-partition WAL write call. For RocksDB this can reduce many partition writes to one `db.Write` / fsync. For SQLite this allows the adapter to group writes by shard. |
| `WalGroupCommitLingerMs` | `0` | Adaptive WAL group-commit linger window in milliseconds. Values above `0` let a write worker briefly gather more ready partitions before issuing one storage sync. |
| `WalSingleFsyncCommit` | `false` | Enables the auto-commit single-fsync fast path. Acknowledges when the proposed entry is quorum-durable and writes the committed marker lazily. |
| `MaxDrainQuantumControl` | `8` | Maximum control-plane operations drained per partition-executor wake cycle. |
| `MaxDrainQuantumReplication` | `4` | Maximum replication operations drained per partition-executor wake cycle. |
| `MaxDrainQuantumClient` | `2` | Maximum client operations drained per partition-executor wake cycle. |
| `MaxDrainQuantumMaintenance` | `1` | Maximum maintenance operations drained per partition-executor wake cycle. |
| `GrpcChannelsPerNode` | `4` | Pooled gRPC channels and streaming calls created per peer. Values are clamped to the range `1` through `64`. |
| `GrpcEnableMultipleHttp2Connections` | `false` | Allows each pooled gRPC channel to open additional HTTP/2 connections when stream capacity is saturated. |
| `GrpcEnableSnapshotCompression` | `false` | Enables gzip for gRPC snapshot installation. Hot replication streams remain uncompressed. |
| `GrpcEnableAppendLogsCoalescing` | `false` | Enables backpressure-driven coalescing of queued append-log stream writes into bounded gRPC batch frames. |
| `GrpcAppendLogsMaxCoalesceBatch` | `256` | Maximum append-log items sent in one coalesced gRPC batch frame. Only applies when `GrpcEnableAppendLogsCoalescing` is enabled. |
| `EnableSharedExecutorPool` | `true` | Lets user partitions share a bounded executor pool instead of each partition owning a dedicated OS thread. Also enables hot-set `CheckLeader` ticks. |
| `PartitionExecutorPoolSize` | `0` | Worker count for the shared partition executor pool. `0` resolves to `Environment.ProcessorCount`; values below `0` are clamped to `1`. |
| `EnableQuiescence` | `true` | Allows idle partitions to suppress per-partition heartbeats and rely on SWIM node liveness until new work arrives. |
| `QuiesceAfter` | `1500 ms` | Idle duration before a leader quiesces a partition. Requires no active proposals. |
| `BackfillThreshold` | `10` | Follower lag threshold that switches the leader from empty heartbeats to active committed-log backfill. |
| `MaxBackfillEntriesPerRound` | `128` | Maximum committed log entries shipped to one stale follower per backfill round. |
| `LearnerPromotionLag` | `10` | Maximum lag a learner may have on any partition and still be considered caught up enough for promotion. |
| `LearnerPromotionStableWindow` | `3 s` | How long a learner must remain within `LearnerPromotionLag` before promotion to voter. |
| `GossipInterval` | `5 s` | Interval between membership gossip rounds. |
| `GossipFanout` | `2` | Random peers contacted per gossip round. `0` disables gossip. |
| `PingTimeout` | `500 ms` | SWIM direct/indirect probe timeout. |
| `IndirectPingFanout` | `2` | Number of relay peers used for indirect SWIM probes. |
| `SuspicionTimeout` | `5 s` | How long a node stays `Suspect` before becoming `Dead`. |
| `DeadMemberEvictionGrace` | `30 s` | How long a node remains `Dead` before the system-partition leader evicts it. |
| `PingInterval` | `1 s` | SWIM ping round interval. Set to `0` or lower to disable the detector. Must be greater than `0` and lower than `StartElectionTimeout` when `EnableQuiescence` is `true`. |
| `EnableLeaderBalancer` | `false` | Enables automatic redistribution of partition leadership across live voters. |
| `LeaderBalancerReportInterval` | `5 s` | How often each node publishes its local leadership and load report through gossip. |
| `LeaderBalancerInterval` | `30 s` | How often the system-partition leader runs a balancing pass. |
| `LeaderBalancerReportTtl` | `20 s` | Maximum report age accepted by the balancer. Must be greater than `LeaderBalancerReportInterval`. |
| `CountDeadband` | `1` | Allowed leader-count difference around the ideal before count balancing acts. |
| `LoadImbalanceThreshold` | `0.25` | Fractional load skew required before the planner considers a count-neutral swap. |
| `MinLeaderStabilityMs` | `5000 ms` | Minimum leadership age before a partition is eligible to move. |
| `MoveCooldown` | `60 s` | Time after a successful or timed-out suggestion before the partition can move again. |
| `MaxMovesPerPass` | `4` | Maximum moves planned in one balancing pass. |
| `MaxConcurrentTransfers` | `2` | Maximum outstanding transfers across the cluster. |
| `LeaderBalancerOpsWeight` | `1.0` | Operations-per-second weight in the partition load score. |
| `LeaderBalancerQueueWeight` | `0.5` | Queue-depth weight in the partition load score. |
| `SuggestionTimeout` | `15 s` | Time allowed for a suggested move to appear in a fresh load report. |
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

## gRPC Transport

| Property | Default | Description |
| --- | ---: | --- |
| `GrpcScheme` | `https://` | URL scheme used when opening channels to peers. Cleartext test clusters can use `http://` when unencrypted HTTP/2 support is enabled by the host. |
| `GrpcChannelsPerNode` | `4` | Number of long-lived channels and matching streaming calls per peer URL. Values below `1` become `1`; values above `64` become `64` and produce a warning. |
| `GrpcEnableMultipleHttp2Connections` | `false` | Lets each channel's handler open more than one HTTP/2 connection to a peer instead of multiplexing every stream over one connection. |
| `GrpcEnableSnapshotCompression` | `false` | Requests gzip encoding for unary snapshot installation and registers the matching server provider. Normal replication streams explicitly remain uncompressed. |
| `GrpcEnableAppendLogsCoalescing` | `false` | Coalesces append-log items that naturally queue behind an in-flight stream write into one `GrpcBatchRequestsRequest`. |
| `GrpcAppendLogsMaxCoalesceBatch` | `256` | Maximum append-log items drained into one coalesced batch frame. Reduce this if entries are large enough to approach gRPC receive-message limits. |

More channels increase per-peer concurrency, but every channel owns a long-lived `SocketsHttpHandler` and TCP/HTTP/2 connection. Increase `GrpcChannelsPerNode` only when measurements show stream saturation. `GrpcEnableMultipleHttp2Connections` can raise concurrency further, with a corresponding increase in connections.

Snapshot compression trades CPU for lower network use during `SendInstallSnapshot`. It does not compress the hot append-log stream.

Append-log coalescing is backpressure-driven. An idle stream sends immediately as a batch of one; Kommander does not add a delay to wait for more work. Under sustained write load, queued append-log items are grouped after the in-flight stream write completes, reducing semaphore acquisitions and HTTP/2 frame churn.

## Partition Scaling

Kommander can run many partitions on a fixed shared executor pool.

| Property | Default | Description |
| --- | ---: | --- |
| `EnableSharedExecutorPool` | `true` | Master switch for the shared partition executor pool. When enabled, active partitions are drained by a bounded pool and fast `CheckLeader` ticks target the hot set instead of every user partition. |
| `PartitionExecutorPoolSize` | `0` | Number of pool worker threads. `0` uses `Environment.ProcessorCount`; values below `0` are clamped to `1`. |
| `CheckLeaderInterval` | `250 ms` | Fast leader-check cadence for the system partition and hot user partitions. |
| `UpdateNodesInterval` | `5000 ms` | Approximate full safety-sweep cadence for checking every partition. |

The pool is fixed for the lifetime of the `RaftManager`; changing its size requires changing configuration and restarting the node. Size it for simultaneously busy partitions and CPU availability, not for the total partition count.

See [Partition Scaling](../operations/partition-scaling.md) for sizing guidance and the relationship with quiescence.

## Queueing And Backpressure

Kommander uses explicit admission control so client traffic and WAL pressure cannot grow without bound.

- `MaxQueuedClientProposalsPerPartition` limits pending client proposals inside a partition executor.
- `MaxWalQueueDepthPerPartition` and `MaxGlobalWalQueueDepth` limit queued WAL writes before scheduler backpressure is raised.
- `MaxWalBatchSize` controls how many WAL write operations may be combined into one flush.
- `MaxWalGroupBatchPartitions` controls how many ready partitions may share one cross-partition WAL write call.

If a client proposal limit is hit, the runtime can reject new work with `RaftOperationStatus.ProposalQueueFull` instead of letting memory usage grow indefinitely.

## WAL Write Batching

`FairWalScheduler` can batch writes in two dimensions:

| Property | Default | Description |
| --- | ---: | --- |
| `MaxWalBatchSize` | `256` | Maximum operations drained from one partition into a single WAL batch. |
| `MaxWalGroupBatchPartitions` | `64` | Maximum ready partitions coalesced into one `IWAL.Write` call. |
| `WalGroupCommitLingerMs` | `0` | Adaptive wait window that lets a WAL worker gather more ready partitions into one sync before writing. |
| `WalSingleFsyncCommit` | `false` | Removes the committed-marker sync from the client-visible `autoCommit` path by acknowledging after propose quorum durability. |
| `WriteIOThreads` | `4` | Number of scheduler workers. Each worker can process one cross-partition group batch at a time. |
| `SqliteWalShardCount` | `0` | Desired SQLite shard count when creating a new WAL directory. |

For RocksDB, a group batch spanning many partitions is written through one `WriteBatch`, which can reduce fsync pressure significantly in many-partition deployments.

`WalGroupCommitLingerMs` can improve batch density when ready work arrives staggered. Start with a small value such as `2` ms and measure. The linger is adaptive; workers stop waiting when no additional ready partition appears.

`WalSingleFsyncCommit` is a latency lever for durable auto-commit writes. When enabled, Kommander acknowledges after the proposed entry is durable on a quorum, then writes the committed marker lazily. Explicit two-phase writes using `autoCommit: false` keep their separate durable commit behavior.

For SQLite, partitions are distributed across a fixed shard pool. The scheduler still submits one cross-partition `IWAL.Write` call, and `SqliteWAL` groups that call by shard before writing. A batch with `P` partitions across `S` SQLite shards costs `S` transactions and fsyncs, not `P`. When `shardCount` is `1`, every partition shares one shard and the whole scheduler group can commit in one SQLite transaction.

`SqliteWalShardCount` is used to seed a new WAL directory. With the default `0`, a new directory uses `Environment.ProcessorCount`. The resolved value is persisted in the directory's metadata database and becomes authoritative. When reopening an existing directory, `0` accepts that persisted value; a nonzero value that differs from it fails startup because changing the count would remap partitions to different database files.

That creates a practical tuning tradeoff:

- fewer SQLite shards improve batching and reduce fsync pressure
- more SQLite shards allow more independent read/write concurrency
- the shard count is fixed for a WAL data directory after initialization because changing it would remap partitions to different database files.

See [WAL Commit Durability](../operations/wal-commit-durability.md) for the single-fsync fast path, group commit linger, crash recovery behavior, and tuning guidance.

## Dynamic Membership

Kommander supports runtime cluster membership management with learners, promotion, gossip dissemination, and SWIM-based failure detection.

| Property | Default | Description |
| --- | ---: | --- |
| `BackfillThreshold` | `10` | Follower lag threshold that switches the leader from empty heartbeats to active committed-log backfill. |
| `MaxBackfillEntriesPerRound` | `128` | Maximum committed log entries shipped to one stale follower per backfill round. |
| `LearnerPromotionLag` | `10` | Maximum lag a learner may have on any partition and still be considered caught up enough for promotion. |
| `LearnerPromotionStableWindow` | `3 s` | How long a learner must remain within `LearnerPromotionLag` before promotion to voter. |
| `GossipInterval` | `5 s` | Interval between membership gossip rounds. |
| `GossipFanout` | `2` | Random peers contacted per gossip round. `0` disables gossip. |
| `PingInterval` | `1 s` | SWIM ping round interval. Set to `0` or lower to disable the detector. Must stay below `StartElectionTimeout` when quiescence is enabled. |
| `PingTimeout` | `500 ms` | SWIM direct/indirect probe timeout. |
| `IndirectPingFanout` | `2` | Number of relay peers used for indirect SWIM probes. |
| `SuspicionTimeout` | `5 s` | How long a node stays `Suspect` before becoming `Dead`. |
| `DeadMemberEvictionGrace` | `30 s` | How long a node remains `Dead` before the system-partition leader evicts it. |

The built-in in-memory, gRPC, and REST transports all implement direct and indirect SWIM pings. If you disable SWIM by setting `PingInterval` to `0`, also set `EnableQuiescence = false`.

## Automatic Leader Balancing

The optional leader balancer runs only on the current system-partition leader. It uses fresh gossip reports to balance leader count first and measured partition load second. It transfers leadership through the normal Raft handoff path; it does not move data or change partition ranges.

| Property | Default | Description |
| --- | ---: | --- |
| `EnableLeaderBalancer` | `false` | Enables reports and balancing passes. Configure it consistently on every node. |
| `LeaderBalancerReportInterval` | `5 s` | Local load-report cadence. |
| `LeaderBalancerInterval` | `30 s` | Controller balancing-pass cadence. |
| `LeaderBalancerReportTtl` | `20 s` | Maximum report age accepted by the controller. |
| `CountDeadband` | `1` | Leader-count tolerance used to avoid unnecessary moves. |
| `LoadImbalanceThreshold` | `0.25` | Load-skew threshold for count-neutral swaps. |
| `MinLeaderStabilityMs` | `5000 ms` | Stability gate for newly elected leaders. |
| `MoveCooldown` | `60 s` | Per-partition cooldown after success or timeout. |
| `MaxMovesPerPass` | `4` | Per-pass planning limit. |
| `MaxConcurrentTransfers` | `2` | Cluster-wide in-flight transfer limit. |
| `SuggestionTimeout` | `15 s` | Deadline for confirming a suggestion through fresh reports. |
| `LeaderBalancerOpsWeight` | `1.0` | Throughput contribution to the load score. |
| `LeaderBalancerQueueWeight` | `0.5` | Queue-pressure contribution to the load score. |

See [Automatic Leader Balancing](../operations/leader-balancing.md) for behavior, tuning, metrics, and troubleshooting.

## Partition Quiescence

Quiescence suppresses per-partition heartbeat traffic for idle partitions. A leader sends a final quiesce marker, then followers rely on SWIM node liveness until the partition wakes up again.

| Property | Default | Description |
| --- | ---: | --- |
| `EnableQuiescence` | `true` | Enables quiescence for idle partitions. Set to `false` to keep sending per-partition heartbeats on every heartbeat interval. |
| `QuiesceAfter` | `1500 ms` | How long a partition must be idle, with no active proposals, before it quiesces. |
| `PingInterval` | `1 s` | SWIM probe cadence used by quiesced followers to detect leader-node failure. Must be greater than `0` and lower than `StartElectionTimeout` when quiescence is enabled. |
| `SuspicionTimeout` | `5 s` | Time from `Suspect` to `Dead`. Quiesced failover starts on `Suspect`, not `Dead`. |
| `StartElectionTimeout` | `2000 ms` | Lower election timeout bound. `PingInterval` must be below this while quiescence is enabled. |

## Executor Drain Quanta

The `MaxDrainQuantum*` settings tune how many operations each partition executor drains per wake cycle for each work class:

- control
- replication
- client
- maintenance.

Higher control and replication quanta help Raft protocol traffic stay ahead of client floods. In most deployments, the defaults are the right starting point.

## Timing Notes

Two timing behaviors matter for operators and test authors:

- `ElectionTimeoutSeed` lets each partition derive its election timeout randomness from a deterministic seed combined with the partition id. That makes election behavior reproducible in tests without making every partition use the exact same sequence.
- `RecentHeartbeat` throttles heartbeats per `(node, partition)` pair. That avoids one busy partition suppressing heartbeats for every other partition on the same follower.
