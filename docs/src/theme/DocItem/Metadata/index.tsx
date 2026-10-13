import { useDoc } from "@docusaurus/plugin-content-docs/client";
import { PageMetadata } from "@docusaurus/theme-common";

// scripts/og.ts draws one card per page, named after its file, so the intro at "/" still finds its own.
export default function DocItemMetadata() {
  const { metadata, frontMatter, assets } = useDoc();
  const card = `img/og/${metadata.source.replace(/^@site\/docs\//, "").replace(/\.mdx?$/, "")}.png`;
  return <PageMetadata title={metadata.title} description={metadata.description} keywords={frontMatter.keywords} image={assets.image ?? frontMatter.image ?? card} />;
}
