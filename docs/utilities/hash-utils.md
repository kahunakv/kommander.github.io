# Hash Utilities

Use `HashUtils` when your service needs a hash that is the same in every process. The default .NET `string.GetHashCode` gives a different value in each process, so two nodes can disagree about where a key belongs. The `HashUtils` functions give the same value in every process and after every restart.

Kommander uses these helpers itself. It derives a node id from the node name with `SmallSimpleHash` when `NodeId` is `0`. Its partition routing table also hashes keys with `HashUtils`. To route a key to a Kommander partition, call `raft.GetPartitionKey(key)` instead. Use `HashUtils` directly for your own bucketing, sharding, or storage keys.

`HashUtils` provides xxHash-based helpers and jump consistent hashing:

```csharp
int nodeId = HashUtils.SmallSimpleHash("node-1");
ulong hash = HashUtils.SimpleHash("tenant-42");
ulong bytesHash = HashUtils.HashBytes(payload);
ulong bucket = HashUtils.StaticHash("tenant-42", buckets: 128);
long prefixed = HashUtils.PrefixedHash("tenant-42/order-1", '/', buckets: 128);
long inversePrefixed = HashUtils.InversePrefixedHash("tenant-42/order-1", '/', buckets: 128);
int consistent = HashUtils.ConsistentHash("tenant-42", numBuckets: 128);
```

`HashBytes` hashes the exact bytes you pass with xxHash64. Use it when you already have a canonical binary representation and do not want string encoding or process-randomized hashing involved.
