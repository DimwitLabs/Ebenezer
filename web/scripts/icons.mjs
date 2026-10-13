// node scripts/icons.mjs: cuts Material Symbols Rounded down to the icons the app and site name, from Google Fonts' icon_names subsetting.
// Any quoted or tag-wrapped word that is a real icon name counts as used, so an extra word or two costs a glyph, never a missing icon.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(web, "..");
const out = join(web, "src/design-system/icons.woff2");

// Google's own codepoints list, since the npm package's name list leaves some out (auto_awesome, expand_more).
const codepoints = "https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL,GRAD,opsz,wght%5D.codepoints";
const known = new Set(
  (await (await fetch(codepoints)).text())
    .split("\n")
    .map((l) => l.split(" ")[0])
    .filter(Boolean),
);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "node_modules" || f.startsWith(".")) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|go|mdx?)$/.test(f) ? [p] : [];
  });
}

const used = new Set();
for (const file of [join(web, "src"), join(repo, "internal"), join(repo, "docs/src")].flatMap(walk)) {
  for (const m of readFileSync(file, "utf8").matchAll(/["'`>]([a-z0-9_]+)["'`<]/g)) if (known.has(m[1])) used.add(m[1]);
}
const names = [...used].sort();

// Google serves woff2 only to browsers it recognises, so ask as one.
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const css = await (
  await fetch(`https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..600,0..1,0&icon_names=${names.join(",")}&display=block`, {
    headers: { "User-Agent": ua },
  })
).text();
const url = css.match(/url\((https:[^)]+)\)/)?.[1];
if (!url) throw new Error(`no font in Google's reply:\n${css}`);
const font = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync(out, font);
console.log(`[icons] ${names.length} icons, ${(font.length / 1024).toFixed(0)} KB`);
