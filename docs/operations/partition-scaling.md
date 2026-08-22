# Partition Scaling

Kommander supports clusters with many partitions, where only a smaller set is active at one moment.

Two runtime features make that practical:

- a shared executor pool, so each partition does not need its own operating-system thread
- hot-set leader checks, so idle partitions do not receive frequent `CheckLeader` ticks.

The hot set is the group of partitions that are active now.

These features are separate from the elastic partition APIs. Elastic partitions change the partition map. Partition scaling controls the CPU cost and the thread cost of many resident partitions.

## Why This Matters

Each user partition is a serial Raft state machine. The work for one partition must run one operation at a time and in order.

The simple implementation gives one thread to each partition. That implementation becomes expensive quickly. A cluster with thousands of mostly idle partitions must not need thousands of parked threads. It must also not need thousands of timer wakeups every few hundred milliseconds.

With the shared executor pool, idle partitions keep their state, but they own no dedicated worker threads. An active partition signals that it has work. A bounded pool then drains a slice of that work. The worker then moves to another ready partition.

## Shared Executor Pool

`RaftPartitionExecutor` still owns the queues and the serial execution for one partition. The difference is the way that the runtime drains the queued work.

With `EnableSharedExecutorPool = true`, all partition executors share a fixed pool of worker threads:

1. A producer posts work to a partition executor.
2. The executor marks itself runnable and enters the global ready queue.
3. One pool worker acquires the run-lock of that partition.
4. The worker drains a bounded quantum of control, replication, client, and maintenance work.
5. The runtime requeues the partition if more work remains.

One guarantee does not change: two workers never drain the same partition at the same time. That single-owner rule keeps the Raft state machine serial. It also prevents concurrency surprises inside one partition that the application can see.

## Hot-Set Leader Checks

Kommander runs `CheckLeader` at regular intervals. The check sends heartbeats, detects missing leaders, and starts elections.

With the shared executor pool enabled, Kommander does not post this fast timer work to every user partition at every tick. The rules are:

- Kommander always checks partition `0`, the system partition.
- Kommander checks active user partitions at each `CheckLeaderInterval`.
- Kommander skips idle quiesced partitions in the fast cycle.
- A full safety sweep checks all partitions at each `UpdateNodesInterval`.

With the defaults, `CheckLeaderInterval` is `250 ms` and `UpdateNodesInterval` is `5 s`. Therefore, the fast cycle runs four times each second. The full sweep runs approximately every five seconds.

## Relationship To Quiescence

Partition scaling and partition quiescence solve different parts of the same problem with many partitions.

| Feature | Reduces | How |
| --- | --- | --- |
| Shared executor pool | Thread cost and scheduler cost | Many partitions share a bounded worker pool instead of one thread each. |
| Hot-set leader checks | Timer wakeups and CPU overhead | Only active partitions receive fast `CheckLeader` ticks. |
| Partition quiescence | Network heartbeat traffic | Idle leaders stop the heartbeats of each partition. Followers then use SWIM node liveness. |

SWIM is the failure detector of Kommander. It tracks the liveness of each node.

The hot-set membership follows the quiescence state. A partition leaves the hot set when it quiesces. It returns to the hot set when a write, an append, a vote, or a relevant failure signal wakes it.

See [Partition Quiescence](../guides/partition-quiescence.md) for the network side.

## Failover For Quiet Partitions

Kommander skips the fast ticks for idle partitions. It does not forget the quiet partitions.

Kommander has two wake paths:

- SWIM marks the leader node `Suspect` or `Dead`. Kommander then returns each partition that believed in that leader to the hot set.
- The periodic full safety sweep checks every partition as a backstop.

In normal operation, the failover of a quiet partition depends on SWIM detection. It does not wait for the slower sweep only.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `EnableSharedExecutorPool` | `true` | Enables the shared partition executor pool and the hot-set optimization for `CheckLeader`. Set it to `false` only to isolate scheduler behavior, or to return to one thread for each partition on purpose. |
| `PartitionExecutorPoolSize` | `0` | The worker count for the shared executor pool. `0` means `Environment.ProcessorCount`. The runtime clamps a value below `0` to `1`. |
| `CheckLeaderInterval` | `250 ms` | The fast leader-check cadence for the system partition and the hot user partitions. |
| `UpdateNodesInterval` | `5000 ms` | The membership refresh cadence. It is also the approximate cadence of the full safety sweep across all partitions. |
| `EnableQuiescence` | `true` | Permits an idle partition to leave the hot set and to suppress the heartbeats of that partition. |
| `QuiesceAfter` | `1500 ms` | The idle time before a partition can quiesce. |

There is no separate setting for the hot-set interval. `CheckLeaderInterval` and `UpdateNodesInterval` give the fast cadence and the slow cadence.

## How To Size The Pool

Start with the default `PartitionExecutorPoolSize = 0`. That default uses the processor count of the machine.

The pool size must follow the number of partitions that do CPU-side Raft work at the same time. It must not follow the total partition count. Ten thousand idle partitions do not need ten thousand executor threads.

Use these signals when you tune the pool:

- Increase `PartitionExecutorPoolSize` only if the operation latency rises while the CPU is not saturated.
- Keep the value when the CPU is saturated. More threads then mainly add context switches.
- Tune `WriteIOThreads` when the WAL writes are the bottleneck. The WAL is the write-ahead log.
- Do not set the pool size to the partition count. That setting recreates the cost of one thread for each partition.

The WAL scheduler and its write I/O threads do the fsync work. An fsync is a durable flush to disk. The partition executor workers must spend most of their time on state-machine scheduling and callbacks. They must not wait on the disk.

## What This Does Not Change

Partition scaling does not change the Raft safety rules, the quorum math, the log format, the terms, or the commit behavior.

It also does not unload the partition metadata. It does not close the WAL handle of a partition. Kommander keeps resident partitions in memory. Each WAL adapter handles the storage through its own shared or sharded structures. This optimization covers threads, scheduling, periodic checks, and idle overhead only.

## Operational Notes

- Keep `EnableSharedExecutorPool = true` for large partition counts.
- Watch the partition queue depths, the scheduler queue depths, and the operation latency when you size the pool.
- Control-plane work keeps its priority over client work inside each drain cycle of the executor.
- The partition lifecycle removes a stopped or removed partition from the hot set.
- Disable quiescence if you disable SWIM. Quiet partitions must not depend on node-liveness signals that are not available.

## Related Reading

- [Partition Quiescence](../guides/partition-quiescence.md)
- [SWIM Failure Detection](../guides/swim-failure-detection.md)
- [Scheduler Internals](../internals/scheduler.md)
- [Metrics And Diagnostics](../internals/metrics-and-diagnostics.md)
- [Configuration](../reference/configuration.md)
