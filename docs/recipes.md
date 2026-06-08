# Recipes

Kommander gives applications a replicated log, partition leadership, and callbacks for applying committed entries. These recipes show practical ways to use those building blocks in real systems.

Kommander is intentionally not a finished database or workflow engine. In each pattern, your service owns the domain model, persistence format, API, authorization, and side effects. Kommander owns the ordered, replicated decision stream.

## How to Read These Recipes

If you are new to Raft, think of Kommander as a way to make a small cluster agree on important decisions before your application acts on them.

A command is an application-level decision you want the cluster to remember, such as "this job started", "this configuration value changed", or "this resource now belongs to node-a". Kommander replicates that command to the partition's Raft group. Once the command is committed, every node receives it through callbacks and can update its own local view.

Most recipes are split into the same beginner-friendly pieces:

- The problem: why this is hard in a distributed service.
- The pattern: where Kommander fits.
- Applying state: what your callbacks should do after a command commits.
- Notes: practical details that prevent common mistakes.

The most important rule is that callbacks should be quick and deterministic. Use them to update local state, indexes, projections, or durable application storage. Avoid slow network calls, payment requests, emails, or other external side effects inside the callback. Record the decision first, then let your application workers perform side effects with idempotency keys.

## Recipes

- [Leader-Owned Workers](recipes/leader-owned-workers.md): run one active coordinator per partition.
- [Replicated Configuration](recipes/replicated-configuration.md): keep runtime configuration consistent across service replicas.
- [Idempotent Job Processing](recipes/idempotent-job-processing.md): record job state transitions before workers perform side effects.
- [Partitioned Metadata](recipes/partitioned-metadata.md): build tenant-aware metadata services with independent Raft partitions.
- [Durable Workflow State](recipes/durable-workflow-state.md): replicate workflow decisions so processes can recover after crashes.

## Common Shape

Most Kommander-backed recipes follow the same flow:

1. Route an application key to a partition with `GetPartitionKey` or `GetPrefixPartitionKey`.
2. Check whether the local node is leader for that partition.
3. Replicate an application command with `ReplicateLogs`.
4. Apply the committed command in `OnReplicationReceived`.
5. Rebuild state from committed logs in `OnLogRestored`.

Partition `0` is reserved for Kommander system configuration. Recipes and application code should use partitions `1` and above.
