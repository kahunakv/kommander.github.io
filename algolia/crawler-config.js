/*
 * Algolia Crawler configuration for the Kommander documentation site.
 *
 * This file is a checked-in copy for review and version history. The live
 * configuration is edited in the Algolia dashboard:
 *   Data Sources -> Crawler -> Editor.
 *
 * Paste the object below over the default "Experiences" config that the
 * onboarding flow generates. The default emits generic page records
 * ({ url, title, description, headers, content }); Docusaurus search needs
 * DocSearch records ({ hierarchy.lvl0..lvl6, content, anchor, type }).
 *
 * The `apiKey` field below is intentionally a placeholder. The crawler key is
 * write-capable - keep it in the dashboard, never in this repository.
 *
 * Selectors are grounded in the generated HTML: the page title is
 * `<article><header><h1>`, and body copy lives in `article p` / `article li`.
 */

new Crawler({
  appId: "SPBBUBI3JT",
  apiKey: "<crawler API key - set in the dashboard, do not commit>",
  indexPrefix: "",
  rateLimit: 8,
  maxUrls: 500,
  schedule: "every 1 day at 3:00 am",
  startUrls: ["https://kahunakv.github.io/kommander.github.io/"],
  sitemaps: ["https://kahunakv.github.io/kommander.github.io/sitemap.xml"],
  discoveryPatterns: ["https://kahunakv.github.io/kommander.github.io/**"],
  saveBackup: false,
  ignoreQueryParams: ["source", "utm_*"],
  ignoreCanonicalTo: true,
  actions: [
    {
      indexName: "kahunakv_github_io_spbbubi3jt_pages",
      pathsToMatch: ["https://kahunakv.github.io/kommander.github.io/**"],
      recordExtractor: ({ $, helpers }) => {
        return helpers.docsearch({
          recordProps: {
            lvl0: {
              selectors: "",
              defaultValue: "Documentation",
            },
            lvl1: "header h1",
            lvl2: "article h2",
            lvl3: "article h3",
            lvl4: "article h4",
            lvl5: "article h5, article td:first-child",
            lvl6: "article h6",
            content: "article p, article li, article td:last-child",
          },
          aggregateContent: true,
          recordVersion: "v3",
        });
      },
    },
  ],
  initialIndexSettings: {
    kahunakv_github_io_spbbubi3jt_pages: {
      attributesForFaceting: ["type", "lang"],
      attributesToRetrieve: [
        "hierarchy",
        "content",
        "anchor",
        "url",
        "url_without_anchor",
        "type",
      ],
      attributesToHighlight: ["hierarchy", "content"],
      attributesToSnippet: ["content:10"],
      camelCaseAttributes: ["hierarchy", "content"],
      searchableAttributes: [
        "unordered(hierarchy.lvl0)",
        "unordered(hierarchy.lvl1)",
        "unordered(hierarchy.lvl2)",
        "unordered(hierarchy.lvl3)",
        "unordered(hierarchy.lvl4)",
        "unordered(hierarchy.lvl5)",
        "unordered(hierarchy.lvl6)",
        "content",
      ],
      distinct: true,
      attributeForDistinct: "url",
      customRanking: [
        "desc(weight.pageRank)",
        "desc(weight.level)",
        "asc(weight.position)",
      ],
      ranking: [
        "words",
        "filters",
        "typo",
        "attribute",
        "proximity",
        "exact",
        "custom",
      ],
      highlightPreTag: '<span class="algolia-docsearch-suggestion--highlight">',
      highlightPostTag: "</span>",
      minWordSizefor1Typo: 3,
      minWordSizefor2Typos: 7,
      allowTyposOnNumericTokens: false,
      minProximity: 1,
      ignorePlurals: true,
      advancedSyntax: true,
      attributeCriteriaComputedByMinProximity: true,
      removeWordsIfNoResults: "allOptional",
      separatorsToIndex: "_",
    },
  },
});
