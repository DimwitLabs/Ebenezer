import type { Plugin } from "@docusaurus/types";

import { DEFAULT_SEED, themeRoles } from "../../../web/src/lib/theme";

export default function themeRolesPlugin(): Plugin {
  const css = `:root{${Object.entries(themeRoles(DEFAULT_SEED))
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
  return {
    name: "ebenezer-theme-roles",
    injectHtmlTags: () => ({ headTags: [{ tagName: "style", innerHTML: css }] }),
  };
}
