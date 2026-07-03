# WAL Diagnostics

Kommander exposes WAL visibility helpers and a practical durability switch for test environments.

## WAL Batch Metrics

The WAL scheduler reports batching through:

- `raft.wal.batches_total`
- `raft.wal.operations_total`
- `raft.wal.batch_size`

`raft.wal.batches_total` counts scheduler group writes to the storage adapter. A single group write can include work from multiple partitions.

`raft.wal.batch_size` records the number of operations drained for each partition inside a group write. It does not report how many partitions were included in the group.

Under load, a healthy batching pattern usually shows `raft.wal.operations_total` growing faster than `raft.wal.batches_total`, which means multiple WAL operations are being amortized into fewer storage calls.

The scheduler also tracks internal counters that are useful when validating WAL durability tuning:

- `TotalBatchesWritten`
- `TotalSyncBatchesWritten`
- `TotalPartitionsBatched`

`TotalSyncBatchesWritten` is the most direct signal for the single-fsync fast path. With `WalSingleFsyncCommit` disabled, committed writes usually produce both propose and commit sync work. With it enabled, committed-marker-only batches can be written without forcing their own sync.

`TotalPartitionsBatched / TotalBatchesWritten` is useful when tuning `WalGroupCommitLingerMs`; it should rise when the linger is successfully gathering more partitions into each group write.

## Counting Persisted And Removable Logs

`IWAL` exposes two helpful counting methods:

- `CountPersistedLogs(partitionId)`
- `CountRemovableLogs(partitionId)`

`CountPersistedLogs` returns the total number of persisted log rows for the partition.

`CountRemovableLogs` returns the number of persisted rows strictly below the last committed checkpoint.

These are useful for:

- compaction diagnostics
- WAL-focused tests
- operational checks that want to estimate how much history is still removable.

## Optional Non-Synchronous Writes

Both durable adapters support `syncWrites: false`:

```csharp
IWAL rocks = new RocksDbWAL("./data", "node-1", logger, syncWrites: false);
IWAL sqlite = new SqliteWAL("./data", "node-1", logger, syncWrites: false);
```

This can improve throughput in CI, benchmarks, and some local test runs.

## Durability Tradeoff

With `syncWrites: false`, acknowledged writes may still be lost on process or machine crash. Use it only when crash durability is not part of what you are validating.

For production latency tuning that preserves quorum durability, prefer [WAL Commit Durability](./wal-commit-durability.md) and the `WalSingleFsyncCommit` / `WalGroupCommitLingerMs` settings over disabling synchronous writes.

## Shared RocksDB Memory Checks

When a host passes `RocksDbSharedResources` to `RocksDbWAL`, two resource counters help confirm the setup:

- `RocksDbSharedResources.MemtableMemoryUsage`
- `RocksDbSharedResources.BlockCache.GetUsage()`

`MemtableMemoryUsage` is the clearer write-path signal. It should rise when any database sharing the write-buffer manager writes data.

`BlockCache.GetUsage()` is read-path oriented. It may not move much in a pure append workload until reads populate the block cache.

See [Shared RocksDB Memory](./shared-rocksdb-memory.md) for ownership and sizing guidance.
