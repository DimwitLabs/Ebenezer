import { describe, expect, it } from "vitest";

import { classify, cleanSchemeName, parseStatement, toFundRows, type Line } from "./cas";

const CHAR = 5;

// Each run is placed at x and spread one glyph per character, the way pdf.js positions text.
function line(baseline: number, ...runs: [number, string][]): Line {
  const glyphs = runs.flatMap(([x, s]) => [...s].map((ch, i) => ({ text: ch, x0: x + i * CHAR, x1: x + (i + 1) * CHAR - 0.5, h: 8 })));
  const text = runs.map(([, s]) => s).join(" ");
  return { glyphs: glyphs.filter((g) => g.text !== " "), baseline, text };
}

const right = (edge: number, s: string): [number, string] => [edge - s.length * CHAR, s];

const AMOUNT = 330;
const UNITS = 400;
const PRICE = 460;
const BALANCE = 540;

function page(): Line[] {
  let y = 800;
  const next = () => (y -= 14);
  return [
    line(next(), [40, "Consolidated Account Statement"]),
    line(next(), [40, "01-Apr-2024 To 30-Sep-2026"]),
    line((y -= 24), [40, "Date"], [110, "Transaction"], [AMOUNT - 30, "Amount"], [UNITS - 25, "Units"], [PRICE - 25, "Price"], [BALANCE - 20, "Unit"]),
    line(y - 8, [AMOUNT - 25, "(INR)"], [PRICE - 25, "(INR)"], [BALANCE - 35, "Balance"]),
    line(next() - 8, [40, "PPFAS Mutual Fund"]),
    line(next(), [40, "Folio No: 12345678 / 90"], [200, "PAN: ABCDE1234F"], [320, "KYC: OK"]),
    line(next(), [40, "PP001ZG-Parag Parikh Flexi Cap Fund - Direct Plan Growth - ISIN: INF879O01027"]),
    line(next(), [40, "(Advisor: DIRECT) Registrar : CAMS"]),
    line(next(), [40, "Opening Unit Balance: 0.000"]),
    line(next(), [40, "10-Apr-2024"], [110, "Systematic Investment"], right(AMOUNT, "10,000.00"), right(UNITS, "140.000"), right(PRICE, "71.4286"), right(BALANCE, "140.000")),
    line((y -= 9), [110, "Purchase - Instalment 1/60"]),
    line(next(), [40, "10-Apr-2024"], [110, "*** Stamp Duty ***"], right(AMOUNT, "0.50")),
    line(next(), [40, "10-May-2024"], [110, "Purchase"], right(AMOUNT, "20,000.00"), right(UNITS, "260.000"), right(PRICE, "76.9231"), right(BALANCE, "400.000")),
    line(next(), [40, "02-Jun-2025"], [110, "Redemption"], right(AMOUNT, "(8,000.00)"), right(UNITS, "(100.000)"), right(PRICE, "80.0000"), right(BALANCE, "300.000")),
    line(next(), [40, "Closing Unit Balance: 300.000"], [260, "NAV on 30-Sep-2026: INR 88.7620"]),
    line(next(), [40, "Total Cost Value: 22,500.00"], [260, "Market Value on 30-Sep-2026: INR 26,628.60"]),
  ];
}

describe("parseStatement", () => {
  const st = parseStatement([page()]);
  const s = st.folios[0]?.schemes[0];

  it("reads the period, folio and scheme heading", () => {
    expect(st.from).toBe("2024-04-01");
    expect(st.to).toBe("2026-09-30");
    expect(st.folios).toHaveLength(1);
    expect(st.folios[0].folio).toBe("12345678 / 90");
    expect(st.folios[0].pan).toBe("ABCDE1234F");
    expect(st.folios[0].amc).toBe("PPFAS Mutual Fund");
    expect(s.name).toBe("Parag Parikh Flexi Cap Fund - Direct Plan Growth");
    expect(s.isin).toBe("INF879O01027");
    expect(s.rta).toBe("CAMS");
    expect(s.advisor).toBe("DIRECT");
  });

  it("reads transactions by column, joining wrapped descriptions", () => {
    expect(s.transactions.map((t) => [t.date, t.type, t.amount, t.units, t.balance])).toEqual([
      ["2024-04-10", "sip", 10000, 140, 140],
      ["2024-04-10", "stamp", 0.5, null, null],
      ["2024-05-10", "purchase", 20000, 260, 400],
      ["2025-06-02", "redemption", -8000, -100, 300],
    ]);
    expect(s.transactions[0].description).toBe("Systematic Investment Purchase - Instalment 1/60");
  });

  it("reads the footer and finds the balances reconcile", () => {
    expect(s.close).toBe(300);
    expect(s.nav).toBe(88.762);
    expect(s.value).toBe(26628.6);
    expect(s.cost).toBe(22500);
    expect(st.warnings).toEqual([]);
  });

  it("turns the statement into fund rows without the tax lines", () => {
    const rows = toFundRows(st);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({
      date: "2025-06-02",
      scheme: "Parag Parikh Flexi Cap Fund - Direct Plan Growth",
      folio: "12345678 / 90",
      action: "Redemption",
      units: "-100",
      isin: "INF879O01027",
      amount: "8000",
      nav: "80",
    });
  });

  it("warns when a row is missing", () => {
    const p = page().filter((l) => !l.text.startsWith("10-May-2024"));
    const w = parseStatement([p]).warnings;
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]).toContain("A row may be missing");
  });
});

describe("classify", () => {
  it("separates switches, reversals and dividends", () => {
    expect(classify("Switch In - From Liquid Fund", 10)).toBe("switch_in");
    expect(classify("S T P Out (Liquid)", -10)).toBe("switch_out");
    expect(classify("Purchase Reversal - Payment not received", -10)).toBe("reversal");
    expect(classify("IDCW Reinvestment @ Rs.1.20 per unit", 2)).toBe("dividend_reinvest");
    expect(classify("STT Paid", null)).toBe("stt");
  });

  it("cleans scheme names", () => {
    expect(cleanSchemeName("HDFC Mid Cap Fund (formerly HDFC Mid-Cap Opportunities) - Growth -")).toBe("HDFC Mid Cap Fund - Growth");
    expect(cleanSchemeName("Axis Bluechip (Demat) Direct")).toBe("Axis Bluechip");
  });
});
