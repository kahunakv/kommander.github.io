# Heterogeneous Write Coalescing

`ReplicateEntries` lets an application send a batch of differently typed entries to one partition in one call.

Use it when your service naturally produces several independent records at once, such as:

- key/value updates
- lock records
- receipts
- metadata entries
- a transaction prepare record.

`ReplicateLogs` is still the right API when every payload has the same log type and the same commit behavior. `ReplicateEntries` is for mixed batches where each entry needs its own type, result, and generation fence.

## Why Use It

With `ReplicateLogs`, one call has one partition, one log type, one `autoCommit` value, one generation fence, and one result for the proposal.

If a consumer has multiple unrelated record types, it usually has to make multiple calls.

`ReplicateEntries` accepts one list where each entry carries its own metadata:

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

Kommander can turn that into fewer proposals and fewer replication round trips, while returning one result per input entry.

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

The batch targets one partition. Inside that batch, the shape is:

- a leading auto-commit group
- optionally followed by one manual group.

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

The manual group must be last because rollback removes a suffix. If a manual entry sat in the middle, rolling it back could also remove entries appended after it.

## Auto-Commit Batch

An auto-commit-only batch is the common case:

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

When it succeeds:

- `result.Success` is `true`
- `result.Status` is `Success`
- each admitted entry has a `RaftEntryResult`
- auto-commit entries have `Status = Success`
- auto-commit entries have `Ticket = HLCTimestamp.Zero`
- each entry reports its own `LogIndex`.

The result list is index-aligned to the input list. `result.Entries[2]` describes the third input entry.

## Trailing Manual Group

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

The auto prefix commits first. The manual suffix is proposed after that and remains pending.

Manual entries report:

- `Status = Pending`
- their assigned `LogIndex`
- a shared ticket.

Use `result.TicketId` to finish the manual group:

```csharp
HLCTimestamp ticket = result.TicketId;

await raft.CommitLogs(1, ticket, cancellationToken);
```

Or roll it back:

```csharp
await raft.RollbackLogs(1, ticket, cancellationToken);
```

The manual group is a clean suffix, so rolling it back does not remove the already committed auto prefix.

## Per-Entry Generation Fencing

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

Generation behavior:

- `ExpectedGeneration = 0` disables the fence for that entry
- a matching nonzero generation admits the entry
- a stale nonzero generation drops only that entry with `PartitionMoved`
- siblings can still commit.

If every entry is fenced out, nothing is appended and the overall result reports `PartitionMoved`.

This is useful with elastic partitions, where a key range can move after a split or merge. Callers can inspect per-entry results, refresh the partition map for stale entries, and retry only the entries that moved.

## Reading Results

`ReplicateEntries` returns `RaftBatchReplicationResult`:

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

Per-entry status:

| Status | Meaning | `LogIndex` | `Ticket` |
| --- | --- | ---: | --- |
| `Success` | Auto-commit entry was appended and committed. | Assigned log index | `HLCTimestamp.Zero` |
| `Pending` | Manual entry was appended and is waiting for `CommitLogs` or `RollbackLogs`. | Assigned log index | Shared manual ticket |
| `PartitionMoved` | Entry was fenced out and not appended. | `-1` | `HLCTimestamp.Zero` |
| Other status | Entry was not appended because the batch or proposal failed. | `-1` | `HLCTimestamp.Zero` |

Overall result:

- `Success = true` means at least one entry was admitted and appended
- individual entries can still be `PartitionMoved`
- `Success = false` means a batch-level rejection, leadership failure, or all entries fenced out.

Always inspect `Entries` when using per-entry fences.

## Rejections

Kommander rejects the whole batch before appending anything when the shape is invalid.

Examples:

- an auto-commit entry appears after a manual entry
- the reserved `_RaftSystem` log type is used on partition `0`.

If some entries are fenced and some are admitted, that is not a whole-batch rejection. The fenced entries keep their result slots with `PartitionMoved`.

## Ordering And Durability

`ReplicateEntries` reduces proposal and transport overhead. It does not bypass the normal Raft or WAL rules.

Important guarantees:

- all entries target one partition
- auto entries commit before any trailing manual group is proposed
- manual rollback affects only the trailing manual suffix
- per-entry `LogIndex` values identify the committed log order
- followers receive ordinary typed `RaftLog` records through the same restore and replication callbacks.

WAL sync behavior is governed by the same scheduler settings as other writes:

- `WalGroupCommitLingerMs`
- `MaxWalGroupBatchPartitions`
- `MaxWalBatchSize`
- `WriteIOThreads`.

An auto-commit-only `ReplicateEntries` call is one proposal. A batch with a manual suffix is two proposals: the auto group commits first, then the manual group is proposed. Their WAL writes can still coalesce with other work through the scheduler, but a single fsync across both groups is not guaranteed.

## When Not To Use It

Keep using `ReplicateLogs` when:

- all payloads share one type
- all payloads share one fate
- one result for the whole proposal is enough
- the simpler API is easier to read.

Do not use one `ReplicateEntries` call for multiple independent manual transactions. There is only one trailing manual group and therefore one manual ticket.

## Related Reading

- [Replicating Logs](./replicating-logs.md)
- [IRaft API](../reference/iraft-api.md)
- [WAL Commit Durability](../operations/wal-commit-durability.md)
- [Elastic Partitions](./elastic-partitions.md)
