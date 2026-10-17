# Deterministic Testing

Kommander includes a non-production test toolchain for deterministic and timing-sensitive scenarios.

The deterministic simulation tests, often called DST in the test tree, run real in-process clusters under a seeded driver. They are meant to find and replay timing-sensitive consensus states, not to be used as production APIs.

## Simulation Runtime

The source tree includes a deterministic simulation runtime with:

- seeded randomness
- replay logs
- virtual time
- reproducible failure scenarios
- promoted regression plans
- compaction and snapshot-rescue scenario sweeps
- restart-under-load scenarios
- validation corpus runs
- trace shrinking for failing schedules
- client-history checking.

This is useful when a timing-sensitive failure is hard to reproduce in ordinary multi-process tests.

The random scenario runner records enough information to replay the action plan that a failing seed produced. Replaying the plan is more useful than replaying only the seed: the seed controls the generator, while the plan preserves the actions that were drawn in the failing run. The trace shrinker then reduces the event history to a smaller schedule that still reproduces the problem, which makes consensus bugs easier to diagnose.

Diagnostic partition views used by the simulation and invariant tooling include `RaftPartitionView.Peers` when the local node is leader. Each `RaftPeerReplicationView` shows the peer endpoint, voter status, known committed frontier, start commit index, and the last `RaftPeerBackfillDecision`. That last decision records why the leader did or did not send catch-up work in the latest heartbeat round, which is useful when a replay stalls on follower repair.

## Test Categories

The simulation suite uses three categories:

| Category | When To Use It |
| --- | --- |
| `DSTSmoke` | Fast checks intended for pull requests and local sanity checks. |
| `DSTRandom` | Seed corpus, random search, snapshot-rescue sweeps, and promoted regression plans. Use for nightly or focused investigation runs. |
| `DSTProbe` | Manual probes for shrinking one plan or capturing trace lines from one plan. Skips unless the required environment variables are set. |

`DSTRandom` is not a cheap pass/fail substitute for unit tests. A failure is usually a lead with a plan artifact, a reproduction rate, and a cluster state to investigate.

A nightly job runs the random DST search to keep looking for rare consensus, recovery, and timing issues after GA. The job is intentionally heavier than pull-request checks: it spends more time exploring seeds and snapshot/compaction paths, then leaves plan artifacts when it finds something worth replaying.

## Plans And Regression Corpus

A failing random run writes plan artifacts under `dst-artifacts`. The important file is the `*.plan.txt` file. It records:

- the seed
- the random scenario bounds
- the ordered actions
- the settings needed to replay those actions.

Promoted plans live under `Kommander.Tests/Simulation/Scenarios/Random/regressions/`. `EveryPromotedPlan_StillHoldsEveryCheck` loads that corpus and fails if the corpus is empty, so a broken copy rule or a wrong corpus directory cannot silently turn the regression set green.

Useful environment variables:

| Variable | Use |
| --- | --- |
| `KOMMANDER_DST_REPLAY_DIR` | Directory containing plan artifacts to replay. |
| `KOMMANDER_DST_REPLAY_REPEATS` | Number of times to replay each promoted plan. |
| `KOMMANDER_DST_SEED_BASE` | First generated seed for random sweeps. |
| `KOMMANDER_DST_SEED_COUNT` | Number of generated seeds beside the fixed corpus. |
| `KOMMANDER_DST_COMPACTION_SWEEP` | Enables the frequent-compaction sweep. |
| `KOMMANDER_DST_BUDGET` | Enables simulation budget checks such as the `ci` budget. |

Read the replay rate, not just the fact that a run failed. A plan that fails once in ten replays and a plan that fails ten times in ten are different findings.

## Shrinking And Trace Probes

The shrinker answers which actions in a failing plan are needed. It first measures the reproduction rate, derives an attempt count from that rate, and then tries candidate reductions.

Useful probe variables:

| Variable | Use |
| --- | --- |
| `KOMMANDER_DST_SHRINK_PLAN` | Plan file to shrink or trace. |
| `KOMMANDER_DST_SHRINK_BUDGET` | Maximum cluster runs the shrink may spend. |
| `KOMMANDER_DST_SHRINK_ATTEMPTS` | Overrides the derived attempts per candidate. |
| `KOMMANDER_DST_SHRINK_PROBE_RUNS` | Runs of the original plan before shrinking or tracing. |
| `KOMMANDER_DST_TRACE` | Trace substring captured by `AConfiguredPlan_ReportsTheTraceThatExplainsIt`. |

The trace probe is for diagnostics only. It captures matching log lines from the replay that fails and reports them; it does not make log text part of the correctness contract.

## Fault-Injection Hooks

`IRaft` includes advanced hooks for deterministic crash-window tests. They are marked with `EditorBrowsable(EditorBrowsableState.Never)` and are not exposed through REST, gRPC, discovery, or server routes.

| Hook | What It Models |
| --- | --- |
| `HoldCommittedProposalRepliesForTesting` | A leader that reached quorum durability but paused or died before answering the original caller. |
| `SetSnapshotInstallGateForTesting` | A follower frozen at a specific point during snapshot install. |
| `HoldConsumerAppliesForTesting` | A node that has durable committed entries but has not delivered them to the application consumer yet. |
| `ResumeConsumerAppliesForTesting` | Drains the held consumer entries in log order. |

`InMemoryCommunication` can also model network faults. `PartitionNode` isolates a whole node, while `BlockLink(from, to)` drops only one direction between two endpoints. Use `BlockLinkBothWays` for a pairwise cut and `HealAll` to clear every delivery filter. Directional blocks are useful when the request and reply paths need to fail independently, such as a successful snapshot install whose acknowledgement is lost.

`HeldProposalReply.Release()` completes the caller with the committed result. `HeldProposalReply.Drop()` abandons the reply so the caller observes the same indeterminate timeout shape as a lost post-quorum response.

Snapshot install gates can run `BeforeImport`, `AfterImport`, or `AfterBoundary`. The signal reports the snapshot index, boundary term, snapshot kind, phase, local max log id, and last applied index.

Held consumer applies keep the applied cursor paused too. That matters because read-index confirmation, compaction fences, and backfill diagnostics should not claim application progress that the consumer has not made.

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

## Scenario Coverage

The random scenario generator can combine client writes, idle steps, leader outages, network faults, storage faults, lifecycle faults, maintenance actions, healing actions, and optional transfer faults.

The client-history checker covers both writes and reads. That lets a failing run distinguish "a value was never written" from "a stale read observed an old value after a later write should have been visible". Some random plans also use ring-shaped network partitions and judge the current leader's whole log, not only the followers' visible prefixes.

Several focused simulation suites exercise states that ordinary integration tests rarely reach:

- restart under load
- follower disk pauses
- snapshot rescue and hung snapshot exports
- compaction-floor backfill decisions
- simulated WAL behavior
- virtual-time timers
- client-history checking
- promoted regression-plan replay.

Compaction-heavy runs deliberately lower `CompactEveryOperations` and can lower `CompactionLiveReplicaLagBudget` so a small simulated cluster can reach below-floor snapshot-rescue states. The snapshot-rescue sweep also uses `TransferFaultWeight` to model a hung application export.

## Budgets And Metrics

Generated simulation runs record useful operational data about the run itself:

- total steps
- wall time
- invariant-check time
- managed memory
- steps per second
- share of time spent checking invariants
- snapshot export counts for snapshot-rescue sweeps.

`KOMMANDER_DST_BUDGET=ci` turns those into stall detectors. Treat those limits as "the run stopped making progress" checks, not as ordinary performance benchmarks. The simulation suite is load-sensitive; when a run is surprisingly slow or fails in an ambiguous way, replay the captured plan or run a control without the suspected change.

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
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter Category=DSTSmoke
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter Category=DSTRandom
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Simulation
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.Scheduler
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.RaftSafety
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter FullyQualifiedName~Kommander.Tests.WAL
dotnet test Kommander.Tests/Kommander.Tests.csproj --filter Category=ChaosSmoke
```

Replay promoted plans from a captured artifact directory:

```shell
KOMMANDER_DST_REPLAY_DIR=/path/to/dst-artifacts KOMMANDER_DST_REPLAY_REPEATS=10 \
  dotnet test Kommander.Tests/Kommander.Tests.csproj \
  --filter "FullyQualifiedName~EveryPromotedPlan_StillHoldsEveryCheck"
```

Shrink one plan:

```shell
KOMMANDER_DST_SHRINK_PLAN=/path/to/random-seed-N.plan.txt \
KOMMANDER_DST_SHRINK_BUDGET=700 \
  dotnet test Kommander.Tests/Kommander.Tests.csproj \
  --filter "FullyQualifiedName~AConfiguredPlan_ShrinksToItsCause"
```

Use `Category=ChaosRandom`, `Category=Stress`, `Category=DSTRandom`, or `Category=DSTProbe` only when you want the slower randomized or manual fault-injection tier.

## Why It Matters

This tooling makes it easier to verify invariants, reproduce leadership churn, test delayed I/O, validate pre-vote behavior under isolation, catch non-contiguous delivery bugs, preserve regression plans, and replay a failure without trying to rediscover the bug by chance.
