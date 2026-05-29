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
| `HttpAuthBearerToken` | empty | Bearer token attached by `RestCommunication`. |
| `HttpTimeout` | `5` | REST request timeout in seconds. |
| `HttpVersion` | `2.0` | REST HTTP version. |
| `HeartbeatInterval` | `500 ms` | Leader heartbeat interval. |
| `RecentHeartbeat` | `100 ms` | Cross-partition recent-heartbeat window. |
| `VotingTimeout` | `1500 ms` | Candidate vote wait timeout. |
| `CheckLeaderInterval` | `250 ms` | Leader election supervision interval. |
| `TimerInitialDelay` | `2500 ms` | Initial delay before periodic Raft timers start firing. |
| `UpdateNodesInterval` | `5000 ms` | Discovery refresh interval. |
| `StartElectionTimeout` | `2000 ms` | Lower election timeout bound. |
| `EndElectionTimeout` | `4000 ms` | Upper election timeout bound. |
| `StartElectionTimeoutIncrement` | `100 ms` | Lower timeout backoff increment. |
| `EndElectionTimeoutIncrement` | `200 ms` | Upper timeout backoff increment. |
| `SlowRaftStateMachineLog` | `50 ms` | Slow partition state-machine operation warning threshold. |
| `SlowRaftWALMachineLog` | `25 ms` | Slow WAL warning threshold. |
| `ReadIOThreads` | `8` | Fair scheduler workers for synchronous WAL reads. |
| `WriteIOThreads` | `4` | Fair scheduler workers for synchronous WAL writes. |
| `CompactEveryOperations` | `10000` | Configured compaction interval value. |
| `CompactNumberEntries` | `100` | Max entries to remove when compaction is invoked. |
