import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Partitioned Raft Groups',
    description: 'Run independent Raft partitions so one node can lead some workloads while following others.',
  },
  {
    title: 'Fair Storage Scheduling',
    description: 'Keep partition state transitions moving while synchronous WAL reads and writes run through fair worker queues.',
  },
  {
    title: 'Pluggable Adapters',
    description: 'Choose RocksDB, SQLite, or in-memory WALs with gRPC, REST/JSON, or in-memory communication.',
  },
];

function Feature({title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.featureCard}>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
