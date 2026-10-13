import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    "first-run",
    {
      type: "category",
      label: "Using Ebenezer",
      collapsed: false,
      items: [
        "using/today",
        "using/portfolios-and-sections",
        "using/importing",
        "using/prices-and-returns",
        "using/expenses-and-cards",
        "using/news",
        "using/ask",
        "using/reports",
        "using/voice",
        "using/export",
      ],
    },
    {
      type: "category",
      label: "Self-Hosting",
      collapsed: false,
      items: [
        "self-hosting/install",
        "self-hosting/people",
        "self-hosting/ai-model",
        "self-hosting/mail",
        "self-hosting/alerts-and-health",
        "self-hosting/schedules",
        "self-hosting/upgrading",
        "self-hosting/backups",
        "self-hosting/troubleshooting",
      ],
    },
    {
      type: "category",
      label: "Reference",
      collapsed: false,
      items: [
        "reference/configuration",
        "reference/data-sources",
        {
          type: "link",
          label: "Changelog",
          href: "https://github.com/DimwitLabs/Ebenezer/blob/main/CHANGELOG.md",
        },
      ],
    },
  ],
};

export default sidebars;
