# Deterministic Testing

Recent Kommander additions significantly strengthened the non-production test toolchain.

## Simulation Runtime

The source tree now includes a deterministic simulation runtime with:

- seeded randomness,
- replay logs,
- virtual time,
- reproducible failure scenarios.

This is useful when a timing-sensitive failure is hard to reproduce in ordinary multi-process tests.

## Focused Test Areas

The current test tree includes several useful slices:

- `Kommander.Tests.Simulation`: simulation and replay.
- `Kommander.Tests.Scheduler`: partition executor, fair schedulers, timer service, transport batching, and system coordinator behavior.
- `Kommander.Tests.RaftSafety`: election safety, commit monotonicity, stale completion handling, log matching, and system restore behavior.
- `Kommander.Tests.WAL`: RocksDB, SQLite, and automatic compaction coverage.

## Useful Commands

```shell
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Simulation
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Scheduler
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.RaftSafety
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.WAL
```

## Why It Matters

This tooling makes it easier to verify invariants, reproduce leadership churn, test delayed I/O, and replay a failure with the same random seed instead of trying to rediscover the bug by chance.
