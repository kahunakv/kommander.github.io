---
sidebar_position: 2
---

# Why Kommander?

Kommander is for .NET applications that need several processes to agree on important decisions and continue safely when a node fails.

It provides a production-oriented Raft runtime as an embeddable library. Your service keeps its API, data model, authorization, and business logic while Kommander handles leader election, ordered replication, quorum commits, durable recovery, and cluster coordination.

## The Problem It Solves

Running the same service on several machines does not automatically make its decisions consistent. Two nodes can accept conflicting updates, a process can fail after writing only part of a change, or a network partition can leave both sides believing they should proceed.

Kommander gives those nodes one agreed order of changes. For each partition:

1. one node acts as leader
2. the leader proposes an application command
3. a quorum stores the command durably
4. every node applies committed commands in the same order
5. another node can become leader when the current leader is unavailable.

This is useful when correctness depends on agreement, not merely on eventually copying data.

## Why Use A Library?

Many consensus systems are complete databases or separate infrastructure services. Kommander takes a different approach: it embeds the consensus machinery inside your .NET process.

That model is valuable when:

- your domain state and API already belong in an existing service
- you need an ordered replicated command stream rather than a predefined database model
- leader-aware work should run beside your application code
- deploying and operating another standalone coordination service would add unnecessary complexity
- tests should exercise the same consensus APIs with in-memory adapters.

You construct `RaftManager`, choose its adapters, subscribe to committed-log callbacks, and decide how each command changes your application state.

## What You Get

### Raft Consensus

Kommander implements per-partition leader election, pre-vote, quorum-based log replication, commit tracking, follower catch-up, leadership transfer, and durable restart recovery.

You do not have to implement election timers, term handling, vote rules, log matching, stale-leader rejection, or quorum tracking in application code.

### Independent Partitions

Each user partition has its own Raft group and leader. Different nodes can lead different partitions, allowing independent workloads to make progress without sending every decision through one cluster-wide leader.

Partition `0` is reserved for Kommander's system state. Application partitions start at `1`.

### Pluggable Storage And Transport

Choose the components that fit your deployment:

| Concern | Built-in choices |
| --- | --- |
| Durable WAL | RocksDB or SQLite |
| Test WAL | In-memory |
| Network transport | gRPC or REST/JSON |
| Test transport | In-memory |
| Discovery | Static, dynamic, or multicast |

The consensus API stays the same while the deployment details can change.

### Runtime Cluster Changes

Kommander supports capabilities commonly needed after the first deployment:

- add nodes as non-voting learners and promote them after catch-up
- remove members through a committed cluster roster
- detect node failure through SWIM-style probing
- create, split, merge, and remove user partitions
- fence stale routing decisions with partition generations
- redistribute partition leaders by count and measured load.

These features let the cluster adapt without treating its initial membership and partition layout as permanent.

### Storage Efficiency And Backpressure

Fair schedulers keep one busy partition from monopolizing synchronous WAL work. Cross-partition group commit can combine writes into fewer storage flushes, while admission limits prevent client and WAL queues from growing without bound.

Checkpoints and bounded compaction keep old recoverable history under control. Partition quiescence reduces heartbeat traffic when a cluster has many idle partitions.

### Security And Diagnostics

The network transports support TLS-aware configuration, shared-secret request authentication, replay protection, and certificate thumbprint controls.

Metrics and structured logs expose partition queue depth, WAL queue depth and batching, operation latency by class, stale completions, heartbeat and election delay, leader-balancer behavior, and admission rejections. The goal is to make slow or unstable behavior explainable during load tests and production incidents.

### Testing Without A Separate Cluster

In-memory discovery, communication, and WAL adapters let tests run several nodes in one process. Deterministic election seeds, virtual-time simulation tools, stable-leader waiting, and fault-injection hooks help reproduce timing-sensitive behavior.

## What Your Application Still Owns

Kommander is not a finished database. It deliberately does not define:

- your public API
- your command and serialization format
- your domain schema or indexes
- authorization rules
- how committed commands update application state
- how clients find or route to the current partition leader
- how application state moves when a partition is split or merged.

This boundary gives you flexibility, but it also means adopting Kommander is an architectural choice. You are building a replicated state machine with the library, not installing a ready-made data product.

## Good Fits

Kommander is a strong fit for:

- replicated control planes
- partitioned metadata and routing services
- durable workflow or job coordination
- leader-owned schedulers and workers
- cluster configuration and placement decisions
- embedded coordination inside an ASP.NET Core service.

For example, a deployment controller can replicate rollout commands, a scheduler can elect one owner per queue partition, or a metadata service can keep tenant placement decisions ordered across nodes.

## When Not To Choose It

Use a different solution when:

- one process is sufficient and quorum availability adds no value
- eventual consistency is acceptable and higher write availability is more important than one agreed order
- you need a ready-made SQL, key/value, cache, queue, or lock-service API
- your workload cannot be represented as deterministic commands applied in order
- you do not want the application to own state-machine and leader-routing behavior
- operating a quorum of nodes is not justified by the failure model.

A managed database or established coordination service is often the better choice when its data model already matches the application. Kommander is most useful when the domain model must remain yours and consensus needs to live inside the service.

## Practical Tradeoffs

Consensus improves safety, but it has costs:

- a write needs quorum, so latency includes storage and network round trips
- a minority partition cannot safely commit new work
- durable state-machine behavior must be deterministic and replayable
- membership, timeouts, storage, security, and monitoring need production configuration
- partitioning increases throughput only when work can be divided cleanly.

Kommander provides the mechanisms and diagnostics for those concerns. It does not remove the need to design around them.

## License And Status

Kommander uses the MIT license. It can be used, modified, and distributed in commercial or internal applications without a copyleft requirement, subject to the license notice and terms.

Kommander is beta software. Evaluate API stability and operational behavior against your production requirements before adoption.

## Where To Go Next

- New to consensus: read [Kommander And Raft](./intro.md)
- Ready to try it: follow [Getting Started](./getting-started.md)
- Evaluating the design: read the [Architecture Overview](./architecture/overview.md)
- Looking for concrete applications: browse the [Recipes](./recipes.md)
- Planning production settings: review [Configuration](./reference/configuration.md) and [Metrics And Diagnostics](./internals/metrics-and-diagnostics.md)
