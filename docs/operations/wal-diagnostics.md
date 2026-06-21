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
