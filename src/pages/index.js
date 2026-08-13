import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

const proofPoints = [
  'Partitioned Raft groups',
  'Replica placement',
  'Jepsen-tested fault behavior',
  'Dynamic membership',
  'Elastic partitions',
  'MIT-licensed for commercial and internal use',
];

const advantageCards = [
  {
    title: 'Spread writes across partitions',
    description:
      'Different partitions can have different leaders, so one node does not have to own every write in the cluster.',
  },
  {
    title: 'Choose how many replicas each range needs',
    description:
      'Keep full replication for simple deployments or set a replication factor so large clusters store each user partition on a smaller voter set.',
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
    title: 'Keep many partitions cheap when idle',
    description:
      'A shared executor pool, hot-set leader checks, and quiescence reduce thread, timer, and heartbeat overhead for clusters with many mostly idle partitions.',
  },
  {
    title: 'Change cluster membership safely',
    description:
      'Add nodes as learners, promote them after catch-up, and remove members through the committed system partition roster instead of trusting discovery snapshots.',
  },
  {
    title: 'Back the claims with Jepsen tests',
    description:
      'Kommander has a Jepsen suite for linearizable CAS registers and log-append integrity under partitions, kills, pauses, and membership churn.',
  },
  {
    title: 'Balance leadership automatically',
    description:
      'Redistribute partition leaders by count and measured load with conservative cooldowns, stability gates, and bounded Raft leadership transfers.',
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

const usedBy = [
  {
    name: 'CamusDB',
    href: 'https://camusdb.github.io/',
    description: 'A distributed database project using Kommander for replicated coordination.',
  },
  {
    name: 'Kahuna',
    href: 'https://kahunakv.github.io/',
    description: 'A distributed key-value project using Kommander as its embedded consensus layer.',
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
  const logoUrl = useBaseUrl('/img/logo-compressed.png');

  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className={clsx('container', styles.heroInner)}>
        <div className={styles.heroContent}>
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
            <Link className="button button--secondary button--lg" to="/docs/why-kommander">
              Why Kommander
            </Link>
          </div>
          <div className={styles.proofGrid}>
            {proofPoints.map((point) => (
              <div key={point} className={styles.proofPill}>
                {point}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.heroMedia} aria-hidden="true">
          <img src={logoUrl} alt="" className={styles.heroLogo} />
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
              eyebrow="Used by"
              title="Built into real distributed data systems"
              subtitle="Kommander is not only an example consensus runtime. It is used as the embedded coordination layer in projects that need replicated state, durable agreement, and operational control."
            />
            <div className={styles.usedByGrid}>
              {usedBy.map((project) => (
                <a
                  key={project.name}
                  className={styles.usedByCard}
                  href={project.href}
                  target="_blank"
                  rel="noreferrer">
                  <Heading as="h3" className={styles.cardTitle}>
                    {project.name}
                  </Heading>
                  <p className={styles.cardDescription}>{project.description}</p>
                </a>
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
                  Elastic partitions
                </Heading>
                <p className={styles.cardDescription}>
                  Create partitions for new workloads, split hot ranges, merge cooled ranges,
                  and fence stale callers with partition generations while your service keeps
                  ownership of state-transfer behavior.
                </p>
                <Link className={styles.inlineLink} to="/docs/guides/elastic-partitions">
                  Read the partition guide
                </Link>
              </div>
              <div className={styles.calloutCard}>
                <Heading as="h3" className={styles.cardTitle}>
                  Replica placement
                </Heading>
                <p className={styles.cardDescription}>
                  Configure a replication factor per user partition so larger clusters can keep
                  fixed-size replica sets while the system partition remains fully replicated.
                </p>
                <Link className={styles.inlineLink} to="/docs/guides/replica-placement">
                  Read the placement guide
                </Link>
              </div>
              <div className={styles.calloutCard}>
                <Heading as="h3" className={styles.cardTitle}>
                  Dynamic membership
                </Heading>
                <p className={styles.cardDescription}>
                  Join new nodes as non-voting learners, promote them after they catch up,
                  and remove members through a committed roster on the system partition so
                  quorum is based on consensus, not discovery.
                </p>
                <Link className={styles.inlineLink} to="/docs/guides/dynamic-cluster-membership">
                  Read the membership guide
                </Link>
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
              <div className={styles.calloutCard}>
                <Heading as="h3" className={styles.cardTitle}>
                  Jepsen fault testing
                </Heading>
                <p className={styles.cardDescription}>
                  The Jepsen suite exercises a five-node Kommander harness with register and
                  log-append workloads while faults partition, kill, pause, and churn nodes.
                </p>
                <Link
                  className={styles.inlineLink}
                  to="https://github.com/kahunakv/kommander-jepsen">
                  Review the Jepsen suite
                </Link>
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
