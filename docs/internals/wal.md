# WAL Internals

The write-ahead log, or WAL, is how Kommander remembers Raft log entries across restarts.

`RaftWriteAhead` is the internal facade between the partition state machine and the configured `IWAL` adapter.

## Log Types

Kommander stores Raft entries with explicit lifecycle types:

| Type | Meaning |
| --- | --- |
| `Proposed` | The leader has proposed an application entry. |
| `Committed` | The proposed entry is committed and can be applied. |
| `RolledBack` | The proposed entry was explicitly rolled back. |
| `ProposedCheckpoint` | A proposed checkpoint marker. |
| `CommittedCheckpoint` | A committed checkpoint marker. |
| `RolledBackCheckpoint` | A checkpoint proposal that was rolled back. |

The application normally sees committed entries through `OnReplicationReceived` and restored committed entries through `OnLogRestored`.

## Recovery

When a partition executor starts, it calls WAL recovery before normal operations are accepted.

Recovery:

1. reads logs for the partition through `ReadScheduler`,
2. advances local propose and commit indexes,
3. ignores proposed and rolled-back entries for application restore,
4. invokes `OnLogRestored` for committed application logs,
5. invokes system restore callbacks for committed system logs,
6. marks restore complete for the partition.

If there are no logs, the commit index starts after the adapter's current max log id.

## Leader Write Path

For a leader proposal:

1. the state machine assigns log ids and the current term,
2. `RaftWriteAhead` enqueues a leader propose write,
3. `FairWalScheduler` writes the proposed entries,
4. completion returns to the partition executor,
5. the state machine creates a proposal quorum tracker,
6. append-log messages are sent to followers.

For auto-commit proposals, the leader commits after quorum completion. For manual proposals, the caller uses the proposal ticket with `CommitLogs` or `RollbackLogs`.

## Follower Append Path

Followers receive append-log messages from the leader. The state machine validates leadership and term expectations, then asks `RaftWriteAhead` to propose, commit, or roll back entries as needed.

Committed follower entries are applied to the application callback after the WAL write succeeds.

## WAL Completion Fencing

WAL completions are not trusted blindly. Completion messages are checked against pending operations and log ranges. Unknown, stale, superseded, or malformed completions are discarded.

This protects the partition from acting on a storage completion that belongs to an older term, an already-processed operation, or an invalid log range.
