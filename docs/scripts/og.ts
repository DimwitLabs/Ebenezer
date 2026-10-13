import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { DEFAULT_SEED, reportPalette } from "../../web/src/lib/theme";

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, "../docs");
const staticDir = join(here, "../static/img");
const repoDir = join(here, "../..");

const c = reportPalette(DEFAULT_SEED);
const font = readFileSync(join(here, "../node_modules/@fontsource/roboto-flex/files/roboto-flex-latin-400-normal.woff"));

const coin = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="g"><polygon points="0,0 64,0 64,38 46.1,38 46.1,64 0,64"/></clipPath></defs><circle cx="32" cy="32" r="32" fill="${c.primary}"/><circle cx="32" cy="32" r="25.5" fill="none" stroke="${c.onPrimary}" stroke-opacity=".45" stroke-width="3.4" clip-path="url(#g)"/><path fill="${c.onPrimary}" d="M21.5 18.5h22.5v5.8H27.9v4.4h13.2v5.6H27.9v4.4H44v5.8H21.5z"/></svg>`;
const coinSrc = `data:image/svg+xml;base64,${Buffer.from(coin).toString("base64")}`;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="g"><polygon points="0,0 64,0 64,38 46.1,38 46.1,64 0,64"/></clipPath></defs><circle cx="32" cy="32" r="32" fill="${c.card}"/><circle cx="32" cy="32" r="25.5" fill="none" stroke="${c.page}" stroke-width="2" clip-path="url(#g)"/><path fill="${c.page}" d="M21.5 18.5h22.5v5.8H27.9v4.4h13.2v5.6H27.9v4.4H44v5.8H21.5z"/></svg>`;
const markSrc = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;

type Card = { kicker: string; title: string; line: string };

const el = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });

// Satori sizes from the font, so the title shrinks for long names instead of wrapping to a third line.
function layout({ kicker, title, line }: Card, width: number, height: number) {
  const titleSize = title.length > 28 ? 76 : 96;
  return el("div", { width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: c.page, fontFamily: "Roboto Flex" }, [
    { type: "img", props: { src: markSrc, width: 520, height: 520, style: { position: "absolute", right: -80, top: (height - 520) / 2 } } },
    el("div", { width: width - 160, height: height - 144, margin: "72px 80px", display: "flex", flexDirection: "column", justifyContent: "space-between" }, [
      el("div", { display: "flex", alignItems: "center", gap: 20 }, [
        { type: "img", props: { src: coinSrc, width: 64, height: 64 } },
        el("div", { fontSize: 36, color: c.ink }, "Ebenezer"),
        el("div", { fontSize: 24, color: c.onChip, backgroundColor: c.chip, borderRadius: 999, padding: "6px 20px", marginLeft: 8 }, kicker),
      ]),
      el("div", { display: "flex", flexDirection: "column", gap: 24 }, [
        el("div", { fontSize: titleSize, lineHeight: 1.05, letterSpacing: -2, color: c.ink }, title),
        el("div", { fontSize: 34, lineHeight: 1.35, color: c.ink2, maxWidth: width - 520 }, line),
      ]),
    ]),
  ]);
}

async function render(card: Card, out: string, width = 1200, height = 630) {
  const svg = await satori(layout(card, width, height) as never, { width, height, fonts: [{ name: "Roboto Flex", data: font, weight: 400, style: "normal" }] });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng());
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.mdx?$/.test(f) ? [p] : [];
  });
}

// The first paragraph after the heading is each page's short opening; cut at a sentence so it fits two lines.
function opening(body: string): string {
  const para = body.split(/\n\s*\n/).find((p) => p.trim() && !/^(#|:::|import |<|```|\||-|\d\.)/.test(p.trim())) ?? "";
  const text = para
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 120) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > 120) break;
    out += s;
  }
  return (out || `${text.slice(0, 117).replace(/\s+\S*$/, "")}...`).trim();
}

const SECTIONS: Record<string, string> = { using: "Using Ebenezer", "self-hosting": "Self-Hosting", reference: "Reference" };

async function main() {
  const tagline = "A ledger for everything you own, kept on your own server.";
  await render({ kicker: "Docs", title: "Ebenezer", line: tagline }, join(staticDir, "og.png"));
  await render({ kicker: "Self-hosted", title: "Bah, Humbug!", line: tagline }, join(repoDir, ".github/social-preview.png"), 1280, 640);

  const pages = walk(docsDir);
  for (const file of pages) {
    const src = readFileSync(file, "utf8");
    const fm = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const title = fm.match(/^title:\s*(.+)$/m)?.[1].replace(/^["']|["']$/g, "") ?? "";
    const rel = relative(docsDir, file).replace(/\.mdx?$/, "");
    const section = SECTIONS[rel.split("/")[0]] ?? "Getting Started";
    await render({ kicker: section, title, line: opening(src.slice(fm.length + 8)) }, join(staticDir, "og", `${rel}.png`));
  }
  console.log(`[og] ${pages.length} pages, the site card and the GitHub preview`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
