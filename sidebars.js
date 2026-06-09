// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/creating-a-node',
        'guides/replicating-logs',
        'guides/hosting-endpoints',
        'guides/elastic-partitions',
        'guides/security-and-authentication',
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
        'architecture/raft',
        'architecture/partitioning',
        'architecture/hybrid-logical-clocks',
      ],
    },
    {
      type: 'category',
      label: 'Internals',
      items: [
        'internals',
        'internals/runtime',
        'internals/scheduler',
        'internals/backpressure-and-admission-control',
        'internals/metrics-and-diagnostics',
        'internals/wal',
        'internals/leader-election',
        'internals/partitions-and-splitting',
        'internals/compaction',
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
      ],
    },
    {
      type: 'category',
      label: 'Operations',
      items: [
        'operations/sample-server',
        'operations/testing',
        'operations/leadership-control',
        'operations/checkpoints-and-compaction',
        'operations/wal-diagnostics',
        'operations/transport-batching',
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
