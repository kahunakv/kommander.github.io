# Testing

Build Kommander from the source repository:

```shell
dotnet build Kommander.sln
```

Run the tests:

```shell
dotnet test Kommander.Tests/Kommander.Tests.csproj
```

Useful focused slices:

```shell
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~TestSmallDictionary
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter "FullyQualifiedName~TestThreeNodeCluster.TestJoinClusterAndProposeReplicateLogs"
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter "FullyQualifiedName~TestThreeNodeCluster.TestJoinClusterAndMultiReplicateLogs"
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.RaftSafety
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Scheduler
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Simulation
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.WAL
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter Category=ChaosSmoke
```

For fast local simulations, use `InMemoryWAL` with `InMemoryCommunication`.

The test suite includes several areas worth knowing about:

- `Kommander.Tests.Simulation`: deterministic simulation runtime with seeded randomness, replay logs, virtual time, and reproducible failure scenarios.
- `Kommander.Tests.Chaos`: real in-memory multi-node clusters with a nemesis transport, hash-chain state machines, continuous invariant checking, and failure reports.
- `Kommander.Tests.Scheduler`: focused tests for partition executors, fair read/write schedulers, timer behavior, transport batching, and the system coordinator.
- `Kommander.Tests.RaftSafety`: safety assertions for election safety, commit monotonicity, stale WAL completions, stale append responses, log matching, and system-partition restore behavior.
- `Kommander.Tests.WAL`: RocksDB, SQLite, and automatic compaction coverage.

The deterministic simulation harness is especially useful when you need to reproduce leadership churn, delayed I/O, transport partitions, or replay a failure with the same random seed.

The chaos harness is useful when you want a source-level safety check against a real `RaftManager` cluster rather than a pure simulation. It samples partition state on each partition executor, records commit-quorum acknowledgements when a test subscriber is attached, and checks invariants such as single leader per term, commit monotonicity, quorum discipline, and no divergent applied prefix.

Run `Category=ChaosSmoke` for targeted scenarios such as snapshot chunks under partitions, deposed-leader snapshot rejection, leadership-transfer loss, symmetric and asymmetric cuts, minority writes, and duplicate or reordered transport delivery.

The randomized chaos tier is marked `Category=ChaosRandom` and `Category=Stress`. Treat it as a slower opt-in or nightly suite rather than a default local command.
