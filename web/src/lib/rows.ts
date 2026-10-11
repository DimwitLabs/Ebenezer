import type { Field, RowData } from "./api";

// Fields read as words, not numbers, so they sit left in a table.
export const TEXT = new Set(["text", "choice", "date"]);

export interface Checked {
  row: Record<string, string>;
  problems: string[];
  bad: Set<string>;
}

const looksNumeric = (v: string) => Number.isFinite(Number(v.replace(/[,₹%\s()]|Rs\.?|INR/g, ""))) && /\d/.test(v);
// A date must exist, not only look like one: 2024-13-40 has the shape and no day.
function realDate(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function looksDate(v: string): boolean {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (iso) return realDate(+iso[1], +iso[2], +iso[3]);
  const dmy = /^(\d{1,2})[-/ .](\d{1,2})[-/ .,]+(\d{4})$/.exec(v);
  if (dmy) return realDate(+dmy[3], +dmy[2], +dmy[1]) || realDate(+dmy[3], +dmy[1], +dmy[2]);
  return /^\d{1,2}[-/ .]([A-Za-z]{3,}|\d{1,2})[-/ .,]+\d{2}$/.test(v) || /^\d{1,2}[-/ .][A-Za-z]{3,}[-/ .,]+\d{4}$/.test(v);
}

// Mirrors what the server would refuse, so problems show before anything is sent.
export function check(rows: Record<string, string>[], fields: Field[]): Checked[] {
  return rows.map((row) => {
    const problems: string[] = [];
    const bad = new Set<string>();
    const flag = (f: Field, problem: string) => (problems.push(problem), bad.add(f.key));
    for (const f of fields) {
      const v = (row[f.key] ?? "").trim();
      if (!v) {
        if (f.required) flag(f, `${f.label} is empty`);
        continue;
      }
      if ((f.type === "number" || f.type === "money" || f.type === "percent") && !looksNumeric(v)) flag(f, `${f.label} is not a number`);
      if (f.type === "date" && !looksDate(v)) flag(f, `${f.label} is not a date`);
      if (f.type === "choice" && f.choices && !f.choices.includes(v)) flag(f, `${f.label} should be one of ${f.choices.join(", ")}`);
    }
    return { row, problems, bad };
  });
}

export function onlyFields(row: Record<string, string>, fields: Field[]): RowData {
  const out: RowData = {};
  for (const f of fields) {
    const v = (row[f.key] ?? "").trim();
    if (v) out[f.key] = v;
  }
  return out;
}

export interface Preview {
  key: string;
  name: string;
  quantity: number;
  invested: number;
}

function num(v: string | undefined): number {
  const s = String(v ?? "").trim();
  const n = Number(s.replace(/[,₹\s()]|Rs\.?|INR/g, "")) || 0;
  return /^\(.*\)$/.test(s) ? -Math.abs(n) : n;
}

// A rough view before prices; the server's first-in-first-out count is the real one.
export function preview(kind: string, rows: Record<string, string>[]): Preview[] {
  const by = new Map<string, Preview>();
  for (const r of rows) {
    const funds = kind === "funds";
    const key = (r.isin || (funds ? r.scheme : r.symbol) || "").trim().toUpperCase();
    if (!key) continue;
    const p = by.get(key) ?? { key, name: (funds ? r.scheme : r.symbol) || key, quantity: 0, invested: 0 };
    const action = (r.action || "").toLowerCase();
    if (funds) {
      const units = num(r.units);
      const out = units < 0 || /redemption|switch[\s-]?out/i.test(action);
      if (action === "dividend payout") continue;
      const u = Math.abs(units);
      const avg = p.quantity > 0 ? p.invested / p.quantity : 0;
      if (out) {
        p.invested -= avg * Math.min(u, p.quantity);
        p.quantity -= Math.min(u, p.quantity);
      } else {
        p.quantity += u;
        if (action !== "dividend reinvest") p.invested += Math.abs(num(r.amount));
      }
    } else {
      const q = Math.abs(num(r.quantity));
      const sell = /^(s|sell|sale|sold)$/.test(action.trim());
      const avg = p.quantity > 0 ? p.invested / p.quantity : 0;
      if (sell) {
        p.invested -= avg * Math.min(q, p.quantity);
        p.quantity -= Math.min(q, p.quantity);
      } else {
        p.quantity += q;
        p.invested += q * num(r.price) + num(r.charges);
      }
    }
    by.set(key, p);
  }
  return [...by.values()].filter((p) => p.quantity > 1e-6).sort((a, b) => b.invested - a.invested);
}
