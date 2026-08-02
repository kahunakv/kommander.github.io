# Scheduler Internals

Kommander separates state-machine execution from blocking storage work.

The partition executor owns Raft state. The read and WAL schedulers own synchronous storage calls.

## Partition Executor

`RaftPartitionExecutor` is a serial executor for one partition. It has separate queues for four classes of work:

| Kind | Weight | Examples |
| --- | ---: | --- |
| Control | `8` | heartbeats, vote requests, vote responses, leadership checks |
| Replication | `4` | append logs, append completions, WAL completions |
| Client | `2` | proposals, commits, rollbacks, ticket checks |
| Maintenance | `1` | restore, drain barriers, maintenance work |

The executor drains these queues in weighted-fair order. Control traffic gets more turns than client traffic so client proposals cannot starve heartbeats and elections.

The executor starts by restoring the WAL. If restore fails, it stops instead of accepting normal Raft operations against incomplete state.

## Fair WAL Scheduler

`FairWalScheduler` handles synchronous writes to `IWAL`.

Its goals are:

- preserve FIFO write order inside each partition
- allow different partitions to write concurrently
- prevent one hot partition from starving others
- batch compatible writes within a drain cycle
- coalesce ready partitions into cross-partition group commits
- apply per-partition backpressure instead of allowing unbounded queues
- drain accepted work on shutdown.

Each partition has its own pending queue. A global ready queue contains partition ids, not individual writes. A partition appears at most once in the ready queue, so workers rotate across active partitions instead of being monopolized by one partition.

When several partitions are ready at the same time, one worker can drain up to `MaxWalGroupBatchPartitions` partition queues and issue one `IWAL.Write` call that spans all of them. Within each partition, it drains up to `MaxWalBatchSize` operations and preserves FIFO order.

This is a group-commit optimization. For RocksDB, the grouped call becomes one `WriteBatch` and one `db.Write` / fsync even when many partitions are included.

Application-facing batching such as `ReplicateEntries` happens before this layer. It can turn mixed typed records into fewer Raft proposals for one partition. The WAL scheduler then treats those proposal writes like ordinary partition-tagged WAL work and may coalesce them with other ready partitions.

SQLite benefits from the same scheduler behavior through shard-level batching. `SqliteWAL` maps partitions to a fixed pool of shard databases and then groups each scheduler batch by shard. If a scheduler group includes many partitions but they span only a few SQLite shards, the adapter commits one transaction per shard instead of one transaction per partition. With one SQLite shard, a full cross-partition scheduler group can commit in one SQLite transaction.

Per-partition ordering is preserved with an in-flight guard. A partition included in one worker's group batch cannot be drained by another worker until that batch completes.

## Fair Read Scheduler

`FairReadScheduler` handles synchronous WAL reads. It uses the same broad model:

- partition-tagged read queues
- FIFO order within a partition
- fair dispatch across partitions
- bounded per-partition queue depth
- task completion when the synchronous read returns.

Reads that semantically depend on prior writes are submitted after the write completion callback fires. That preserves the expected write-then-read ordering for a partition.

The read scheduler also guards against reschedule stranding. If a partition receives more read work while a worker is between draining and clearing its in-flight marker, the scheduler requeues that partition so the new work cannot remain parked until unrelated activity wakes the scheduler. Concurrent drain races are handled the same way: at most one worker owns a partition at a time, and any work that arrives during that ownership is made visible for a later drain.

## Backpressure

The fair schedulers have per-partition queue limits. When the limit is reached, callers get a backpressure exception instead of silently creating an unbounded backlog.

This matters for consensus. If client work could grow without bounds, it could delay control-plane work such as heartbeats and vote handling.

For the full request path, including client proposal admission, WAL write limits, drain quanta, and how overload surfaces to callers, see [Backpressure And Admission Control](backpressure-and-admission-control.md).
