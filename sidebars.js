// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    'why-kommander',
    'getting-started',
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/creating-a-node',
        'guides/replicating-logs',
        'guides/hosting-endpoints',
        'operations/sample-server',
        'guides/advanced-replicated-simpledb',
        'guides/security-and-authentication',
        'guides/checkpointing-and-recovery',
        'guides/elastic-partitions',
        'guides/splitting-a-hot-partition',
        'guides/merging-idle-partitions',
        'guides/dynamic-cluster-membership',
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
      items: [
        'recipes',
        'recipes/leader-owned-workers',
        'recipes/replicated-configuration',
        'recipes/idempotent-job-processing',
        'recipes/partitioned-metadata',
        'recipes/durable-workflow-state',
        'recipes/checkpointed-projections',
        'recipes/splitting-hot-tenant-ranges',
        'recipes/merging-cooled-partitions',
      ],
    },
    {
      type: 'category',
      label: 'Operating Kommander',
      items: [
        'internals/metrics-and-diagnostics',
        'guides/partition-load-signals',
        'operations/leader-balancing',
        'operations/partition-scaling',
        'guides/partition-quiescence',
        'guides/swim-failure-detection',
        'operations/checkpoints-and-compaction',
        'operations/wal-diagnostics',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/iraft-api',
        'reference/configuration',
        'reference/adapters',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/raft',
        'architecture/partitioning',
        'architecture/hybrid-logical-clocks',
      ],
    },
    {
      type: 'category',
      label: 'Internals & Development',
      items: [
        'internals',
        'internals/runtime',
        'internals/scheduler',
        'internals/backpressure-and-admission-control',
        'internals/wal',
        'internals/leader-election',
        'operations/leadership-control',
        'guides/log-backfill-and-catch-up',
        'operations/transport-batching',
        'internals/partitions-and-splitting',
        'internals/compaction',
        'operations/testing',
        'operations/deterministic-testing',
      ],
    },
    {
      type: 'category',
      label: 'Utilities',
      items: ['utilities/hash-utils', 'utilities/support-types'],
    },
  ],
};

export default sidebars;
