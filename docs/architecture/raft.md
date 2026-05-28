# Raft In Kommander

Raft is a consensus protocol that helps a cluster maintain a replicated state machine by synchronizing a durable log. A leader receives proposed changes, writes them locally, replicates them to followers, and commits them after a quorum acknowledges the proposal.

Kommander implements this model with partitioned Raft groups. Each partition elects its own leader, so a node can lead one partition and follow another. This improves throughput when workloads can be routed by key while preserving strict ordering inside each partition.

## Leader Election

Followers monitor leader heartbeats. When a heartbeat is not received within the configured election window, a follower can become a candidate and request votes. A candidate becomes leader after receiving quorum support for the current term.

## Log Replication

The partition leader accepts proposals, assigns log indexes, writes the proposal to its WAL, and sends append-log requests to followers. Once quorum acknowledges the proposal, the leader can commit it and notify followers.

## State Machine Integration

Kommander does not own your domain state. Your application applies committed log entries through `OnReplicationReceived` and rebuilds state during restore through `OnLogRestored`.
