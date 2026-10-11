import { describe, expect, it } from "vitest";

import type { Line, Page } from "./cas";
import { dematDate, depositoryOf, parseDepository, period, readRow } from "./depository";

const page = (...texts: string[]): Page => texts.map((text, i): Line => ({ text, baseline: 800 - i * 12, glyphs: [] }));

describe("detection and dates", () => {
  it("tells NSDL from CDSL", () => {
    expect(depositoryOf("NSDL Consolidated Account Statement")).toBe("NSDL");
    expect(depositoryOf("Read more About NSDL on the web")).toBe("NSDL");
    expect(depositoryOf("Central Depository Services (India) Limited")).toBe("CDSL");
    expect(depositoryOf("Consolidated Account Statement CAMSCASWS")).toBeNull();
  });

  it("reads named and numbered months", () => {
    expect(dematDate("30-Sep-2026")).toBe("2026-09-30");
    expect(dematDate("30-09-2026")).toBe("2026-09-30");
    expect(dematDate("30-13-2026")).toBeNull();
    expect(period("Statement for the period from 01-Sep-2026 to 30-09-2026")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
});

describe("readRow", () => {
  it("does not mistake small unrelated numbers for a holding", () => {
    expect(readRow("SOME BOND SERIES 1 2 3")).toBeNull();
  });

  it("reads an NSDL equity row past the face value", () => {
    expect(readRow("FAKECO LIMITED EQUITY 10.00 50 1,500.00 75,000.00")).toEqual({ name: "FAKECO LIMITED EQUITY", quantity: 50, price: 1500, value: 75000, cost: null });
  });

  it("reads a CDSL row with eleven numbers", () => {
    const r = readRow("TESTCO LTD 20 0 0 0 20 0 0 0 0 250.50 5,010.00");
    expect(r).toMatchObject({ name: "TESTCO LTD", quantity: 20, price: 250.5, value: 5010 });
  });

  it("finds the cost on a folio row", () => {
    const r = readRow("UCC123 Pretend Flexi Cap Fund Direct Growth 100.000 50.0000 5,000.00 60.0000 6,000.00 1,000.00 20.00");
    expect(r).toMatchObject({ quantity: 100, price: 60, value: 6000, cost: 5000 });
  });

  it("refuses a row whose numbers do not multiply out", () => {
    expect(readRow("NOTHING HERE 10 20 30")).toBeNull();
  });
});

describe("parseDepository", () => {
  const st = parseDepository(
    [
      page(
        "NSDL Consolidated Account Statement",
        "for the period from 01-Sep-2026 to 30-Sep-2026",
        "INE000A01010 MADE UP LTD 99 1 2",
        "NSDL demat account",
        "INE000A01010 MADE UP LTD 1.00 10 100.00 1,000.00",
        "INF000Z01019 PRETEND LIQUID ETF 4 1,000.00 4,000.00",
        "IN0000000014 SGB 2030 SERIES I 5 6,000.00 30,000.00",
        "INE999X01016 SUSPENDED CO 1.00 7 - -",
      ),
      page(
        "CDSL demat account",
        "INE000A01010 MADE UP LTD 5 0 0 0 5 0 0 0 0 100.00 500.00",
        "Mutual Fund Folios (F)",
        "INF111Y01012",
        "UCC9 Imaginary Bond Fund Regular Growth 12345678",
        "40.000 25.0000 1,000.00 30.0000 1,200.00 200.00 20.00",
      ),
    ],
    "NSDL",
  );

  it("reads the period and starts at the holdings", () => {
    expect(st.to).toBe("2026-09-30");
    expect(st.from).toBe("2026-09-01");
  });

  it("sums an ISIN across accounts and sorts holdings into kinds", () => {
    const by = Object.fromEntries(st.holdings.map((h) => [h.isin, h]));
    expect(by.INE000A01010).toMatchObject({ kind: "stocks", quantity: 15, value: 1500, price: 100 });
    expect(by.INF000Z01019).toMatchObject({ kind: "funds", quantity: 4, price: 1000 });
    expect(by.IN0000000014).toMatchObject({ kind: "bonds", quantity: 5 });
    expect(by.INF111Y01012).toMatchObject({ kind: "funds", quantity: 40, price: 30, value: 1200, cost: 1000, name: "UCC9 Imaginary Bond Fund Regular Growth" });
  });

  it("warns about rows it could not read", () => {
    expect(st.holdings.find((h) => h.isin === "INE999X01016")).toBeUndefined();
    expect(st.warnings).toEqual(["1 line starting with an ISIN couldn't be read as a holding, so I left it out."]);
  });
});
