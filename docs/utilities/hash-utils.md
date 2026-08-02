# Hash Utilities

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

These helpers are useful when building partition-aware services on top of Kommander.

`HashBytes` hashes the exact bytes you pass with xxHash64. Use it when you already have a canonical binary representation and do not want string encoding or process-randomized hashing involved.
