import type { Field } from "./api";

export interface Table {
  headers: string[];
  rows: string[][];
}

function delimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts = [",", "\t", ";", "|"].map((d) => [d, line.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ",";
}

export function parseCSV(text: string): Table {
  const d = delimiter(text);
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === d) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((v) => v !== "")) out.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) out.push(row);
  if (out.length === 0) return { headers: [], rows: [] };
  const width = Math.max(...out.map((r) => r.length));
  const headers = out[0].map((h, i) => h.replace(/^﻿/, "") || `Column ${i + 1}`);
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
  return { headers, rows: out.slice(1).map((r) => headers.map((_, i) => r[i] ?? "")) };
}

const synonyms: Record<string, string[]> = {
  date: ["date", "trade date", "transaction date", "txn date", "order date", "bought on", "purchase date"],
  symbol: ["symbol", "ticker", "scrip", "stock", "nse code", "nse symbol", "trading symbol", "stock symbol", "code", "security"],
  isin: ["isin", "isin code"],
  action: ["action", "type", "buy/sell", "side", "transaction type", "trade type", "txn type", "b/s"],
  quantity: ["quantity", "qty", "shares", "no. of shares", "units held"],
  price: ["price", "rate", "trade price", "avg price", "average price", "buy price", "cost price", "nav"],
  charges: ["charges", "brokerage", "fees", "total charges", "taxes"],
  scheme: ["scheme", "scheme name", "fund", "fund name", "mutual fund"],
  folio: ["folio", "folio no", "folio number"],
  amount: ["amount", "value", "invested", "investment", "principal", "total"],
  units: ["units", "unit"],
  nav: ["nav", "price"],
  grams: ["grams", "weight", "gm", "gms", "weight (g)"],
  bank: ["bank", "institution"],
  account: ["account", "account name", "account number"],
  balance: ["balance", "amount", "closing balance"],
  rate: ["rate", "interest", "interest rate", "roi"],
  start: ["start", "start date", "open date", "deposit date", "value date"],
  maturity: ["maturity", "maturity date", "end date"],
  lender: ["lender", "bank"],
  outstanding: ["outstanding", "principal outstanding", "balance"],
  item: ["what", "item", "merchant", "payee", "description", "narration", "details", "title", "name"],
  category: ["category", "tag", "type of expense", "expense type", "head"],
  paid_with: ["paid from", "paid with", "payment mode", "payment method", "mode", "paid via", "account", "wallet", "source"],
  note: ["note", "notes", "remarks", "memo", "comment"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(headers: string[], fields: Field[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  const score = (field: Field, header: string): number => {
    const h = norm(header);
    const names = [norm(field.key), norm(field.label), ...(synonyms[field.key] ?? [])];
    if (names.includes(h)) return 3;
    if (names.some((n) => n.length > 2 && (h.startsWith(n) || h.endsWith(n)))) return 2;
    if (names.some((n) => n.length > 3 && h.includes(n))) return 1;
    return 0;
  };
  for (const pass of [3, 2, 1]) {
    for (const f of fields) {
      if (out[f.key]) continue;
      const hit = headers.find((h) => !used.has(h) && score(f, h) === pass);
      if (hit) {
        out[f.key] = hit;
        used.add(hit);
      }
    }
  }
  return out;
}

export function applyMapping(table: Table, mapping: Record<string, string>): Record<string, string>[] {
  const index = Object.fromEntries(table.headers.map((h, i) => [h, i]));
  return table.rows.map((r) => {
    const o: Record<string, string> = {};
    for (const [field, header] of Object.entries(mapping)) {
      if (header && index[header] !== undefined) o[field] = r[index[header]];
    }
    return o;
  });
}
