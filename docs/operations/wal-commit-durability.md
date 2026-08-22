# WAL Commit Durability

Kommander persists the Raft log entries through the configured write-ahead log (WAL).

For a durable backend such as RocksDB or SQLite, Kommander keeps the Raft durability invariant. It also avoids an unnecessary sync that the client can see on the common auto-commit path. A sync is an fsync, which is a durable flush to disk.

Without the single-fsync fast path, a normal auto-commit write does two durable syncs:

1. It writes the proposed entry and syncs it.
2. It writes the committed marker after the quorum acknowledgement, then syncs it.

That older two-sync path is safe and predictable. The storage sync latency can still dominate the write latency. Kommander gives two WAL settings that reduce the cost in different ways:

- `WalGroupCommitLingerMs` improves the batch density and the throughput when concurrent writes arrive at staggered times.
- `WalSingleFsyncCommit` removes the second sync from the auto-commit path that the client can see.

These settings apply to a durable WAL adapter. `InMemoryWAL` does no fsync. A durable adapter with `syncWrites: false` already trades crash durability for test speed or benchmark speed.

## What Makes An Entry Durable

Raft treats an entry as committed when a quorum stores it durably.

The default WAL representation of Kommander stores two records:

- a `Proposed` record, written before the replication
- a `Committed` marker, written after the entry reaches the quorum.

The second marker makes the restart recovery cheaper, because the WAL describes the committed prefix directly. The marker is not the reason that the entry is durable on a quorum. The quorum-durable proposed entry is the Raft commit point.

## Two-Sync Path

With `WalSingleFsyncCommit = false`:

```text
leader proposed entry -> fsync
followers proposed entry -> fsync
quorum reached
leader committed marker -> fsync
client acknowledged
```

Each follower also receives a committed marker and syncs it.

Therefore, one auto-commit write can wait for two serial syncs on the leader path. Group commit can amortize the syncs across many writes. The write still waits for both phases.

## Group Commit Linger

`FairWalScheduler` already batches the ready WAL work across partitions. A worker can drain a maximum of `MaxWalGroupBatchPartitions` ready partitions. It then makes one `IWAL.Write` call.

`WalGroupCommitLingerMs` adds a short adaptive wait after the worker finds the first ready partition. That wait gives more partitions a chance to arrive and share the same storage sync.

Use the linger in these conditions:

- The writes spread across many partitions.
- The WAL batches stay small, even under a meaningful load.
- The follower append traffic arrives at staggered times and causes many near-solo syncs.
- The storage sync cost is visible in a latency profile or a throughput profile.

Start with a small value such as `2 ms`. Then measure the result. A value of `0` keeps the default opportunistic batches.

The linger window is adaptive. The worker does not wait for the full window if no other ready partition arrives. A full group batch also syncs immediately.

`ReplicateEntries` can reduce the proposal overhead and the transport overhead before the work reaches the WAL scheduler. A heterogeneous batch with auto-commit entries only is one proposal. A batch with a trailing manual group is one auto group plus a manual suffix. The WAL scheduler still controls the storage calls and the fsync coalescence through the same group commit settings.

## Single-Fsync Commit Fast Path

`WalSingleFsyncCommit` changes the auto-commit path.

The setting is enabled by default. An `autoCommit` write then acknowledges the client as soon as the proposed entry is durable on a quorum. The runtime still writes the committed marker of each entry afterward. It writes the marker lazily, so the marker can ride a later sync.

```text
proposed entry -> fsync
quorum reached
client acknowledged
committed marker written lazily
```

This is a latency optimization. It removes one serial sync from the path that the client can see. It applies to the common single-round auto-commit write.

It does not apply to an explicit two-phase write. In that case, the caller uses `autoCommit: false`, then calls `CommitLogs` or `RollbackLogs`. That path keeps its separate durable commit behavior.

## Crash Recovery Behavior

With `WalSingleFsyncCommit` enabled, a crash can leave a proposed entry on disk. The committed marker of that entry can be unflushed.

Kommander handles that case conservatively:

- It keeps the durable proposed tail. It does not reuse those log ids.
- It restores the committed prefix from the durable committed records and the committed checkpoints.
- The leader can supply the committed entries to the followers again through normal catch-up and backfill.
- A node that restarts and becomes leader can recommit the durable proposed entries through the standard Raft rules.

One invariant for the operator does not change. A write that the system acknowledges to the client reached quorum durability.

## Application Durability Floor

Raft durability and application durability are related, but they are not identical.

The checkpoints of Kommander describe the prefix of the Raft log that consensus made durable. Your application can apply the committed entries to its own storage synchronously inside `OnReplicationReceived`. It can also apply them to an in-memory projection first and flush that projection later.

Configure `ApplicationDurabilityProvider` if your application flushes asynchronously:

```csharp
public sealed class ProjectionDurability : IApplicationDurabilityProvider
{
    public long GetDurablyAppliedIndex(int partitionId)
    {
        return durableStore.ReadAppliedRaftIndex(partitionId);
    }
}

var config = new RaftConfiguration
{
    ApplicationDurabilityProvider = new ProjectionDurability(),
};
```

The provider returns the highest WAL log id with a committed prefix that is durable in the storage of the application. Kommander uses that floor in two places:

- The restart replay widens down to the floor. The runtime then delivers the committed entries above the durable point of the application again through `OnLogRestored`.
- Compaction does not remove an entry above the floor, even when a Raft checkpoint is higher.

Return `-1` for "no opinion". That value keeps the behavior that the checkpoint anchors. Return `0` when nothing is durably applied yet. The value must come from the durable storage of the application. It must be cheap to read. It must never be too high. A stale low value is safe, because the runtime can deliver the entries again. A value that is too high can hide the entries that the application still needs after a restart.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `WalSingleFsyncCommit` | `true` | Enables the single-fsync fast path for auto-commit. The client acknowledgement occurs when the proposed entry is durable on a quorum. The runtime writes the committed marker lazily. |
| `WalGroupCommitLingerMs` | `0` | The bounded adaptive wait, in milliseconds, that a WAL worker uses to gather more ready partitions into one group commit. `0` disables the linger and keeps the opportunistic batches. |
| `MaxWalGroupBatchPartitions` | `64` | The maximum number of ready partitions that the scheduler coalesces into one group write. |
| `MaxWalBatchSize` | `256` | The maximum number of WAL operations that the scheduler drains from one partition into one batch. |
| `ApplicationDurabilityProvider` | `null` | The optional application durability floor. It widens the restart replay and fences the compaction. |
| `WriteIOThreads` | `4` | The number of write workers in the WAL scheduler. |

The two WAL durability settings are complementary:

- Use `WalSingleFsyncCommit` when the second commit sync dominates the write latency.
- Use `WalGroupCommitLingerMs` when the throughput or the tail latency suffers. That case occurs when the writes arrive far enough apart to miss the batch opportunities.

## Observability

These signals are useful:

- `raft.wal.batches_total`
- `raft.wal.operations_total`
- `raft.wal.batch_size`
- `raft.wal.queue_depth`
- `IRaft.GetPartitionWalQueueDepth`
- `IRaft.GetPartitionCommitWaitMs`

The scheduler internals also track:

- `TotalBatchesWritten`
- `TotalSyncBatchesWritten`
- `TotalPartitionsBatched`

Those counters separate the storage write calls from the true sync batches. With `WalSingleFsyncCommit` enabled, the number of write calls can stay similar while the number of sync batches falls.

For the group commit linger, compare the average batch density before and after you enable it. The linger does useful work if `TotalPartitionsBatched / TotalBatchesWritten` rises while the latency stays acceptable.

## Practical Guidance

- Keep the defaults for your first deployment on durable storage.
- Keep `WalSingleFsyncCommit` enabled when the second commit sync dominates the write latency.
- Disable `WalSingleFsyncCommit` only when you need the older behavior. In that behavior, the committed markers on the disk alone identify the complete committed frontier immediately after a local restart.
- Configure `ApplicationDurabilityProvider` when the application applies the committed entries to its storage asynchronously.
- Use small values for `WalGroupCommitLingerMs` first. A large value can add avoidable latency.
- Do not use `syncWrites: false` in place of these settings in production. That setting changes the crash durability.
- Find the bottleneck first if the WAL queue depth grows steadily. The cause is the storage sync latency, too few `WriteIOThreads`, or a workload that needs more partitions or more nodes.

## Related Reading

- [WAL Diagnostics](./wal-diagnostics.md)
- [Heterogeneous Write Coalescing](../guides/heterogeneous-write-coalescing.md)
- [WAL Internals](../internals/wal.md)
- [Backpressure And Admission Control](../internals/backpressure-and-admission-control.md)
- [Configuration](../reference/configuration.md)
