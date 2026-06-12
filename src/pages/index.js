import clsx from 'clsx';
import {Highlight, themes as prismThemes} from 'prism-react-renderer';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

const proofPoints = [
  'Partitioned Raft groups',
  'Embedded in your .NET service',
  'RocksDB, SQLite, or in-memory WAL',
  'gRPC, REST, or in-memory transport',
];

const heroSnippet = `// Only the leader for a partition can propose. The change is
// committed once a quorum of nodes has durably stored it.
if (await raft.AmILeader(partitionId, ct))
{
    RaftReplicationResult result = await raft.ReplicateLogs(
        partitionId, 
        "OrderPlaced", 
        payload, 
        cancellationToken: ct
    );

    Console.WriteLine($"Committed at log #{result.LogIndex}");
}

// Every node applies committed entries in the same order,
// so the whole cluster ends up with one source of truth.
raft.OnReplicationReceived += (partitionId, log) => Apply(log.LogData);`;

const advantageCards = [
  {
    title: 'Spread writes across partitions',
    description:
      'Different partitions can have different leaders, so one node does not have to own every write in the cluster.',
  },
  {
    title: 'Keep control of your domain model',
    description:
      'Kommander gives you consensus, WAL durability, and leader election. Your service keeps the API, schema, authorization, and business logic.',
  },
  {
    title: 'Run it where your service already runs',
    description:
      'Use it as a library inside an ASP.NET Core host instead of standing up a separate control-plane product just to coordinate state.',
  },
  {
    title: 'Choose the durability and transport path',
    description:
      'Use RocksDB or SQLite in production, in-memory adapters in tests, and gRPC or REST depending on how your cluster is hosted.',
  },
  {
    title: 'Scale partitions at runtime',
    description:
      'Create, split, merge, and remove user partitions without restarting the cluster, with generation fencing to protect callers from stale routing.',
  },
  {
    title: 'Debug real runtime behavior',
    description:
      'Queue-depth metrics, operation latency, WAL batching telemetry, stale-completion counters, and deterministic simulation tooling make failures easier to explain.',
  },
];

const fitCards = [
  {
    title: 'Good fit',
    items: [
      'Replicated control planes',
      'Partitioned metadata services',
      'Leader-owned workers and schedulers',
      'Workflow and job coordination',
      'Embedded coordination inside .NET services',
    ],
  },
  {
    title: 'Not the target',
    items: [
      'A finished database product',
      'A drop-in cache or queue',
      'Eventually consistent fire-and-forget workloads',
      'Single-node applications that do not need quorum safety',
    ],
  },
];

function SectionHeading({eyebrow, title, subtitle}) {
  return (
    <div className={styles.sectionHeading}>
      <p className={styles.sectionEyebrow}>{eyebrow}</p>
      <Heading as="h2" className={styles.sectionTitle}>
        {title}
      </Heading>
      {subtitle ? <p className={styles.sectionSubtitle}>{subtitle}</p> : null}
    </div>
  );
}

function HomepageHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <p className={styles.heroEyebrow}>Open-source Raft for C# and .NET</p>
        <Heading as="h1" className={styles.heroTitle}>
          Make your .NET services agree, and survive failure
        </Heading>
        <p className={styles.heroSubtitle}>
          Kommander is an embedded library that lets several nodes commit the same ordered
          stream of changes, so your system keeps one source of truth even when nodes
          restart or the network breaks. You keep your data model and APIs. It handles
          leader election, replication, and durable recovery.
        </p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started">
            Get started
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Why Kommander
          </Link>
        </div>
        <Highlight theme={prismThemes.dracula} code={heroSnippet} language="csharp">
          {({className, style, tokens, getLineProps, getTokenProps}) => (
            <pre className={clsx(className, styles.heroCode)} style={style}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({line})}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({token})} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
        <div className={styles.proofGrid}>
          {proofPoints.map((point) => (
            <div key={point} className={styles.proofPill}>
              {point}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} documentation`}
      description="Documentation for Kommander, a Raft consensus library for C# and .NET.">
      <HomepageHeader />
      <main>
        <section className={styles.primarySection}>
          <div className="container">
            <SectionHeading
              eyebrow="Why teams use it"
              title="Consensus mechanics without handing your system over to a black box"
              subtitle="Kommander is a library, not a finished database product. That is the point: it gives you the hard distributed-systems machinery while keeping your service architecture, data model, and APIs in your hands"
            />
            <div className={styles.cardGrid}>
              {advantageCards.map((card) => (
                <div key={card.title} className={styles.advantageCard}>
                  <Heading as="h3" className={styles.cardTitle}>
                    {card.title}
                  </Heading>
                  <p className={styles.cardDescription}>{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.bandSection}>
          <div className="container">
            <SectionHeading
              eyebrow="What it is"
              title="A serious foundation for replicated control-plane work"
              subtitle="Use Kommander when several machines need to agree on the same ordered stream of decisions and another node must be able to continue safely after a failure."
            />
            <div className={styles.fitGrid}>
              {fitCards.map((card) => (
                <div key={card.title} className={styles.fitCard}>
                  <Heading as="h3" className={styles.cardTitle}>
                    {card.title}
                  </Heading>
                  <ul className={styles.fitList}>
                    {card.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.primarySection}>
          <div className="container">
            <SectionHeading
              eyebrow="What you get"
              title="The value is not just Raft. It is the runtime around Raft"
              subtitle="Partition executors, fair schedulers, WAL adapters, transport choices, lifecycle APIs, security controls, and diagnostics make the library usable in real services instead of only in toy examples."
            />
            <div className={styles.calloutRow}>
              <div className={styles.calloutCard}>
                <Heading as="h3" className={styles.cardTitle}>
                  Runtime capabilities
                </Heading>
                <p className={styles.cardDescription}>
                  Per-partition leadership, explicit commit and rollback, checkpoints,
                  automatic compaction, backpressure, elastic partitions, and state-transfer
                  hooks.
                </p>
              </div>
              <div className={styles.calloutCard}>
                <Heading as="h3" className={styles.cardTitle}>
                  Operational visibility
                </Heading>
                <p className={styles.cardDescription}>
                  Metrics and logs explain queue pressure, operation latency, WAL batching,
                  stale completions, and election behavior, while deterministic simulation
                  helps reproduce timing-sensitive failures.
                </p>
              </div>
            </div>
            <div className={styles.footerActions}>
              <Link className="button button--primary button--lg" to="/docs/guides/creating-a-node">
                Create a node
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/guides/elastic-partitions">
                Explore elastic partitions
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
