# WAL Diagnostics

Kommander gives visibility helpers for the write-ahead log (WAL). It also gives a practical durability switch for a test environment.

## WAL Batch Metrics

The WAL scheduler reports its batches through these metrics:

- `raft.wal.batches_total`
- `raft.wal.operations_total`
- `raft.wal.batch_size`

`raft.wal.batches_total` counts the group writes from the scheduler to the storage adapter. One group write can include work from more than one partition.

`raft.wal.batch_size` records the number of operations that the scheduler drains for each partition inside a group write. It does not report the number of partitions in the group.

Under load, a healthy batch pattern usually shows a rise in `raft.wal.operations_total` that is faster than the rise in `raft.wal.batches_total`. That pattern means that the scheduler amortizes several WAL operations into fewer storage calls.

The scheduler also keeps internal counters. They are useful when you validate the WAL durability tuning:

- `TotalBatchesWritten`
- `TotalSyncBatchesWritten`
- `TotalPartitionsBatched`

`TotalSyncBatchesWritten` is the most direct signal for the single-fsync fast path. An fsync is a durable flush to disk. With `WalSingleFsyncCommit` disabled, a committed write usually causes sync work for the proposal and sync work for the commit. With the setting enabled, the scheduler can write a batch with committed markers only. That batch needs no sync of its own.

`TotalPartitionsBatched / TotalBatchesWritten` is useful when you tune `WalGroupCommitLingerMs`. The ratio must rise when the linger gathers more partitions into each group write.

## Count The Persisted Logs And The Removable Logs

`IWAL` gives two helpful count methods:

- `CountPersistedLogs(partitionId)`
- `CountRemovableLogs(partitionId)`

`CountPersistedLogs` returns the total number of persisted log rows for the partition.

`CountRemovableLogs` returns the number of persisted rows strictly below the last committed checkpoint.

These methods are useful for:

- compaction diagnostics
- tests with a focus on the WAL
- an operational check that estimates the quantity of history that is still removable.

## Optional Non-Synchronous Writes

Both durable adapters support `syncWrites: false`:

```csharp
IWAL rocks = new RocksDbWAL("./data", "node-1", logger, syncWrites: false);
IWAL sqlite = new SqliteWAL("./data", "node-1", logger, syncWrites: false);
```

This setting can improve the throughput in CI, in a benchmark, and in some local test runs.

## Durability Tradeoff

With `syncWrites: false`, a process crash or a machine crash can lose an acknowledged write. Use the setting only when crash durability is not part of your validation.

For a production latency change that keeps quorum durability, prefer [WAL Commit Durability](./wal-commit-durability.md). Use the `WalSingleFsyncCommit` setting and the `WalGroupCommitLingerMs` setting. Do not disable the synchronous writes.

## Shared RocksDB Memory Checks

A host can pass `RocksDbSharedResources` to `RocksDbWAL`. Two resource counters then confirm the setup:

- `RocksDbSharedResources.MemtableMemoryUsage`
- `RocksDbSharedResources.BlockCache.GetUsage()`

`MemtableMemoryUsage` is the clearer signal for the write path. It must rise when any database that shares the write-buffer manager writes data.

`BlockCache.GetUsage()` applies to the read path. In a pure append workload, it can stay almost constant until reads fill the block cache.

See [Shared RocksDB Memory](./shared-rocksdb-memory.md) for ownership guidance and size guidance.
