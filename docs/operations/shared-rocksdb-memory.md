# Shared RocksDB Memory

Some applications embed Kommander and also use RocksDB for their own local data. Kahuna is a typical example: the same process can host a Kommander `RocksDbWAL` and an application RocksDB database.

Without coordination, those databases use separate RocksDB memory resources. That can mean two block caches and separate memtable memory growth inside one process.

`RocksDbSharedResources` lets the host create one shared RocksDB memory bundle and pass it to Kommander's `RocksDbWAL` and to the host application's RocksDB database. This reduces duplicated memory overhead without merging the databases or changing the WAL format.

## What It Shares

| Resource | Shared | Notes |
| --- | --- | --- |
| Block cache | Yes | One RocksDB LRU block cache can be applied to Kommander's WAL column families and the host database. |
| Write-buffer manager | Yes | One native RocksDB write-buffer manager can account memtable memory across the sharing databases. |
| RocksDB background environment | Already shared | RocksDB's default process environment is already common in-process. |
| On-disk data | No | Kommander WAL files and host database files remain separate. |
| Raft behavior | No | Replication, recovery, snapshots, and wire behavior are unchanged. |

This feature is opt-in. If you do not pass shared resources, `RocksDbWAL` behaves as before.

## When To Use It

Use shared RocksDB memory when:

- your process runs Kommander's `RocksDbWAL`
- the same process also opens another RocksDB database
- total memory usage matters
- you want one bounded cache and memtable budget instead of independent RocksDB budgets.

Do not use it to share data between databases. It is only about in-process RocksDB memory objects.

## Basic Usage

Create the bundle once in the host application's composition root:

```csharp
using Kommander.WAL;

RocksDbSharedResources shared = RocksDbSharedResources.CreateWithUnifiedBudget(
    totalBytes: 512L * 1024 * 1024,
    memtableBudgetBytes: 128L * 1024 * 1024
);

IWAL wal = new RocksDbWAL(
    path: walPath,
    revision: nodeRevision,
    logger: logger,
    syncWrites: true,
    sharedResources: shared
);
```

Then wire the same `shared.BlockCache` and `shared.WriteBufferManagerHandle` into the host application's own RocksDB options before that database is opened.

There is no `RaftConfiguration` property for this. The host already chooses the WAL adapter, so sharing is configured by passing `sharedResources` to the `RocksDbWAL` constructor.

## Budget Sizing

`CreateWithUnifiedBudget(totalBytes, memtableBudgetBytes)` creates:

- one LRU block cache sized by `totalBytes`
- one write-buffer manager with a memtable sub-budget of `memtableBudgetBytes`.

The memtable budget lives inside the total cache budget, so `memtableBudgetBytes` must be less than or equal to `totalBytes`.

Start conservatively. For example:

```csharp
RocksDbSharedResources shared = RocksDbSharedResources.CreateWithUnifiedBudget(
    totalBytes: 512L * 1024 * 1024,
    memtableBudgetBytes: 128L * 1024 * 1024
);
```

RocksDB memtable usage depends on column families. Kommander's RocksDB WAL uses multiple column families, so an overly small shared memtable budget can cause frequent flushing and couple the host database's write behavior to Kommander's WAL write path.

If write-path coupling becomes visible, share only the block cache in the host database and avoid attaching the shared write-buffer manager there. The block cache is often the larger duplicated read-side resource.

## Ownership And Lifetime

The host owns `RocksDbSharedResources`.

Important rules:

- create it before opening databases that use it
- pass it to `RocksDbWAL` through the constructor
- pass its cache and write-buffer manager to any host RocksDB database before that database opens
- dispose every database that borrowed it first
- dispose `RocksDbSharedResources` last.

`RocksDbWAL` borrows the bundle and does not dispose it.

Disposing the bundle early should not crash because RocksDB keeps native shared references internally, but it is still a usage error. Memory accounting can become misleading while databases are still open.

## Observability

`RocksDbSharedResources` exposes:

| Property | Meaning |
| --- | --- |
| `MemtableMemoryUsage` | Current bytes tracked by the shared write-buffer manager. This rises as any sharing database writes. |
| `BlockCache.GetUsage()` | Current block-cache occupancy. This is most useful after read traffic populates the cache. |

To verify sharing, watch `MemtableMemoryUsage` while writing through Kommander and through the host database. If both move the same shared counter, both are drawing from the same budget.

## What Does Not Change

Shared RocksDB memory does not change:

- Raft commit semantics
- WAL recovery behavior
- on-disk format
- database paths
- partition layout
- snapshot or checkpoint behavior
- network compatibility.

It is an in-process memory optimization for hosts that already run more than one RocksDB database.

## Related Reading

- [Adapters](../reference/adapters.md)
- [WAL Internals](../internals/wal.md)
- [WAL Diagnostics](./wal-diagnostics.md)
