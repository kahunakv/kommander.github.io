# Heterogeneous Write Coalescing

`ReplicateEntries` lets an application send a batch of entries with different types to one partition in one call.

Use it when your service makes several independent records at one time. Examples are:

- key/value updates
- lock records
- receipts
- metadata entries
- a transaction prepare record.

`ReplicateLogs` is still the correct API when every payload has the same log type and the same commit behavior. `ReplicateEntries` is for a mixed batch. Each entry in that batch needs its own type, its own result, and its own generation fence. A generation fence protects a partition from a write with an old generation number.

## Why To Use It

With `ReplicateLogs`, one call has one partition, one log type, one `autoCommit` value, one generation fence, and one result for the proposal.

A consumer with several unrelated record types must usually make several calls.

`ReplicateEntries` accepts one list. Each entry in that list carries its own metadata:

```csharp
RaftBatchReplicationResult result = await raft.ReplicateEntries(
    partitionId: 1,
    entries:
    [
        new RaftProposalEntry("kv", keyValueBytes),
        new RaftProposalEntry("lock", lockBytes),
        new RaftProposalEntry("receipt", receiptBytes),
    ],
    cancellationToken: cancellationToken
);
```

Kommander can change that list into fewer proposals and fewer replication round trips. It still returns one result for each input entry.

## Batch Shape

Each entry is a `RaftProposalEntry`:

```csharp
public readonly record struct RaftProposalEntry(
    string Type,
    byte[] Data,
    bool AutoCommit = true,
    long ExpectedGeneration = 0
);
```

The batch has one target partition. Inside that batch, the shape is:

- a first group of auto-commit entries
- one optional manual group after it.

Valid examples:

```text
[ auto, auto, auto ]
[ auto, auto, manual, manual ]
[ manual, manual ]
```

Invalid examples:

```text
[ auto, manual, auto ]
[ manual, auto ]
```

The manual group must be last, because a rollback removes a suffix. A manual entry in the middle causes a risk. Its rollback can also remove the entries after it.

## Auto-Commit Batch

A batch with auto-commit entries only is the common case:

```csharp
RaftBatchReplicationResult result = await raft.ReplicateEntries(
    partitionId: 1,
    entries:
    [
        new("kv", firstKeyValue),
        new("lock", lockRecord),
        new("receipt", receiptRecord),
        new("kv", secondKeyValue),
    ],
    cancellationToken: cancellationToken
);
```

After a successful call:

- `result.Success` is `true`.
- `result.Status` is `Success`.
- Each admitted entry has a `RaftEntryResult`.
- Each auto-commit entry has `Status = Success`.
- Each auto-commit entry has `Ticket = HLCTimestamp.Zero`.
- Each entry reports its own `LogIndex`.

The index of the result list agrees with the index of the input list. `result.Entries[2]` describes the third input entry.

## Manual Group At The End

A batch can end with manual entries:

```csharp
RaftBatchReplicationResult result = await raft.ReplicateEntries(
    partitionId: 1,
    entries:
    [
        new("kv", keyValueBytes, AutoCommit: true),
        new("lock", lockBytes, AutoCommit: true),
        new("prepare", prepareBytes, AutoCommit: false),
    ],
    cancellationToken: cancellationToken
);
```

The auto prefix commits first. Kommander proposes the manual suffix after that. The manual suffix then stays pending.

A manual entry reports these values:

- `Status = Pending`
- its assigned `LogIndex`
- a shared ticket.

Use `result.TicketId` to complete the manual group:

```csharp
HLCTimestamp ticket = result.TicketId;

await raft.CommitLogs(1, ticket, cancellationToken);
```

You can also roll it back:

```csharp
await raft.RollbackLogs(1, ticket, cancellationToken);
```

The manual group is a clean suffix. Therefore, its rollback does not remove the auto prefix that already committed.

## Generation Fence For Each Entry

Each entry has its own `ExpectedGeneration`.

```csharp
RaftBatchReplicationResult result = await raft.ReplicateEntries(
    partitionId: 3,
    entries:
    [
        new("kv", hashRoutedBytes, ExpectedGeneration: 0),
        new("kv", freshRangeBytes, ExpectedGeneration: currentGeneration),
        new("kv", staleRangeBytes, ExpectedGeneration: oldGeneration),
    ],
    cancellationToken: cancellationToken
);
```

The generation behavior is:

- `ExpectedGeneration = 0` disables the fence for that entry.
- A generation above zero that matches admits the entry.
- A stale generation above zero drops that entry only, with `PartitionMoved`.
- The other entries can still commit.

The fence can reject every entry. Kommander then appends nothing. The overall result reports `PartitionMoved`.

This behavior is useful with elastic partitions, because a key range can move after a split or a merge. A caller can examine the result of each entry. It can then refresh the partition map for the stale entries. It can retry only the entries that moved.

## Read The Results

`ReplicateEntries` returns a `RaftBatchReplicationResult`:

```csharp
public sealed class RaftBatchReplicationResult
{
    public bool Success { get; }
    public RaftOperationStatus Status { get; }
    public HLCTimestamp TicketId { get; }
    public IReadOnlyList<RaftEntryResult> Entries { get; }
}

public readonly record struct RaftEntryResult(
    RaftOperationStatus Status,
    long LogIndex,
    HLCTimestamp Ticket
);
```

The status of each entry is:

| Status | Meaning | `LogIndex` | `Ticket` |
| --- | --- | ---: | --- |
| `Success` | Kommander appended and committed the auto-commit entry. | The assigned log index | `HLCTimestamp.Zero` |
| `Pending` | Kommander appended the manual entry. The entry waits for `CommitLogs` or `RollbackLogs`. | The assigned log index | The shared manual ticket |
| `PartitionMoved` | The fence rejected the entry. Kommander did not append it. | `-1` | `HLCTimestamp.Zero` |
| Other status | Kommander did not append the entry, because the batch or the proposal failed. | `-1` | `HLCTimestamp.Zero` |

The overall result is:

- `Success = true` means that Kommander admitted and appended a minimum of one entry.
- An individual entry can still be `PartitionMoved`.
- `Success = false` means a rejection of the batch, a leadership failure, or a fence that rejected all the entries.

Always examine `Entries` when you use a fence for each entry.

## Rejections

Kommander rejects the whole batch before it appends anything when the shape is invalid.

Examples are:

- An auto-commit entry comes after a manual entry.
- The batch uses the reserved `_RaftSystem` log type on partition `0`.

A batch can have some fenced entries and some admitted entries. That case is not a rejection of the whole batch. Each fenced entry keeps its result slot with `PartitionMoved`.

## Order And Durability

`ReplicateEntries` reduces the proposal overhead and the transport overhead. It does not bypass the normal Raft rules or WAL rules. The WAL is the write-ahead log.

The important guarantees are:

- All the entries have one target partition.
- The auto entries commit before Kommander proposes a manual group at the end.
- A manual rollback affects the manual suffix only.
- The `LogIndex` value of each entry identifies the committed log order.
- Each follower receives ordinary typed `RaftLog` records. They arrive through the same restore callback and replication callback.

The same scheduler settings control the WAL sync behavior for these writes and for the other writes:

- `WalGroupCommitLingerMs`
- `MaxWalGroupBatchPartitions`
- `MaxWalBatchSize`
- `WriteIOThreads`.

A `ReplicateEntries` call with auto-commit entries only is one proposal. A batch with a manual suffix is two proposals. The auto group commits first. Kommander then proposes the manual group. The WAL writes can still coalesce with other work through the scheduler. One fsync across both groups is not guaranteed. An fsync is a durable flush to disk.

## When Not To Use It

Continue with `ReplicateLogs` in these conditions:

- All the payloads share one type.
- All the payloads share one fate.
- One result for the whole proposal is sufficient.
- The simpler API is easier to read.

Do not use one `ReplicateEntries` call for several independent manual transactions. There is one manual group at the end. Therefore, there is one manual ticket.

## Related Reading

- [Replicating Logs](./replicating-logs.md)
- [IRaft API](../reference/iraft-api.md)
- [WAL Commit Durability](../operations/wal-commit-durability.md)
- [Elastic Partitions](./elastic-partitions.md)
