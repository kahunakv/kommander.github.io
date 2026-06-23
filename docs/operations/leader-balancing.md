# Automatic Leader Balancing

Each Kommander user partition is an independent Raft group with its own leader. Leaders are elected independently, so one node can end up leading many more partitions than its peers. Even with similar leader counts, the busiest partitions can collect on one node.

The optional leader balancer gradually redistributes leadership across live voting members. It balances leader count first, then considers measured partition load. This spreads replication, heartbeat, and proposal work without moving partition data or changing partition ranges.

## When To Use It

Leader balancing is useful when:

- the cluster has several user partitions
- one node consistently leads more partitions than its peers
- leader counts look even but hot partitions are concentrated on one node
- node-level latency or queue depth follows the current leader distribution.

It is disabled by default. Small clusters with few partitions may not benefit because there are too few leaderships to distribute meaningfully.

## Enable The Balancer

Enable it on every node so every member publishes load reports and can participate consistently:

```csharp
RaftConfiguration configuration = new()
{
    EnableLeaderBalancer = true
};
```

The default settings are intentionally conservative. Start with them before changing move limits or timing.

The balancer exchanges reports through membership gossip. Keep `GossipFanout` greater than `0`, and use a transport that implements `SendGossip`. Kommander's in-memory, gRPC, and REST transports support this path.

## Mental Model

Partition `0`, the system partition, coordinates the cluster. Only its current leader runs balancing passes, which provides one controller for the whole cluster.

Every node periodically reports:

- which partitions it currently leads
- recent leader-side replicated-log operations per second for each led partition
- client and WAL queue depth used to estimate pending pressure
- how long each leadership has been stable.

Reports are advisory and remain in memory. They are not appended to the Raft log. Reports older than `LeaderBalancerReportTtl` are ignored.

The load score for a partition is:

```text
load = LeaderBalancerOpsWeight * log operations/second
     + LeaderBalancerQueueWeight * (client queue depth + WAL queue depth)
```

Log operations per second uses an exponentially weighted moving average (EWMA). It counts the leader-side `ReplicateLogs` path and smooths short spikes while still adapting when a partition stays busy or becomes idle. See [Partition Load Signals](../guides/partition-load-signals.md) for the related public accessors.

## How A Balancing Pass Works

Every `LeaderBalancerInterval`, the system-partition leader:

1. builds a cluster-wide view from fresh reports
2. reconciles transfers suggested by earlier passes
3. skips the pass if any live voter is missing a fresh report
4. plans a limited set of useful moves
5. asks each partition's current leader to transfer leadership to the selected target.

The controller sends suggestions because only a partition's current leader can transfer that partition safely. The recipient verifies that it still leads the partition, the partition is eligible, and the target is a live voter before using the normal Raft leadership-transfer path. Stale or invalid suggestions are ignored.

The controller does not block while a transfer completes. A later report confirms whether the target became leader. Timed-out suggestions are cleared and may be reconsidered after cooldown.

## Balancing Policy

The planner uses two stages.

### Leader Count

First, it moves leaderships from nodes above the ideal count to nodes below it. `CountDeadband` allows a small difference without causing unnecessary movement. When several partitions are eligible, the planner prefers moving a hotter partition to a cooler node.

### Measured Load

When leader counts are already balanced, the planner compares node load. If skew exceeds `LoadImbalanceThreshold`, it can produce a count-neutral swap: a hot partition moves to the cooler node and a cold partition moves in the opposite direction. The swap is used only when it reduces imbalance.

## Safety And Churn Controls

A partition is eligible only when:

- it is in the `Active` lifecycle state
- its current leader has been stable for at least `MinLeaderStabilityMs`
- the target is a live voting member of that partition's Raft group
- it is not in `MoveCooldown`
- it has no outstanding transfer suggestion.

`MaxMovesPerPass` limits new plans in one pass. `MaxConcurrentTransfers` limits transfers already in flight across the cluster.

The balancer changes leadership, not membership, partition ownership, hash ranges, WAL contents, or application state. Every actual move goes through `TransferLeadershipAsync` validation. If the controller has incomplete or stale information, the expected result is a skipped, rejected, or unnecessary suggestion rather than bypassing Raft safety.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `EnableLeaderBalancer` | `false` | Enables load reports and automatic balancing passes. Configure it consistently on every node. |
| `LeaderBalancerReportInterval` | `5 s` | How often each node includes its local leadership and load report in gossip. |
| `LeaderBalancerInterval` | `30 s` | How often the system-partition leader runs a balancing pass. |
| `LeaderBalancerReportTtl` | `20 s` | Maximum report age accepted by the global view. Must be greater than the report interval. |
| `CountDeadband` | `1` | Allowed leader-count difference around the ideal before count balancing acts. |
| `LoadImbalanceThreshold` | `0.25` | Fractional load skew required before load balancing considers a swap. |
| `MinLeaderStabilityMs` | `5000 ms` | Minimum leadership age before a partition can move. |
| `MoveCooldown` | `60 s` | Time after success or timeout before that partition can be selected again. |
| `MaxMovesPerPass` | `4` | Maximum moves planned during one balancing pass. |
| `MaxConcurrentTransfers` | `2` | Maximum outstanding transfers across the cluster. |
| `SuggestionTimeout` | `15 s` | Time allowed for a suggested move to appear in a fresh report. |
| `LeaderBalancerOpsWeight` | `1.0` | Weight of operations per second in the partition load score. |
| `LeaderBalancerQueueWeight` | `0.5` | Weight of pending queue depth in the partition load score. |

Keep `SuggestionTimeout` longer than `LeaderBalancerReportInterval` plus expected gossip propagation and leadership-transfer time. Otherwise, successful moves can be recorded as timed out before the new report reaches the controller.

Raise `CountDeadband`, `LoadImbalanceThreshold`, `MoveCooldown`, or `MinLeaderStabilityMs` if leadership changes too often. Raise move limits or shorten `LeaderBalancerInterval` only after metrics show that convergence is too slow.

## Metrics

Subscribe to the .NET meter named `Kommander`:

| Metric | Type | Meaning |
| --- | --- | --- |
| `raft.balancer.moves_total` | Counter | Suggested moves tagged with `outcome=planned`, `succeeded`, or `timed_out`. |
| `raft.balancer.skipped_passes_total` | Counter | Passes skipped because the controller lacked a fresh report from every live voter. |
| `raft.balancer.count_imbalance` | Gauge | Distance between the highest leader count and the target count. |
| `raft.balancer.load_imbalance` | Gauge | Fractional load skew across nodes. |

The imbalance gauges are meaningful on the process hosting the system-partition leader. A healthy rebalance usually shows planned moves followed by successful moves while both imbalance gauges trend downward.

## Troubleshooting

### It Is Enabled But Nothing Moves

Check that:

- `EnableLeaderBalancer` is enabled on every node
- `GossipFanout` is greater than `0`
- every live voter publishes a fresh report before `LeaderBalancerReportTtl`
- imbalance exceeds `CountDeadband` or `LoadImbalanceThreshold`
- eligible partitions are `Active`, stable, and outside cooldown
- targets are voting members of the relevant partition groups.

A rising `raft.balancer.skipped_passes_total` usually means the global report view is incomplete.

### Suggestions Time Out

Inspect `raft.balancer.moves_total{outcome=timed_out}`. Common causes include stale ownership information, a target that cannot accept the transfer, transport delivery failure, or a `SuggestionTimeout` shorter than report propagation.

### Leadership Keeps Moving

Increase the deadband, load threshold, stability window, or cooldown. Also confirm that application traffic is not shifting rapidly between partitions; the balancer can only react to the load it observes.

For manual transfers and stable-leader waiting, see [Leadership Control](./leadership-control.md). For partition topology changes, see [Elastic Partitions](../guides/elastic-partitions.md).
