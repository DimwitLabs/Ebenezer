import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type { Glyph, Line, Page } from "./cas";

GlobalWorkerOptions.workerSrc = workerUrl;

export class PasswordNeeded extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? "That password didn't open the file" : "This file needs its password");
    this.name = "PasswordNeeded";
  }
}

const SAME_LINE = 2;

// The file and its password stay in this tab; neither is sent anywhere.
export async function readPages(data: ArrayBuffer, password?: string): Promise<Page[]> {
  const task = getDocument({ data: new Uint8Array(data), password, disableFontFace: true, enableXfa: false });
  try {
    const doc = await task.promise;
    const pages: Page[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(group(content.items.filter((it): it is TextItem => "str" in it && it.str.trim() !== "")));
      page.cleanup();
    }
    return pages;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err.name === "PasswordException") throw new PasswordNeeded(err.code === 2);
    throw e;
  } finally {
    await task.destroy();
  }
}

function group(items: TextItem[]): Line[] {
  const rows: { baseline: number; glyphs: Glyph[]; runs: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    const x = it.transform[4];
    const y = it.transform[5];
    const h = Math.abs(it.transform[3]) || it.height || 8;
    let row = rows.find((r) => Math.abs(r.baseline - y) <= SAME_LINE);
    if (!row) {
      row = { baseline: y, glyphs: [], runs: [] };
      rows.push(row);
    }
    const chars = [...it.str];
    const w = it.width / Math.max(1, chars.length);
    chars.forEach((ch, i) => {
      if (ch.trim() !== "") row!.glyphs.push({ text: ch, x0: x + i * w, x1: x + (i + 1) * w, h });
    });
    row.runs.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.baseline - a.baseline);
  return rows.map((r) => ({
    baseline: r.baseline,
    glyphs: r.glyphs,
    text: r.runs
      .sort((a, b) => a.x - b.x)
      .map((x) => x.s.trim())
      .filter(Boolean)
      .join(" "),
  }));
}
