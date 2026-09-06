import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

const proofPoints = [
  'Partitioned Raft',
  'Elastic partitions',
  'Dynamic membership',
  'RocksDB and SQLite',
  'Jepsen tested',
  'MIT licensed',
];

const advantageCards = [
  {
    title: 'Scale writes with partitions',
    description:
      'Each partition can have its own leader and replica set, spreading work across the cluster.',
  },
  {
    title: 'Keep your application design',
    description:
      'Kommander handles consensus and recovery. You keep your APIs, data model, and business logic.',
  },
  {
    title: 'Embed it in your .NET service',
    description:
      'Run it inside ASP.NET Core instead of operating a separate coordination service.',
  },
  {
    title: 'Choose storage and transport',
    description:
      'Use RocksDB or SQLite for durable storage, in-memory adapters for tests, and gRPC or REST between nodes.',
  },
  {
    title: 'Change the cluster while it runs',
    description:
      'Add and remove nodes, move replicas, and split or merge partitions without restarting the cluster.',
  },
  {
    title: 'Built for real failures',
    description:
      'Jepsen tests, metrics, structured logs, and simulation tools help you trust and understand the system under stress.',
  },
];

const fitCards = [
  {
    title: 'Good fit',
    items: [
      'Replicated control planes',
      'Partitioned metadata services',
      'Distributed workers and schedulers',
      'Embedded coordination inside .NET services',
    ],
  },
  {
    title: 'Not the target',
    items: [
      'A finished database product',
      'A drop-in cache or queue',
      'Apps that do not need quorum safety',
    ],
  },
];

const usedBy = [
  {
    name: 'CamusDB',
    href: 'https://camusdb.github.io/',
    description: 'A distributed database built with Kommander for replicated coordination.',
  },
  {
    name: 'Kahuna',
    href: 'https://kahunakv.github.io/',
    description: 'A distributed key-value store using Kommander as its consensus layer.',
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
            Reliable consensus for .NET services
          </Heading>
          <p className={styles.heroSubtitle}>
            Kommander keeps your nodes in sync through crashes and network failures. Embed it
            in your service and get leader election, replication, and durable recovery while
            keeping your own APIs and data model.
          </p>
          <div className={styles.buttons}>
            <Link className={styles.primaryButton} to="/docs/getting-started">
              Get started
            </Link>
            <Link className={styles.secondaryButton} to="/book">
              Read the book
            </Link>
            <Link className={styles.secondaryButton} to="/docs/why-kommander">
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
          <div className={styles.systemPanel}>
            <div className={styles.panelBar}>
              <span>cluster / production-eu-1</span>
              <span className={styles.panelState}>● HEALTHY</span>
            </div>
            <div className={styles.clusterMap}>
              <span className={styles.linkLine} />
              <span className={styles.linkLineSecond} />
              <div className={clsx(styles.node, styles.nodeLeader)}>
                <span>01</span>
                <strong>LEADER</strong>
              </div>
              <div className={clsx(styles.node, styles.nodeReplicaOne)}><span>02</span></div>
              <div className={clsx(styles.node, styles.nodeReplicaTwo)}><span>03</span></div>
              <div className={styles.partitionLabel}>partition / 042</div>
            </div>
            <div className={styles.panelFooter}>
              <span>TERM 0187</span>
              <span>COMMIT INDEX 8,421,964</span>
            </div>
          </div>
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
              title="The hard parts of consensus, ready to use"
              subtitle="Build reliable distributed systems without giving up control of your application."
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
              title="Powering real distributed systems"
              subtitle="Kommander is already used as an embedded coordination layer."
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
              title="Is Kommander right for your project?"
              subtitle="Use it when multiple nodes must agree on state and continue safely after a failure."
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
              title="More than a Raft implementation"
              subtitle="Kommander includes the runtime features needed to operate consensus in production."
            />
            <div className={styles.calloutRow}>
              <div className={styles.calloutCard}>
                <Heading as="h3" className={styles.cardTitle}>
                  Elastic partitions
                </Heading>
                <p className={styles.cardDescription}>
                  Create, split, merge, and remove partitions at runtime as your workload changes.
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
                  Set the replication factor for each partition and place replicas where they
                  make the most sense.
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
                  Safely add nodes, let them catch up, promote them to voters, and remove old
                  members.
                </p>
                <Link className={styles.inlineLink} to="/docs/guides/dynamic-cluster-membership">
                  Read the membership guide
                </Link>
              </div>
            </div>
            <div className={styles.footerActions}>
              <Link className={styles.primaryButton} to="/docs/guides/creating-a-node">
                Create a node
              </Link>
              <Link className={styles.secondaryButton} to="/docs/guides/elastic-partitions">
                Explore the guides
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
