# WAL Internals

The write-ahead log, or WAL, is how Kommander remembers Raft log entries across restarts.

`RaftWriteAhead` is the internal facade between the partition state machine and the configured `IWAL` adapter.

## Log Types

Kommander stores Raft entries with explicit lifecycle types:

| Type | Meaning |
| --- | --- |
| `Proposed` | The leader has proposed an application entry. |
| `Committed` | The proposed entry is committed and can be applied. |
| `RolledBack` | The proposed entry was explicitly rolled back. |
| `ProposedCheckpoint` | A proposed checkpoint marker. |
| `CommittedCheckpoint` | A committed checkpoint marker. |
| `RolledBackCheckpoint` | A checkpoint proposal that was rolled back. |

The application normally sees committed entries through `OnReplicationReceived` and restored committed entries through `OnLogRestored`.

## Recovery

When a partition executor starts, it calls WAL recovery before normal operations are accepted.

Recovery:

1. reads logs for the partition through `ReadScheduler`
2. advances local propose and commit indexes
3. ignores proposed and rolled-back entries for application restore
4. invokes `OnLogRestored` for committed application logs
5. invokes system restore callbacks for committed system logs
6. marks restore complete for the partition.

If there are no logs, the commit index starts after the adapter's current max log id.

## Leader Write Path

For a leader proposal:

1. the state machine assigns log ids and the current term
2. `RaftWriteAhead` enqueues a leader propose write
3. `FairWalScheduler` writes the proposed entries
4. completion returns to the partition executor
5. the state machine creates a proposal quorum tracker
6. append-log messages are sent to followers.

For auto-commit proposals, the leader commits after quorum completion. For manual proposals, the caller uses the proposal ticket with `CommitLogs` or `RollbackLogs`.

## Cross-Partition Group Commit

`FairWalScheduler` can batch writes from multiple ready partitions into one `IWAL.Write` call.

The scheduler batches in two layers:

- up to `MaxWalBatchSize` operations from one partition
- up to `MaxWalGroupBatchPartitions` partitions in one group write.

The important guarantee is unchanged: writes remain FIFO within each partition. A partition can appear in only one in-flight group batch at a time.

For RocksDB, the grouped call is written as one `WriteBatch`, so many partition writes can share one `db.Write` / fsync. This is a major performance win for clusters with many active partitions.

For SQLite, partitions are mapped into a fixed set of shard databases. The adapter groups the scheduler's cross-partition batch by shard, merges same-partition entries inside each shard, and commits one SQLite transaction per shard. A batch of `P` partitions spanning `S` shards therefore costs `S` SQLite transactions and fsyncs. This keeps the scheduler-level fairness model while improving SQLite write amortization.

If one shard write fails, the scheduler reports the group status as errored to all operations in that group. Retries are safe because WAL writes are idempotent.

`WalGroupCommitLingerMs` can make group commits denser. When it is greater than `0`, a write worker may wait briefly after finding the first ready partition so more partitions can join the same storage sync. This is adaptive and bounded by `MaxWalGroupBatchPartitions`.

## Single-Fsync Auto-Commit Path

By default, an auto-commit write syncs both the proposed entry and the committed marker.

With `WalSingleFsyncCommit` enabled, Kommander can release an auto-commit proposal when the proposed entry is durable on a quorum. The committed marker is still written, but it can ride a later sync.

The recovery path preserves the durable proposed tail and reconstructs the committed frontier conservatively. A follower that restarted with missing committed markers can be re-supplied by the leader through normal catch-up and backfill.

This does not affect explicit two-phase writes where the caller proposes with `autoCommit: false` and later calls `CommitLogs` or `RollbackLogs`.

See [WAL Commit Durability](../operations/wal-commit-durability.md) for operator-facing tuning guidance.

## RocksDB Shared Memory Resources

`RocksDbWAL` can borrow a `RocksDbSharedResources` bundle supplied by the host application.

The bundle contains:

- one RocksDB block cache
- one native RocksDB write-buffer manager.

When the bundle is passed to the `RocksDbWAL` constructor, the WAL applies the write-buffer manager to its `DbOptions` and applies the block cache to every RocksDB column family before opening the database. The same bundle can be wired into a host application's own RocksDB database so both databases draw from one memory budget.

This is memory sharing only. The WAL database path, column families, Raft log format, and recovery behavior stay unchanged.

`RocksDbWAL` does not own or dispose the bundle. The host must dispose every database that borrowed the bundle first, then dispose `RocksDbSharedResources`.

See [Shared RocksDB Memory](../operations/shared-rocksdb-memory.md) for the user-facing setup and sizing model.

## SQLite Shard Batching

`SqliteWAL` stores logs in files named like `raft_shard{shardId}_{revision}.db`. A partition maps to a shard with `partitionId mod shardCount`.

The shard count controls the main SQLite batching tradeoff:

| Choice | Effect |
| --- | --- |
| Lower `shardCount` | More partitions share a shard, so cross-partition scheduler batches collapse into fewer SQLite transactions and fsyncs. |
| Higher `shardCount` | More shard files can operate independently, which can improve concurrency when many partitions are active at the same time. |

For a new data directory, `new SqliteWAL(path, revision, logger, syncWrites, shardCount)` seeds the shard count. A `shardCount` of `0` uses `Environment.ProcessorCount`. After the directory is initialized, the resolved shard count is persisted in metadata and reused on later opens. Passing a different non-zero value for an existing directory fails fast because it would route existing partitions to different shard files.

## Follower Append Path

Followers receive append-log messages from the leader. The state machine validates leadership and term expectations, then asks `RaftWriteAhead` to propose, commit, or roll back entries as needed.

Committed follower entries are applied to the application callback after the WAL write succeeds.

## WAL Completion Fencing

WAL completions are not trusted blindly. Completion messages are checked against pending operations and log ranges. Unknown, stale, superseded, or malformed completions are discarded.

This protects the partition from acting on a storage completion that belongs to an older term, an already-processed operation, or an invalid log range.
