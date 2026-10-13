import judgeDefault from "../../internal/news/judge.json";
import type {
  Card,
  Catalogue,
  Check,
  Field,
  Holding,
  Import,
  InstanceView,
  Job,
  JobRun,
  Kind,
  Model,
  NewsItem,
  Note,
  NoteLine,
  Portfolio,
  Position,
  Returns,
  Row,
  Schedule,
  Section,
  Security,
  Snapshot,
  Spend,
  SpendCategory,
  SpendImport,
  Template,
  Trade,
  User,
} from "../src/lib/api";

export { judgeDefault };

const DAY = 86_400_000;
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const dayBack = (back: number) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
export const midnight = (day: string) => `${day}T00:00:00Z`;
export const at = (back: number, hh: number, mm = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, hh, mm).toISOString();
export const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
export const today = dayBack(0);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(midnight(b)) - Date.parse(midnight(a))) / DAY);
// A day of this month or an earlier one, clamped to the month's length.
export const monthDay = (monthsBack: number, day: number) => {
  const last = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0).getDate();
  return ymd(new Date(now.getFullYear(), now.getMonth() - monthsBack, Math.min(day, last)));
};

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uid = (n: number) => `6e6b0d3c-5a1f-4c2e-9b7d-${String(n).padStart(12, "0")}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const PID = uid(1);
export const ASHA = uid(2);
const RAVI = uid(3);

// The weekday prices last came in: today after the evening run, otherwise the weekday before.
function lastTradingDay(): string {
  for (let back = now.getHours() >= 19 ? 0 : 1; ; back++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    if (d.getDay() !== 0 && d.getDay() !== 6) return ymd(d);
  }
}
export const pricedOn = lastTradingDay();

function tradingDays(span: number): string[] {
  const out: string[] = [];
  for (let back = span; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    if (d.getDay() !== 0 && d.getDay() !== 6 && ymd(d) <= pricedOn) out.push(ymd(d));
  }
  return out;
}

// A year of closes ending on today's price; drift is roughly the year's change, as a log.
function closes(last: number, drift: number, vol: number, seed: number): { day: string; close: number }[] {
  const days = tradingDays(365);
  const r = rng(seed);
  const walk: number[] = [0];
  for (let i = 1; i < days.length; i++) walk.push(walk[i - 1] + drift / days.length + vol * (r() - 0.5));
  const end = walk[walk.length - 1];
  return days.map((day, i) => ({ day, close: round2(last * Math.exp(walk[i] - end)) }));
}

export function xirr(flows: { day: string; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  const t0 = Date.parse(midnight(flows[0].day));
  const f = (rate: number) => flows.reduce((s, x) => s + x.amount / (1 + rate) ** ((Date.parse(midnight(x.day)) - t0) / (365 * DAY)), 0);
  let lo = -0.95;
  let hi = 5;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return round2(((lo + hi) / 2) * 10000) / 10000;
}

export const user: User = { id: ASHA, email: "asha@example.com", name: "Asha", isOwner: true, mustChangePassword: false };
export const users: User[] = [user, { id: RAVI, email: "ravi@example.com", name: "Ravi", isOwner: false, mustChangePassword: false }];

export const portfolio: Portfolio = {
  id: PID,
  name: "Family",
  slug: "family",
  icon: "family_restroom",
  color: "#006c4b",
  people: ["Asha", "Ravi"],
  ownerId: ASHA,
  owner: "Asha",
  currency: "INR",
  fyStart: 4,
  settings: {
    benchmark: "Nifty 50",
    inflation: 5.5,
    xirrMinDays: 90,
    morningCount: "07:30",
    news: { enabled: true, times: ["07:00", "18:30"], windowDays: 3, perScrip: 6, aiJudge: true },
    voice: { personality: "accountant", custom: "", tone: "dry", instructions: "", model: "" },
    report: { enabled: true, time: "08:00", days: ["Mon", "Wed", "Fri"], to: ["asha@example.com"], sections: ["summary", "note", "sections", "movers", "news", "health"] },
    moves: {},
  },
};

function tradeFields(symbol: string, isin: string, quantity: string, price: string): Field[] {
  return [
    { key: "date", label: "Date", type: "date", required: true, example: "2024-04-15" },
    { key: "symbol", label: "Symbol", type: "text", example: symbol },
    { key: "isin", label: "ISIN", type: "text", example: isin },
    { key: "action", label: "Action", type: "choice", required: true, choices: ["Buy", "Sell"] },
    { key: "quantity", label: "Quantity", type: "number", required: true, example: quantity },
    { key: "price", label: "Price", type: "money", required: true, example: price },
    { key: "charges", label: "Charges", type: "money", example: "20" },
  ];
}

const savingsFields: Field[] = [
  { key: "account", label: "Account", type: "text", required: true, example: "HDFC savings" },
  { key: "balance", label: "Balance", type: "money", required: true, example: "125000" },
  { key: "as_of", label: "Balance on", type: "date", example: "2026-09-30" },
  { key: "rate", label: "Interest rate", type: "percent", example: "3" },
];

// The real catalogue, with its examples swapped for the demo's fictional names.
const kinds: Kind[] = [
  {
    key: "stocks",
    name: "Stocks",
    icon: "candlestick_chart",
    hint: "Shares on NSE or BSE, from any broker",
    valuation: "market",
    holdings: true,
    fields: tradeFields("NEELTEX", "INE0NTX01015", "10", "812"),
    template: "e.g. Zerodha tradebook",
  },
  {
    key: "funds",
    name: "Mutual Funds",
    icon: "pie_chart",
    hint: "Matched to AMFI by ISIN, priced daily",
    valuation: "nav",
    holdings: true,
    template: "e.g. Groww order history",
    fields: [
      { key: "date", label: "Date", type: "date", required: true, example: "2024-04-15" },
      { key: "scheme", label: "Scheme", type: "text", required: true, example: "Banyan Flexi Cap Fund – Direct Growth" },
      { key: "isin", label: "ISIN", type: "text", example: "INF0MRL01FC7" },
      { key: "folio", label: "Folio", type: "text", example: "12345678/90" },
      { key: "action", label: "Action", type: "choice", required: true, choices: ["Purchase", "Redemption", "Switch in", "Switch out", "Dividend reinvest", "Dividend payout", "Other"] },
      { key: "amount", label: "Amount", type: "money", example: "10000" },
      { key: "units", label: "Units", type: "number", example: "142.857" },
      { key: "nav", label: "NAV", type: "number", example: "70.00" },
    ],
  },
  {
    key: "bonds",
    name: "Bonds",
    icon: "receipt_long",
    hint: "Government and corporate bonds, SGBs included",
    valuation: "market",
    holdings: true,
    fields: tradeFields("SGBAUG28V", "IN0020200153", "5", "5334"),
    template: "e.g. RBI Retail Direct holdings",
  },
  {
    key: "crypto",
    name: "Crypto",
    icon: "currency_bitcoin",
    hint: "Coins from any exchange or wallet, priced daily in rupees",
    valuation: "market",
    holdings: true,
    template: "e.g. CoinDCX or WazirX trade history",
    fields: [
      { key: "date", label: "Date", type: "date", required: true, example: "2024-04-15" },
      { key: "symbol", label: "Coin", type: "text", required: true, example: "BTC" },
      { key: "action", label: "Action", type: "choice", required: true, choices: ["Buy", "Sell"] },
      { key: "quantity", label: "Quantity", type: "number", required: true, example: "0.015" },
      { key: "price", label: "Price per coin", type: "money", required: true, example: "5200000" },
      { key: "charges", label: "Fees", type: "money", example: "150" },
    ],
  },
  {
    key: "gold",
    name: "Bullion",
    icon: "diamond",
    hint: "Gold and silver coins, bars and digital gold",
    valuation: "gold",
    holdings: false,
    costField: "cost",
    dateField: "bought_on",
    template: "e.g. Gold coins list",
    fields: [
      { key: "item", label: "Item", type: "text", required: true, example: "10g gold coin" },
      { key: "metal", label: "Metal", type: "choice", choices: ["Gold 24K", "Gold 22K", "Gold 18K", "Silver"] },
      { key: "grams", label: "Grams", type: "number", required: true, example: "10" },
      { key: "bought_on", label: "Bought on", type: "date", example: "2022-11-04" },
      { key: "cost", label: "Cost", type: "money", example: "52000" },
    ],
  },
  {
    key: "deposits",
    name: "Deposits",
    icon: "account_balance",
    hint: "Fixed and recurring, valued from the rate and dates",
    valuation: "deposit",
    holdings: false,
    template: "e.g. Bank deposit summary",
    fields: [
      { key: "bank", label: "Bank", type: "text", required: true, example: "SBI" },
      { key: "account", label: "Account", type: "text", example: "FD 0042" },
      { key: "type", label: "Type", type: "choice", choices: ["Fixed", "Recurring"] },
      { key: "amount", label: "Amount or monthly instalment", type: "money", required: true, example: "200000" },
      { key: "rate", label: "Rate", type: "percent", required: true, example: "7.1" },
      { key: "start", label: "Start", type: "date", required: true, example: "2025-01-10" },
      { key: "maturity", label: "Maturity", type: "date", required: true, example: "2027-01-10" },
      { key: "compounding", label: "Compounding", type: "choice", choices: ["Quarterly", "Monthly", "Yearly", "Simple"] },
      { key: "on_maturity", label: "On maturity", type: "choice", choices: ["Credit to account", "Reinvest", "Reinvest principal, credit interest"] },
    ],
  },
  {
    key: "savings",
    name: "Savings",
    icon: "savings",
    hint: "Bank balances and cash, earning interest from the day you give",
    valuation: "balance",
    holdings: false,
    valueField: "balance",
    dateField: "as_of",
    template: "e.g. Month-end balances",
    fields: savingsFields,
  },
  {
    key: "loans",
    name: "Loans",
    icon: "request_quote",
    hint: "Home, car or personal, counted against you",
    valuation: "liability",
    holdings: false,
    valueField: "outstanding",
    template: "e.g. Loan statements",
    fields: [
      { key: "lender", label: "Lender", type: "text", required: true, example: "HDFC home loan" },
      { key: "outstanding", label: "Outstanding", type: "money", required: true, example: "3000000" },
      { key: "rate", label: "Rate", type: "percent", example: "8.5" },
      { key: "emi", label: "EMI", type: "money", example: "32000" },
    ],
  },
  {
    key: "property",
    name: "Property",
    icon: "home",
    hint: "Valued by your own estimate",
    valuation: "manual",
    holdings: false,
    valueField: "value",
    costField: "cost",
    dateField: "bought_on",
    template: "e.g. Property list",
    fields: [
      { key: "property", label: "Property", type: "text", required: true, example: "2BHK, Baner" },
      { key: "city", label: "City", type: "text", example: "Pune" },
      { key: "bought_on", label: "Bought on", type: "date", example: "2019-06-01" },
      { key: "cost", label: "Cost", type: "money", example: "6500000" },
      { key: "value", label: "Current estimate", type: "money", required: true, example: "9000000" },
      { key: "rent", label: "Monthly rent", type: "money", example: "25000" },
    ],
  },
  {
    key: "insurance",
    name: "Insurance",
    icon: "shield",
    hint: "Term, health and other cover. Shown, never counted",
    valuation: "cover",
    holdings: false,
    template: "e.g. Policy list",
    fields: [
      { key: "policy", label: "Policy", type: "text", required: true, example: "Term plan" },
      { key: "type", label: "Type", type: "choice", required: true, choices: ["Term life", "Health", "Life with savings", "Vehicle", "Home", "Other"] },
      { key: "insurer", label: "Insurer", type: "text", example: "Banyan Life" },
      { key: "cover", label: "Cover", type: "money", required: true, example: "15000000" },
      { key: "premium", label: "Premium", type: "money", example: "18200" },
      { key: "pays", label: "Pays", type: "choice", choices: ["Monthly", "Quarterly", "Half-yearly", "Yearly", "Once"] },
      { key: "renews_on", label: "Renews on", type: "date", example: "2027-03-03" },
      { key: "ends_on", label: "Ends on", type: "date", example: "2051-03-03" },
      { key: "covers", label: "Covers", type: "text", example: "You, Ravi" },
      { key: "nominee", label: "Nominee", type: "text", example: "Ravi" },
    ],
  },
  { key: "custom", name: "Something else", icon: "add_circle", hint: "Define a section of your own", valuation: "manual", holdings: false, fields: [] },
];

export const catalogue: Catalogue = {
  kinds,
  fieldTypes: ["text", "number", "money", "date", "percent", "choice"],
  customValuations: ["manual", "rate", "none"],
  expenseFields: [
    { key: "date", label: "Date", type: "date", required: true, example: "2026-10-09" },
    { key: "item", label: "What", type: "text", required: true, example: "Lunch" },
    { key: "amount", label: "Amount", type: "money", required: true, example: "486" },
    { key: "category", label: "Category", type: "text", example: "Food delivery" },
    { key: "paid_with", label: "Paid from", type: "text", example: "Millennia" },
    { key: "note", label: "Note", type: "text" },
  ],
  cardFields: [
    { key: "bank", label: "Bank", type: "text", required: true, example: "HDFC Bank" },
    { key: "name", label: "Card", type: "text", required: true, example: "Millennia" },
    { key: "nickname", label: "Nickname", type: "text", example: "Travel card" },
    { key: "kind", label: "Kind", type: "choice", choices: ["credit", "charge"], example: "credit" },
    { key: "network", label: "Network", type: "choice", choices: ["visa", "mastercard", "amex", "rupay", "diners", "other"], example: "visa" },
    { key: "limit", label: "Limit", type: "money", example: "300000" },
    { key: "statement_day", label: "Statement day", type: "number", required: true, example: "17" },
    { key: "due_days", label: "Due days after", type: "number", example: "20" },
    { key: "interest", label: "Interest a month", type: "percent", example: "3.75" },
    { key: "annual_fee", label: "Annual fee", type: "money", example: "2500" },
    { key: "statement_on", label: "Last statement on", type: "date", example: "2026-09-17" },
    { key: "statement_balance", label: "Last statement balance", type: "money", example: "22410" },
    { key: "paid", label: "Paid towards it", type: "money", example: "0" },
    { key: "spent_before", label: "Spent since that statement", type: "money", example: "0" },
    { key: "color", label: "Colour", type: "text", example: "#1d2b4f" },
  ],
};

const kind = (key: string) => kinds.find((k) => k.key === key)!;

function section(n: number, key: string, position: number, description = ""): Section {
  const k = kind(key);
  return {
    id: uid(100 + n),
    portfolioId: PID,
    kind: k.key,
    name: k.name,
    icon: k.icon,
    description,
    valuation: k.valuation,
    rate: null,
    valueField: k.valueField ?? "",
    costField: k.costField ?? "",
    dateField: k.dateField ?? "",
    fields: k.fields,
    counts: k.valuation !== "cover",
    position,
    rows: 0,
    holdings: 0,
    lastImport: null,
  };
}

export const STOCKS = section(1, "stocks", 0);
export const FUNDS = section(2, "funds", 1);
export const GOLD = section(3, "gold", 2, "Wedding gold and the coins bought each Dhanteras.");
export const SAVINGS = section(4, "savings", 3);
export const DEPOSITS = section(5, "deposits", 4);
export const LOANS = section(6, "loans", 5);

interface Scrip {
  isin: string;
  symbol: string;
  bseCode: string;
  name: string;
  group: string;
  price: number;
  drift: number;
  vol: number;
  buys: [string, number, number][];
  sells?: [string, number, number][];
}

// Each buy is [day, quantity, price]; the prices land the cost on the figure the scenario wants.
export const SCRIPS: Scrip[] = [
  {
    isin: "INE0NTX01015",
    symbol: "NEELTEX",
    bseCode: "543921",
    name: "Neel Textiles Ltd",
    group: "Textiles",
    price: 812.4,
    drift: 0.24,
    vol: 0.034,
    buys: [
      ["2021-11-08", 300, 492.5],
      ["2022-06-20", 250, 561.2],
      ["2023-09-14", 270, 723.55],
    ],
  },
  {
    isin: "INE0SVP01027",
    symbol: "SUVIDHA",
    bseCode: "543874",
    name: "Suvidha Pharma Ltd",
    group: "Pharmaceuticals",
    price: 1684.5,
    drift: -0.12,
    vol: 0.03,
    buys: [
      ["2024-02-12", 180, 1795.0],
      ["2024-07-29", 130, 1806.4],
    ],
  },
  {
    isin: "INE0MDF01013",
    symbol: "MADHUR",
    bseCode: "543610",
    name: "Madhur Foods Ltd",
    group: "Consumer foods",
    price: 268.7,
    drift: 0.01,
    vol: 0.022,
    buys: [
      ["2022-03-03", 900, 271.2],
      ["2023-01-17", 550, 268.8],
    ],
  },
  {
    isin: "INE0PVL01019",
    symbol: "PARVAT",
    bseCode: "543355",
    name: "Parvat Logistics Ltd",
    group: "Logistics",
    price: 942.1,
    drift: 0.2,
    vol: 0.03,
    buys: [
      ["2021-05-24", 320, 512.3],
      ["2022-10-11", 220, 599.05],
    ],
  },
  {
    isin: "INE0KRP01024",
    symbol: "KIRAN",
    bseCode: "543702",
    name: "Kiran Power Ltd",
    group: "Power",
    price: 140.6,
    drift: 0.34,
    vol: 0.04,
    buys: [
      ["2021-08-02", 1400, 52.4],
      ["2023-04-06", 1000, 63.1],
    ],
    sells: [["2024-03-18", 300, 118.25]],
  },
];

interface Fund {
  isin: string;
  code: string;
  name: string;
  group: string;
  category: string;
  folio: string;
  value: number;
  rate: number;
  // [first month back, how many months, amount]; months count back from this month.
  sip: [number, number, number];
  lumps?: string[];
}

export const FUNDS_HELD: Fund[] = [
  {
    isin: "INF0MRL01FC7",
    code: "149872",
    name: "Banyan Flexi Cap Fund – Direct Growth",
    group: "Flexi Cap",
    category: "Equity Scheme - Flexi Cap Fund",
    folio: "40418823/71",
    value: 631102,
    rate: 0.13,
    sip: [47, 48, 10000],
  },
  {
    isin: "INF0CHB01LC2",
    code: "151204",
    name: "Cheeryble Large Cap Index Fund – Direct Growth",
    group: "Large Cap",
    category: "Other Scheme - Index Funds",
    folio: "77120345/12",
    value: 402880,
    rate: 0.12,
    sip: [33, 34, 10000],
  },
  {
    isin: "INF0PKW01MC5",
    code: "148830",
    name: "Pickwick Midcap Fund – Direct Growth",
    group: "Mid Cap",
    category: "Equity Scheme - Mid Cap Fund",
    folio: "31507762/45",
    value: 346215,
    rate: 0.16,
    sip: [51, 52, 5000],
  },
  {
    isin: "INF0NKB01TS8",
    code: "147315",
    name: "Nickleby ELSS Tax Saver Fund – Direct Growth",
    group: "ELSS",
    category: "Equity Scheme - ELSS",
    folio: "90233118/03",
    value: 170100,
    rate: 0.11,
    sip: [0, 0, 0],
    lumps: ["2023-01-16", "2023-02-15", "2024-01-15", "2024-02-15", "2025-01-15", "2025-02-17", "2026-01-15"],
  },
];

export const GOLD_PER_GRAM = 11850;
export const SILVER_PER_GRAM = 148;

interface Built {
  rows: Row[];
  holdings: Holding[];
  positions: Position[];
  trades: Record<string, Trade[]>;
}

const created = (day: string) => `${day}T10:30:00Z`;
let rowN = 1000;
const rowOf = (data: Row["data"], day: string): Row => ({ id: uid(rowN++), data, createdAt: created(day) });

function buildStocks(): Built {
  const out: Built = { rows: [], holdings: [], positions: [], trades: {} };
  for (const s of SCRIPS) {
    const flows: { day: string; amount: number }[] = [];
    const trades: Trade[] = [];
    // Sales come out of the oldest lots first, as the app counts them.
    const lots: { q: number; unit: number }[] = [];
    let realised = 0;
    const events = [...s.buys.map((b) => ({ b, sell: false })), ...(s.sells ?? []).map((b) => ({ b, sell: true }))].sort((x, y) => x.b[0].localeCompare(y.b[0]));
    for (const { b, sell } of events) {
      const [day, q, price] = b;
      const amount = round2(q * price + 20);
      out.rows.push(rowOf({ date: day, symbol: s.symbol, isin: s.isin, action: sell ? "Sell" : "Buy", quantity: q, price, charges: 20 }, day));
      trades.push({ date: day, action: sell ? "Sell" : "Buy", quantity: q, amount: round2(q * price), sell, opening: false });
      if (sell) {
        let left = q;
        let basis = 0;
        while (left > 0) {
          const take = Math.min(left, lots[0].q);
          basis += take * lots[0].unit;
          lots[0].q -= take;
          left -= take;
          if (lots[0].q === 0) lots.shift();
        }
        realised += q * price - 20 - basis;
        flows.push({ day, amount: q * price - 20 });
      } else {
        lots.push({ q, unit: amount / q });
        flows.push({ day, amount: -amount });
      }
    }
    const qty = lots.reduce((n, l) => n + l.q, 0);
    const cost = lots.reduce((n, l) => n + l.q * l.unit, 0);
    const value = round2(qty * s.price);
    flows.push({ day: today, amount: value });
    out.trades[s.isin] = trades.reverse();
    out.holdings.push({ key: s.isin, isin: s.isin, symbol: s.symbol, name: s.name, quantity: qty, cost: round2(cost), realised: round2(realised), firstDate: s.buys[0][0] });
    out.positions.push({
      key: s.isin,
      name: s.name,
      isin: s.isin,
      quantity: qty,
      price: s.price,
      value,
      invested: round2(cost),
      xirr: xirr(flows),
      days: daysBetween(s.buys[0][0], today),
      group: s.group,
    });
  }
  return out;
}

// A fund's NAV on a day, growing at its rate back from today's figure, with some weather.
const navOn = (f: Fund, now: number, day: string) => {
  const years = daysBetween(day, today) / 365;
  return round2(now / (1 + f.rate) ** years / (1 + 0.035 * Math.sin(years * 5.3 + f.rate * 40)));
};

function buildFunds(): Built & { navs: Record<string, number> } {
  const out: Built & { navs: Record<string, number> } = { rows: [], holdings: [], positions: [], trades: {}, navs: {} };
  for (const f of FUNDS_HELD) {
    const days = f.lumps ?? Array.from({ length: f.sip[1] }, (_, i) => monthDay(f.sip[0] - i, 7)).filter((d) => d <= today);
    const amount = f.lumps ? 20000 : f.sip[2];
    // Today's NAV is solved for, so the units bought on those days come to the value the scenario wants.
    const base = 100;
    const units = days.reduce((u, d) => u + amount / navOn(f, base, d), 0);
    const nav = round2((f.value / units) * 1);
    const scale = nav / base;
    const flows: { day: string; amount: number }[] = [];
    const trades: Trade[] = [];
    let held = 0;
    for (const d of days) {
      const n = round2(navOn(f, base, d) * scale);
      const u = Math.round((amount / n) * 1000) / 1000;
      held += u;
      out.rows.push(rowOf({ date: d, scheme: f.name, isin: f.isin, folio: f.folio, action: "Purchase", amount, units: u, nav: n }, d));
      trades.push({ date: d, action: "Purchase", quantity: u, amount, sell: false, opening: false });
      flows.push({ day: d, amount: -amount });
    }
    held = Math.round(held * 1000) / 1000;
    const value = round2(held * nav);
    flows.push({ day: today, amount: value });
    const invested = amount * days.length;
    out.navs[f.isin] = nav;
    out.trades[f.isin] = trades.reverse();
    out.holdings.push({ key: f.isin, isin: f.isin, symbol: f.code, name: f.name, quantity: held, cost: invested, realised: 0, firstDate: days[0] });
    out.positions.push({ key: f.isin, name: f.name, isin: f.isin, quantity: held, price: nav, value, invested, xirr: xirr(flows), days: daysBetween(days[0], today), group: f.group });
  }
  return out;
}

const PURITY: Record<string, number> = { "Gold 24K": 1, "Gold 22K": 0.916, "Gold 18K": 0.75 };

function buildGold(): Built {
  const items: [string, string, number, string, number][] = [
    ["24K coins, four of 10g", "Gold 24K", 40, "2022-10-23", 210000],
    ["Wedding bangles", "Gold 22K", 38, "2023-11-10", 452000],
    ["Digital gold", "Gold 24K", 8.6, "2025-04-30", 80000],
  ];
  const out: Built = { rows: [], holdings: [], positions: [], trades: {} };
  for (const [item, metal, grams, bought, cost] of items) {
    const row = rowOf({ item, metal, grams, bought_on: bought, cost }, bought);
    out.rows.push(row);
    const value = round2(grams * GOLD_PER_GRAM * (PURITY[metal] ?? 1));
    out.positions.push({
      key: row.id,
      name: item,
      value,
      invested: cost,
      xirr: xirr([
        { day: bought, amount: -cost },
        { day: today, amount: value },
      ]),
      days: daysBetween(bought, today),
      price: null,
    });
  }
  return out;
}

export const stocks = buildStocks();
export const funds = buildFunds();
export const gold = buildGold();

export const savingsRow = rowOf({ account: "Peepal savings", balance: 150000, as_of: monthDay(0, 1), rate: 3 }, monthDay(0, 1));
export const depositRow = rowOf(
  { bank: "SBI", account: "FD 0042", type: "Fixed", amount: 92000, rate: 7.1, start: dayBack(340), maturity: dayBack(-390), compounding: "Quarterly", on_maturity: "Credit to account" },
  dayBack(340),
);
export const loanRow = rowOf({ lender: "Car loan, Peepal Bank", outstanding: 321450, rate: 9.1, emi: 14800 }, dayBack(30));

export const depositValue = round2(92000 * (1 + 0.071 / 4) ** ((4 * 340) / 365));

export const securities: Record<string, Security> = Object.fromEntries([
  ...SCRIPS.map((s) => [s.isin, { isin: s.isin, symbol: s.symbol, bseCode: s.bseCode, name: s.name, kind: "stock", category: "" }]),
  ...FUNDS_HELD.map((f) => [f.isin, { isin: f.isin, symbol: f.code, bseCode: "", name: f.name, kind: "fund", category: f.category }]),
]);

export const histories: Record<string, { day: string; close: number }[]> = Object.fromEntries([
  ...SCRIPS.map((s, i) => [s.isin, closes(s.price, s.drift, s.vol, 11 + i)]),
  ...FUNDS_HELD.map((f, i) => [f.isin, closes(funds.navs[f.isin], Math.log(1 + f.rate), 0.012, 31 + i)]),
]);

const ret = (x: number | null, benchmark: number | null, days: number): Returns => ({ xirr: x, benchmark, inflation: 5.5, days, eligible: x !== null && days >= 90 });

export const RETURNS = {
  wealth: ret(0.0937, 0.1381, 1966),
  stocks: ret(0.0618, 0.1352, 1966),
  funds: ret(0.1176, 0.1309, 1557),
  gold: ret(0.1583, 0.1214, 1450),
  deposits: ret(0.071, 0.134, 340),
  none: ret(null, null, 0),
};

// Monthly SIPs step what went in up; the market moves the rest.
export function snapshots(netWorth: number, invested: number): Snapshot[] {
  const r = rng(7);
  let wobble = 0;
  return Array.from({ length: 121 }, (_, i) => {
    const back = 120 - i;
    const day = dayBack(back);
    const monthsBack = (now.getFullYear() - Number(day.slice(0, 4))) * 12 + now.getMonth() + 1 - Number(day.slice(5, 7));
    const put = invested - monthsBack * 25000;
    wobble = wobble * 0.85 + (r() - 0.5) * 0.03;
    // A real four months has a bad patch in it: a slide of about a tenth, then most of the way back.
    const slide = back > 40 && back < 85 ? -0.1 * Math.sin(((back - 40) / 45) * Math.PI) : 0;
    const drift = 0.94 + 0.06 * (i / 120);
    const ratio = (netWorth / invested) * (back === 0 ? 1 : drift * (1 + wobble + slide + 0.015 * Math.sin(back / 6)));
    return { day, netWorth: Math.round(put * ratio), invested: put };
  });
}

const filing = (n: number) => `https://www.bseindia.com/xml-data/corpfiling/AttachLive/0f${n}e2a91-5c3d-4e7b-a1f0-demo${n}.pdf`;
const story = (n: number) => `https://example.com/markets/story-${n}`;

const item = (id: number, hours: number, scrip: string, title: string, verdict: string, category: string, reason: string, source: string, snippet = "", also = 0, link = story(id)): NewsItem => ({
  id,
  link,
  title,
  source,
  snippet: snippet || title,
  publishedAt: hoursAgo(hours),
  scrips: [scrip],
  about: verdict === "offtopic" || verdict === "stale" ? [] : [scrip],
  verdict,
  category,
  reason,
  also,
});

export const news: NewsItem[] = [
  item(
    101,
    3,
    "NEELTEX",
    "Neel Textiles wins export order worth a fifth of last year's revenue",
    "signal",
    "order",
    "An order this size moves the year's earnings, not just the share price.",
    "BSE",
    "",
    2,
    filing(101),
  ),
  item(102, 5, "NEELTEX", "3 textile stocks to buy before Diwali, says brokerage", "humbug", "market", "A broker's shopping list. Nothing happened at the company.", "Google News"),
  item(
    103,
    7,
    "SUVIDHA",
    "Suvidha Pharma gets regulator's nod for its Baddi plant",
    "signal",
    "regulatory",
    "The plant can now sell what it makes, which it could not last week.",
    "BSE",
    "",
    1,
    filing(103),
  ),
  item(104, 8, "SUVIDHA", "Suvidha Pharma shares jump 6% in early trade", "humbug", "market", "The price moved. Nothing else did.", "Google News"),
  item(
    105,
    11,
    "KIRAN",
    "Kiran Power board to meet on 24 October to consider quarterly results",
    "signal",
    "calendar",
    "Results are a fortnight away. I will read them when they come.",
    "BSE",
    "",
    0,
    filing(105),
  ),
  item(106, 20, "MADHUR", "Madhur Foods closes trading window ahead of results", "routine", "filing", "", "BSE", "Closure of trading window for designated persons.", 0, filing(106)),
  item(
    107,
    26,
    "NEELTEX",
    "Neel Textiles names a new chief financial officer",
    "signal",
    "management",
    "A new hand on the books. Worth watching the next two quarters.",
    "BSE",
    "",
    0,
    filing(107),
  ),
  item(108, 28, "SUVIDHA", "Is Suvidha Pharma the next multibagger? Experts weigh in", "humbug", "market", "A headline written to be clicked, and a question with no answer in it.", "Google News"),
  item(109, 31, "PARVAT", "Parvat Logistics September volumes up 14% on year", "signal", "operations", "Real tonnage, up on last year. That is what pays the bills.", "Google News", "", 3),
  item(110, 34, "PARVAT", "Parvat Logistics share price live: stock trades flat", "humbug", "market", "A live price page. I have the price already.", "Google News"),
  item(111, 46, "MADHUR", "Madhur Foods to raise biscuit prices by 4% from November", "signal", "operations", "A price rise on the main line, which helps margins if volumes hold.", "Google News"),
  item(112, 52, "KIRAN", "Power stocks: what technical charts say for the week ahead", "humbug", "market", "Chart reading. Lines on a picture are not news.", "Google News"),
  item(113, 55, "SUVIDHA", "Suvidha Pharma recalls one batch of a cough syrup in two states", "signal", "regulatory", "A small recall, but the regulator noticed. Watch for more.", "Google News"),
  item(114, 70, "NEELTEX", "Neel Textiles AGM held on 18 September", "stale", "calendar", "The meeting was weeks ago.", "Google News"),
  item(115, 74, "PARVAT", "Parvat trek in winter: a beginner's guide", "offtopic", "other", "A namesake. Not your company.", "Google News"),
  item(116, 80, "KIRAN", "Kiran Power completes commissioning of 120 MW solar park", "signal", "operations", "New capacity running, which earns from this quarter on.", "BSE", "", 1, filing(116)),
  item(117, 98, "MADHUR", "Madhur Foods shares: should you hold or sell?", "humbug", "market", "An opinion dressed as a question.", "Google News"),
  item(118, 104, "SUVIDHA", "Suvidha Pharma board meeting outcome", "unclear", "other", "The headline says a meeting happened, not what it decided.", "Google News"),
  item(119, 122, "PARVAT", "Parvat Logistics allots shares under employee stock option scheme", "routine", "filing", "", "BSE", "Allotment of equity shares under ESOS.", 0, filing(119)),
  item(120, 140, "NEELTEX", "Cotton prices ease as new crop arrives", "unclear", "market", "Cotton is cheaper, but the story does not say what Neel pays.", "Google News"),
  item(
    121,
    2,
    "MADHUR",
    "Madhur Foods signs distribution deal for the Gulf",
    "",
    "",
    "",
    "Google News",
    "Madhur Foods has agreed terms with a Dubai distributor to carry its biscuits across five Gulf markets.",
  ),
];

export const judged: Record<number, { verdict: string; category: string; reason: string }> = {
  121: { verdict: "signal", category: "deal", reason: "A new market for the biscuits. Small for now, but it is real business." },
};

export const categories: SpendCategory[] = [
  { name: "Rent", icon: "home" },
  { name: "Groceries", icon: "shopping_cart" },
  { name: "Food delivery", icon: "fastfood" },
  { name: "Eating out", icon: "restaurant" },
  { name: "Fuel", icon: "local_gas_station" },
  { name: "Electricity", icon: "bolt" },
  { name: "Phone and internet", icon: "wifi" },
  { name: "Subscriptions", icon: "subscriptions" },
  { name: "Medical", icon: "local_pharmacy" },
  { name: "Shopping", icon: "shopping_bag" },
  { name: "Cabs", icon: "local_taxi" },
  { name: "Fitness", icon: "fitness_center" },
  { name: "Car", icon: "directions_car" },
];

export const CARD_HDFC = uid(201);
export const CARD_AXIS = uid(202);
export const CARD_AMEX = uid(203);
export const ACCOUNT = `account:${savingsRow.id}`;

// The statement Ebenezer last saw: the latest one on or before today.
function lastStatement(day: number): string {
  for (let m = 0; ; m++) {
    const d = monthDay(m, day);
    if (d <= today) return d;
  }
}

export const cards: Card[] = [
  {
    id: CARD_HDFC,
    kind: "credit",
    bank: "Peepal Bank",
    name: "Everyday",
    nickname: "Daily card",
    network: "visa",
    color: "#1d2b4f",
    limit: 250000,
    statementDay: 5,
    dueDays: 20,
    interest: 3.6,
    annualFee: 1000,
    statementOn: midnight(lastStatement(5)),
    statementBalance: 38420,
    paid: 0,
    spentBefore: 0,
  },
  {
    id: CARD_AXIS,
    kind: "credit",
    bank: "Kestrel Bank",
    name: "Harvest",
    nickname: "Grocery card",
    network: "mastercard",
    color: "#6b1f2a",
    limit: 120000,
    statementDay: 18,
    dueDays: 18,
    interest: 3.75,
    annualFee: 250,
    statementOn: midnight(lastStatement(18)),
    statementBalance: 14260,
    paid: 14260,
    spentBefore: 0,
  },
  {
    id: CARD_AMEX,
    kind: "charge",
    bank: "Lotus Bank",
    name: "Reserve",
    nickname: "Travel card",
    network: "diners",
    color: "metal",
    limit: null,
    statementDay: 25,
    dueDays: 20,
    interest: null,
    annualFee: 5000,
    statementOn: midnight(lastStatement(25)),
    statementBalance: 21880,
    paid: 0,
    spentBefore: 0,
  },
];

const HDFC = `card:${CARD_HDFC}`;
const AXIS = `card:${CARD_AXIS}`;
const AMEX = `card:${CARD_AMEX}`;

let spendN = 3000;

// Four months of a household: bills on their days, and the everyday spends scattered between them.
function buildSpends(): Spend[] {
  const out: Spend[] = [];
  const add = (day: string, item: string, amount: number, category: string, paidWith: string, asking = false) => {
    if (day > today || daysBetween(day, today) > 125) return;
    out.push({ id: uid(spendN++), day: midnight(day), item, amount, category, paidWith, asking, note: "" });
  };
  const r = rng(42);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  for (let m = 4; m >= 0; m--) {
    add(monthDay(m, 1), "Rent for the flat", 32000, "Rent", ACCOUNT);
    add(monthDay(m, 15), "Electricity bill", [2340, 2610, 2980, 2180, 2440][m], "Electricity", ACCOUNT);
    add(monthDay(m, 18), "Phone bill", 899, "Phone and internet", HDFC);
    add(monthDay(m, 20), "Internet bill", 1179, "Phone and internet", HDFC);
    add(monthDay(m, 22), "Streaming subscription", 649, "Subscriptions", AMEX);
    add(monthDay(m, 25), "Gym membership", 2500, "Fitness", HDFC);
    add(monthDay(m, 3), "Monthly groceries", 6200 + Math.round(r() * 1800), "Groceries", AXIS);
    for (let d = 2; d <= 28; d += 1 + Math.floor(r() * 2)) {
      const day = monthDay(m, d);
      const roll = r();
      if (roll < 0.28) add(day, pick(["Thali delivery", "Noodles delivery", "Pizza delivery", "Biryani delivery"]), 280 + Math.round(r() * 520), "Food delivery", pick([HDFC, HDFC, AMEX]));
      else if (roll < 0.46) add(day, pick(["Vegetables", "Milk and bread", "Fruit", "Kirana store"]), 120 + Math.round(r() * 680), "Groceries", pick([AXIS, AXIS, "cash"]));
      else if (roll < 0.58) add(day, pick(["Cab to office", "Auto home", "Airport cab"]), 140 + Math.round(r() * 460), "Cabs", pick([HDFC, "cash"]));
      else if (roll < 0.68) add(day, "Petrol", 1500 + Math.round(r() * 1500), "Fuel", pick([HDFC, AXIS]));
      else if (roll < 0.78) add(day, pick(["Dinner out", "Coffee with Ravi", "Lunch with the team", "Sunday brunch"]), 350 + Math.round(r() * 1900), "Eating out", pick([AMEX, HDFC]));
      else if (roll < 0.84) add(day, pick(["Pharmacy", "Doctor's visit"]), 260 + Math.round(r() * 1100), "Medical", pick([HDFC, "cash"]));
      else add(day, pick(["Kurta for Diwali", "School shoes", "Bedsheets", "Kitchen things"]), 900 + Math.round(r() * 3600), "Shopping", AMEX);
    }
  }
  // An everyday spend seen once a month would read as a bill still to come, so each gets a second visit that month.
  const bills = new Set(["Rent for the flat", "Electricity bill", "Phone bill", "Internet bill", "Streaming subscription", "Gym membership", "Monthly groceries"]);
  const seen = new Map<string, Spend[]>();
  for (const sp of out) if (!bills.has(sp.item)) seen.set(`${sp.item}|${sp.day.slice(0, 7)}`, [...(seen.get(`${sp.item}|${sp.day.slice(0, 7)}`) ?? []), sp]);
  for (const [, [sp, ...more]] of seen) {
    const day = Number(sp.day.slice(8, 10));
    if (!more.length) add(`${sp.day.slice(0, 8)}${pad(day > 14 ? day - 6 : day + 6)}`, sp.item, Math.round(sp.amount * 0.8), sp.category, sp.paidWith);
  }
  add(dayBack(1), "Pharmacy", 640, "Medical", "", true);
  add(dayBack(2), "Car service", 4850, "Car", "", true);
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

export const spends = buildSpends();

export const spendImports: SpendImport[] = [{ id: uid(401), source: "everyday-card-august.csv", added: 34, skipped: 2, createdAt: at(52, 21, 10) }];

export const imports: Import[] = [
  { id: uid(501), sectionId: STOCKS.id, sectionName: STOCKS.name, source: "tradebook-2021-2026.csv", added: stocks.rows.length, skipped: 0, createdAt: at(41, 20, 12) },
  { id: uid(502), sectionId: FUNDS.id, sectionName: FUNDS.name, source: "CAS statement, September", added: funds.rows.length, skipped: 6, replaced: 4, createdAt: at(38, 9, 40) },
  { id: uid(503), sectionId: GOLD.id, sectionName: GOLD.name, source: "gold.csv", added: gold.rows.length, skipped: 0, createdAt: at(36, 18, 5) },
];

export const templates: Template[] = [
  {
    id: uid(601),
    kind: "stocks",
    name: "Broker tradebook",
    payload: { mapping: { trade_date: "date", symbol: "symbol", isin: "isin", trade_type: "action", quantity: "quantity", price: "price" }, processed: true },
  },
  {
    id: uid(602),
    kind: "expenses",
    name: "Everyday card statement",
    payload: { mapping: { Date: "date", Narration: "item", Amount: "amount" }, processed: false, script: "rows.filter((r) => r.amount > 0)", summary: "Keeps the spends and drops the payments." },
  },
];

const run = (id: number, job: string, back: number, hh: number, mm: number, message: string, facts: [string, string][], portfolioId: string | null = null, seconds = 40): JobRun => {
  const started = at(back, hh, mm);
  return {
    id,
    job,
    portfolioId,
    startedAt: started,
    finishedAt: new Date(Date.parse(started) + seconds * 1000).toISOString(),
    ok: true,
    message,
    facts: facts.map(([label, value]) => ({ label, value })),
    catchUpFor: null,
  };
};

const weekday = now.getDay() === 0 ? 2 : now.getDay() === 6 ? 1 : now.getHours() >= 19 ? 0 : now.getDay() === 1 ? 3 : 1;
const weekend = now.getDay() === 0 ? 0 : now.getDay() === 6 ? (now.getHours() >= 19 ? 0 : 6) : now.getDay();

export const jobs: Job[] = [
  {
    name: "prices",
    label: "Prices",
    description: "BSE and NSE closes, AMFI NAVs, NSE index levels, and gold and silver rates",
    portfolio: false,
    running: false,
    lastRun: run(9001, "prices", weekday, 18, 45, "2,184 closes, 14,206 NAVs, 112 indices", [
      ["NSE closes", "2,184"],
      ["AMFI NAVs", "14,206"],
      ["Indices", "112"],
      ["Gold", `₹${GOLD_PER_GRAM.toLocaleString("en-IN")}/g`],
    ]),
    next: "Weekdays at 18:45",
  },
  {
    name: "benchmark",
    label: "Benchmark history",
    description: "Index closes back to your first investment, for the comparison, and the last month of share closes",
    portfolio: false,
    running: false,
    lastRun: run(9002, "benchmark", weekday, 18, 47, "Nifty 50 up to date", [["Nifty 50", "1,326 closes"]]),
    next: "After prices",
  },
  {
    name: "crypto",
    label: "Crypto prices",
    description: "Coin prices in rupees from CoinGecko; the weekday price run includes them, this one keeps weekends current",
    portfolio: false,
    running: false,
    lastRun: run(9003, "crypto", weekend, 18, 45, "No coins held", []),
    next: "Saturdays and Sundays at 18:45",
  },
  {
    name: "snapshot",
    label: "Net worth snapshot",
    description: "Records today's net worth for the Past chart",
    portfolio: true,
    running: false,
    lastRun: run(9004, "snapshot", weekday, 18, 48, "Net worth ₹48.60 L", [["Net worth", "₹48.60 L"]], PID, 2),
    next: "After prices and crypto",
  },
  {
    name: "news",
    label: "News",
    description: "Fetches and judges news for every scrip you hold",
    portfolio: true,
    running: false,
    lastRun: run(
      9005,
      "news",
      0,
      7,
      0,
      "21 stories, 8 signal",
      [
        ["Stories", "21"],
        ["Signal", "8"],
        ["Humbug", "6"],
      ],
      PID,
      95,
    ),
    next: "Daily at 07:00, 18:30",
  },
  {
    name: "notes",
    label: "Ebenezer's notes",
    description: "Writes my notes on Today and Portfolio, for whatever changed",
    portfolio: true,
    running: false,
    lastRun: run(9006, "notes", 0, 7, 2, "Notes written", [["Model", "anthropic/claude-sonnet-5.5"]], PID, 14),
    next: "After prices, crypto and news",
  },
  {
    name: "report",
    label: "Email report",
    description: "Sends this portfolio's report to the addresses in Settings",
    portfolio: true,
    running: false,
    lastRun: run(9007, "report", 2, 8, 0, "Sent to 1 address", [["To", "asha@example.com"]], PID, 6),
    next: "Mon, Wed, Fri at 08:00",
  },
  {
    name: "health",
    label: "Health check",
    description: "Checks every outside source still answers the way I expect",
    portfolio: false,
    running: false,
    lastRun: run(9008, "health", 0, 9, 0, "All 9 checks pass", []),
    next: "Daily at 09:00",
  },
];

function nextAt(times: string[], days: number[]): string | null {
  for (let d = 0; d <= 7; d++) {
    for (const t of [...times].sort()) {
      const [h, m] = t.split(":").map(Number);
      const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, m);
      if (when > now && days.includes(when.getDay())) return when.toISOString();
    }
  }
  return null;
}

export const schedules: Schedule[] = [
  {
    name: "prices",
    label: "Prices",
    portfolio: false,
    steps: [
      { job: "prices", label: "Exchange and fund prices" },
      { job: "benchmark", label: "Benchmark history" },
      { job: "snapshot", label: "Net worth snapshot" },
      { job: "notes", label: "Ebenezer's notes" },
    ],
    running: false,
    next: "Weekdays at 18:45",
    nextAt: nextAt(["18:45"], [1, 2, 3, 4, 5]),
  },
  {
    name: "crypto",
    label: "Crypto",
    portfolio: false,
    steps: [
      { job: "crypto", label: "Coin prices" },
      { job: "snapshot", label: "Net worth snapshot" },
      { job: "notes", label: "Ebenezer's notes" },
    ],
    running: false,
    next: "Saturdays and Sundays at 18:45",
    nextAt: nextAt(["18:45"], [0, 6]),
  },
  {
    name: "news",
    label: "News",
    portfolio: true,
    steps: [
      { job: "news", label: "Fetch and judge news" },
      { job: "notes", label: "Ebenezer's notes" },
    ],
    running: false,
    next: "Daily at 07:00, 18:30",
    nextAt: nextAt(["07:00", "18:30"], [0, 1, 2, 3, 4, 5, 6]),
  },
  { name: "report", label: "Email report", portfolio: true, steps: [{ job: "report", label: "Email report" }], running: false, next: "Mon, Wed, Fri at 08:00", nextAt: nextAt(["08:00"], [1, 3, 5]) },
  {
    name: "health",
    label: "Health check",
    portfolio: false,
    steps: [{ job: "health", label: "Health check" }],
    running: false,
    next: "Daily at 09:00",
    nextAt: nextAt(["09:00"], [0, 1, 2, 3, 4, 5, 6]),
  },
];

const checkedAt = at(0, 9, 0);
const check = (name: string, detail: string): Check => ({ name, ok: true, detail, failures: 0, at: checkedAt });

export const health = {
  checks: [
    check("NSE bhavcopy", "2,184 quotes"),
    check("BSE bhavcopy", "4,512 quotes"),
    check("NSE indices", "112 indices, Nifty 50 present: true"),
    check("AMFI NAVs", "14,206 NAVs"),
    check("CoinGecko", "bitcoin ₹1,02,64,310"),
    check("Bullion rates", `gold ₹${GOLD_PER_GRAM.toLocaleString("en-IN")}/g, silver ₹${SILVER_PER_GRAM}/g from IBJA`),
    check("Google News", "3 stories for ITC"),
    check("BSE announcements", "3 filings for ITC"),
    check("OpenRouter key", "key accepted"),
  ],
  at: checkedAt,
};

export const instance: InstanceView = {
  settings: {
    pricesTime: "18:45",
    goldPerGram: 0,
    silverPerGram: 0,
    openRouterModel: "anthropic/claude-sonnet-5.5",
    healthTime: "09:00",
    ntfyUrl: "https://ntfy.sh/asha-ebenezer",
    ntfyUser: "",
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpSecurity: "starttls",
    smtpUser: "ebenezer@example.com",
    smtpFrom: "Ebenezer <ebenezer@example.com>",
  },
  metals: { goldPerGram: GOLD_PER_GRAM, silverPerGram: SILVER_PER_GRAM, source: "IBJA", at: at(weekday, 18, 45) },
  secrets: { openrouter_key: { set: true }, ntfy_token: { set: true }, ntfy_password: { set: false }, smtp_password: { set: true } },
  canEdit: true,
};

export const models: Model[] = [
  { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5", context: 1000000, prompt: 3, completion: 15 },
  { id: "anthropic/claude-haiku-5", name: "Anthropic: Claude Haiku 5", context: 200000, prompt: 1, completion: 5 },
  { id: "openai/gpt-5-mini", name: "OpenAI: GPT-5 Mini", context: 400000, prompt: 0.25, completion: 2 },
  { id: "google/gemini-3-flash", name: "Google: Gemini 3 Flash", context: 1000000, prompt: 0.3, completion: 2.5 },
];

export const DEFAULT_INSTRUCTIONS =
  "Look at the whole picture across sections, not just shares. Compare against the benchmark and inflation when it helps. Point out idle cash, money concentrated in one holding or section, and what frequent trading has cost. Be honest when results are poor, and say plainly when they are good.";

const SIGNOFF = "Ebenezer is a sceptical accountant, not a licensed adviser. Check before you act.";

export function todayNote(lines: NoteLine[], sees: string): Note {
  return {
    lead: "Your funds and gold are carrying the house. Your stocks, the biggest part of it, are not.",
    sees,
    lines,
    signoff: SIGNOFF,
  };
}
