const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Accounts show a loss in brackets, which reads faster down a column than a minus sign.
const bracket = (negative: boolean, s: string) => (negative ? `(${s})` : s);

export function money(n: number): string {
  const r = Math.round(n);
  return bracket(r < 0, `₹${inr.format(Math.abs(r))}`);
}

export function price(n: number): string {
  return `₹${inr2.format(n)}`;
}

export function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return bracket(n < 0, `₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 2)}\u202FCr`);
  if (a >= 1e5) return bracket(n < 0, `₹${(a / 1e5).toFixed(2)}\u202FL`);
  return bracket(Math.round(a) > 0 && n < 0, `₹${inr.format(Math.round(a))}`);
}

export function signed(n: number): string {
  return n > 0 ? `+${short(n)}` : short(n);
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const v = x * 100;
  const s = `${Math.abs(v).toFixed(digits)}%`;
  if (Number(s.slice(0, -1)) === 0) return s;
  return v > 0 ? `+${s}` : `(${s})`;
}

export function plainPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function sentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.?]$/.test(t) ? "" : ".");
}

export function toNumber(v: string): number | null {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : null;
}

export function qty(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(n);
}

export function tone(x: number | null | undefined): "up" | "down" | "flat" {
  if (!x) return "flat";
  return x > 0 ? "up" : "down";
}

// The rate left once inflation is taken out, compounded rather than subtracted.
export function realReturn(xirr: number | null, inflation: number): number | null {
  return xirr === null ? null : (1 + xirr) / (1 + inflation / 100) - 1;
}

export function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

export function daysTo(day: string): number {
  const d = new Date(`${day.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function date(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ago(s: string | null | undefined): string {
  if (!s) return "never";
  const mins = (Date.now() - new Date(s).getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} d ago`;
  return date(s);
}

export function years(days: number): string {
  if (days < 365) return `${days} days`;
  const y = days / 365;
  return `${y.toFixed(y < 10 ? 1 : 0)} years`;
}

const KEEP = new Set(["ETF", "NAV", "IDCW", "ELSS", "SBI", "HDFC", "ICICI", "LIC", "ITC", "TCS", "NTPC", "ONGC", "BSE", "NSE", "UTI", "IT", "PSU", "II", "III"]);

export function nameCase(s: string): string {
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s+|-|\(|\))/)
    .map((w) => {
      const bare = w.replace(/\.$/, "").toUpperCase();
      if (KEEP.has(bare)) return w.toUpperCase();
      if (bare === "LTD") return "Ltd";
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

export function zoneLabel(tz: string): string {
  if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta" || tz === "IST") return "India time";
  if (tz === "UTC" || tz === "Etc/UTC") return "UTC";
  return `${tz.split("/").pop()!.replace(/_/g, " ")} time`;
}
