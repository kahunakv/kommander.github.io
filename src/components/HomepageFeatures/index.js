import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Partitioned Raft Groups',
    description: 'Run independent Raft partitions so one node can lead some workloads while following others.',
  },
  {
    title: 'Pluggable Runtime',
    description: 'Choose RocksDB, SQLite, or in-memory WALs with gRPC, REST/JSON, or in-memory communication.',
  },
  {
    title: 'Application Callbacks',
    description: 'React to restored logs, committed replications, leader changes, and replication errors in your own state machine.',
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
