---
sidebar_position: 1
---

# Kommander

Kommander is an open-source distributed consensus library for C#/.NET. It helps several running processes agree on the same ordered stream of changes, even when individual nodes restart, lose network connectivity, or stop responding.

If you have not worked with Raft or consensus algorithms before, the core idea is simple: one node becomes the leader for a partition, that leader accepts a proposed change, and the change is considered committed only after enough nodes have stored it. Your application can then apply committed changes in the same order on every node.

That gives you a reliable foundation for building services where multiple machines need to behave like one coordinated system.

## What You Can Build

Kommander is useful when a single server is not enough, but letting every server make independent decisions would create conflicts. You can use it to build:

- Replicated state machines where every node applies the same commands in the same order.
- Highly available control planes where another node can continue after the leader fails.
- Partitioned metadata services for tenants, resources, jobs, sessions, or internal platform state.
- Leader-aware workers where exactly one node coordinates work for a partition at a time.
- Durable coordination layers embedded inside your own .NET service.
- Local simulations and tests for distributed behavior without running a full external database.

Kommander does not decide what your data means. It gives you the ordered, replicated log. Your application decides how each committed log entry changes its own state.

## Why Consensus Matters

In a distributed system, failures rarely look clean. A process can pause, a network call can time out, a node can restart after writing data locally, or two machines can temporarily disagree about who should make decisions.

Consensus algorithms handle those failure modes by forcing important changes through a quorum. A quorum is a majority of the nodes responsible for a partition. If a leader cannot reach a quorum, it cannot safely commit new work. If it can reach a quorum, the cluster can make progress while preserving a single agreed order of changes.

This is what prevents two nodes from independently committing conflicting versions of the same state.

## How Kommander Helps

Kommander implements Raft as a reusable library. Instead of writing leader election, log replication, commit tracking, failure handling, and recovery yourself, you plug Kommander into your service and focus on your domain state machine.

A typical Kommander-backed service works like this:

1. Start one `RaftManager` per process.
2. Configure how nodes discover each other.
3. Choose a write-ahead log implementation such as RocksDB, SQLite, or in-memory storage for tests.
4. Choose a transport such as gRPC, REST/JSON, or in-memory communication.
5. Subscribe to callbacks that restore and apply committed log entries.
6. Propose changes through `ReplicateLogs` when the local node is leader for a partition.

## What Kommander Is Not

Kommander is a library, not a finished database product. It is not a key/value store, lock service, sequencer, cache, or scripting engine by itself.

That boundary is intentional. Kommander owns consensus mechanics. Your application owns the API, data model, serialization format, authorization, business rules, and state transitions.

## What Kommander Provides

- Per-partition Raft leader election.
- Quorum-based log replication.
- Automatic commit or explicit commit and rollback.
- RocksDB, SQLite, and in-memory WAL implementations.
- gRPC, REST/JSON, and in-memory communication adapters.
- Static, dynamic, and multicast discovery.
- Hybrid logical clock proposal tickets.
- Restore, replication, leadership, and error callbacks.
- ASP.NET Core route extensions for Raft endpoints.

Kommander targets `.NET 8.0`.

## When To Reach For It

Use Kommander when you are building a replicated service and need a consensus core that stays separate from your domain storage, command format, and network host.

It is a good fit when correctness depends on ordered, replicated decisions. It is probably not the right fit for simple single-node applications, fire-and-forget messaging, eventually consistent caches, or workloads where losing recent writes is acceptable.

:::warning
Kommander is beta software. APIs and operational behavior may change between releases.
:::
