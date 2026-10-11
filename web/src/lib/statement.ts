import type { HeldOn, RowData } from "./api";
import { cleanSchemeName, parseStatement, schemeRows, type Page, type Statement } from "./cas";
import { depositoryOf, parseDepository, type DematHolding, type DematStatement, type HoldingKind } from "./depository";
import { date as showDate, plural, qty } from "./format";

export type Parsed = { type: "cams"; st: Statement } | { type: "demat"; st: DematStatement };

export function readStatement(pages: Page[]): Parsed {
  const text = pages.flat().map((l) => l.text).join("\n");
  const cams = /CAMSCASWS|KFINCASWS/.test(text);
  const depository = cams ? null : depositoryOf(text);
  if (depository) {
    const st = parseDepository(pages, depository);
    if (!st.to) throw new Error(`I couldn't find the statement period in this ${depository} statement.`);
    if (st.holdings.length === 0) throw new Error(`I found no holdings in this ${depository} statement.`);
    return { type: "demat", st };
  }
  const st = parseStatement(pages);
  if (st.folios.length === 0) {
    throw new Error(cams ? "I found no folios. Is this the detailed CAMS or KFintech statement?" : "This doesn't look like a CAMS, KFintech, NSDL or CDSL statement.");
  }
  if (!st.to) throw new Error("I couldn't find the statement period.");
  return { type: "cams", st };
}

export const asOf = (p: Parsed) => p.st.to as string;

export type Status = "match" | "adds" | "differs" | "missing" | "absent";

export interface Item {
  id: string;
  kind: HoldingKind;
  isin: string | null;
  name: string;
  statement: number | null;
  ebenezer: number;
  status: Status;
  label: string;
  adds: string;
  note?: string;
  rows: Record<string, string>[];
  on: boolean;
  // Stand-ins for trades the statement lacks, replaced by a later tradebook: "opening" if cost is unknown, "snapshot" if known.
  basis?: "opening" | "snapshot";
}

const TOL = 0.001;
const round = (n: number) => String(Math.round(n * 10000) / 10000);
const nameKey = (s: unknown) => cleanSchemeName(String(s ?? "")).toLowerCase();

// Mirrors the server's sale rule, so the totals here agree with what Ebenezer will count.
function netUnits(r: Record<string, string>): number {
  const action = r.action.toLowerCase();
  if (action === "dividend payout") return 0;
  const u = Number(r.units);
  return u < 0 || action === "redemption" || action === "switch out" ? -Math.abs(u) : Math.abs(u);
}

export function reviewCams(st: Statement, held: HeldOn[], existing: RowData[]): Item[] {
  const groups = new Map<string, { isin: string | null; name: string; close: number | null; rows: Record<string, string>[] }>();
  for (const f of st.folios) {
    for (const s of f.schemes) {
      const key = s.isin ?? nameKey(s.name);
      const g = groups.get(key) ?? { isin: s.isin, name: s.name, close: null, rows: [] };
      if (s.close !== null) g.close = (g.close ?? 0) + s.close;
      g.rows.push(...schemeRows(f, s));
      groups.set(key, g);
    }
  }
  const unused = [...existing];
  const funds = held.filter((h) => h.kind === "funds");
  const items: Item[] = [];
  for (const [key, g] of groups) {
    const missing = g.rows.filter((r) => {
      const at = unused.findIndex((e) => {
        if (String(e.date ?? "") !== r.date) return false;
        if (Math.abs(Math.abs(Number(e.units)) - Math.abs(Number(r.units))) > TOL) return false;
        const isin = String(e.isin ?? "").toUpperCase();
        return (!!isin && isin === r.isin) || nameKey(e.scheme) === nameKey(r.scheme);
      });
      if (at < 0) return true;
      unused.splice(at, 1);
      return false;
    });
    const ebenezer = funds.filter((h) => (g.isin ? h.isin.toUpperCase() === g.isin : !h.isin && nameKey(h.name) === key)).reduce((a, h) => a + h.quantity, 0);
    const after = ebenezer + missing.reduce((a, r) => a + netUnits(r), 0);
    const gap = g.close === null ? 0 : g.close - after;
    const n = missing.length;
    let status: Status = n > 0 ? "adds" : "match";
    let label = n > 0 ? `Adds ${plural(n, "transaction")}` : "Matches";
    if (Math.abs(gap) > TOL) {
      status = "differs";
      label = n > 0 ? `Differs by ${qty(gap)} units after adding` : `Differs by ${qty(gap)} units`;
    }
    items.push({
      id: `cams:${key}`,
      kind: "funds",
      isin: g.isin,
      name: g.name,
      statement: g.close,
      ebenezer,
      status,
      label,
      adds: n > 0 ? plural(n, "transaction") : "Nothing",
      rows: missing,
      on: n > 0,
    });
  }
  return items;
}

function position(kind: HoldingKind, on: string, h: { isin: string; name: string }, change: number, price: number, amount?: number): Record<string, string> {
  const out = change < 0;
  if (kind === "funds") {
    return { date: on, scheme: h.name, isin: h.isin, action: out ? "Redemption" : "Purchase", units: round(Math.abs(change)), nav: round(price), amount: round(amount ?? Math.abs(change) * price) };
  }
  return { date: on, isin: h.isin, action: out ? "Sell" : "Buy", quantity: round(Math.abs(change)), price: round(price) };
}

const isHoldingKind = (k: string): k is HoldingKind => k === "stocks" || k === "funds" || k === "bonds";

export function reviewDemat(st: DematStatement, held: HeldOn[]): { items: Item[]; unchecked: number } {
  const on = st.to as string;
  const byIsin = new Map<string, HeldOn[]>();
  for (const h of held) {
    if (!h.isin) continue;
    const k = h.isin.toUpperCase();
    byIsin.set(k, [...(byIsin.get(k) ?? []), h]);
  }
  const items = st.holdings.map((h: DematHolding): Item => {
    const mine = byIsin.get(h.isin) ?? [];
    const kind = mine.length > 0 && isHoldingKind(mine[0].kind) ? mine[0].kind : h.kind;
    const ebenezer = mine.reduce((a, x) => a + x.quantity, 0);
    const base = { id: `demat:${h.isin}`, kind, isin: h.isin, name: mine[0]?.name || h.name, statement: h.quantity, ebenezer };
    if (Math.abs(h.quantity - ebenezer) <= TOL) return { ...base, status: "match", label: "Matches", adds: "Nothing", rows: [], on: false };
    if (ebenezer === 0) {
      return {
        ...base,
        status: "missing",
        label: "Not in Ebenezer",
        adds: `Opening position of ${qty(h.quantity)}`,
        note: `Counted from ${showDate(on)} at that day's value; the statement has no purchase history.`,
        rows: [position(kind, on, h, h.quantity, h.price, h.cost ?? h.value)],
        on: true,
        basis: h.cost == null ? "opening" : "snapshot",
      };
    }
    const diff = h.quantity - ebenezer;
    return {
      ...base,
      status: "differs",
      label: `Differs: statement ${qty(h.quantity)}, Ebenezer ${qty(ebenezer)}`,
      adds: `${diff > 0 ? (kind === "funds" ? "Purchase" : "Buy") : kind === "funds" ? "Redemption" : "Sell"} of ${qty(Math.abs(diff))} to match`,
      rows: [position(kind, on, h, diff, h.price)],
      on: false,
      basis: "opening",
    };
  });

  const seen = new Set(st.holdings.map((h) => h.isin));
  const kinds = new Set(items.map((i) => i.kind));
  for (const [isin, mine] of byIsin) {
    const kind = mine[0].kind;
    if (seen.has(isin) || !isHoldingKind(kind) || !kinds.has(kind)) continue;
    const quantity = mine.reduce((a, x) => a + x.quantity, 0);
    const cost = mine.reduce((a, x) => a + x.cost, 0);
    items.push({
      id: `absent:${isin}`,
      kind,
      isin,
      name: mine[0].name || isin,
      statement: 0,
      ebenezer: quantity,
      status: "absent",
      label: "Not on the statement",
      adds: `${kind === "funds" ? "Redemption" : "Sell"} of ${qty(quantity)} to match`,
      note: "Priced at what it cost you, as the statement has no price for it.",
      rows: [position(kind, on, { isin, name: mine[0].name || isin }, -quantity, quantity > 0 ? cost / quantity : 0)],
      on: false,
      basis: "snapshot",
    });
  }
  const unchecked = held.filter((h) => !h.isin && isHoldingKind(h.kind) && kinds.has(h.kind)).length;
  return { items, unchecked };
}
