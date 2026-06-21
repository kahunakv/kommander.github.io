# Deterministic Testing

Kommander includes a non-production test toolchain for deterministic and timing-sensitive scenarios.

## Simulation Runtime

The source tree includes a deterministic simulation runtime with:

- seeded randomness
- replay logs
- virtual time
- reproducible failure scenarios.

This is useful when a timing-sensitive failure is hard to reproduce in ordinary multi-process tests.

Several timing controls help reproducibility directly in the runtime:

- `ElectionTimeoutSeed` can make partition election timeouts deterministic
- `WaitForLeaderStableAsync` lets tests wait for a leader that stays stable for a minimum duration.

The election tests include targeted pre-vote coverage:

- state-machine tests verify that pre-vote stays side-effect free until quorum is reached
- transport tests verify the `PreVote` RPC flag survives gRPC serialization
- multi-node tests cover the stale follower rejoin case that pre-vote is meant to stabilize.

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

This tooling makes it easier to verify invariants, reproduce leadership churn, test delayed I/O, validate pre-vote behavior under isolation, and replay a failure with the same random seed instead of trying to rediscover the bug by chance.
