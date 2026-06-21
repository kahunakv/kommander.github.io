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
```

For fast local simulations, use `InMemoryWAL` with `InMemoryCommunication`.

The test suite includes several areas worth knowing about:

- `Kommander.Tests.Simulation`: deterministic simulation runtime with seeded randomness, replay logs, virtual time, and reproducible failure scenarios.
- `Kommander.Tests.Scheduler`: focused tests for partition executors, fair read/write schedulers, timer behavior, transport batching, and the system coordinator.
- `Kommander.Tests.RaftSafety`: safety assertions for election safety, commit monotonicity, stale WAL completions, stale append responses, log matching, and system-partition restore behavior.
- `Kommander.Tests.WAL`: RocksDB, SQLite, and automatic compaction coverage.

The deterministic simulation harness is especially useful when you need to reproduce leadership churn, delayed I/O, transport partitions, or replay a failure with the same random seed.
