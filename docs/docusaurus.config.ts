import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import type { PrismTheme } from "prism-react-renderer";

import sidebars from "./sidebars";
import sectionCards from "./src/remark/sectionCards";
import themeRoles from "./src/plugins/themeRoles";

const REPO = "https://github.com/DimwitLabs/Ebenezer";

const codeTheme: PrismTheme = {
  plain: {
    color: "var(--text)",
    backgroundColor: "var(--surface)",
  },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "var(--text3)", fontStyle: "italic" } },
    { types: ["punctuation", "operator"], style: { color: "var(--text2)" } },
    { types: ["keyword", "builtin", "selector", "attr-name"], style: { color: "var(--md-sys-color-primary)", fontWeight: "600" } },
    { types: ["function", "class-name"], style: { color: "var(--md-sys-color-tertiary)", fontWeight: "600" } },
    { types: ["string", "char", "inserted", "url"], style: { color: "var(--md-sys-color-secondary)" } },
    { types: ["number", "boolean", "constant", "symbol"], style: { color: "var(--md-sys-color-tertiary)" } },
    { types: ["variable", "parameter", "property"], style: { color: "var(--text)" } },
    { types: ["deleted"], style: { color: "var(--md-sys-color-error)" } },
  ],
};

// llms.txt lists pages in the sidebar's order rather than the alphabet's.
function docOrder(items: unknown[]): string[] {
  return items.flatMap((i) => (typeof i === "string" ? [`${i}.md`] : (i as { items?: unknown[] }).items ? docOrder((i as { items: unknown[] }).items) : []));
}

function appVersion() {
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    return JSON.parse(readFileSync(`${here}../web/package.json`, "utf8")).version as string;
  } catch {
    return "";
  }
}

const config: Config = {
  title: "Ebenezer",
  tagline: "I keep a ledger of everything you own, on your own server, and I tell you plainly how it is doing.",
  favicon: "img/ebenezer.svg",

  url: "https://ebenezer.dimwit.me",
  baseUrl: "/",

  organizationName: "DimwitLabs",
  projectName: "Ebenezer",

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",

  markdown: {
    format: "mdx",
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  customFields: {
    appVersion: appVersion(),
    repo: REPO,
  },

  future: {
    v4: true,
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    themeRoles,
    [
      "docusaurus-plugin-llms",
      {
        generateLLMsFullTxt: false,
        description:
          "A self-hosted ledger for everything an Indian investor owns: shares, mutual funds, bonds, gold, deposits, savings, loans and property. It prices holdings each evening from free exchange and AMFI data, works out XIRR against the Nifty 50 and inflation, judges news about your holdings, answers questions from your own books, and keeps your expenses and credit cards. It runs in Docker on your own server.",
        rootContent: "Source, issues and the changelog: https://github.com/DimwitLabs/Ebenezer",
        includeOrder: docOrder(sidebars.docs as unknown[]),
      },
    ],
  ],

  headTags: [
    { tagName: "link", attributes: { rel: "manifest", href: "/site.webmanifest" } },
    { tagName: "link", attributes: { rel: "apple-touch-icon", href: "/img/apple-touch-icon.png" } },
    { tagName: "link", attributes: { rel: "alternate", type: "text/plain", title: "llms.txt", href: "/llms.txt" } },
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/docs",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [sectionCards],
          editUrl: `${REPO}/tree/main/docs/`,
        },
        blog: false,
        theme: {
          customCss: ["./src/css/custom.css"],
        },
        sitemap: {
          lastmod: "date",
          changefreq: "weekly",
          ignorePatterns: ["/search/**"],
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      "@easyops-cn/docusaurus-search-local",
      {
        docsRouteBasePath: "/docs",
        indexBlog: false,
        hashed: true,
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
        searchResultContextMaxLength: 60,
      },
    ],
  ],

  themeConfig: {
    image: "img/og.png",
    metadata: [
      { name: "description", content: "I keep a ledger of everything you own, on your own server, and I tell you plainly how it is doing." },
      {
        name: "keywords",
        content:
          "self-hosted portfolio tracker, net worth tracker India, XIRR calculator, Nifty 50 benchmark, mutual fund tracker, CAMS statement, NSDL CDSL, expense tracker, credit card tracker, open source, Docker",
      },
      { name: "author", content: "Dimwit Labs" },
      { name: "text-scale", content: "scale" },
      { name: "theme-color", content: "#206a4e", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0f1511", media: "(prefers-color-scheme: dark)" },
      { property: "og:site_name", content: "Ebenezer" },
      { property: "og:type", content: "website" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Ebenezer, a self-hosted ledger for everything you own" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image:alt", content: "Ebenezer, a self-hosted ledger for everything you own" },
    ],
    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Ebenezer",
      logo: {
        alt: "Ebenezer",
        src: "img/ebenezer.svg",
        href: "/",
        height: 32,
      },
      items: [
        { type: "search", position: "right" },
        { type: "custom-versionPill", position: "right" },
      ],
    },
    footer: {
      style: "light",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting Started", to: "/docs" },
            { label: "Self-Hosting", to: "/docs/self-hosting/install" },
            { label: "Reference", to: "/docs/reference/configuration" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "Source", href: REPO },
            { label: "Licence", href: `${REPO}/blob/main/LICENSE` },
            { label: "Changelog", href: `${REPO}/blob/main/CHANGELOG.md` },
            { label: "Security", href: `${REPO}/blob/main/SECURITY.md` },
          ],
        },
        {
          title: "Elsewhere",
          items: [
            { label: "AI Declaration", href: `${REPO}/blob/main/AI-DECLARATION.md` },
            { label: "Dimwit Labs", href: "https://dimwit.me" },
          ],
        },
      ],
      copyright: 'Made with love and labour, and backed by the <a href="https://dimwit.me/pledge" target="_blank" rel="noopener noreferrer">Dimwit Pledge</a>',
    },
    docs: {
      sidebar: { hideable: false, autoCollapseCategories: false },
    },
    tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    prism: {
      theme: codeTheme,
      darkTheme: codeTheme,
      additionalLanguages: ["bash"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
