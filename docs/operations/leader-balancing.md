# Automatic Leader Balancing

Each Kommander user partition is an independent Raft group with its own leader. Each group elects its leader independently. Therefore, one node can lead many more partitions than its peers. The busiest partitions can also collect on one node, even with similar leader counts.

The optional leader balancer moves leadership across the live voting members in small steps. It balances the leader count first. It then examines the measured partition load. This spreads the work of replication, heartbeats, and proposals. It does not move partition data. It does not change partition ranges.

Leadership can move only among the voter replicas of the partition when you enable [replica placement](../guides/replica-placement.md). Placement selects the nodes that host the range. Leader balancing selects the eligible replica that leads it.

## When To Use It

Leader balancing is useful in these conditions:

- The cluster has several user partitions.
- One node leads more partitions than its peers at all times.
- The leader counts look even, but the hot partitions collect on one node.
- The node-level latency or the queue depth follows the current distribution of leaders.

The balancer is disabled by default. A small cluster with few partitions can get no benefit, because there are too few leaderships to distribute.

## Enable The Balancer

Enable the balancer on every node. Then every member publishes load reports. Every member can also take part in a consistent way.

```csharp
RaftConfiguration configuration = new()
{
    EnableLeaderBalancer = true
};
```

The default settings are conservative on purpose. Use them before you change the move limits or the timings.

The balancer exchanges reports through membership gossip. Gossip is the exchange of membership messages between nodes. Keep `GossipFanout` above `0`. Use a transport that implements `SendGossip`. The in-memory, gRPC, and REST transports of Kommander support this path.

## How The Balancer Works

Partition `0` is the system partition. It coordinates the cluster. Only its current leader runs balance passes. This gives one controller for the full cluster.

Every node reports these items at regular intervals:

- the partitions that it leads now
- the recent leader-side operations per second in the replicated log of each led partition
- the client queue depth and the WAL queue depth, which estimate the pending pressure
- the time that each leadership was stable.

The reports are advisory. They stay in memory. The runtime does not append them to the Raft log. The global view ignores each report that is older than `LeaderBalancerReportTtl`.

The load score of a partition is:

```text
load = LeaderBalancerOpsWeight * log operations/second
     + LeaderBalancerQueueWeight * (client queue depth + WAL queue depth)
```

The log operations per second value is an exponentially weighted moving average (EWMA). It counts the leader-side `ReplicateLogs` path. It smooths short spikes. It still adapts when a partition stays busy or becomes idle. See [Partition Load Signals](../guides/partition-load-signals.md) for the related public accessors.

## How A Balance Pass Works

The system-partition leader does these steps at each `LeaderBalancerInterval`:

1. It builds a cluster-wide view from the fresh reports.
2. It reconciles the transfers that earlier passes suggested.
3. It skips the pass if a fresh report from any live voter is missing.
4. It plans a limited set of useful moves.
5. It asks the current leader of each partition to transfer leadership to the selected target.

The controller sends suggestions, because only the current leader of a partition can transfer that partition safely. The recipient makes three checks before it uses the normal Raft transfer path for leadership. It confirms that it still leads the partition. It confirms that the partition is eligible. It confirms that the target is a live voter. The recipient ignores each stale or invalid suggestion.

The controller does not block during a transfer. A later report confirms if the target became the leader. The controller clears each suggestion that times out. It can select that partition again after the cooldown.

## Balance Policy

The planner uses two stages.

### Leader Count

First, the planner moves leaderships from the nodes above the ideal count to the nodes below it. `CountDeadband` permits a small difference without unnecessary movement. The planner prefers to move a hotter partition to a cooler node when several partitions are eligible.

### Measured Load

The planner compares the node load when the leader counts are already balanced. It can plan a count-neutral swap if the skew is more than `LoadImbalanceThreshold`. In a swap, a hot partition moves to the cooler node. A cold partition moves in the opposite direction. The planner uses the swap only when the swap reduces the imbalance.

## Safety And Churn Controls

A partition is eligible only in these conditions:

- The partition is in the `Active` lifecycle state.
- Its current leader was stable for a minimum of `MinLeaderStabilityMs`.
- The target is a live voting member of the Raft group of that partition.
- The partition is not in `MoveCooldown`.
- The partition has no outstanding transfer suggestion.

`MaxMovesPerPass` limits the new plans in one pass. `MaxConcurrentTransfers` limits the transfers that are already in flight across the cluster.

The balancer changes leadership only. It does not change membership, partition ownership, hash ranges, WAL contents, or application state. Each actual move uses the validation in `TransferLeadershipAsync`. The information of the controller can be incomplete or stale. The expected result is then a skipped, rejected, or unnecessary suggestion. The balancer never bypasses Raft safety.

## Configuration

| Property | Default | Description |
| --- | ---: | --- |
| `EnableLeaderBalancer` | `false` | Enables the load reports and the automatic balance passes. Configure it in the same way on every node. |
| `LeaderBalancerReportInterval` | `5 s` | The interval at which each node puts its local leadership report and load report into gossip. |
| `LeaderBalancerInterval` | `30 s` | The interval at which the system-partition leader runs a balance pass. |
| `LeaderBalancerReportTtl` | `20 s` | The maximum report age that the global view accepts. It must be more than the report interval. |
| `CountDeadband` | `1` | The permitted difference in leader count around the ideal count before count balancing acts. |
| `LoadImbalanceThreshold` | `0.25` | The fractional load skew that is necessary before load balancing examines a swap. |
| `MinLeaderStabilityMs` | `5000 ms` | The minimum leadership age before a partition can move. |
| `MoveCooldown` | `60 s` | The time after a success or a timeout before the planner can select that partition again. |
| `MaxMovesPerPass` | `4` | The maximum number of moves that one balance pass plans. |
| `MaxConcurrentTransfers` | `2` | The maximum number of outstanding transfers across the cluster. |
| `SuggestionTimeout` | `15 s` | The time permitted for a suggested move to appear in a fresh report. |
| `LeaderBalancerOpsWeight` | `1.0` | The weight of the operations per second in the partition load score. |
| `LeaderBalancerQueueWeight` | `0.5` | The weight of the pending queue depth in the partition load score. |

Keep `SuggestionTimeout` longer than `LeaderBalancerReportInterval` plus the expected gossip propagation time and leadership transfer time. If you do not, the controller can record a successful move as timed out before the new report arrives.

Increase `CountDeadband`, `LoadImbalanceThreshold`, `MoveCooldown`, or `MinLeaderStabilityMs` if leadership changes too often. Increase the move limits or decrease `LeaderBalancerInterval` only after the metrics show slow convergence.

## Metrics

Subscribe to the .NET meter with the name `Kommander`:

| Metric | Type | Meaning |
| --- | --- | --- |
| `raft.balancer.moves_total` | Counter | Suggested moves with the tag `outcome=planned`, `succeeded`, or `timed_out`. |
| `raft.balancer.skipped_passes_total` | Counter | Passes that the controller skipped because a fresh report from a live voter was missing. |
| `raft.balancer.count_imbalance` | Gauge | The distance between the highest leader count and the target count. |
| `raft.balancer.load_imbalance` | Gauge | The fractional load skew across the nodes. |

The imbalance gauges have a meaning on the process that hosts the system-partition leader. A healthy rebalance usually shows planned moves, then successful moves, while both imbalance gauges fall.

## Troubleshooting

### The Balancer Is Enabled, But Nothing Moves

Check these conditions:

- `EnableLeaderBalancer` is enabled on every node.
- `GossipFanout` is more than `0`.
- Every live voter publishes a fresh report before `LeaderBalancerReportTtl`.
- The imbalance is more than `CountDeadband` or `LoadImbalanceThreshold`.
- The eligible partitions are `Active` and stable, and their cooldown is complete.
- The targets are voting members of the relevant partition groups.

A rise in `raft.balancer.skipped_passes_total` usually means an incomplete global view of the reports.

### Suggestions Time Out

Examine `raft.balancer.moves_total{outcome=timed_out}`. The usual causes are stale ownership information, a target that cannot accept the transfer, or a transport delivery failure. Another cause is a `SuggestionTimeout` that is shorter than the report propagation time.

### Leadership Moves Too Often

Increase the deadband, the load threshold, the stability window, or the cooldown. Also confirm that the application traffic does not move quickly between partitions. The balancer can react only to the load that it observes.

For manual transfers and a wait for a stable leader, see [Leadership Control](./leadership-control.md). For changes to the partition topology, see [Elastic Partitions](../guides/elastic-partitions.md).
