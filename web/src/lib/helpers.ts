// Kept apart from the worker so tests can run a compiled script exactly as the sandbox does.

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export const helpers = {
  number(v: unknown): number {
    if (typeof v === "number") return v;
    const s = String(v ?? "").replace(/[,₹\s%]|Rs\.?|INR/gi, "");
    const neg = /^\(.*\)$/.test(s) || s.startsWith("-") || s.endsWith("-");
    const n = Number(s.replace(/[()-]/g, ""));
    return Number.isFinite(n) ? (neg ? -n : n) : 0;
  },
  // Day first, the way Indian statements write dates, unless an export says otherwise.
  date(v: unknown, monthFirst = false): string {
    const s = String(v ?? "").trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = /^(\d{1,2})[-/ .]([A-Za-z]{3})[A-Za-z]*[-/ .,]+(\d{2,4})$/.exec(s);
    if (m && MONTHS[m[2].toLowerCase()]) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${y}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
    }
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      const [d, mo] = monthFirst ? [m[2], m[1]] : [m[1], m[2]];
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return s;
  },
  action(v: unknown): string {
    const s = String(v ?? "").trim().toLowerCase();
    if (/^(s|sell|sale|sold|redeem|redemption)$/.test(s)) return "Sell";
    if (/^(b|buy|bought|purchase)$/.test(s)) return "Buy";
    return String(v ?? "");
  },
  round(n: number, digits = 4): number {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
  },
};
