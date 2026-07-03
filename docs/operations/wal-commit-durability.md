# WAL Commit Durability

Kommander persists Raft log entries through the configured write-ahead log, or WAL.

For durable backends such as RocksDB and SQLite, the default write path favors conservative durability and simple recovery. A normal auto-commit write usually performs two durable storage syncs:

1. write the proposed entry and sync it
2. after quorum acknowledgement, write the committed marker and sync it.

That default is safe and predictable, but storage sync latency can dominate write latency. Kommander exposes two WAL settings that reduce the cost in different ways:

- `WalGroupCommitLingerMs` improves batching density and throughput under staggered concurrent writes
- `WalSingleFsyncCommit` removes the second sync from the client-visible auto-commit path.

These settings affect durable WAL adapters. `InMemoryWAL` does not fsync, and durable adapters configured with `syncWrites: false` already trade away crash durability for testing or benchmarking.

## Mental Model

Raft considers an entry committed when a quorum has durably stored it.

Kommander's default WAL representation stores both:

- a `Proposed` record, written before replication
- a `Committed` marker, written after the entry reaches quorum.

The second marker makes restart recovery cheaper because the WAL describes the committed prefix directly. It is not what makes the entry durable on a quorum. The quorum-durable proposed entry is the Raft commit point.

## Default Path

With default settings:

```text
leader proposed entry -> fsync
followers proposed entry -> fsync
quorum reached
leader committed marker -> fsync
client acknowledged
```

Followers also receive committed markers and sync them.

This means a single auto-commit write can wait for two serial syncs on the leader path. Group commit can amortize syncs across many writes, but the write still waits for both phases.

## Group Commit Linger

`FairWalScheduler` already batches ready WAL work across partitions. A worker can drain up to `MaxWalGroupBatchPartitions` ready partitions and issue one `IWAL.Write` call.

`WalGroupCommitLingerMs` adds a short adaptive wait after the first ready partition is found. That gives more partitions a chance to arrive and share the same storage sync.

Use it when:

- writes are spread across many partitions
- WAL batches are small even under meaningful load
- follower append traffic arrives staggered and causes many near-solo syncs
- storage sync cost is visible in latency or throughput profiles.

Start with a small value such as `2 ms` and measure. `0` keeps the default purely opportunistic batching.

The linger window is adaptive. If another ready partition does not arrive, the worker does not sit through the whole window. A full group batch also syncs immediately.

## Single-Fsync Commit Fast Path

`WalSingleFsyncCommit` changes the auto-commit path.

When enabled, an `autoCommit` write can acknowledge the client as soon as the proposed entry is durable on a quorum. The per-entry committed marker is still written afterward, but it is written lazily so it can ride a later sync.

```text
proposed entry -> fsync
quorum reached
client acknowledged
committed marker written lazily
```

This is a latency optimization. It removes one serial sync from the client-visible path for the common single-round auto-commit write.

It does not apply to explicit two-phase writes where the caller uses `autoCommit: false` and later calls `CommitLogs` or `RollbackLogs`. That path keeps its separate durable commit behavior.

## Crash Recovery Behavior

With `WalSingleFsyncCommit` enabled, a crash can leave a proposed entry on disk whose committed marker was not flushed yet.

Kommander handles that conservatively:

- it keeps the durable proposed tail and does not reuse those log ids
- it restores the committed prefix from durable committed records and committed checkpoints
- followers can be re-supplied committed entries by the leader through normal catch-up and backfill
- a restarted node that becomes leader can recommit durable proposed entries through standard Raft rules.

The important operator-facing invariant is unchanged: a write acknowledged to the client has reached quorum durability.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `WalSingleFsyncCommit` | `false` | Enables the single-fsync auto-commit fast path. Client acknowledgement happens when the proposed entry is durable on a quorum; the committed marker is written lazily. |
| `WalGroupCommitLingerMs` | `0` | Bounded adaptive wait, in milliseconds, used by WAL workers to gather more ready partitions into a group commit. `0` disables the linger and keeps opportunistic batching. |
| `MaxWalGroupBatchPartitions` | `64` | Maximum ready partitions coalesced into one scheduler group write. |
| `MaxWalBatchSize` | `256` | Maximum WAL operations drained from one partition into one batch. |
| `WriteIOThreads` | `4` | Number of WAL scheduler write workers. |

The two new knobs are complementary:

- use `WalSingleFsyncCommit` when write latency is dominated by the second commit sync
- use `WalGroupCommitLingerMs` when throughput or tail latency suffers because writes arrive just far enough apart to miss batching opportunities.

## Observability

Useful signals:

- `raft.wal.batches_total`
- `raft.wal.operations_total`
- `raft.wal.batch_size`
- `raft.wal.queue_depth`
- `IRaft.GetPartitionWalQueueDepth`
- `IRaft.GetPartitionCommitWaitMs`

Scheduler internals also track:

- `TotalBatchesWritten`
- `TotalSyncBatchesWritten`
- `TotalPartitionsBatched`

Those counters distinguish storage write calls from true sync batches. With `WalSingleFsyncCommit` enabled, the number of write calls may stay similar while the number of sync batches drops.

For group commit linger, compare average batch density before and after enabling it. If `TotalPartitionsBatched / TotalBatchesWritten` rises while latency stays acceptable, the linger is doing useful work.

## Practical Guidance

- Keep defaults when first deploying durable storage.
- Enable `WalSingleFsyncCommit` only after measuring write latency on your storage backend.
- Use `WalGroupCommitLingerMs` with small values first; large values can add avoidable latency.
- Do not use `syncWrites: false` as a substitute for these settings in production. That changes crash durability.
- If WAL queue depth grows steadily, first determine whether the bottleneck is storage sync latency, too few `WriteIOThreads`, or a workload that needs more partitions or nodes.

## Related Reading

- [WAL Diagnostics](./wal-diagnostics.md)
- [WAL Internals](../internals/wal.md)
- [Backpressure And Admission Control](../internals/backpressure-and-admission-control.md)
- [Configuration](../reference/configuration.md)
