import type { Method, Spend, SpendCategory } from "./api";

export const dayOf = (s: string) => s.slice(0, 10);

const DAY = 86400000;
export const toTime = (d: string) => Date.parse(`${dayOf(d)}T00:00:00Z`);
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A colour follows the name, so a category looks the same in the chat, the ledger and the chart.
export function colorOf(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `var(--seg${(h % 7) + 1})`;
}

export const iconOf = (cats: SpendCategory[], name: string) => cats.find((c) => c.name === name)?.icon ?? "category";

export const METHOD_ICON: Record<Method["kind"], string> = { card: "credit_card", account: "account_balance", cash: "payments" };

export function dayLabel(d: string, today = todayISO()): string {
  const diff = Math.round((toTime(today) - toTime(d)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(toTime(d)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export const shortDay = (d: string) => new Date(toTime(d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export type Quadrant = "bo" | "br" | "so" | "sr";

export const QUADRANT_NAME: Record<Quadrant, string> = { bo: "Big and often", br: "Big and rare", so: "Small and often", sr: "Small and rare" };
export const QUADRANT_MEANS: Record<Quadrant, string> = { bo: "Regular big spends", br: "Occasional big ones", so: "Habits that add up", sr: "Odds and ends" };

export interface Point {
  name: string;
  n: number;
  a: number;
  t: number;
  q: Quadrant;
}

export interface Frame {
  end: string;
  points: Point[];
}

export interface Trend {
  big: number;
  frames: Frame[];
  maxTotal: number;
}

export const WINDOW = 28;
export const OFTEN = 4;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const inWindow = (sp: Spend, end: string, days = WINDOW) => {
  const t = toTime(sp.day);
  return t <= toTime(end) && t > toTime(end) - days * DAY;
};

export function pointsAt(spends: Spend[], end: string, big: number): Point[] {
  const by = new Map<string, { n: number; t: number }>();
  for (const sp of spends) {
    if (sp.amount <= 0 || !inWindow(sp, end)) continue;
    const name = sp.category || "No category";
    const v = by.get(name) ?? { n: 0, t: 0 };
    v.n++;
    v.t += sp.amount;
    by.set(name, v);
  }
  return [...by].map(([name, { n, t }]) => {
    const a = t / n;
    return { name, n, a, t, q: `${a > big ? "b" : "s"}${n >= OFTEN ? "o" : "r"}` as Quadrant };
  });
}

// Each frame is the four weeks to its day; frames step a week apart, or wider for long ranges, so a range never has more than 60.
export function trend(spends: Spend[], rangeDays: number | null, today = todayISO()): Trend {
  const first = spends.reduce((m, s) => Math.min(m, toTime(s.day)), toTime(today));
  const start = rangeDays === null ? first : toTime(today) - (rangeDays - 1) * DAY;
  const inRange = spends.filter((s) => toTime(s.day) >= start && toTime(s.day) <= toTime(today));
  const big = Math.round(median(inRange.filter((s) => s.amount > 0).map((s) => s.amount)));
  const firstEnd = Math.min(toTime(today), start + (WINDOW - 1) * DAY);
  const span = Math.round((toTime(today) - firstEnd) / DAY);
  const step = Math.max(7, Math.ceil(span / 59 / 7) * 7);
  const ends: string[] = [];
  for (let t = toTime(today); t >= firstEnd; t -= step * DAY) ends.unshift(isoDay(t));
  if (ends.length === 0) ends.push(today);
  const frames = ends.map((end) => ({ end, points: pointsAt(spends, end, big) }));
  const maxTotal = Math.max(1, ...frames.flatMap((f) => f.points.map((p) => p.t)));
  return { big, frames, maxTotal };
}

export function biggest(spends: Spend[], end: string, category: string | null, n = 3): Spend[] {
  return spends
    .filter((s) => s.amount > 0 && inWindow(s, end) && (category === null || (s.category || "No category") === category))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

export function totals(spends: Spend[], end: string, category: string | null, days = WINDOW): { n: number; t: number } {
  let n = 0;
  let t = 0;
  for (const s of spends) {
    if (s.amount <= 0 || !inWindow(s, end, days) || (category !== null && (s.category || "No category") !== category)) continue;
    n++;
    t += s.amount;
  }
  return { n, t };
}

export const weeksBefore = (end: string, weeks = 4) => isoDay(toTime(end) - weeks * 7 * DAY);
