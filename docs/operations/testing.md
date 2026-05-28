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
```

For fast local simulations, use `InMemoryWAL` with `InMemoryCommunication`.
