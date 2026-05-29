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
```

For fast local simulations, use `InMemoryWAL` with `InMemoryCommunication`. The source tree also contains deterministic scheduler and Raft-safety test suites that exercise election safety, commit monotonicity, stale WAL completions, stale append responses, and partition restore behavior.
