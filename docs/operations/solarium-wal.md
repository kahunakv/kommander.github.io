# Solarium WAL

[Solarium.Kommander](https://solariumdb.github.io/docs/integrations/kommander/) provides `SolariumWAL`, an external durable implementation of Kommander's `IWAL` interface. You pass it to `RaftManager` in the same position as `RocksDbWAL`, `SqliteWAL`, or `InMemoryWAL`. Kommander itself does not need a fork or a storage-specific configuration flag.

Solarium is useful when you want a durable WAL implemented in .NET without shipping the native RocksDB library. The integration preserves the Raft-facing behavior that Kommander expects, including log shards, commit and compaction frontiers, checkpoints, snapshot boundaries, hard state, and the HLC floor.

`Solarium.Kommander` is maintained and versioned separately from Kommander. Check the [official integration guide](https://solariumdb.github.io/docs/integrations/kommander/) for the currently supported Kommander and .NET versions before upgrading either dependency.

## Create The WAL

Add the `Solarium.Kommander` project or package according to the official Solarium instructions, then construct `SolariumWAL` and pass it to the node:

```csharp
using Kommander;
using Kommander.Discovery;
using Kommander.Time;
using Solarium.Kommander;

using SolariumWAL wal = new(
    path: "/var/lib/node1/raft",
    revision: "v1",
    logger: logger,
    syncWrites: true
);

RaftManager raft = new(
    configuration,
    new StaticDiscovery(peers),
    wal,
    communication,
    new HybridLogicalClock(),
    logger
);
```

The WAL stores its database under `{path}/{revision}` and creates that directory when needed. Only one process may open it at a time.

| Parameter | Meaning |
| --- | --- |
| `path` | Base directory that contains the revision directory. |
| `revision` | Storage subdirectory name, such as `"v1"`. |
| `logger` | The node's `ILogger<IRaft>`. |
| `syncWrites` | Whether a write is flushed to disk before it returns. Defaults to `true`. |
| `options` | Optional `SolariumWalOptions` for storage-engine tuning and shared resources. |

`RaftManager` disposes the WAL when the manager is disposed. Resources supplied through `SolariumWalOptions`, such as a storage environment, write-buffer manager, or block cache, remain owned by the host. Dispose the WAL first and those shared resources afterward.

## Durability

Keep `syncWrites: true` for a node whose acknowledged Raft log must survive power loss. The adapter flushes a write before returning from `IWAL.Write`.

With `syncWrites: false`, a write reaches the operating system before returning but is not forced to stable storage. It can survive a process crash while still being vulnerable to power loss or an operating-system crash. Use this mode only when that durability tradeoff is intentional, such as a benchmark or a disposable test cluster.

Kommander's `WalSingleFsyncCommit`, cross-partition scheduler batching, backpressure, compaction, and checkpoint behavior continue to operate above the adapter. Solarium decides how each `IWAL` operation is represented and persisted.

## Storage Compatibility

`SolariumWAL` follows the logical layout and metadata model of Kommander's `RocksDbWAL`, but it uses Solarium files. A RocksDB WAL directory cannot be opened as a Solarium WAL directory, and a Solarium WAL directory cannot be opened by `RocksDbWAL`.

Do not switch an existing node by pointing `SolariumWAL` at its RocksDB path. Moving between the engines requires an explicit data migration or rebuilding the replica from another healthy cluster member through normal catch-up and snapshot installation. Keep the old data until the replacement replica has caught up and is healthy.

## Tuning And Shared Memory

`SolariumWalOptions` controls the storage-engine resources and shard behavior. The main options are:

| Option | Purpose |
| --- | --- |
| `ShardWriteBufferSizeBytes` | Sets the memtable flush unit for each Raft-log shard. |
| `ShardMaxWriteBufferNumber` | Limits the memtables a shard can hold before writes wait for a flush. |
| `ShardLevel0FileNumCompactionTrigger` | Starts compaction after the configured number of level-0 files. |
| `ShardLevel0SlowdownWritesTrigger` | Slows writes when level-0 file pressure reaches the threshold. |
| `ShardLevel0StopWritesTrigger` | Stops writes at the hard level-0 pressure threshold. |
| `MaxBackgroundCompactions` | Limits concurrent background compaction work. |
| `MaxTotalWalSizeFlushUnits` | Bounds storage-engine WAL growth in units of shard flushes. |
| `WriteBufferManager` | Optionally shares and bounds memtable memory with other Solarium databases in the host. |
| `BlockCache` | Optionally shares and bounds index and filter memory. |
| `Environment` | Selects the storage environment, including the optional Linux io_uring environment. |
| `TickSource` | Supplies the clock used by failure logging and probe cadence. |

The host owns shared memory resources. When a write-buffer manager and block cache are shared with another Solarium database, size the budget for both the Kommander WAL and the application database. An undersized budget can cause frequent flushes and higher write amplification without changing Raft safety.

The Solarium guide documents the current defaults and their relationship to `RocksDbWalTuning`. Treat those defaults as version-specific rather than copying them permanently into application configuration.

## Optional io_uring Environment

On Linux, `Solarium.IoUring` can supply an `IoUringStorageEnvironment`:

```csharp
using Solarium.IoUring;
using Solarium.Kommander;

using IoUringStorageEnvironment environment = new();
using SolariumWAL wal = new(
    path,
    "v1",
    logger,
    syncWrites: true,
    new SolariumWalOptions { Environment = environment }
);
```

The host owns the environment, so dispose it after the WAL. Benchmark the default and io_uring environments with your workload before choosing one; the best result depends on whether writes are synchronized and on the storage device.

## Storage Failure Recovery

After a write failure, Solarium prevents later database writes from proceeding blindly. `SolariumWAL` probes the volume with a small durable file write and probes the database with a canary write. It reopens the database only when the volume works but the database remains failed, then retries the operation once.

If the volume still rejects writes, such as when a disk is full, the adapter returns `RaftOperationStatus.Errored` and leaves the database closed or failed. Kommander's ordinary retry, WAL-stall detection, and leader step-down behavior remain responsible for the consensus-side response. Fix the storage condition rather than relying on repeated reopen attempts.

## Metrics

Kommander's adapter-independent WAL metrics remain on the `Kommander` meter. These include scheduler batches, operations, queue depth, oldest pending write age, write duration, and compaction passes.

Storage-engine gauges from `SolariumWAL` are published on the separate `Solarium.Kommander` meter. Register both meters:

```csharp
builder.Services.AddOpenTelemetry().WithMetrics(metrics => metrics
    .AddMeter("Kommander")
    .AddMeter(SolariumWalMetrics.MeterName));
```

The Solarium meter publishes storage pressure and memory signals using the same `raft.wal.*` names and meanings as the corresponding RocksDB metrics, including:

- delayed or stopped writes
- live SSTable bytes and level file counts
- table-reader and memtable memory
- block-cache usage and pinned bytes when a cache is configured
- storage-engine WAL file bytes
- database reopen outcomes

Listen to both meters when building dashboards. Otherwise the consensus and scheduler metrics will be present while the Solarium storage-engine signals are missing.

## Operational Checklist

- Use a node-private WAL directory and allow only one process to open it
- Keep `syncWrites: true` when power-loss durability is required
- Do not reuse a `RocksDbWAL` directory as a `SolariumWAL` directory
- Register both the `Kommander` and `Solarium.Kommander` meters
- Dispose host-owned environments and shared memory resources after the WAL
- Validate dependency compatibility before upgrades
- Exercise restart, snapshot installation, compaction, and disk-full handling in staging

For the complete option defaults, format details, concurrency rules, conformance tests, and benchmarks, read the [Solarium.Kommander integration guide](https://solariumdb.github.io/docs/integrations/kommander/).

