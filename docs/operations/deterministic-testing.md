# Deterministic Testing

Kommander includes a non-production test toolchain for deterministic and timing-sensitive scenarios.

## Simulation Runtime

The source tree includes a deterministic simulation runtime with:

- seeded randomness
- replay logs
- virtual time
- reproducible failure scenarios
- validation corpus runs
- trace shrinking for failing schedules
- client-history checking.

This is useful when a timing-sensitive failure is hard to reproduce in ordinary multi-process tests.

The random scenario runner records enough information to replay a failing seed. The trace shrinker then reduces the event history to a smaller schedule that still reproduces the problem, which makes consensus bugs easier to diagnose.

Several timing controls help reproducibility directly in the runtime:

- `ElectionTimeoutSeed` can make partition election timeouts deterministic
- `TickSource` lets the harness replace the process clock with virtual monotonic time
- `EnableInternalTimers = false` lets the harness trigger timer passes explicitly
- `EnableInternalSchedulingThreads = false` lets the harness drive executor, WAL, and transport progress explicitly
- `WaitForLeaderStableAsync` lets tests wait for a leader that stays stable for a minimum duration.

Do not use those runtime-driver switches in production. With internal timers or scheduling threads disabled, Kommander expects an external simulation driver to pump the system.

| Configuration | Default | Use |
| --- | ---: | --- |
| `TickSource` | system monotonic clock | Supplies elapsed-time ticks for elections, heartbeats, quiescence, and backoff windows. |
| `EnableInternalTimers` | `true` | Set to `false` only when a deterministic harness calls the timer trigger methods itself. |
| `EnableInternalSchedulingThreads` | `true` | Set to `false` only when a deterministic harness drives partition executors, WAL writes, and outbound transport dispatch. Requires `EnableSharedExecutorPool = true`. |
| `InvariantChecks` | debug: throw, release: log | Controls built-in consensus invariant checks. Use `Throw` in release chaos runs when you want the first violation to fail immediately. |

The election tests include targeted pre-vote coverage:

- state-machine tests verify that pre-vote stays side-effect free until quorum is reached
- transport tests verify the `PreVote` RPC flag survives gRPC serialization
- multi-node tests cover the stale follower rejoin case that pre-vote is meant to stabilize.

## Focused Test Areas

The current test tree includes several useful slices:

- `Kommander.Tests.Simulation`: simulation and replay.
- `Kommander.Tests.Simulation.Scenarios.Random`: seeded random scenarios and failure reports.
- `Kommander.Tests.Chaos`: real in-memory clusters with nemesis transport rules, hash-chain divergence checks, continuous invariants, and detailed failure reports.
- `Kommander.Tests.Scheduler`: partition executor, fair schedulers, timer service, transport batching, and system coordinator behavior.
- `Kommander.Tests.RaftSafety`: election safety, commit monotonicity, stale completion handling, log matching, and system restore behavior.
- `Kommander.Tests.WAL`: RocksDB, SQLite, and automatic compaction coverage.

## Useful Commands

```shell
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Simulation
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Scheduler
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.RaftSafety
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.WAL
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter Category=ChaosSmoke
```

Use `Category=ChaosRandom` or `Category=Stress` only when you want the slower randomized fault-injection tier.

## Why It Matters

This tooling makes it easier to verify invariants, reproduce leadership churn, test delayed I/O, validate pre-vote behavior under isolation, catch non-contiguous delivery bugs, and replay a failure with the same random seed instead of trying to rediscover the bug by chance.
