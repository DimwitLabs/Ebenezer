// After casparser's nsdl_statement.py (MIT, codereverser/casparser), but matching quantity × price = value instead of fixed column regexes.

import type { Page } from "./cas";

export type Depository = "NSDL" | "CDSL";
export type HoldingKind = "stocks" | "funds" | "bonds";

export interface DematHolding {
  isin: string;
  name: string;
  kind: HoldingKind;
  quantity: number;
  price: number;
  value: number;
  cost: number | null;
}

export interface DematStatement {
  depository: Depository;
  from: string | null;
  to: string | null;
  holdings: DematHolding[];
  warnings: string[];
}

const PERIOD_RE = /for\s+the\s+period\s+from\s+(\d{2}-[A-Za-z0-9]{2,3}-\d{4})\s+to\s+(\d{2}-[A-Za-z0-9]{2,3}-\d{4})/i;
const ISIN_RE = /^(IN[A-Z0-9]{9}\d)\b/;
const NUM_RE = /^\(?-?(?:\d[\d,]*)?\.?\d+\)?$/;
const DATE_START_RE = /^\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{4}\b/;
const HOLDINGS_START_RE = /^(NSDL|CDSL)\s+demat\s+account|Mutual\s+Fund\s+Folios\s+\(F\)/i;
const GOLD_BOND_RE = /sovereign\s+gold|\bSGB\b/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function depositoryOf(text: string): Depository | null {
  if (/NSDL\s+Consolidated\s+Account\s+Statement|About\s+NSDL/i.test(text)) return "NSDL";
  if (/Central\s+Depository\s+Services\s+\(India\)\s+Limited/i.test(text)) return "CDSL";
  return null;
}

export function dematDate(s: string): string | null {
  const m = /^(\d{2})-([A-Za-z]{3}|\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mon = /\d/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (mon < 1 || mon > 12) return null;
  return `${m[3]}-${String(mon).padStart(2, "0")}-${m[1]}`;
}

export function period(text: string): { from: string | null; to: string | null } {
  const m = PERIOD_RE.exec(text);
  return m ? { from: dematDate(m[1]), to: dematDate(m[2]) } : { from: null, to: null };
}

function toNumber(t: string): number {
  const neg = t.startsWith("(") || t.startsWith("-");
  const n = Number(t.replace(/[(),-]/g, ""));
  return neg ? -n : n;
}

// Values round to paise and prices to four places; a looser slack would let unrelated small numbers match.
const near = (a: number, b: number) => b > 0 && Math.abs(a - b) <= 0.005 * b + 0.05;

export interface Read {
  name: string;
  quantity: number;
  price: number;
  value: number;
  cost: number | null;
}

// The value is the latest number that is a product of two earlier ones; a smaller product on the same quantity is the cost.
export function readRow(rest: string): Read | null {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  const first = tokens.findIndex((t) => NUM_RE.test(t));
  if (first < 0) return null;
  const name = tokens.slice(0, first).join(" ");
  const n = tokens.slice(first).filter((t) => NUM_RE.test(t)).map(toNumber);
  for (let k = n.length - 1; k >= 2; k--) {
    if (!(n[k] > 0)) continue;
    for (let j = k - 1; j >= 1; j--) {
      if (!(n[j] > 0)) continue;
      for (let i = j - 1; i >= 0; i--) {
        if (!(n[i] > 0) || !near(n[i] * n[j], n[k])) continue;
        let cost: number | null = null;
        for (let k2 = k - 1; k2 > i && cost === null; k2--) {
          if (k2 === j || !(n[k2] > 0)) continue;
          for (let j2 = k2 - 1; j2 > i; j2--) {
            if (j2 !== j && n[j2] > 0 && near(n[i] * n[j2], n[k2])) {
              cost = n[k2];
              break;
            }
          }
        }
        return { name, quantity: n[i], price: n[j], value: n[k], cost };
      }
    }
  }
  return null;
}

function kindOf(isin: string, name: string): HoldingKind {
  if (isin.startsWith("INF")) return "funds";
  if (isin.startsWith("IN0") || GOLD_BOND_RE.test(name)) return "bonds";
  return "stocks";
}

const numbers = (s: string) => s.split(/\s+/).filter((t) => NUM_RE.test(t)).length;

export function parseDepository(pages: Page[], depository: Depository): DematStatement {
  const lines = pages.flat().map((l) => l.text.trim()).filter(Boolean);
  const { from, to } = period(lines.slice(0, 80).join(" "));
  const startAt = lines.findIndex((l) => HOLDINGS_START_RE.test(l));
  const by = new Map<string, DematHolding>();
  let skipped = 0;

  for (let i = Math.max(0, startAt); i < lines.length; i++) {
    const m = ISIN_RE.exec(lines[i]);
    if (!m) continue;
    let text = lines[i].slice(m[1].length);
    // A folio table puts the ISIN on its own line, with the rest below it.
    for (let extra = 1; extra <= 2 && numbers(text) < 3; extra++) {
      const next = lines[i + extra];
      if (!next || ISIN_RE.test(next) || DATE_START_RE.test(next) || HOLDINGS_START_RE.test(next)) break;
      text += ` ${next}`;
    }
    const r = readRow(text);
    if (!r) {
      skipped++;
      continue;
    }
    const isin = m[1];
    const had = by.get(isin);
    if (had) {
      had.quantity += r.quantity;
      had.value += r.value;
      had.cost = had.cost !== null && r.cost !== null ? had.cost + r.cost : null;
      had.price = had.value / had.quantity;
    } else {
      by.set(isin, { isin, name: r.name || isin, kind: kindOf(isin, r.name), quantity: r.quantity, price: r.price, value: r.value, cost: r.cost });
    }
  }

  const warnings: string[] = [];
  if (skipped > 0) warnings.push(`${skipped} line${skipped === 1 ? "" : "s"} starting with an ISIN couldn't be read as a holding, so I left ${skipped === 1 ? "it" : "them"} out.`);
  return { depository, from, to, holdings: [...by.values()], warnings };
}
