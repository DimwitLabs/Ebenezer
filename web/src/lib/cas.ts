// Port of casparser's CAMS/KFintech reader (MIT, codereverser/casparser), reading columns by position rather than regex.

export interface Glyph {
  text: string;
  x0: number;
  x1: number;
  h: number;
}

// baseline is in PDF space, so it falls as you go down the page.
export interface Line {
  glyphs: Glyph[];
  baseline: number;
  text: string;
}

export type Page = Line[];

export type TxnType =
  | "purchase"
  | "sip"
  | "redemption"
  | "switch_in"
  | "switch_out"
  | "dividend_payout"
  | "dividend_reinvest"
  | "gift_in"
  | "gift_out"
  | "reversal"
  | "segregation"
  | "stt"
  | "stamp"
  | "tds"
  | "misc"
  | "unknown";

export interface Txn {
  date: string;
  description: string;
  amount: number | null;
  units: number | null;
  nav: number | null;
  balance: number | null;
  type: TxnType;
}

export interface Scheme {
  name: string;
  code: string;
  isin: string | null;
  rta: string;
  advisor: string | null;
  open: number;
  close: number | null;
  nav: number | null;
  value: number | null;
  valuedOn: string | null;
  cost: number | null;
  transactions: Txn[];
}

export interface Folio {
  folio: string;
  amc: string;
  pan: string;
  schemes: Scheme[];
}

export interface Statement {
  from: string | null;
  to: string | null;
  folios: Folio[];
  warnings: string[];
}

const HEADER_LABELS = new Set(["Date", "Transaction", "Amount", "Units", "Price", "Unit", "Balance", "NAV"]);
const MIN_HITS = 4;
const HEADER_WINDOW_Y = 15;
const NUMERIC_ZONE = 55;
const CONTINUATION_GAP = 10;
const ALIGN: Record<string, "left" | "right"> = {
  Date: "left",
  Transaction: "left",
  Amount: "right",
  Units: "right",
  Price: "right",
  "Unit Balance": "right",
  NAV: "right",
};

interface Column {
  label: string;
  lo: number;
  hi: number;
  align: "left" | "right";
}

type Word = [string, number, number];

function words(line: Line, minGap = 1.5): Word[] {
  const gs = [...line.glyphs].sort((a, b) => a.x0 - b.x0);
  const out: Word[] = [];
  let cur = "";
  let x0 = 0;
  let x1 = 0;
  for (const g of gs) {
    if (cur && g.x0 - x1 > minGap) {
      out.push([cur, x0, x1]);
      cur = "";
    }
    if (!cur) x0 = g.x0;
    cur += g.text;
    x1 = g.x1;
  }
  if (cur) out.push([cur, x0, x1]);
  return out;
}

function detectColumns(lines: Line[]): { first: number; last: number; columns: Column[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const window = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[i].baseline - lines[j].baseline > HEADER_WINDOW_Y) break;
      window.push(lines[j]);
    }
    const all = window.flatMap((l) => words(l));
    const labels = new Set(all.filter((w) => HEADER_LABELS.has(w[0])).map((w) => w[0]));
    if (labels.size < MIN_HITS) continue;
    return { first: i, last: i + window.length - 1, columns: buildColumns(all) };
  }
  return null;
}

function buildColumns(ws: Word[]): Column[] {
  const cols: Column[] = [];
  const hasBalance = ws.some((w) => w[0] === "Balance");
  for (const [text, x0, x1] of ws) {
    if (text === "Unit" && hasBalance) {
      const bal = ws.find((w) => w[0] === "Balance" && Math.abs((w[1] + w[2]) / 2 - (x0 + x1) / 2) < 30);
      if (bal) cols.push({ label: "Unit Balance", lo: Math.min(x0, bal[1]), hi: Math.max(x1, bal[2]), align: "right" });
    } else if (text in ALIGN && text !== "Unit" && text !== "Balance") {
      cols.push({ label: text, lo: x0, hi: x1, align: ALIGN[text] });
    }
  }
  return cols.sort((a, b) => a.lo - b.lo);
}

// Descriptions run wide into the Amount column, so numeric columns are bounded by content width.
function ranges(columns: Column[]): [Column, number, number][] {
  const sorted = [...columns].sort((a, b) => (a.lo + a.hi) / 2 - (b.lo + b.hi) / 2);
  return sorted.map((col, i) => {
    if (col.align === "right") return [col, col.hi - NUMERIC_ZONE, col.hi + 3];
    const next = sorted[i + 1];
    const hi = !next ? Infinity : next.align === "right" ? next.hi - NUMERIC_ZONE : next.lo - 3;
    return [col, col.lo - 3, hi];
  });
}

function cells(line: Line, columns: Column[]): Record<string, string> {
  const rs = ranges(columns);
  const buckets: Record<string, Glyph[]> = Object.fromEntries(columns.map((c) => [c.label, []]));
  for (const g of line.glyphs) {
    const mid = (g.x0 + g.x1) / 2;
    const hit = rs.find(([, lo, hi]) => lo <= mid && mid < hi);
    if (hit) buckets[hit[0].label].push(g);
  }
  const out: Record<string, string> = {};
  for (const [label, gs] of Object.entries(buckets)) {
    if (gs.length === 0) continue;
    gs.sort((a, b) => a.x0 - b.x0);
    const hs = gs.map((g) => g.h).sort((a, b) => a - b);
    const gap = Math.max(1.5, 0.6 * hs[Math.floor(hs.length / 2)]);
    let s = "";
    let prev: number | null = null;
    for (const g of gs) {
      if (prev !== null && g.x0 - prev > gap) s += " ";
      s += g.text;
      prev = g.x1;
    }
    out[label] = s.trim();
  }
  return out;
}

const FOLIO_RE = /Folio\s+No\s*:\s*(\d+(?:\s*\/\s*\d+)?)(?:.*?PAN\s*:\s*([A-Z]{5}\d{4}[A-Z]))?/i;
const INLINE_ISIN_RE = /[-\s]*ISIN\s*:\s*([A-Z0-9]+)/i;
const INLINE_ADVISOR_RE = /[-\s]*\(\s*Advisor\s*:\s*([^)]+?)\)/i;
const INLINE_ADVISORS_RE = new RegExp(INLINE_ADVISOR_RE.source, "gi");
const RTA_LABEL_RE = /Registrar\s*:\s*(\S+)/i;
const FULL_ISIN_RE = /^INF[0-9A-Z]{8}\d$/;
const ISIN_ANYWHERE_RE = /\bINF[0-9A-Z]{8}\d\b/;
const RTA_TOKEN_RE = /\b(CAMS|KFINTECH|KFIN|KARVY)\b/i;
const OPEN_BAL_RE = /Opening\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i;
const CLOSE_BAL_RE = /Closing\s+Unit\s+Balance\s*:?\s*([\d,.]+)/i;
const NAV_RE = /NAV\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,.]+)/i;
const VALUATION_RE = /(?:Valuation|Market\s+Value)\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*INR\s*([\d,.]+)/i;
const COST_RE = /Total\s+Cost\s+Value\s*:?\s*([\d,.]+)/i;
const PERIOD_RE = /(\d{2}-[A-Za-z]{3}-\d{4})\s+To\s+(\d{2}-[A-Za-z]{3}-\d{4})/i;
const AMC_RE = /^(.+?\s+(?:MF|Mutual\s*Fund|Fund\s*House))$/i;
const DATE_CELL_RE = /^\s*(\d{1,2}[-\s]*[A-Za-z]{3}[-\s]*\d{4})/;
const HEADER_MARKER_RE = /Registrar\s*:|Advisor\s*:|ISIN\s*:|Nominee\s+\d|\bARN-?\d+\b|\bINA\d+\b/i;
const SCHEME_CODE_RE = /^\s*(?=[A-Z0-9 ]{0,40}[A-Z])[A-Z0-9]+(?: [A-Z0-9]+)*-/i;
const TRAILING_MARKER_RE = /(Registrar\s*:|Advisor\s*:|ISIN\s*:|\(\s*Advisor\s*:)\s*$/i;
const NAME_EXCISE_ISIN_RE = /[-\s]*ISIN\s*:\s*INF[A-Z0-9]*/gi;
const NAME_TERMINATOR_RE = /\(\s*Advisor\s*:|Registrar\s*:?|Nominee\s+\d|\bARN-?\d+\b|\bINA\d+\b|\b(?:CAMS|KFINTECH|KFIN|KARVY)\b/i;
const ADVISOR_CODE_RE = /\b(ARN-?\d+|INA\d+)\b/i;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function isoDate(s: string): string | null {
  const m = /^(\d{1,2})[-\s]*([A-Za-z]{3})[-\s]*(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  return mon ? `${m[3]}-${mon}-${m[1].padStart(2, "0")}` : null;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  let t = s.trim();
  if (!t) return null;
  const neg = t.startsWith("(") || t.startsWith("-");
  t = t.replace(/^[(-]+/, "").replace(/\)$/, "").replace(/,/g, "");
  const n = Number(t);
  if (!Number.isFinite(n) || t === "") return null;
  return neg ? -n : n;
}

const DIVIDEND_RE = /(?:div\.|dividend|idcw)[\s\S]*?@\s*Rs\.\s*([\d.]+)/i;
const STP_RE = /\bs\s*t\s*p\b|systematic\s+transfer/i;

export function classify(description: string, units: number | null): TxnType {
  const d = description.toLowerCase();
  if (DIVIDEND_RE.test(d)) return /reinvest/i.test(d) ? "dividend_reinvest" : "dividend_payout";
  if (units === null) {
    if (d.includes("stt")) return "stt";
    if (d.includes("stamp")) return "stamp";
    if (d.includes("tds")) return "tds";
    return "misc";
  }
  if (units > 0) {
    if (d.includes("gift")) return "gift_in";
    if (d.includes("switch") || STP_RE.test(d)) return "switch_in";
    if (d.includes("segregat")) return "segregation";
    if (d.includes("sip") || d.includes("systematic") || /instal+ment/.test(d) || /sys.+?invest/s.test(d)) return "sip";
    return "purchase";
  }
  if (units < 0) {
    if (d.includes("gift")) return "gift_out";
    if (/reversal|rejection|dishonoured|mismatch|insufficient\s+balance|payment\s+not\s+received/.test(d)) return "reversal";
    if (d.includes("switch") || STP_RE.test(d)) return "switch_out";
    return "redemption";
  }
  return "unknown";
}

export function cleanSchemeName(s: string): string {
  let n = s.replace(/\((formerly|erstwhile)[\s\S]+?\)/gi, "").trim();
  n = n.replace(/\((Demat|Non-Demat)[\s\S]*/gi, "").trim();
  n = n.replace(/\s+/g, " ").trim();
  return n.replace(/[^a-zA-Z0-9_)]+$/, "").trim();
}

const isHeaderLine = (t: string) => HEADER_MARKER_RE.test(t) || RTA_TOKEN_RE.test(t) || SCHEME_CODE_RE.test(t);

function expectsContinuation(t: string): boolean {
  if (TRAILING_MARKER_RE.test(t.trim())) return true;
  const adv = /\(\s*Advisor\s*:/i.exec(t);
  return !!adv && !t.slice(adv.index + adv[0].length).includes(")");
}

function candidate(buf: string[]): { lines: string[]; s: number; members: number[]; header: string } | null {
  const lines = buf.map((s) => s.trim()).filter(Boolean);
  const s = lines.findIndex((ln) => SCHEME_CODE_RE.test(ln) && ln.split("-")[0].trim().toUpperCase() !== "ARN");
  if (s < 0) return null;
  const members: number[] = [];
  let forced = false;
  lines.forEach((ln, i) => {
    if (forced || isHeaderLine(ln)) {
      members.push(i);
      forced = expectsContinuation(ln);
    } else {
      forced = false;
    }
  });
  const header = members.map((i) => lines[i]).join(" ");
  if (!header.includes("Registrar")) return null;
  return { lines, s, members, header };
}

function buildScheme(buf: string[]): Scheme | null {
  const c = candidate(buf);
  if (!c) return null;
  const line = c.lines[c.s];
  const dash = line.indexOf("-");
  const code = line.slice(0, dash).trim();
  let nameText = [line.slice(dash + 1), ...c.members.filter((i) => i > c.s).map((i) => c.lines[i])].join(" ");
  nameText = nameText.replace(INLINE_ADVISORS_RE, "").replace(NAME_EXCISE_ISIN_RE, "");
  const cut = NAME_TERMINATOR_RE.exec(nameText);
  const name = cleanSchemeName(cut ? nameText.slice(0, cut.index) : nameText);

  let isin: string | null = INLINE_ISIN_RE.exec(c.header)?.[1]?.trim() ?? null;
  if (!isin || !FULL_ISIN_RE.test(isin)) isin = ISIN_ANYWHERE_RE.exec(c.header)?.[0] ?? null;

  let advisor = INLINE_ADVISOR_RE.exec(c.header)?.[1]?.trim() ?? null;
  const advCode = advisor ? ADVISOR_CODE_RE.exec(advisor) : null;
  if (advCode) advisor = advCode[1];

  const rta = RTA_TOKEN_RE.exec(c.header)?.[1]?.toUpperCase() ?? RTA_LABEL_RE.exec(c.header)?.[1] ?? "CAMS";
  return { name, code, isin, rta, advisor, open: 0, close: null, nav: null, value: null, valuedOn: null, cost: null, transactions: [] };
}

function regionWarning(buf: string[], where: string): string | null {
  const c = candidate(buf);
  return c ? `A scheme heading near ${where} had no opening balance, so it was skipped: ${c.lines[c.s].slice(0, 80)}` : null;
}

const TOL = 0.005;

// The running unit balance is a checksum: a sign flipped by a cosmetic bracket is corrected, any other gap warned.
function reconcile(s: Scheme): string[] {
  let prev = s.open;
  for (const t of s.transactions) {
    if (t.units === null || t.balance === null) continue;
    if (Math.abs(prev + t.units - t.balance) > TOL && Math.abs(prev - t.units - t.balance) <= TOL) {
      t.units = -t.units;
      if (t.amount !== null) t.amount = -t.amount;
      t.type = classify(t.description, t.units);
    }
    prev = t.balance;
  }
  const out: string[] = [];
  let running = s.open;
  for (const t of s.transactions) {
    if (t.units !== null) running += t.units;
    if (t.balance === null) continue;
    if (Math.abs(running - t.balance) > TOL) {
      out.push(`${s.name}: on ${t.date} the units add up to ${running.toFixed(3)} but the statement says ${t.balance.toFixed(3)}. A row may be missing.`);
      running = t.balance;
    }
  }
  if (s.close !== null && Math.abs(running - s.close) > TOL) {
    out.push(`${s.name}: the units add up to ${running.toFixed(3)} but the closing balance is ${s.close.toFixed(3)}.`);
  }
  return out;
}

export function parseStatement(pages: Page[]): Statement {
  let from: string | null = null;
  let to: string | null = null;
  const folios = new Map<string, Folio>();
  const warnings: string[] = [];
  let amc: string | null = null;
  let folio: Folio | null = null;
  let scheme: Scheme | null = null;
  let lastColumns: Column[] = [];
  let buf: string[] = [];
  let active = false;

  pages.forEach((lines, pageIndex) => {
    const det = detectColumns(lines);
    let first = -1;
    let last = -1;
    let columns = lastColumns;
    if (det) {
      ({ first, last, columns } = det);
      lastColumns = columns;
    }
    let contIdx = -2;
    let contBase = 0;

    lines.forEach((line, i) => {
      const text = line.text;
      if (from === null) {
        const m = PERIOD_RE.exec(text);
        if (m) [from, to] = [isoDate(m[1]), isoDate(m[2])];
      }
      const amcMatch = AMC_RE.exec(text.trim());
      if (amcMatch) {
        amc = amcMatch[0];
        if (active) {
          const w = regionWarning(buf, "a fund house heading");
          if (w) warnings.push(w);
        }
        buf = [];
        active = false;
        return;
      }
      if (text.includes("Folio No") && !DATE_CELL_RE.test(text)) {
        const m = FOLIO_RE.exec(text);
        if (m) {
          const no = m[1].trim();
          const key = `${amc ?? "UNKNOWN"}|${no}`;
          if (!folios.has(key)) folios.set(key, { folio: no, amc: amc ?? "Unknown", pan: m[2] ?? "", schemes: [] });
          folio = folios.get(key)!;
          scheme = null;
          if (active) {
            const w = regionWarning(buf, "a folio heading");
            if (w) warnings.push(w);
          }
          buf = [];
          active = true;
          return;
        }
      }
      const open = OPEN_BAL_RE.exec(text);
      if (open) {
        if (active) {
          scheme = buildScheme(buf);
          if (scheme && folio) {
            folio.schemes.push(scheme);
          } else {
            const region = buf.map((s) => s.trim()).filter(Boolean).slice(0, 2).join(" / ").slice(0, 120);
            warnings.push(`I couldn't read a scheme on page ${pageIndex + 1}, so I skipped it and its transactions: ${region}`);
            scheme = null;
          }
          active = false;
          buf = [];
        }
        if (scheme) scheme.open = num(open[1]) ?? 0;
        return;
      }
      let footer = false;
      if (scheme) {
        const close = CLOSE_BAL_RE.exec(text);
        if (close) {
          scheme.close = num(close[1]) ?? 0;
          buf = [];
          active = true;
          footer = true;
        }
        const nav = NAV_RE.exec(text);
        if (nav) {
          scheme.valuedOn = isoDate(nav[1]);
          scheme.nav = num(nav[2]);
          footer = true;
        }
        const val = VALUATION_RE.exec(text);
        if (val) {
          scheme.valuedOn = isoDate(val[1]);
          scheme.value = num(val[2]);
          footer = true;
        }
        const cost = COST_RE.exec(text);
        if (cost) {
          scheme.cost = num(cost[1]);
          footer = true;
        }
      }
      if (active) {
        if (!footer && !(first <= i && i <= last)) buf.push(text);
        return;
      }
      if (!scheme || columns.length === 0 || i <= last) return;

      const cs = cells(line, columns);
      const dateCell = (cs.Date ?? "").trim();
      const desc = (cs.Transaction ?? "").trim();
      const md = DATE_CELL_RE.exec(dateCell);
      if (!md) {
        const filled = Object.entries(cs).filter(([, v]) => v.trim()).map(([k]) => k);
        if (i === contIdx + 1 && contBase - line.baseline <= CONTINUATION_GAP && scheme.transactions.length > 0 && filled.length === 1 && filled[0] === "Transaction") {
          const t = scheme.transactions[scheme.transactions.length - 1];
          t.description = `${t.description} ${desc}`;
          t.type = classify(t.description, t.units);
          contIdx = i;
          contBase = line.baseline;
        }
        return;
      }
      if (!desc) return;
      const amount = num(cs.Amount);
      const units = num(cs.Units);
      let nav = num(cs.Price || cs.NAV);
      const balance = num(cs["Unit Balance"]);
      if (amount === null && units === null && balance === null && !desc.startsWith("***")) return;
      if (nav === null && amount !== null && units) nav = Math.round((amount / units) * 10000) / 10000;
      const date = isoDate(md[1].replace(/[-\s]+/g, "-").replace(/^-|-$/g, ""));
      if (!date) return;
      scheme.transactions.push({ date, description: desc, amount, units, nav, balance, type: classify(desc, units) });
      contIdx = i;
      contBase = line.baseline;
    });
  });
  if (active) {
    const w = regionWarning(buf, "the end of the statement");
    if (w) warnings.push(w);
  }
  for (const f of folios.values()) for (const s of f.schemes) warnings.push(...reconcile(s));
  return { from, to, folios: [...folios.values()], warnings };
}

const ACTION: Partial<Record<TxnType, string>> = {
  purchase: "Purchase",
  sip: "Purchase",
  redemption: "Redemption",
  reversal: "Redemption",
  switch_in: "Switch in",
  switch_out: "Switch out",
  dividend_payout: "Dividend payout",
  dividend_reinvest: "Dividend reinvest",
  gift_in: "Other",
  gift_out: "Other",
  segregation: "Other",
};

// Tax and note rows carry no units and their rupees are already in the purchase amounts, so they are skipped.
export function schemeRows(f: Folio, s: Scheme): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const t of s.transactions) {
    const action = ACTION[t.type];
    if (!action || t.units === null) continue;
    const row: Record<string, string> = { date: t.date, scheme: s.name, folio: f.folio, action, units: String(t.units) };
    if (s.isin) row.isin = s.isin;
    if (t.amount !== null) row.amount = String(Math.abs(t.amount));
    if (t.nav !== null) row.nav = String(t.nav);
    rows.push(row);
  }
  return rows;
}

export function toFundRows(st: Statement): Record<string, string>[] {
  return st.folios.flatMap((f) => f.schemes.flatMap((s) => schemeRows(f, s)));
}
