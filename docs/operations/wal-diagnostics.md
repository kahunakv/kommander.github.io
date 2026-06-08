# WAL Diagnostics

Recent Kommander builds added more WAL visibility and a practical durability switch for test environments.

## Counting Persisted And Removable Logs

`IWAL` now exposes two helpful counting methods:

- `CountPersistedLogs(partitionId)`
- `CountRemovableLogs(partitionId)`

`CountPersistedLogs` returns the total number of persisted log rows for the partition.

`CountRemovableLogs` returns the number of persisted rows strictly below the last committed checkpoint.

These are useful for:

- compaction diagnostics,
- WAL-focused tests,
- operational checks that want to estimate how much history is still removable.

## Optional Non-Synchronous Writes

Both durable adapters now support `syncWrites: false`:

```csharp
IWAL rocks = new RocksDbWAL("./data", "node-1", logger, syncWrites: false);
IWAL sqlite = new SqliteWAL("./data", "node-1", logger, syncWrites: false);
```

This can improve throughput in CI, benchmarks, and some local test runs.

## Durability Tradeoff

With `syncWrites: false`, acknowledged writes may still be lost on process or machine crash. Use it only when crash durability is not part of what you are validating.
