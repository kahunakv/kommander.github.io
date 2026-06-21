# Partitions And Splitting

Partitions divide the keyspace into independent Raft groups.

Partition `0` is reserved for system configuration. User partitions start at `1`.

## Partition Ranges

The system coordinator stores partition ranges as replicated system configuration. A range maps a slice of the hash space to a partition id.

When user partitions are initialized, `RaftSystemCoordinator` divides the positive `int` hash space across `InitialPartitions` ranges. It starts with partition id `1`.

Application routing uses:

- `GetPartitionKey`, which hashes the prefix before the last `/`
- `GetPrefixPartitionKey`, which hashes the complete provided string.

`RaftManager` then finds the partition whose range contains the hash value.

## Why Ranges Are Replicated

Every node must agree on which partition owns which hash range. That map is replicated through the system partition so all nodes start and update user partitions from the same configuration.

## Splitting A Partition

`RaftManager.SplitPartition(partitionId)` queues a split request through the system coordinator.

The caller must satisfy three conditions:

- the node is initialized
- the target partition is not `0`
- the local node is leader for the target partition.

The split process:

1. reads the current partition range map from system configuration
2. finds the target range
3. computes the midpoint
4. shrinks the existing range to the lower half
5. creates a new partition id for the upper half
6. replicates the new range map through the system partition
7. starts or updates local partitions from the replicated map.

The new partition id is one greater than the highest current partition id.

## Current Scope

Splitting changes the routing map and starts the new partition range. Application state movement is still your responsibility. If your state machine keeps derived indexes or external projections, design them so they can be rebuilt or moved according to the new range map.
