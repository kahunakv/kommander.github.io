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
| `WalSingleFsyncCommit` | `true` | Enables the auto-commit single-fsync fast path. Acknowledges when the proposed entry is quorum-durable and writes the committed marker lazily. |
| `ApplicationDurabilityProvider` | `null` | Optional application-owned durability floor. When set, restart replay widens below checkpoints as needed and compaction is fenced so committed entries are not removed before the application has durably applied them. |
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
| `LeadershipBarrierTimeout` | `10 s` | Maximum time a newly elected leader waits for its internal promotion barrier to commit before reverting to follower. Must be positive. |
| `LeadershipConfirmationTimeout` | `2 s` | Maximum time `ConfirmLeadershipAsync` waits for quorum confirmation and local apply catch-up before returning `false`. |
| `EnableCheckQuorum` | `false` | When enabled, a leader steps down if it has not heard same-term acknowledgements from a majority for the configured check-quorum window. |
| `CheckQuorumIntervalMultiplier` | `8` | Number of heartbeat intervals used as the check-quorum step-down window when `EnableCheckQuorum` is enabled. |
| `BackfillEnabled` | `true` | Master switch for leader-driven backfill and snapshot fallback for lagging followers. Set to `false` only when a consumer owns catch-up by another path. |
| `BackfillThreshold` | `10` | Follower lag threshold that engages the actively-behind backfill trigger. This is not a disable switch; use `BackfillEnabled` to turn backfill off. |
| `FollowerSaturationBackoff` | `1 s` | How long a leader pauses entry-carrying backfill to a follower after that follower reports WAL saturation. Heartbeats continue. |
| `MaxBackfillEntriesPerRound` | `128` | Maximum committed log entries shipped to one stale follower per backfill round. |
| `SnapshotReceiveSessionTtl` | `30 s` | Idle timeout for an incomplete snapshot receive session. Expiry runs lazily on later snapshot receives. |
| `SnapshotMaxPendingSessions` | `8` | Maximum concurrent snapshot receive sessions buffered by one node. |
| `SnapshotMaxPendingBytes` | `512 MiB` | Maximum total bytes buffered by active and installing snapshot receive sessions. |
| `AllowLegacySnapshotSenders` | `false` | Compatibility switch for peers that do not send snapshot leader and boundary metadata. Keep disabled for normal clusters. |
| `LearnerPromotionLag` | `10` | Maximum lag a learner may have on any partition and still be considered caught up enough for promotion. |
| `LearnerPromotionStableWindow` | `3 s` | How long a learner must remain within `LearnerPromotionLag` before promotion to voter. |
| `GossipInterval` | `5 s` | Interval between membership gossip rounds. |
| `GossipFanout` | `2` | Random peers contacted per gossip round. `0` disables gossip. |
| `PingTimeout` | `500 ms` | SWIM direct/indirect probe timeout. |
| `IndirectPingFanout` | `2` | Number of relay peers used for indirect SWIM probes. |
| `SuspicionTimeout` | `5 s` | How long a node stays `Suspect` before becoming `Dead`. |
| `DeadMemberEvictionGrace` | `2 min` | How long a node remains `Dead` before the system-partition leader may evict it. The eviction path performs a final direct probe before committing removal. |
| `EnableAutoRejoin` | `true` | Allows a running node that discovers it was removed from the committed roster to automatically run the join flow again instead of remaining `NotMember`. |
| `PingInterval` | `1 s` | SWIM ping round interval. Set to `0` or lower to disable the detector. Must be greater than `0` and lower than `StartElectionTimeout` when `EnableQuiescence` is `true`. |
| `EnableLeaderBalancer` | `false` | Enables automatic redistribution of partition leadership across live voters. |
| `EnableLoadReports` | `false` | Explicitly enables gossip of partition leadership and load reports even when the leader balancer is off. Reports are also enabled automatically by leader balancing, placement rebalancing, or a nonzero global `ReplicationFactor`. |
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
| `ReplicationFactor` | `0` | Target voter replicas per user partition. `0` means legacy full replication across every roster voter. |
| `EnablePlacementRebalancer` | `false` | Enables ongoing replica placement repair, trim, and balancing. In-flight transitions still complete when disabled. |
| `PlacementPassInterval` | `5 s` | Cadence for placement-controller passes on the system-partition leader. Independent of the leader-balancer timer. Non-positive disables the timer, but event-driven kicks can still run. |
| `MaxReplicaMovesPerPass` | `4` | Maximum new replica placement moves started in one controller pass across repair and balance priorities. |
| `MaxConcurrentReplicaTransfers` | `1` | Maximum balance-class replica transfers allowed in flight at once. Repair work has a separate budget. |
| `MaxConcurrentReplicaRepairs` | `3` | Maximum repair-class replica moves allowed in flight at once, such as re-replication after node loss or decommission drain. |
| `DecommissionDrainTimeout` | `2 min` | Maximum time `RequestLeaveAsync` waits for replica evacuation after committing the local member as `Leaving`. On expiry the role is rolled back to `Voter` and the leave reports `DrainTimedOut`. |
| `ReplicaCountDeadband` | `1` | Per-node replica-count imbalance tolerated before balancing moves are emitted. Under-replication repairs ignore it. |
| `Zone` | `null` | Optional locality hint for the local node. The placement planner prefers distinct zones when hints are available. |
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
| `TrustedServerCertificateThumbprints` | empty | Optional SHA-256 thumbprint allow-list for peer server certificates used by outbound REST and gRPC clients. |
| `TrustedClientCertificateThumbprints` | empty | SHA-256 thumbprint allow-list for peer client certificates used by incoming `MutualTls` requests. Server deployments should set at least one value in `MutualTls` mode. |
| `ClientCertificatePath` | `null` | Path to the PKCS#12 client certificate this node presents to peers in `MutualTls` mode. |
| `ClientCertificatePassword` | `null` | Password for `ClientCertificatePath`. Empty is valid for password-less archives. |
| `ClientCertificate` | `null` | Pre-loaded `X509Certificate2` for embedded hosts. Takes precedence over `ClientCertificatePath` and is not bound by the server CLI. |

The configuration still supports `HttpAuthBearerToken` for legacy compatibility. Internally, `GetEffectiveTransportSecurity()` falls back to that bearer token when `TransportSecurity.SharedSecret` is not set and `NodeAuthenticationMode` is not `MutualTls`.

`MutualTls` requires a client certificate and cannot be combined with `AllowInsecureCertificateValidation`. The certificate is loaded once and retained by long-lived REST and gRPC handlers, so certificate rotation requires rolling the trust lists first and restarting nodes with the new certificate.

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

## Leadership And Reads

| Property | Default | Description |
| --- | ---: | --- |
| `LeadershipBarrierTimeout` | `10 s` | Bounds the promotion barrier for a newly elected leader that inherits prior-term WAL entries. During the barrier, heartbeats can flow, but leadership is not published to applications. |
| `LeadershipConfirmationTimeout` | `2 s` | Bounds `ConfirmLeadershipAsync`, including its same-term quorum acknowledgement round and the wait for the local apply frontier to cover the confirmed commit index. |
| `EnableCheckQuorum` | `false` | Makes an active leader step down after losing same-term quorum contact for the configured window. This helps stale leaders fail faster, but linearizable local reads should still use `ConfirmLeadershipAsync`. |
| `CheckQuorumIntervalMultiplier` | `8` | Multiplier applied to `HeartbeatInterval` for the check-quorum step-down window. |

The promotion barrier protects newly elected leaders from serving before inherited committed entries have been applied locally. If a clean failover has no inherited tail, leadership publishes immediately. If prior-term entries exist above the local commit frontier, Kommander commits an internal no-op first, drains inherited entries, and only then reports the node as leader.

`ConfirmLeadershipAsync` is the read-side safety API. Use it before serving authoritative local reads from a leader-owned projection. It confirms that the node still has same-term quorum contact and that its local state machine has applied through the commit index observed by that confirmation round.

## WAL Write Batching

`FairWalScheduler` can batch writes in two dimensions:

| Property | Default | Description |
| --- | ---: | --- |
| `MaxWalBatchSize` | `256` | Maximum operations drained from one partition into a single WAL batch. |
| `MaxWalGroupBatchPartitions` | `64` | Maximum ready partitions coalesced into one `IWAL.Write` call. |
| `WalGroupCommitLingerMs` | `0` | Adaptive wait window that lets a WAL worker gather more ready partitions into one sync before writing. |
| `WalSingleFsyncCommit` | `true` | Removes the committed-marker sync from the client-visible `autoCommit` path by acknowledging after propose quorum durability. |
| `ApplicationDurabilityProvider` | `null` | Optional floor reported by the application for the highest committed WAL index durably applied to the application's own storage. |
| `WriteIOThreads` | `4` | Number of scheduler workers. Each worker can process one cross-partition group batch at a time. |
| `SqliteWalShardCount` | `0` | Desired SQLite shard count when creating a new WAL directory. |

For RocksDB, a group batch spanning many partitions is written through one `WriteBatch`, which can reduce fsync pressure significantly in many-partition deployments.

`WalGroupCommitLingerMs` can improve batch density when ready work arrives staggered. Start with a small value such as `2` ms and measure. The linger is adaptive; workers stop waiting when no additional ready partition appears.

`WalSingleFsyncCommit` is enabled by default as the latency lever for durable auto-commit writes. Kommander acknowledges after the proposed entry is durable on a quorum, then writes the committed marker lazily. Explicit two-phase writes using `autoCommit: false` keep their separate durable commit behavior.

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
| `BackfillEnabled` | `true` | Master switch for leader-driven committed-log backfill and snapshot fallback for lagging followers. |
| `BackfillThreshold` | `10` | Follower lag threshold that engages active committed-log backfill. It does not disable idle-tail or restart-regression repairs. |
| `FollowerSaturationBackoff` | `1 s` | Backoff window after a follower reports WAL saturation. |
| `MaxBackfillEntriesPerRound` | `128` | Maximum committed log entries shipped to one stale follower per backfill round. |
| `SnapshotReceiveSessionTtl` | `30 s` | How long an incomplete snapshot receive session may sit idle before the receiver drops its buffered state. |
| `SnapshotMaxPendingSessions` | `8` | Maximum concurrent snapshot receive sessions on one node. |
| `SnapshotMaxPendingBytes` | `512 MiB` | Maximum live bytes used by snapshot receive buffers, including completed buffers still installing. |
| `AllowLegacySnapshotSenders` | `false` | Accepts snapshot chunks that omit `LeaderTerm`, `LeaderEndpoint`, or `LastIncludedTerm`. Use only during a controlled compatibility window. |
| `LearnerPromotionLag` | `10` | Maximum lag a learner may have on any partition and still be considered caught up enough for promotion. |
| `LearnerPromotionStableWindow` | `3 s` | How long a learner must remain within `LearnerPromotionLag` before promotion to voter. |
| `GossipInterval` | `5 s` | Interval between membership gossip rounds. |
| `GossipFanout` | `2` | Random peers contacted per gossip round. `0` disables gossip. |
| `PingInterval` | `1 s` | SWIM ping round interval. Set to `0` or lower to disable the detector. Must stay below `StartElectionTimeout` when quiescence is enabled. |
| `PingTimeout` | `500 ms` | SWIM direct/indirect probe timeout. |
| `IndirectPingFanout` | `2` | Number of relay peers used for indirect SWIM probes. |
| `SuspicionTimeout` | `5 s` | How long a node stays `Suspect` before becoming `Dead`. |
| `DeadMemberEvictionGrace` | `2 min` | How long a node remains `Dead` before the system-partition leader may evict it. The leader probes the endpoint once more before committing removal. |
| `EnableAutoRejoin` | `true` | Lets an evicted-but-running node automatically rejoin through the ordinary learner-to-voter path. Disable only when remote removal is intended to keep the process out while it remains running. |

The built-in in-memory, gRPC, and REST transports all implement direct and indirect SWIM pings. If you disable SWIM by setting `PingInterval` to `0`, also set `EnableQuiescence = false`.

## Snapshot Installation

The snapshot receive path is bounded and term-aware.

| Property | Default | Description |
| --- | ---: | --- |
| `SnapshotReceiveSessionTtl` | `30 s` | Idle timeout for an incomplete snapshot receive session. The sweep is lazy and runs when another snapshot chunk arrives. |
| `SnapshotMaxPendingSessions` | `8` | Maximum number of concurrent receive sessions buffered across all partitions on one node. |
| `SnapshotMaxPendingBytes` | `512 MiB` | Maximum total buffered snapshot bytes. Completed buffers still count while their partition-executor install is running. |
| `AllowLegacySnapshotSenders` | `false` | Allows peers that omit the snapshot leader-term and boundary-term fields. Keep disabled unless you are rolling through an older wire contract. |

The final snapshot chunk is installed on the partition's single-writer executor. That serializes stale-leader rejection, application import, durable checkpoint-boundary writes, and apply-frontier seeding with the rest of the partition state machine.

See [Snapshot Installation](../operations/snapshot-installation.md) for the receive contract and import requirements.

## Automatic Leader Balancing

The optional leader balancer runs only on the current system-partition leader. It uses fresh gossip reports to balance leader count first and measured partition load second. It transfers leadership through the normal Raft handoff path; it does not move data or change partition ranges.

| Property | Default | Description |
| --- | ---: | --- |
| `EnableLeaderBalancer` | `false` | Enables reports and balancing passes. Configure it consistently on every node. |
| `EnableLoadReports` | `false` | Explicit opt-in for load-report gossip when you want leader hints and remote partition load signals without enabling balancing. |
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

## Replica Placement

Replica placement controls which nodes host each user partition.

| Property | Default | Description |
| --- | ---: | --- |
| `ReplicationFactor` | `0` | Target number of voter replicas per user partition. `0` means full replication across every roster voter. |
| `EnablePlacementRebalancer` | `false` | Master switch for ongoing placement passes. Initial placement still honors `ReplicationFactor`, and in-flight transitions still complete. |
| `PlacementPassInterval` | `5 s` | Placement-controller cadence on the system-partition leader. This is separate from `LeaderBalancerInterval`. |
| `MaxReplicaMovesPerPass` | `4` | Maximum new add/remove placement moves initiated in one pass. |
| `MaxConcurrentReplicaTransfers` | `1` | Balance-class move budget for ranges with a learner or removing replica. |
| `MaxConcurrentReplicaRepairs` | `3` | Repair-class move budget for under-replicated ranges and decommission evacuation. |
| `DecommissionDrainTimeout` | `2 min` | Drain-first leave timeout before a `Leaving` member rolls back to `Voter`. |
| `ReplicaCountDeadband` | `1` | Replica-count imbalance tolerated before balancing moves are planned. Repairs for under-replicated ranges bypass the deadband. |
| `Zone` | `null` | Optional zone or rack hint for this node. Placement prefers spreading a range's replicas across distinct zones when hints exist. |
| `LearnerPromotionLag` | `10` | Maximum lag a learner replica may have and still be considered caught up. |
| `LearnerPromotionStableWindow` | `3 s` | Stable catch-up window before a learner replica is promoted to voter. |

`ReplicationFactor = 0` keeps the legacy behavior where every committed roster voter hosts every user partition. When RF is greater than `0`, each range records its own replica set in the committed partition map, and quorum is computed over that range's voter replicas.

Prefer odd RF values. RF 4 usually costs more than RF 3 without increasing tolerated failures, because both require a majority and both tolerate one failed replica.

See [Replica Placement](../guides/replica-placement.md) for routing behavior, split/merge interaction, and operational guidance.

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

- `HeartbeatInterval` and `CheckLeaderInterval` must both stay below `StartElectionTimeout`. Heartbeats are sent from the `CheckLeader` timer pass, so either interval at or above the lower election timeout causes followers to time out before the next heartbeat and leadership churns indefinitely.
- `ElectionTimeoutSeed` lets each partition derive its election timeout randomness from a deterministic seed combined with the partition id. That makes election behavior reproducible in tests without making every partition use the exact same sequence.
- `RecentHeartbeat` throttles heartbeats per `(node, partition)` pair. That avoids one busy partition suppressing heartbeats for every other partition on the same follower.
