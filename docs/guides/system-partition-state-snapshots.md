# System Partition State Snapshots

Partition `0` is Kommander's system partition. Kommander uses it for cluster-wide metadata such as membership and partition maps.

Applications can also replicate their own small cluster-wide control state on partition `0`, as long as they use their own log type. This is useful for things like:

- a small registry shared by every node
- feature flags
- lease metadata
- routing metadata
- a compact application control-plane map.

The challenge is compaction. If application entries on partition `0` are deltas, a node that falls behind after old deltas are compacted needs a whole-state repair path. Kommander provides that repair path through `IRaftSystemStateTransfer`.

## What Problem This Solves

The simplest compaction-safe pattern is to write the entire application control state on every mutation.

That works, but it becomes expensive:

- every small change replicates the whole state
- WAL writes grow with total state size
- network traffic grows with total state size
- frequent updates such as lease renewals become costly.

With system-state snapshots, the application can replicate cheap deltas on partition `0` and provide a whole-state snapshot hook for repair.

## Important Partition 0 Rules

Partition `0` is reserved for system-wide state. Application code may use it carefully, but there are rules:

- use your own log type string
- do not use `_RaftSystem`; that log type is reserved by Kommander
- register system-state transfer on every node if your partition `0` entries are deltas
- keep your own local snapshot and restore logic if you want fast restart without fetching a full state snapshot from another node.

User partitions still start at `1`. Elastic partition APIs do not create, split, merge, or remove partition `0`.

## Full Snapshots Versus Deltas

There are two ways to store application state on partition `0`.

| Pattern | Write Cost | Compaction Safety |
| --- | --- | --- |
| Full snapshot per mutation | `O(total state)` per write | Any surviving entry can rebuild state. |
| Delta per mutation plus `IRaftSystemStateTransfer` | `O(one change)` per write | Below-floor nodes are repaired with a whole-state snapshot. |

Use full snapshots when the state is tiny and changes rarely.

Use deltas plus system-state transfer when the state can grow or changes frequently.

## The Integration Contract

The safe delta pattern has five parts:

1. implement `IRaftSystemStateTransfer`
2. register it on every node
3. replicate deltas to partition `0` under your own log type
4. periodically persist a local application snapshot with the committed index it reflects
5. call `SetMinRetainIndex(0, snapshotIndex + 1)` after the local snapshot is durable.

## Implement The Transfer

`IRaftSystemStateTransfer` exports and imports the whole application state for partition `0`.

```csharp
public sealed class ControlStateTransfer : IRaftSystemStateTransfer
{
    private readonly ControlStateStore store;

    public ControlStateTransfer(ControlStateStore store)
    {
        this.store = store;
    }

    public Task<Stream> ExportPartitionState(
        int partitionId,
        long upToIndex,
        CancellationToken ct
    )
    {
        return store.ExportSnapshotAsStream(upToIndex, ct);
    }

    public Task ImportPartitionState(
        int partitionId,
        Stream snapshot,
        CancellationToken ct
    )
    {
        return store.ImportSnapshotAtomically(snapshot, ct);
    }
}
```

`ExportPartitionState` must return the complete application state as of `upToIndex`. Kommander uses that index to seed the follower checkpoint after import.

`ImportPartitionState` must be atomic. If the process crashes or the import fails halfway through, the old state should remain usable so Kommander can retry.

## Register On Every Node

Registration is local process state. It is not replicated.

Call this on every node, preferably before `JoinCluster`:

```csharp
raft.RegisterSystemStateTransfer(
    new ControlStateTransfer(controlStateStore)
);
```

Pass `null` to clear the registration.

This is separate from `RegisterStateMachineTransfer`, which is used for user-partition split and merge data movement. A node can register both.

## Replicate Deltas On Partition 0

Use `ReplicateLogs` with `partitionId: 0` and your own log type:

```csharp
RaftReplicationResult result = await raft.ReplicateLogs(
    partitionId: 0,
    type: "control-state-delta",
    data: encodedDelta,
    cancellationToken: cancellationToken
);

if (result.Status == RaftOperationStatus.Success)
{
    long committedIndex = result.LogIndex;
}
```

The committed index returned as `result.LogIndex` is the same value delivered as `RaftLog.Id` in callbacks.

Never use `_RaftSystem` as the log type. Kommander reserves it for its own partition maps, membership records, and split or merge metadata.

## Restore From Local Snapshot Plus Deltas

If your application keeps its own local snapshot, record the committed index it includes.

On startup:

1. load the local application snapshot
2. remember its committed index, for example `snapshotIndex`
3. call `SetMinRetainIndex(0, snapshotIndex + 1)`
4. let Kommander replay retained logs through `OnLogRestored`
5. apply only restored logs where `log.Id > snapshotIndex`.

Example:

```csharp
long snapshotIndex = await controlStateStore.LoadLocalSnapshot(ct);

raft.SetMinRetainIndex(0, snapshotIndex + 1);

raft.OnLogRestored += async (partitionId, log) =>
{
    if (partitionId == 0 && log.LogType == "control-state-delta")
    {
        if (log.Id > snapshotIndex)
            await controlStateStore.ApplyDelta(log.LogData);
    }

    return true;
};
```

The `log.Id > snapshotIndex` check prevents double-applying deltas that were already folded into your local snapshot.

## Retain Floor

`SetMinRetainIndex(partitionId, index)` protects a WAL tail from compaction.

For partition `0` delta state, call it after your local snapshot is durable:

```csharp
raft.SetMinRetainIndex(0, snapshotIndex + 1);
```

This tells compaction to keep entries at or above the first delta not included in your local snapshot.

Important details:

- the retain floor is in-memory
- it resets on process restart
- call it again after loading your local snapshot
- `0` or negative values mean no protection
- the effective compaction boundary is the lower of the checkpoint and the retain floor.

For temporary work, use `AcquireRetentionHold` instead of overwriting the single retain floor:

```csharp
using IDisposable hold = raft.AcquireRetentionHold(
    partitionId: 0,
    index: snapshotIndex + 1
);

await exporter.CopyUnsnapshottedDeltas(cancellationToken);
```

Multiple holds compose safely. Kommander retains down to the lowest active hold index, and disposing one handle releases only that hold. Like `SetMinRetainIndex`, holds are in-memory and must be reacquired after restart.

## Below-Floor Repair

A node is below the floor when it needs log entries that the leader has already compacted.

If `IRaftSystemStateTransfer` is registered, Kommander can repair it:

1. the leader exports whole application state through `ExportPartitionState(0, checkpointIndex, ct)`
2. Kommander streams the snapshot to the follower
3. the follower imports it through `ImportPartitionState(0, stream, ct)`
4. Kommander seeds a committed checkpoint at that index
5. normal replication resumes after the checkpoint.

The application implements export and import. Kommander handles the snapshot trigger, chunking, transport, and checkpoint seeding.

## Install Semantics

System-state snapshots use `SnapshotKind.SystemState`.

The leader sends the snapshot as chunks. The follower buffers those chunks under a bounded receive session and installs the completed snapshot on partition `0`'s single-writer executor.

That install path matters because it serializes:

- stale-leader and term validation
- your `ImportPartitionState` callback
- the durable `CommittedCheckpoint` boundary
- the commit and apply frontier update that lets backfill resume after the snapshot.

The import method must be idempotent for the same `(partitionId, snapshotIndex, lastIncludedTerm)`. If the import succeeds but the WAL checkpoint boundary cannot be written, the leader receives failure and retries the same snapshot.

Snapshot receive buffering is controlled by:

| Setting | Default | Description |
| --- | ---: | --- |
| `SnapshotReceiveSessionTtl` | `30 s` | Idle receive sessions are expired lazily on later snapshot traffic. |
| `SnapshotMaxPendingSessions` | `8` | Maximum concurrent snapshot receive sessions on one node. |
| `SnapshotMaxPendingBytes` | `512 MiB` | Maximum bytes buffered across active sessions and completed buffers still installing. |
| `AllowLegacySnapshotSenders` | `false` | Compatibility switch for older peers that do not send snapshot leader and boundary metadata. |

Keep `AllowLegacySnapshotSenders` disabled in normal clusters. Enable it only for a controlled rolling compatibility window.

## Checkpoints And Compaction

Compaction is still checkpoint-driven. If you never replicate checkpoints, little or no WAL history becomes eligible for removal.

For partition `0` delta state:

```csharp
await raft.ReplicateCheckpoint(0, cancellationToken);
```

The checkpoint says old history may be removable. The retain floor says how far compaction may actually go without deleting deltas that your local snapshot still needs for offline replay.

## Testing Checklist

Useful tests for an application integration:

- replicate a delta and assert `RaftReplicationResult.LogIndex` matches the `RaftLog.Id` callback value
- persist a local snapshot, restart, and apply only restored logs above the snapshot index
- call `SetMinRetainIndex(0, snapshotIndex + 1)` and verify compaction keeps the unsnapshotted tail
- acquire multiple retention holds and verify releasing one hold does not remove another consumer's protected tail
- drive a follower below the compaction floor and assert `ImportPartitionState` is called
- verify `_RaftSystem` is never used by application writes.

## Related Reading

- [IRaft API](../reference/iraft-api.md)
- [Snapshot Installation](../operations/snapshot-installation.md)
- [Checkpoints And Compaction](../operations/checkpoints-and-compaction.md)
- [Architecture Overview](../architecture/overview.md)
- [Log Backfill And Catch-Up](./log-backfill-and-catch-up.md)
