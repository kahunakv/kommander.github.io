// @ts-check

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Kommander',
  tagline: 'Raft consensus for replicated .NET services',
  favicon: 'img/logo.svg',

  url: 'https://kahunakv.github.io',
  baseUrl: '/kommander.github.io/',
  trailingSlash: true,

  organizationName: 'kahunakv',
  projectName: 'kommander.github.io',
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'throw',
  themes: ['@docusaurus/theme-mermaid'],
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
  ],

  headTags: [
    {
      tagName: 'meta',
      attributes: {
        name: 'algolia-site-verification',
        content: 'CCAE52A1C7A7537A',
      },
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/kahunakv/kommander.github.io/tree/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/logo.svg',
      algolia: {
        appId: 'SPBBUBI3JT',
        // Search-only key. Safe to commit; never put the crawler key here.
        apiKey: '4bce7f90e4896c3f699731e08db06a09',
        indexName: 'kahunakv_github_io_spbbubi3jt_pages',
        // The site is single-locale and unversioned, so contextual filtering
        // by docusaurus_tag would only ever exclude valid results.
        contextualSearch: false,
      },
      navbar: {
        title: 'Kommander',
        logo: {
          alt: 'Kommander Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://github.com/kahunakv/kommander',
            label: 'GitHub',
            position: 'right',
          },
          {
            href: 'https://www.nuget.org/packages/Kommander',
            label: 'NuGet',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Introduction',
                to: '/docs/intro',
              },
              {
                label: 'Getting Started',
                to: '/docs/getting-started',
              },
              {
                label: 'IRaft API',
                to: '/docs/reference/iraft-api',
              },
            ],
          },
          {
            title: 'Project',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/kahunakv/kommander',
              },
              {
                label: 'NuGet',
                href: 'https://www.nuget.org/packages/Kommander',
              },
            ],
          },
        ],
        copyright: 'Copyright © 2024-2026 Kommander.',
      },
      // Colors per color mode live in src/theme/Mermaid/index.js.
      mermaid: {
        theme: {light: 'base', dark: 'base'},
        options: {
          // Flat boxes without the drop shadows of Mermaid 12's default 'neo' look.
          look: 'classic',
          // Mermaid 12 wraps node labels at 120px; keep short labels on one line.
          // Space above subgraph titles so they do not crowd the top border.
          flowchart: {padding: 16, wrappingWidth: 220, subGraphTitleMargin: {top: 14, bottom: 6}},
          // Narrow, wrapped sequence diagrams keep their text legible when
          // scaled to the content column.
          sequence: {
            wrap: true,
            width: 130,
            actorMargin: 40,
            mirrorActors: false,
            actorFontSize: 15,
            messageFontSize: 15,
            noteFontSize: 14,
          },
        },
      },
      prism: {
        theme: prismThemes.oneLight,
        darkTheme: prismThemes.oneDark,
        additionalLanguages: ['csharp', 'bash', 'powershell'],
      },
    }),
};

export default config;
