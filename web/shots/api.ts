import type {
  Account,
  Card,
  CardState,
  ChatResult,
  ExpenseOverview,
  Expenses,
  InstanceSettings,
  Job,
  Method,
  NewsItem,
  Note,
  NoteLine,
  PaidResult,
  Portfolio,
  ScripView,
  Section,
  SectionResult,
  Spend,
  Status,
  Summary,
  User,
} from "../src/lib/api";
import { money, nameCase, pct, plainPct, short } from "../src/lib/format";
import * as F from "./fixtures";

const DEMO = "This is a demo, so I keep nothing. Run me yourself to do that.";

class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const refuse = (): never => {
  throw new Refusal(400, DEMO);
};

const state = {
  portfolio: structuredClone(F.portfolio) as Portfolio,
  instance: structuredClone(F.instance),
  spends: structuredClone(F.spends),
  categories: structuredClone(F.categories),
  cards: structuredClone(F.cards),
  news: structuredClone(F.news) as NewsItem[],
  jobs: structuredClone(F.jobs) as Job[],
  members: new Set(F.users.map((u) => u.id)),
};

const SECTIONS = [F.STOCKS, F.FUNDS, F.GOLD, F.SAVINGS, F.DEPOSITS, F.LOANS];
const ROWS = { [F.STOCKS.id]: F.stocks.rows, [F.FUNDS.id]: F.funds.rows, [F.GOLD.id]: F.gold.rows, [F.SAVINGS.id]: [F.savingsRow], [F.DEPOSITS.id]: [F.depositRow], [F.LOANS.id]: [F.loanRow] };
const HOLDINGS = { [F.STOCKS.id]: F.stocks.holdings, [F.FUNDS.id]: F.funds.holdings };
const rupees = (n: number) => money(n);
const dayOf = (s: string) => s.slice(0, 10);
const utc = (day: string) => new Date(`${dayOf(day)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().replace(".000Z", "Z");
const days = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000);
const dm = (d: string) => utc(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function sections(): Section[] {
  const last = (id: string) => F.imports.find((i) => i.sectionId === id)?.createdAt ?? null;
  return SECTIONS.map((s) => ({ ...s, rows: ROWS[s.id].length, holdings: HOLDINGS[s.id]?.length ?? 0, lastImport: last(s.id) }));
}

function account(): Account {
  const d = F.savingsRow.data;
  const asOf = String(d.as_of);
  const spent = state.spends.filter((s) => s.paidWith === F.ACCOUNT && dayOf(s.day) > asOf).reduce((t, s) => t + s.amount, 0);
  return { key: F.ACCOUNT, name: String(d.account), set: Number(d.balance), asOf: F.midnight(asOf), spent, balance: Number(d.balance) - spent };
}

function results(): SectionResult[] {
  const sum = (ps: { value: number; invested: number }[]) => ps.reduce((t, p) => ({ value: t.value + p.value, invested: t.invested + p.invested }), { value: 0, invested: 0 });
  const of = (s: Section, positions: SectionResult["positions"], returns = F.RETURNS.none): SectionResult => ({ sectionId: s.id, ...sum(positions), positions, unpriced: 0, returns });
  const acc = account();
  const loan = Number(F.loanRow.data.outstanding);
  return [
    of(F.STOCKS, F.stocks.positions, F.RETURNS.stocks),
    of(F.FUNDS, F.funds.positions, F.RETURNS.funds),
    of(F.GOLD, F.gold.positions, F.RETURNS.gold),
    of(F.SAVINGS, [{ key: F.savingsRow.id, name: acc.name, value: acc.balance, invested: acc.balance, xirr: null, days: 0, price: null }]),
    of(F.DEPOSITS, [{ key: F.depositRow.id, name: "SBI FD 0042", value: F.depositValue, invested: 92000, xirr: 0.071, days: 340, price: null }], F.RETURNS.deposits),
    { ...of(F.LOANS, [{ key: F.loanRow.id, name: String(F.loanRow.data.lender), value: -loan, invested: 0, xirr: null, days: 0, price: null }]), invested: 0 },
  ];
}

function totals() {
  const rs = results();
  const assets = rs.filter((r) => r.value > 0).reduce((t, r) => t + r.value, 0);
  const liabilities = -rs.filter((r) => r.value < 0).reduce((t, r) => t + r.value, 0);
  const invested = rs.reduce((t, r) => t + r.invested, 0);
  return { rs, assets, liabilities, invested, netWorth: assets - liabilities };
}

const position = (isin: string) => [...F.stocks.positions, ...F.funds.positions].find((p) => p.isin === isin)!;

function ledgerHead(t: ReturnType<typeof totals>): string[] {
  const r = (x: typeof F.RETURNS.wealth) => `${pct(x.xirr)} a year, against ${pct(x.benchmark)} for the same money in Nifty 50, over ${x.days} days`;
  return [
    `Portfolio "Family", today ${dm(F.today)} ${F.today.slice(0, 4)}.`,
    `Prices from ${dm(F.pricedOn)} ${F.pricedOn.slice(0, 4)}.`,
    `Net worth ${short(t.netWorth)}: owned ${short(t.assets)}, owed ${short(t.liabilities)}, put in ${short(t.invested)}.`,
    "Inflation assumed 5.5% a year.",
    `Wealth XIRR (every dated rupee): ${r(F.RETURNS.wealth)}.`,
    `Stocks XIRR: ${r(F.RETURNS.stocks)}.`,
  ];
}

function ledgerSection(s: Section, r: SectionResult): string[] {
  const out = [""];
  if (s.valuation === "liability") out.push(`Section "${s.name}" (${s.kind}, money owed): ${short(-r.value)} outstanding.`);
  else if (s.valuation === "balance") out.push(`Section "${s.name}" (${s.kind}, bank balances that earn only their interest; no yearly return applies): ${short(r.value)} held.`);
  else
    out.push(
      `Section "${s.name}" (${s.kind}): value ${short(r.value)}, put in ${short(r.invested)}, XIRR ${pct(r.returns.xirr)} a year${r.returns.benchmark !== null ? `, against ${pct(r.returns.benchmark)} for the same money in Nifty 50` : ""}.`,
    );
  for (const p of [...r.positions].sort((a, b) => b.value - a.value))
    out.push(`  - ${nameCase(p.name)}: ${short(Math.abs(p.value))}${p.invested > 0 && s.valuation !== "balance" ? `, put in ${short(p.invested)}, XIRR ${pct(p.xirr)}` : ""}.`);
  return out;
}

function ledgerText(): string {
  const t = totals();
  const lines = ledgerHead(t);
  sections().forEach((s, i) => lines.push(...ledgerSection(s, t.rs[i])));
  lines.push("", "News judged signal in the last three days:");
  for (const n of state.news.filter((x) => x.verdict === "signal").slice(0, 6)) lines.push(`  - ${n.scrips.join(", ")}: ${n.title}. ${n.reason}`);
  lines.push("", "Spending and cards:", facts(expenses()));
  return lines.join("\n");
}

function summary(): Summary {
  const t = totals();
  const list = sections();
  const share = (v: number) => plainPct(v / t.assets, 0);
  const stocks = t.rs[0];
  const funds = t.rs[1];
  const gold = t.rs[2];
  const savings = t.rs[3];
  const e = expenses();
  const due = e.cards.filter((c) => c.unpaid > 0).sort((a, b) => a.due.localeCompare(b.due))[0];
  const top = [...stocks.positions].sort((a, b) => b.value - a.value)[0];
  const growth = (p: SectionResult["positions"][number]) => (p.value - p.invested) / p.invested;
  const byGrowth = (r: SectionResult) => [...r.positions].sort((a, b) => growth(b) - growth(a));
  const sees = (i: number) => [...ledgerHead(t), ...ledgerSection(list[i], t.rs[i])].join("\n");
  const lines: NoteLine[] = [
    {
      icon: "trending_down",
      text: `Your stocks earn ${pct(F.RETURNS.stocks.xirr)} a year against ${pct(F.RETURNS.stocks.benchmark)} in the Nifty 50. Suvidha Pharma does most of the damage.`,
      section: F.STOCKS.id,
    },
    { icon: "diamond", text: `Gold is ${pct((gold.value - gold.invested) / gold.invested, 0)} above what you paid, the best of anything you own.`, section: F.GOLD.id },
  ];
  if (due) lines.push({ icon: "credit_card", text: `Your ${due.name} bill of ${rupees(due.unpaid)} is due on ${dm(due.due)}.` });
  return {
    protection: null,
    unknown: 0,
    netWorth: t.netWorth,
    assets: t.assets,
    liabilities: t.liabilities,
    invested: t.invested,
    wealth: F.RETURNS.wealth,
    stocks: F.RETURNS.stocks,
    sections: t.rs,
    sectionList: list,
    pricedOn: F.midnight(F.pricedOn),
    benchmark: "Nifty 50",
    cardsOwed: e.cards.reduce((s, c) => s + c.owed, 0),
    note: F.todayNote(lines, [...ledgerHead(t), ...list.flatMap((s, i) => ledgerSection(s, t.rs[i]))].join("\n")),
    tabNotes: {
      overview: {
        lines: [
          { icon: "trending_up", text: `Bullion is doing the most work at ${pct(F.RETURNS.gold.xirr)} a year.`, section: F.GOLD.id },
          { icon: "trending_down", text: `Stocks are doing the least at ${pct(F.RETURNS.stocks.xirr)} a year.`, section: F.STOCKS.id },
          { icon: "pie_chart", text: `Your biggest holding, ${top.name}, is ${plainPct(top.value / t.assets, 1)} of what you own.`, section: F.STOCKS.id },
          { icon: "savings", text: `${share(savings.value)} of what you own sits in savings, losing 5.5% a year to inflation.` },
        ],
        sees: [...ledgerHead(t), ...list.flatMap((s, i) => ledgerSection(s, t.rs[i]))].join("\n"),
      },
      [F.STOCKS.id]: {
        lines: [
          { icon: "category", text: `Textiles is the biggest at ${plainPct(top.value / stocks.value, 0)}, across 5 sectors.` },
          {
            icon: "stacked_bar_chart",
            text: `Your top three make up ${plainPct(
              [...stocks.positions]
                .sort((a, b) => b.value - a.value)
                .slice(0, 3)
                .reduce((s, p) => s + p.value, 0) / stocks.value,
              0,
            )}.`,
          },
          { icon: "trending_up", text: `${byGrowth(stocks)[0].name} has grown most, ${pct(growth(byGrowth(stocks)[0]))}.` },
          { icon: "trending_down", text: `${byGrowth(stocks).at(-1)!.name} is down ${pct(growth(byGrowth(stocks).at(-1)!))}. It was bought near its top.` },
        ],
        sees: sees(0),
      },
      [F.FUNDS.id]: {
        lines: [
          { icon: "pie_chart", text: `${byGrowth(funds).sort((a, b) => b.value - a.value)[0].name} is ${plainPct(F.funds.positions[0].value / funds.value, 0)} of your mutual funds.` },
          { icon: "trending_up", text: `${byGrowth(funds)[0].name} has grown most, ${pct(growth(byGrowth(funds)[0]))}.` },
          {
            icon: "compare_arrows",
            text: `Together they trail the Nifty 50 by ${((F.RETURNS.funds.benchmark! - F.RETURNS.funds.xirr!) * 100).toFixed(1)} points a year. The index fund among them cannot help it; it pays its fees.`,
          },
        ],
        sees: sees(1),
      },
      [F.GOLD.id]: {
        lines: [
          { icon: "pie_chart", text: `The wedding bangles are ${plainPct(F.gold.positions[1].value / gold.value, 0)} of your bullion.` },
          { icon: "trending_up", text: `The 24K coins have grown most, ${pct(growth(F.gold.positions[0]))}.` },
        ],
        sees: sees(2),
      },
      [F.SAVINGS.id]: { lines: [{ icon: "savings", text: `${short(savings.value)} sits here at 3% while prices rise at 5.5%. Keep what you need for three months and no more.` }], sees: sees(3) },
      [F.DEPOSITS.id]: { lines: [], quiet: "Nothing here needs you.", sees: sees(4) },
      [F.LOANS.id]: { lines: [{ icon: "request_quote", text: `The car loan costs 9.1% a year, more than your deposit earns. It is the dearest money you hold.` }], sees: sees(5) },
    },
    notesPending: false,
  };
}

function nextStatement(after: Date, day: number): Date {
  const at = (y: number, m: number) => new Date(Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  const s = at(after.getUTCFullYear(), after.getUTCMonth());
  return s > after ? s : at(after.getUTCFullYear(), after.getUTCMonth() + 1);
}

// A port of app.StateOf: a statement Ebenezer did not see is assumed unpaid, so it carries into the next.
function stateOf(c: Card, spends: Spend[], today: Date): CardState {
  const key = `card:${c.id}`;
  const statementOn = utc(c.statementOn);
  let last = statementOn;
  let billed = c.statementBalance;
  let paidOff = c.paid;
  let peak = statementOn.getUTCFullYear() === today.getUTCFullYear() ? c.statementBalance : 0;
  const mine = spends.filter((s) => s.paidWith === key && utc(s.day) > statementOn);
  let cycle = c.spentBefore;
  for (let s = nextStatement(statementOn, c.statementDay); s <= today; s = nextStatement(s, c.statementDay)) {
    for (const sp of mine) if (utc(sp.day) > last && utc(sp.day) <= s) cycle += sp.amount;
    billed = Math.max(0, billed - paidOff) + cycle;
    paidOff = 0;
    last = s;
    cycle = 0;
    if (s.getUTCFullYear() === today.getUTCFullYear()) peak = Math.max(peak, billed);
  }
  let count = 0;
  for (const sp of mine)
    if (utc(sp.day) > last) {
      cycle += sp.amount;
      count++;
    }
  const unpaid = Math.max(0, billed - paidOff);
  const due = new Date(last.getTime() + c.dueDays * 86_400_000);
  return { ...c, lastStatement: iso(last), nextStatement: iso(nextStatement(last, c.statementDay)), due: iso(due), billed, paidOff, cycle, owed: unpaid + cycle, unpaid, peak, spends: count };
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

const billKey = (item: string) =>
  item
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
const monthStart = (d: Date, back = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
const monthName = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

// A port of app.overview, so the hero's figures follow the same rules as the real one.
function overview(spends: Spend[], cards: CardState[], today: Date): ExpenseOverview {
  const thisM = monthStart(today);
  const last = monthStart(today, 1);
  const lastCut = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(today.getUTCDate(), new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate())));
  const o: ExpenseOverview = { month: monthName(thisM), lastMonth: monthName(last), total: 0, count: 0, through: null, lastSoFar: 0, usual: 0, billsToCome: 0, bills: [], onCards: 0 };
  const months = new Map<number, number>();
  const seen = new Map<string, Map<number, number[]>>();
  const now = new Set<string>();
  for (const sp of spends) {
    const d = utc(sp.day);
    const m = monthStart(d).getTime();
    if (d >= thisM && d <= today) {
      o.total += sp.amount;
      o.count++;
      if (!o.through || sp.day > o.through) o.through = sp.day;
      now.add(billKey(sp.item));
    } else if (d >= last && d <= lastCut) o.lastSoFar += sp.amount;
    if (m < thisM.getTime() && m >= monthStart(today, 6).getTime()) months.set(m, (months.get(m) ?? 0) + sp.amount);
    if (m < thisM.getTime() && m >= monthStart(today, 3).getTime() && sp.amount > 0) {
      const k = billKey(sp.item);
      if (!seen.has(k)) seen.set(k, new Map());
      const byMonth = seen.get(k)!;
      byMonth.set(m, [...(byMonth.get(m) ?? []), sp.amount]);
    }
  }
  o.usual = median([...months.values()]);
  for (const [k, byMonth] of seen) {
    if (byMonth.size < 2 || now.has(k) || !k) continue;
    const amounts = [...byMonth.values()];
    if (amounts.some((xs) => xs.length !== 1)) continue;
    o.billsToCome += median(amounts.map((xs) => xs[0]));
    o.bills.push(k);
  }
  o.bills.sort();
  o.onCards = cards.reduce((t, c) => t + c.cycle, 0);
  return o;
}

function soonestClosing(cards: CardState[], within: number): CardState | undefined {
  return cards.filter((c) => days(F.today, c.nextStatement) <= within && c.cycle > 0).sort((a, b) => a.nextStatement.localeCompare(b.nextStatement))[0];
}

const closingLine = (c: CardState) =>
  `${c.name}'s statement closes ${inDays(days(F.today, c.nextStatement))} at ${rupees(c.cycle)}${c.limit ? `, with ${plainPct(c.owed / c.limit, 0)} of its limit used.` : "."}`;

function expenseNote(e: Omit<Expenses, "note" | "cardNote">): Note {
  const n: Note = { lead: "", lines: [], signoff: "" };
  const add = (icon: string, text: string, section = "") => n.lines.push({ icon, text, ...(section ? { section } : {}) });
  const today = utc(F.today);
  const thisM = monthStart(today);
  const last = monthStart(today, 1);
  const cut = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), today.getUTCDate()));
  const now = new Map<string, number>();
  const before = new Map<string, number>();
  const items = new Map<string, Map<string, number>>();
  for (const sp of e.spends) {
    const d = utc(sp.day);
    if (d >= thisM && d <= today) {
      now.set(sp.category, (now.get(sp.category) ?? 0) + sp.amount);
      if (!items.has(sp.category)) items.set(sp.category, new Map());
      const m = items.get(sp.category)!;
      m.set(billKey(sp.item), (m.get(billKey(sp.item)) ?? 0) + 1);
    } else if (d >= last && d <= cut) before.set(sp.category, (before.get(sp.category) ?? 0) + sp.amount);
  }
  let lead = "";
  let leadCat = "";
  let best = 0;
  for (const [c, v] of now) {
    const b = before.get(c) ?? 0;
    if (c && b > 0 && v - b > best && v - b > 0.1 * b) {
      best = v - b;
      leadCat = c;
      lead = `${c} is up ${rupees(v - b)} on ${e.overview.lastMonth}, and is now ${plainPct(v / Math.max(1, e.overview.total), 0)} of everything you spend.`;
    }
  }
  if (!lead)
    for (const [c, v] of now)
      if (c && v > best) {
        best = v;
        leadCat = c;
        lead = `${c} is your biggest spend this month at ${rupees(v)}, ${plainPct(v / Math.max(1, e.overview.total), 0)} of everything.`;
      }
  if (lead) {
    add("trending_up", lead, `category:${leadCat}`);
    const [top, count] = [...(items.get(leadCat) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ["", 0];
    if (count >= 3) add("receipt_long", `Most of it is ${top}, ${count} times this month.`);
  }
  const asking = e.spends.filter((s) => s.asking).length;
  if (asking) add("help", `${plural(asking, "spend", "spends")} still ${asking === 1 ? "needs" : "need"} how you paid. Tap the chip in the ledger to say.`, "asking");
  const closing = soonestClosing(e.cards, 7);
  if (closing) add("credit_card", closingLine(closing), `card:${closing.id}`);
  for (const acc of e.accounts) if (acc.spent > 0) add("account_balance", `${acc.name} is at ${short(acc.balance)} after the spends since you set it.`);
  if (n.lines.length < 3 && e.overview.bills.length) add("event_repeat", `Still to come this month, going by the last three: ${e.overview.bills.join(", ")}, about ${rupees(e.overview.billsToCome)}.`);
  n.sees = facts(e);
  return n;
}

function cardNote(e: Omit<Expenses, "note" | "cardNote">): Note {
  const n: Note = { lead: "", lines: [], signoff: "" };
  const add = (icon: string, text: string, section = "") => n.lines.push({ icon, text, ...(section ? { section } : {}) });
  let due: CardState | undefined;
  let dues = 0;
  for (const c of e.cards) {
    if (c.unpaid <= 0) continue;
    if (F.today > dayOf(c.due)) {
      add("schedule", `${c.name}'s ${rupees(c.unpaid)} was due on ${dm(c.due)}. Mark it paid once it is.`, `card:${c.id}`);
      continue;
    }
    dues += c.unpaid;
    if (!due || c.unpaid > due.unpaid) due = c;
  }
  if (due)
    n.lines.unshift({
      icon: "event",
      text: `${due.name}'s ${rupees(due.unpaid)} is due${due.kind === "charge" ? " in full" : ""} on ${dm(due.due)}, ${inDays(days(F.today, due.due))}.`,
      section: `card:${due.id}`,
    });
  const closing = soonestClosing(e.cards, 7);
  if (closing) add("event_upcoming", closingLine(closing), `card:${closing.id}`);
  const saved = e.accounts.reduce((t, a) => t + a.balance, 0);
  if (dues > 0) add("savings", saved >= dues ? `Your savings, ${short(saved)}, cover every card bill now due.` : `Card bills due come to ${short(dues)}, more than the ${short(saved)} in savings.`);
  if (!n.lines.length) n.lead = "Nothing is due on your cards right now.";
  if (n.lines.length < 4) add("task_alt", "Mark a bill paid once you have paid it, and the next statement starts clean.");
  n.sees = facts(e);
  return n;
}

function facts(e: Omit<Expenses, "note" | "cardNote">): string {
  const o = e.overview;
  const today = utc(F.today);
  const lines = [
    `Today is ${today.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.`,
    `${o.month} so far: ${rupees(o.total)} across ${o.count} spends. ${o.lastMonth} to the same day: ${rupees(o.lastSoFar)}. A usual month: ${rupees(o.usual)}.`,
    "By category, this month and all of last month:",
  ];
  const byCat = new Map<string, [number, number]>();
  for (const sp of e.spends) {
    const d = utc(sp.day);
    const v = byCat.get(sp.category) ?? [0, 0];
    if (d >= monthStart(today)) v[0] += sp.amount;
    else if (d >= monthStart(today, 1)) v[1] += sp.amount;
    byCat.set(sp.category, v);
  }
  for (const [c, v] of [...byCat].sort((a, b) => b[1][0] - a[1][0])) if (v[0] || v[1]) lines.push(`- ${c || "No category"}: ${rupees(v[0])}, last month ${rupees(v[1])}`);
  for (const c of e.cards)
    lines.push(
      `Card ${c.name} (${c.bank}): last statement ${dm(c.lastStatement)} for ${rupees(c.billed)}, ${rupees(c.unpaid)} unpaid, due ${dm(c.due)}; this cycle ${rupees(c.cycle)}; statement closes ${dm(c.nextStatement)}; ${c.limit !== null ? `limit ${rupees(c.limit)}, ${rupees(c.limit - c.owed)} left` : "no preset limit"}.`,
    );
  for (const a of e.accounts) lines.push(`Account ${a.name}: ${rupees(a.balance)} now, after ${rupees(a.spent)} spent since it was set.`);
  return lines.join("\n");
}

const ICONS = [
  "restaurant",
  "local_cafe",
  "fastfood",
  "shopping_cart",
  "local_taxi",
  "directions_car",
  "local_gas_station",
  "flight",
  "train",
  "hotel",
  "bolt",
  "water_drop",
  "wifi",
  "smartphone",
  "home",
  "chair",
  "cleaning_services",
  "shopping_bag",
  "checkroom",
  "medical_services",
  "local_pharmacy",
  "fitness_center",
  "spa",
  "school",
  "menu_book",
  "movie",
  "sports_esports",
  "music_note",
  "pets",
  "child_care",
  "redeem",
  "volunteer_activism",
  "receipt_long",
  "subscriptions",
  "build",
  "local_laundry_service",
  "content_cut",
  "celebration",
  "account_balance",
  "category",
];

function expenses(): Expenses {
  const today = utc(F.today);
  const cards = state.cards.map((c) => stateOf(c, state.spends, today));
  const accounts = [account()];
  const methods: Method[] = [
    ...state.cards.map((c) => ({ key: `card:${c.id}`, name: c.name, kind: "card" as const, also: c.nickname })),
    ...accounts.map((a) => ({ key: a.key, name: a.name, kind: "account" as const })),
    { key: "cash", name: "Cash", kind: "cash" },
  ];
  const base = {
    spends: [...state.spends].sort((a, b) => b.day.localeCompare(a.day)),
    categories: state.categories,
    methods,
    cards,
    accounts,
    overview: overview(state.spends, cards, today),
    imports: F.spendImports,
    icons: ICONS,
  };
  return { ...base, note: expenseNote(base), cardNote: cardNote(base) };
}

function effects(e: Expenses, saved: Spend[]): string[] {
  const out: string[] = [];
  for (const key of new Set(saved.map((s) => s.paidWith).filter(Boolean))) {
    const c = e.cards.find((x) => `card:${x.id}` === key);
    if (c) out.push(`${c.name}'s statement closes ${inDays(days(F.today, c.nextStatement))} at ${rupees(c.cycle)} so far`);
    const a = e.accounts.find((x) => x.key === key);
    if (a) out.push(`${a.name} is now ${rupees(a.balance)}`);
  }
  return out;
}

let spendN = 8000;
const newId = () => `6e6b0d3c-5a1f-4c2e-9b7d-${String(spendN++).padStart(12, "0")}`;

const GUESS: [RegExp, string][] = [
  [/swiggy|zomato|deliver|takeaway|pizza|biryani/, "Food delivery"],
  [/lunch|dinner|breakfast|brunch|restaurant|cafe|coffee|tea|snack|chai/, "Eating out"],
  [/petrol|diesel|fuel|cng/, "Fuel"],
  [/grocer|vegetable|veggies|milk|bread|fruit|kirana|supermarket/, "Groceries"],
  [/electric|power bill/, "Electricity"],
  [/phone|mobile|internet|wifi|broadband|recharge/, "Phone and internet"],
  [/uber|ola|cab|taxi|auto|metro/, "Cabs"],
  [/medicine|pharmacy|doctor|chemist|clinic/, "Medical"],
  [/netflix|spotify|prime|subscription|streaming/, "Subscriptions"],
  [/rent/, "Rent"],
  [/gym|yoga/, "Fitness"],
  [/shirt|shoes|kurta|clothes|amazon|shopping/, "Shopping"],
];

const STOP = new Set(["on", "for", "with", "from", "via", "using", "by", "paid", "spent", "spend", "rs", "inr", "rupees", "at", "i", "the", "a", "my", "today", "yesterday"]);

function method(e: Expenses, words: string): string {
  const w = words.toLowerCase();
  if (/\bcash\b/.test(w)) return "cash";
  for (const c of state.cards) if ([c.name, c.nickname, c.bank, c.bank.split(" ")[0]].some((n) => n && new RegExp(`\\b${n.toLowerCase()}\\b`).test(w))) return `card:${c.id}`;
  for (const a of e.accounts) if (w.includes(a.name.toLowerCase()) || /\b(savings|account|bank|upi)\b/.test(w)) return a.key;
  return "";
}

// A canned stand-in for the model: an amount, what it was for, and how it was paid if the words say.
function parseSpend(e: Expenses, text: string): Spend | null {
  const m = text.match(/(?:₹|rs\.?\s*|inr\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  if (!amount || amount >= 1e8) return null;
  const rest = text.replace(m[0], " ").replace(/[₹?.!]/g, " ");
  const tail = rest.match(/\b(?:with|on|from|via|using|by|through)\s+(.+)$/i);
  let paidWith = "";
  let words = rest;
  for (const t of tail ? [tail[0], ...tail[0].split(/\s+(?=on |with |from |via |using |by )/i)] : []) {
    const key = method(e, t);
    if (key) {
      paidWith = key;
      words = rest.replace(t, " ");
      break;
    }
  }
  const item = words
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()))
    .join(" ")
    .trim();
  if (!item) return null;
  const category = GUESS.find(([re]) => re.test(item.toLowerCase()))?.[1] ?? "";
  const label = item.charAt(0).toUpperCase() + item.slice(1);
  const yesterday = /\byesterday\b/i.test(text);
  return { id: newId(), day: F.midnight(yesterday ? F.dayBack(1) : F.today), item: label, amount, category, paidWith, asking: !paidWith, note: "" };
}

function answerSpendQuestion(e: Expenses, q: string): string {
  const t = q.toLowerCase();
  const month = e.spends.filter((s) => dayOf(s.day) >= `${F.today.slice(0, 7)}-01`);
  const card = state.cards.find((c) => t.includes(c.name.toLowerCase()) || t.includes(c.nickname.toLowerCase()));
  if (card && /left|limit|owe|due/.test(t)) {
    const c = e.cards.find((x) => x.id === card.id)!;
    if (c.limit === null) return `${c.name} has no preset limit. You owe ${rupees(c.owed)} on it, and the statement closes ${inDays(days(F.today, c.nextStatement))}.`;
    return `${c.name} has ${rupees(c.limit - c.owed)} left of its ${rupees(c.limit)} limit. You owe ${rupees(c.owed)} on it, ${rupees(c.cycle)} of that this cycle.`;
  }
  const cat = /food|eat/.test(t) ? ["Food delivery", "Eating out", "Groceries"] : e.categories.filter((c) => t.includes(c.name.toLowerCase())).map((c) => c.name);
  if (cat.length && /month/.test(t)) {
    const parts = cat.map((c) => [c, month.filter((s) => s.category === c).reduce((x, s) => x + s.amount, 0)] as const);
    const total = parts.reduce((x, [, v]) => x + v, 0);
    return `${rupees(total)} so far in ${e.overview.month}: ${parts.map(([c, v]) => `${c.toLowerCase()} ${rupees(v)}`).join(", ")}. ${parts.length > 1 ? "Delivery is the part you could do something about." : ""}`.trim();
  }
  if (/last week|this week|7 days/.test(t)) {
    const week = e.spends.filter((s) => days(s.day, F.today) <= 7 && days(s.day, F.today) >= 0);
    const total = week.reduce((x, s) => x + s.amount, 0);
    const big = [...week].sort((a, b) => b.amount - a.amount)[0];
    return `${rupees(total)} across ${week.length} spends in the last seven days${big ? `. The biggest was ${big.item.toLowerCase()}, ${rupees(big.amount)}` : ""}.`;
  }
  if (/this month|so far|total/.test(t)) return `${rupees(e.overview.total)} so far in ${e.overview.month}, across ${e.overview.count} spends. A usual month is ${rupees(e.overview.usual)}.`;
  return "In this demo I can only add up the sample ledger. Ask what went on food this month, what is left on a card, or what you spent last week.";
}

function spendChat(message: string): ChatResult {
  const before = expenses();
  const text = message.trim();
  if (/\?\s*$/.test(text) || /^(how|what|when|where|which|did|show|tell)\b/i.test(text)) {
    return { reply: answerSpendQuestion(before, text), saved: [], effects: [], asking: [], newCategories: [], offerTidy: false, expenses: before };
  }
  const saved = text
    .split(/\s+and\s+|;|\n/i)
    .map((part) => parseSpend(before, part))
    .filter((s): s is Spend => s !== null);
  if (!saved.length) {
    return {
      reply: "I couldn't find an amount and a thing to put it against. Say it the way you would to a friend, like 450 on lunch, and I'll write it down.",
      saved: [],
      effects: [],
      asking: [],
      newCategories: [],
      offerTidy: false,
      expenses: before,
    };
  }
  state.spends.push(...saved);
  const after = expenses();
  return { reply: "", saved, effects: effects(after, saved), asking: saved.filter((s) => s.asking).map((s) => s.id), newCategories: [], offerTidy: false, expenses: after };
}

const STARTERS = ["Is HODL working for me?", "Where am I losing to the index?", "How much is sitting idle?", "What does my debt cost me?"];
const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim();

function answer(question: string): { answer: string; followUps: string[]; redacted: boolean } {
  const e = expenses();
  const ups = (q: string) => STARTERS.filter((s) => s !== q).slice(0, 3);
  const w = F.SCRIPS.find((s) => s.symbol === "KIRAN")!;
  const [, sold, at] = w.sells![0];
  const suvidha = position("INE0SVP01027");
  const madhur = position("INE0MDF01013");
  const acc = account();
  const usual = e.overview.usual;
  const loan = Number(F.loanRow.data.outstanding);
  const unpaid = e.cards.reduce((s, c) => s + c.unpaid, 0);
  const answers: Record<string, string> = {
    [STARTERS[0]]: `Mostly. In five years you have sold once: ${sold} Kiran Power shares at ${money(at)} each. They would fetch ${money(sold * w.price)} today, so that sale left about ${money(sold * (w.price - at))} on the table.\n\nEverything else you bought, you still hold, and the stocks earn ${pct(F.RETURNS.stocks.xirr)} a year. Holding is not what costs you here. Choosing is: Suvidha Pharma was bought near its top and is ${pct((suvidha.value - suvidha.invested) / suvidha.invested)} on what you paid.`,
    [STARTERS[1]]: `In your stocks. The same money put into the Nifty 50 on the same days would have earned **${pct(F.RETURNS.stocks.benchmark)} a year**; yours earned ${pct(F.RETURNS.stocks.xirr)}.\n\nTwo holdings do most of the damage. Suvidha Pharma, bought in 2024, is ${pct((suvidha.value - suvidha.invested) / suvidha.invested)}, and Madhur Foods has gone nowhere since 2022, ${pct((madhur.value - madhur.invested) / madhur.invested)} in all. Your funds trail the index by a little, ${((F.RETURNS.funds.benchmark! - F.RETURNS.funds.xirr!) * 100).toFixed(1)} points a year. Your gold is the one thing well ahead of it.`,
    [STARTERS[2]]: `**${short(acc.balance)}** sits in your Peepal savings account at 3%, while prices rise at 5.5%. That costs you about ${money(acc.balance * 0.025)} a year in what it buys.\n\nA usual month costs you ${short(usual)}, so three months' cover is about ${short(usual * 3)}. ${acc.balance > usual * 3 ? `The ${short(acc.balance - usual * 3)} above that is idle by habit, not by need.` : "You keep less than that, so none of it is idle; if anything, the buffer is thin."} The fixed deposit, ${short(F.depositValue)} at 7.1%, at least keeps ahead of inflation.`,
    [STARTERS[3]]: `Your car loan of **${short(loan)}** at 9.1% costs about ${money(loan * 0.091)} a year in interest. It is the only loan you have, and the dearest money in the books.\n\nYour card bills, ${money(unpaid)} unpaid on the last statements, cost nothing if you pay them in full by the due date. Carry them over and the banks charge about 3.6% a month, which is over 40% a year. Pay those first, always.`,
  };
  const key = STARTERS.find((s) => plain(s) === plain(question));
  if (key) return { answer: answers[key], followUps: ups(key), redacted: false };
  return {
    answer: "This demo holds only a sample ledger, so I can answer only the questions it suggests. Run me on your own books and ask me anything.",
    followUps: STARTERS.slice(0, 3),
    redacted: false,
  };
}

function scrip(isin: string): ScripView {
  const h = [...F.stocks.holdings, ...F.funds.holdings].find((x) => x.isin === isin);
  if (!h) throw new Refusal(404, "no such scrip");
  const sec = F.securities[isin];
  const codes = [sec.symbol.toUpperCase(), sec.bseCode].filter(Boolean);
  const trades = F.stocks.trades[isin] ?? F.funds.trades[isin] ?? [];
  return { security: sec, history: F.histories[isin], holding: h, news: state.news.filter((n) => [...n.about, ...n.scrips].some((c) => codes.includes(c.toUpperCase()))), trades };
}

function judge(id: number): NewsItem {
  const n = state.news.find((x) => x.id === id);
  if (!n) throw new Refusal(404, "no such story");
  Object.assign(n, F.judged[id] ?? { verdict: "unclear", category: "other", reason: "The headline says something happened, not what." });
  return n;
}

function cardPaid(id: string): Expenses {
  const today = utc(F.today);
  const c = state.cards.find((x) => x.id === id);
  if (!c) throw new Refusal(404, "no such card");
  const st = stateOf(c, state.spends, today);
  if (st.lastStatement !== c.statementOn) c.spentBefore = 0;
  Object.assign(c, { statementOn: st.lastStatement, statementBalance: st.billed, paid: st.billed });
  return expenses();
}

function paid(id: string, key: string): PaidResult {
  const sp = state.spends.find((s) => s.id === id);
  if (!sp) throw new Refusal(404, "no such spend");
  if (!expenses().methods.some((m) => m.key === key)) throw new Refusal(400, "choose one of your cards or accounts, or cash");
  Object.assign(sp, { paidWith: key, asking: false });
  const after = expenses();
  return { saved: `${sp.item}, ${rupees(sp.amount)} on ${after.methods.find((m) => m.key === key)!.name}`, effects: effects(after, [sp]), expenses: after };
}

interface SpendBody {
  day: string;
  item: string;
  amount: number;
  category: string;
  paidWith: string;
  note: string;
}

function spendFrom(b: SpendBody, id: string): Spend {
  if (!b.day || b.day > F.today) throw new Refusal(400, "give a date up to today");
  if (!b.item?.trim()) throw new Refusal(400, "say what it was in up to 120 characters, and a category of up to 40");
  if (!b.amount || !Number.isFinite(b.amount)) throw new Refusal(400, "give an amount; a refund is negative");
  const category = b.category.trim();
  if (category && !state.categories.some((c) => c.name.toLowerCase() === category.toLowerCase())) state.categories.push({ name: category, icon: "category" });
  return { id, day: F.midnight(b.day), item: b.item.trim(), amount: b.amount, category, paidWith: b.paidWith, asking: false, note: b.note?.trim() ?? "" };
}

function ranJob(name: string) {
  const j = state.jobs.find((x) => x.name === name);
  if (!j) throw new Refusal(404, "no such job");
  if (name === "report") refuse();
  if (j.lastRun) {
    const at = new Date();
    j.lastRun = { ...j.lastRun, id: j.lastRun.id + 100, startedAt: at.toISOString(), finishedAt: new Date(at.getTime() + 1500).toISOString(), catchUpFor: null };
  }
  return { started: true };
}

type Body = Record<string, unknown>;
type Handler = (p: Record<string, string>, body: Body, query: URLSearchParams) => unknown;

const routes: [string, string, Handler][] = [
  ["GET", "/status", (): Status => ({ needsSetup: false, user: F.user, timeZone: "Asia/Kolkata" })],
  ["POST", "/login", (): User => F.user],
  ["POST", "/logout", () => ({ ok: true })],
  ["POST", "/setup", refuse],
  ["PUT", "/me/password", refuse],
  ["GET", "/users", () => F.users],
  ["POST", "/users", refuse],
  ["DELETE", "/users/:id", refuse],
  ["POST", "/users/:id/invite", refuse],
  ["GET", "/kinds", () => F.catalogue],
  ["GET", "/securities", () => []],
  ["GET", "/settings", () => state.instance],
  ["PUT", "/settings", (_, b) => (state.instance.settings = { ...state.instance.settings, ...(b as Partial<InstanceSettings>) })],
  ["PUT", "/settings/secrets/:name", refuse],
  ["POST", "/settings/ntfy-test", refuse],
  ["POST", "/settings/smtp-test", refuse],
  ["POST", "/settings/ai-test", refuse],
  ["GET", "/settings/models", () => F.models],
  ["GET", "/checks", () => ({ health: F.health, running: false })],
  ["GET", "/judge/default", () => F.judgeDefault],
  ["GET", "/export", refuse],
  ["GET", "/portfolios", () => [state.portfolio]],
  ["POST", "/portfolios", refuse],
  ["GET", "/portfolios/:pid", () => state.portfolio],
  [
    "PATCH",
    "/portfolios/:pid",
    (_, b) => {
      const { settings, palette, ...rest } = b as Partial<Portfolio> & { palette?: Record<string, string> };
      Object.assign(state.portfolio, rest);
      if (settings) state.portfolio.settings = { ...settings, moves: state.portfolio.settings.moves, palette: state.portfolio.settings.palette };
      if (palette) state.portfolio.settings.palette = palette;
      return state.portfolio;
    },
  ],
  ["DELETE", "/portfolios/:pid", refuse],
  ["GET", "/portfolios/:pid/summary", summary],
  ["GET", "/portfolios/:pid/snapshots", () => F.snapshots(totals().netWorth, totals().invested)],
  ["GET", "/portfolios/:pid/positions", refuse],
  ["PUT", "/portfolios/:pid/moves", refuse],
  ["GET", "/portfolios/:pid/report", refuse],
  ["GET", "/portfolios/:pid/ledger", () => ({ ledger: ledgerText(), defaultInstructions: F.DEFAULT_INSTRUCTIONS })],
  ["POST", "/portfolios/:pid/ask", (_, b) => answer(String(b.question ?? ""))],
  ["GET", "/portfolios/:pid/members", () => F.users.filter((u) => state.members.has(u.id))],
  ["PUT", "/portfolios/:pid/members/:uid", (p) => (state.members.add(p.uid), { ok: true })],
  [
    "DELETE",
    "/portfolios/:pid/members/:uid",
    (p) => {
      if (p.uid === F.ASHA) throw new Refusal(400, "the owner always sees every portfolio they are on");
      state.members.delete(p.uid);
      return { ok: true };
    },
  ],
  ["POST", "/portfolios/:pid/invite", refuse],
  ["GET", "/portfolios/:pid/sections", sections],
  ["POST", "/portfolios/:pid/sections", refuse],
  ["GET", "/portfolios/:pid/imports", () => F.imports],
  ["GET", "/portfolios/:pid/templates", () => F.templates],
  ["PUT", "/portfolios/:pid/templates", refuse],
  ["DELETE", "/portfolios/:pid/templates/:id", refuse],
  ["GET", "/portfolios/:pid/news", () => [...state.news].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))],
  ["POST", "/portfolios/:pid/news/:id/judge", (p) => judge(Number(p.id))],
  ["GET", "/portfolios/:pid/scrips/:isin", (p) => scrip(p.isin)],
  ["POST", "/portfolios/:pid/scrips/:isin/news", () => ({ added: 0, checked: true })],
  ["GET", "/portfolios/:pid/jobs", () => state.jobs],
  ["POST", "/portfolios/:pid/jobs/:job", (p) => ranJob(p.job)],
  [
    "DELETE",
    "/portfolios/:pid/jobs/:job",
    (p) => {
      throw new Refusal(409, `${state.jobs.find((j) => j.name === p.job)?.label.toLowerCase() ?? "that job"} isn't running`);
    },
  ],
  ["GET", "/portfolios/:pid/schedules", () => F.schedules],
  [
    "POST",
    "/portfolios/:pid/schedules/:name",
    (p) => {
      const s = F.schedules.find((x) => x.name === p.name);
      if (!s) throw new Refusal(404, "no such schedule");
      s.steps.forEach((st) => ranJob(st.job));
      return { started: true };
    },
  ],
  [
    "DELETE",
    "/portfolios/:pid/schedules/:name",
    (p) => {
      throw new Refusal(409, `${F.schedules.find((s) => s.name === p.name)?.label.toLowerCase() ?? "that schedule"} isn't running`);
    },
  ],
  ["POST", "/portfolios/:pid/tidy", refuse],
  ["GET", "/portfolios/:pid/expenses", expenses],
  ["POST", "/portfolios/:pid/expenses/chat", (_, b) => spendChat(String(b.message ?? ""))],
  [
    "POST",
    "/portfolios/:pid/spends",
    (_, b) => {
      state.spends.push(spendFrom(b as unknown as SpendBody, newId()));
      return expenses();
    },
  ],
  [
    "PUT",
    "/portfolios/:pid/spends/:id",
    (p, b) => {
      const i = state.spends.findIndex((s) => s.id === p.id);
      if (i < 0) throw new Refusal(404, "no such spend");
      state.spends[i] = spendFrom(b as unknown as SpendBody, p.id);
      return expenses();
    },
  ],
  ["PUT", "/portfolios/:pid/spends/:id/paid", (p, b) => paid(p.id, String(b.paidWith ?? ""))],
  [
    "POST",
    "/portfolios/:pid/spends/undo",
    (_, b) => {
      const ids = new Set((b.ids as string[]) ?? []);
      state.spends = state.spends.filter((s) => !ids.has(s.id));
      return expenses();
    },
  ],
  ["POST", "/portfolios/:pid/spends/import", refuse],
  ["DELETE", "/portfolios/:pid/spend-imports/:id", refuse],
  ["POST", "/portfolios/:pid/categories/tidy", refuse],
  ["POST", "/portfolios/:pid/categories/apply", refuse],
  ["POST", "/portfolios/:pid/categories/edit", refuse],
  ["POST", "/portfolios/:pid/categories/remove", refuse],
  ["POST", "/portfolios/:pid/cards", refuse],
  ["POST", "/portfolios/:pid/cards/import", refuse],
  ["POST", "/portfolios/:pid/cards/terms", refuse],
  ["PUT", "/portfolios/:pid/cards/:id", refuse],
  ["DELETE", "/portfolios/:pid/cards/:id", refuse],
  ["POST", "/portfolios/:pid/cards/:id/paid", (p) => cardPaid(p.id)],
  ["PATCH", "/sections/:sid", refuse],
  ["DELETE", "/sections/:sid", refuse],
  ["GET", "/sections/:sid/rows", (p) => ROWS[p.sid] ?? []],
  ["POST", "/sections/:sid/rows", refuse],
  ["PUT", "/sections/:sid/rows/:rid", refuse],
  ["DELETE", "/sections/:sid/rows/:rid", refuse],
  ["GET", "/sections/:sid/holdings", (p) => HOLDINGS[p.sid] ?? []],
  ["POST", "/sections/:sid/import", refuse],
];

function route(method: string, path: string): [Handler, Record<string, string>] | null {
  const parts = path.split("/").filter(Boolean);
  for (const [m, pattern, h] of routes) {
    if (m !== method) continue;
    const want = pattern.split("/").filter(Boolean);
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (want.every((w, i) => (w.startsWith(":") ? ((params[w.slice(1)] = decodeURIComponent(parts[i])), true) : w === parts[i]))) return [h, params];
  }
  return null;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Answers /api from memory, so the demo never reaches a server and forgets everything on reload.
export function installDemoApi() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return real(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.pathname.slice(4);
    const found = route(method, path);
    const slow = /\/(ask|expenses\/chat)$/.test(path);
    await pause(slow ? 900 + Math.random() * 600 : 60 + Math.random() * 120);
    if (!found) return json(404, { error: "no such endpoint" });
    try {
      const body = typeof init?.body === "string" && init.body ? (JSON.parse(init.body) as Body) : {};
      const out = found[0](found[1], body, url.searchParams);
      return json(method === "POST" && /\/(jobs|schedules)\//.test(path) ? 202 : 200, out);
    } catch (e) {
      if (e instanceof Refusal) return json(e.status, { error: e.message });
      console.warn("demo api", method, path, e);
      return json(500, { error: "something went wrong on the server" });
    }
  };
}
