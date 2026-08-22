import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './book.module.css';

export default function Book() {
  const logoUrl = useBaseUrl('/img/logo-compressed.png');
  const htmlUrl = useBaseUrl('/book/kommander-book.html');
  const pdfUrl = useBaseUrl('/book/kommander-book.pdf');
  const epubUrl = useBaseUrl('/book/kommander-book.epub');
  const formats = [
    {
      title: 'Read online',
      description: 'Open the full HTML edition in your browser.',
      href: htmlUrl,
      label: 'Open HTML'
    },
    {
      title: 'PDF edition',
      description: 'Download a paginated copy for reading, printing, or archiving.',
      href: pdfUrl,
      label: 'Download PDF'
    },
    {
      title: 'EPUB edition',
      description: 'Use the ebook edition with your preferred reader.',
      href: epubUrl,
      label: 'Download EPUB'
    }
  ];

  return (
    <Layout
      title="Kommander Book"
      description="Kommander: Building Distributed Systems in .NET with Embedded Raft">
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className="container">
            <div className={styles.heroInner}>
              <div>
                <p className={styles.eyebrow}>Free book</p>
                <Heading as="h1" className={styles.title}>
                  Kommander: Building Distributed Systems in .NET with Embedded Raft
                </Heading>
                <p className={styles.subtitle}>
                  A practical guide to replicated state machines, partitioned Raft groups,
                  elastic partitions, dynamic membership, and operating Kommander-backed
                  systems in production.
                </p>
                <div className={styles.actions}>
                  <a className="button button--primary button--lg" href={htmlUrl}>
                    Read online
                  </a>
                  <a className="button button--secondary button--lg" href={pdfUrl}>
                    Download PDF
                  </a>
                </div>
              </div>
              <div className={styles.heroMedia} aria-hidden="true">
                <img className={styles.heroLogo} src={logoUrl} alt="" />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className="container">
            <div className={styles.grid}>
              {formats.map((format) => (
                <article key={format.title} className={styles.card}>
                  <Heading as="h2" className={styles.cardTitle}>
                    {format.title}
                  </Heading>
                  <p className={styles.cardText}>{format.description}</p>
                  <a className={styles.cardLink} href={format.href}>
                    {format.label}
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
