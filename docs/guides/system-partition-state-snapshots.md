# System Partition State Snapshots

Partition `0` is the system partition of Kommander. Kommander uses it for cluster-wide metadata such as the membership and the partition maps.

An application can also replicate its own small cluster-wide control state on partition `0`. It must use its own log type. This is useful for these items:

- a small registry that every node shares
- feature flags
- lease metadata
- routing metadata
- a compact control-plane map of the application.

Compaction is the difficulty. The application entries on partition `0` can be deltas. A node that falls behind then needs a repair path for the whole state. This is true after the compaction of the old deltas. Kommander gives that repair path through `IRaftSystemStateTransfer`.

## The Problem That This Solves

The simplest pattern that is safe for compaction writes the full application control state at each change.

That pattern works. It also becomes expensive:

- Each small change replicates the whole state.
- The WAL writes grow with the total size of the state. The WAL is the write-ahead log.
- The network traffic grows with the total size of the state.
- A frequent update such as a lease renewal becomes costly.

With system-state snapshots, the application replicates cheap deltas on partition `0`. It also gives a hook for a whole-state snapshot for the repair.

## Important Rules For Partition 0

Partition `0` is reserved for system-wide state. Application code can use it with care. There are rules:

- Use your own string for the log type.
- Do not use `_RaftSystem`. Kommander reserves that log type.
- Register the system-state transfer on every node if your partition `0` entries are deltas.
- Keep your own local snapshot logic and restore logic. A restart is then fast. It does not need a full state snapshot from another node.

The user partitions still start at `1`. The elastic partition APIs do not create, split, merge, or remove partition `0`.

## Full Snapshots Or Deltas

There are two ways to store the application state on partition `0`.

| Pattern | Write Cost | Compaction Safety |
| --- | --- | --- |
| A full snapshot at each change | `O(total state)` for each write | Any entry that survives can rebuild the state. |
| A delta at each change, plus `IRaftSystemStateTransfer` | `O(one change)` for each write | A whole-state snapshot repairs a node below the floor. |

Use the full snapshot when the state is very small and changes rarely.

Use the deltas and the system-state transfer when the state can grow or changes frequently.

## The Integration Contract

The safe delta pattern has five parts:

1. Implement `IRaftSystemStateTransfer`.
2. Register it on every node.
3. Replicate the deltas to partition `0` under your own log type.
4. Persist a local application snapshot at intervals. Record the committed index of that snapshot.
5. Call `SetMinRetainIndex(0, snapshotIndex + 1)` after the local snapshot is durable.

## Implement The Transfer

`IRaftSystemStateTransfer` exports and imports the whole application state of partition `0`.

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

`ExportPartitionState` must return the complete application state at `upToIndex`. Kommander uses that index to seed the follower checkpoint after the import.

`ImportPartitionState` must be atomic. The process can crash, or the import can fail in the middle. The old state must stay usable. Kommander can then retry.

## Register On Every Node

The registration is local process state. Kommander does not replicate it.

Make this call on every node. Prefer a call before `JoinCluster`:

```csharp
raft.RegisterSystemStateTransfer(
    new ControlStateTransfer(controlStateStore)
);
```

Pass `null` to clear the registration.

This method is separate from `RegisterStateMachineTransfer`. That other method moves the data of a user partition during a split or a merge. One node can register both.

## Replicate The Deltas On Partition 0

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

`result.LogIndex` gives the committed index. The callbacks deliver the same value as `RaftLog.Id`.

Never use `_RaftSystem` as the log type. Kommander reserves it for its own partition maps, its membership records, and its split and merge metadata.

## Restore From A Local Snapshot And The Deltas

Your application can keep its own local snapshot. Record the committed index inside that snapshot.

At startup, do these steps:

1. Load the local application snapshot.
2. Remember its committed index. This example calls it `snapshotIndex`.
3. Call `SetMinRetainIndex(0, snapshotIndex + 1)`.
4. Let Kommander replay the retained logs through `OnLogRestored`.
5. Apply only the restored logs with `log.Id > snapshotIndex`.

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

The `log.Id > snapshotIndex` check prevents a second application of a delta. Your local snapshot already contains that delta.

## Retain Floor

`SetMinRetainIndex(partitionId, index)` protects a WAL tail from compaction.

For the delta state on partition `0`, call it after your local snapshot is durable:

```csharp
raft.SetMinRetainIndex(0, snapshotIndex + 1);
```

This call tells compaction to keep the entries at the first delta outside your local snapshot, and above it.

The important details are:

- The retain floor is in memory.
- It resets at a process restart.
- Call it again after you load your local snapshot.
- A value of `0` or a negative value gives no protection.
- The effective compaction boundary is the lower of the checkpoint and the retain floor.

For temporary work, use `AcquireRetentionHold`. Do not overwrite the single retain floor:

```csharp
using IDisposable hold = raft.AcquireRetentionHold(
    partitionId: 0,
    index: snapshotIndex + 1
);

await exporter.CopyUnsnapshottedDeltas(cancellationToken);
```

Several holds compose safely. Kommander retains down to the lowest index of the active holds. The disposal of one handle releases that hold only. A hold is in memory, in the same way as `SetMinRetainIndex`. You must acquire it again after a restart.

## Repair Below The Floor

A node is below the floor when it needs log entries that the leader already compacted.

Kommander can repair that node with `IRaftSystemStateTransfer` registered:

1. The leader exports the whole application state through `ExportPartitionState(0, checkpointIndex, ct)`.
2. Kommander streams the snapshot to the follower.
3. The follower imports it through `ImportPartitionState(0, stream, ct)`.
4. Kommander seeds a committed checkpoint at that index.
5. The normal replication continues after the checkpoint.

The application implements the export and the import. Kommander controls the snapshot trigger, the division into chunks, the transport, and the checkpoint seed.

## Install Semantics

A system-state snapshot uses `SnapshotKind.SystemState`.

The leader sends the snapshot as chunks. The follower buffers those chunks in a bounded receive session. It then installs the complete snapshot on the single-writer executor of partition `0`.

That install path is important, because it serializes these steps:

- the validation of a stale leader and the term
- your `ImportPartitionState` callback
- the durable `CommittedCheckpoint` boundary
- the update of the commit frontier and the apply frontier, which lets the backfill continue after the snapshot.

The import method must be idempotent for the same `(partitionId, snapshotIndex, lastIncludedTerm)`. The import can succeed while the WAL checkpoint boundary write fails. The leader then receives a failure. It retries the same snapshot.

These settings control the buffer for a snapshot receive:

| Setting | Default | Description |
| --- | ---: | --- |
| `SnapshotReceiveSessionTtl` | `30 s` | Kommander expires an idle receive session lazily, on later snapshot traffic. |
| `SnapshotMaxPendingSessions` | `8` | The maximum number of concurrent snapshot receive sessions on one node. |
| `SnapshotMaxPendingBytes` | `512 MiB` | The maximum bytes in the buffer across the active sessions and the completed buffers in their install. |
| `AllowLegacySnapshotSenders` | `false` | A compatibility switch for an older peer. That peer does not send the leader metadata and the boundary metadata of a snapshot. |

Keep `AllowLegacySnapshotSenders` disabled in a normal cluster. Enable it for a controlled rolling compatibility window only.

## Checkpoints And Compaction

The checkpoints still drive the compaction. Without a replicated checkpoint, little or no WAL history becomes eligible for removal.

For the delta state on partition `0`:

```csharp
await raft.ReplicateCheckpoint(0, cancellationToken);
```

The checkpoint says that the old history can be removable. The retain floor says how far the compaction can go. The compaction must not delete a delta that your local snapshot still needs for an offline replay.

## Testing Checklist

These tests are useful for an application integration:

- Replicate a delta. Assert that `RaftReplicationResult.LogIndex` matches the `RaftLog.Id` value in the callback.
- Persist a local snapshot. Restart. Apply only the restored logs above the snapshot index.
- Call `SetMinRetainIndex(0, snapshotIndex + 1)`. Verify that the compaction keeps the tail outside the snapshot.
- Acquire several retention holds. Verify that the release of one hold keeps the protected tail of another consumer.
- Drive a follower below the compaction floor. Assert that Kommander calls `ImportPartitionState`.
- Verify that no application write uses `_RaftSystem`.

## Related Reading

- [IRaft API](../reference/iraft-api.md)
- [Snapshot Installation](../operations/snapshot-installation.md)
- [Checkpoints And Compaction](../operations/checkpoints-and-compaction.md)
- [Architecture Overview](../architecture/overview.md)
- [Log Backfill And Catch-Up](./log-backfill-and-catch-up.md)
