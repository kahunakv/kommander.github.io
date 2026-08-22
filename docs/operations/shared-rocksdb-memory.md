# Shared RocksDB Memory

Some applications embed Kommander and also use RocksDB for their own local data. Kahuna is a typical example. One process can host a Kommander `RocksDbWAL` and an application RocksDB database. The WAL is the write-ahead log.

Without coordination, those two databases use separate RocksDB memory resources. One process can then hold two block caches. The memtable memory of each database also grows separately.

`RocksDbSharedResources` lets the host create one shared bundle of RocksDB memory. The host passes the bundle to the `RocksDbWAL` of Kommander and to its own RocksDB database. This reduces the duplicate memory overhead. It does not merge the databases. It does not change the WAL format.

## What It Shares

| Resource | Shared | Notes |
| --- | --- | --- |
| Block cache | Yes | One RocksDB LRU block cache applies to the WAL column families of Kommander and to the host database. |
| Write-buffer manager | Yes | One native RocksDB write-buffer manager accounts for the memtable memory of the databases that share it. |
| RocksDB background environment | Already shared | The default process environment of RocksDB is already common in the process. |
| On-disk data | No | The Kommander WAL files and the host database files stay separate. |
| Raft behavior | No | The replication, the recovery, the snapshots, and the wire behavior do not change. |

This feature is opt-in. `RocksDbWAL` behaves as before if you pass no shared resources.

## When To Use It

Use shared RocksDB memory in these conditions:

- Your process runs the `RocksDbWAL` of Kommander.
- The same process also opens another RocksDB database.
- The total memory usage matters.
- You want one bounded budget for the cache and the memtables instead of independent RocksDB budgets.

Do not use this feature to share data between the databases. It covers the in-process RocksDB memory objects only.

## Basic Usage

Create the bundle one time in the composition root of the host application:

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

Then put the same `shared.BlockCache` and `shared.WriteBufferManagerHandle` into the RocksDB options of the host application. Do this before that database opens.

There is no `RaftConfiguration` property for this feature. The host already selects the WAL adapter. Therefore, you configure the sharing when you pass `sharedResources` to the `RocksDbWAL` constructor.

## Budget Size

`CreateWithUnifiedBudget(totalBytes, memtableBudgetBytes)` creates two objects:

- one LRU block cache with the size `totalBytes`
- one write-buffer manager with a memtable sub-budget of `memtableBudgetBytes`.

The memtable budget is inside the total cache budget. Therefore, `memtableBudgetBytes` must be less than `totalBytes` or equal to it.

Start conservatively. For example:

```csharp
RocksDbSharedResources shared = RocksDbSharedResources.CreateWithUnifiedBudget(
    totalBytes: 512L * 1024 * 1024,
    memtableBudgetBytes: 128L * 1024 * 1024
);
```

The RocksDB memtable usage depends on the column families. The RocksDB WAL of Kommander uses several column families. A shared memtable budget that is too small can cause frequent flushes. It can also couple the write behavior of the host database to the WAL write path of Kommander.

You can see that coupling in the write path. Then share the block cache only in the host database. Do not attach the shared write-buffer manager there. The block cache is often the larger duplicate resource on the read side.

## Ownership And Lifetime

The host owns `RocksDbSharedResources`.

Obey these rules:

1. Create the bundle before you open the databases that use it.
2. Pass the bundle to `RocksDbWAL` through the constructor.
3. Pass its cache and its write-buffer manager to each host RocksDB database before that database opens.
4. Dispose every database that borrowed the bundle first.
5. Dispose `RocksDbSharedResources` last.

`RocksDbWAL` borrows the bundle. It does not dispose it.

An early disposal of the bundle must not cause a crash, because RocksDB keeps native shared references internally. It is still a usage error. The memory accounting can become misleading while the databases are still open.

## Observability

`RocksDbSharedResources` gives these members:

| Property | Meaning |
| --- | --- |
| `MemtableMemoryUsage` | The current bytes that the shared write-buffer manager tracks. This value rises when a database that shares the manager writes data. |
| `BlockCache.GetUsage()` | The current occupancy of the block cache. This value is most useful after read traffic fills the cache. |

To verify the sharing, watch `MemtableMemoryUsage` during a write through Kommander and a write through the host database. Both databases draw from the same budget if both writes move that shared counter.

## What Does Not Change

Shared RocksDB memory does not change these items:

- the Raft commit semantics
- the WAL recovery behavior
- the on-disk format
- the database paths
- the partition layout
- the snapshot behavior and the checkpoint behavior
- the network compatibility.

It is an in-process memory optimization. It applies to a host that already runs more than one RocksDB database.

## Related Reading

- [Adapters](../reference/adapters.md)
- [WAL Internals](../internals/wal.md)
- [WAL Diagnostics](./wal-diagnostics.md)
