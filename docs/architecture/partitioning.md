# Partitioning

Kommander uses independent Raft partitions. Partition `0` is reserved for replicated system configuration. Application data should use user partitions, which start at `1`.

## Routing Keys

Use partition helpers to map application keys to user partitions:

```csharp
int partition = raft.GetPartitionKey("tenant-42/order-1001");
int prefixPartition = raft.GetPrefixPartitionKey("tenant-42");
```

`GetPartitionKey` uses the prefix before the last `/` separator. `GetPrefixPartitionKey` hashes the complete string provided.

Do not call public replication APIs with partition `0`; `RaftManager` rejects userland writes to the system partition.

## Dynamic Partitions

Initial user partitions are replicated through the reserved system partition and then started on every node. If you keep a concrete `RaftManager` reference, you can request a partition split:

```csharp
RaftManager manager = /* created node */;
await manager.SplitPartition(partitionId);
```

The caller must be initialized, the target partition cannot be partition `0`, and the local node must be leader for the target partition.
