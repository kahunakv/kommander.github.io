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
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

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
        copyright: 'Copyright © 2026 Kommander.',
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['csharp', 'bash', 'powershell'],
      },
    }),
};

export default config;
