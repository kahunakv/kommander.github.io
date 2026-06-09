# Partitioning

Kommander uses independent Raft partitions. Partition `0` is reserved for replicated system configuration. Application data must use user partitions with ids greater than `0`; the first user partition is `1`.

Partitions let one cluster manage many independent decision streams. Instead of forcing every update through one leader, Kommander can have different leaders for different partitions. That helps spread work across nodes while keeping strict ordering inside each partition.

## Routing Keys

Use partition helpers to map application keys to user partitions:

```csharp
int partition = raft.GetPartitionKey("tenant-42/order-1001");
int prefixPartition = raft.GetPrefixPartitionKey("tenant-42");
```

`GetPartitionKey` uses the prefix before the last `/` separator. `GetPrefixPartitionKey` hashes the complete string provided.

Use stable keys. If the same tenant, workflow, or resource is routed with different key formats over time, related decisions may land in different partitions.

Do not call public replication APIs with partition `0`; `RaftManager` rejects userland writes to the system partition. Use partition `1` or higher for application data.

## Dynamic Partitions

Initial user partitions are replicated through the reserved system partition and then started on every node. If you keep a concrete `RaftManager` reference, you can request a partition split:

```csharp
RaftManager manager = /* created node */;
await manager.SplitPartition(partitionId);
```

The caller must be initialized, the target partition must be `1` or higher, and the local node must be leader for the target partition.

Recent Kommander builds also expose create, remove, split, and merge APIs through `IRaft`, along with generation fencing and partition-map snapshots. See [Elastic Partitions](../guides/elastic-partitions.md) for the user-facing lifecycle behavior.
