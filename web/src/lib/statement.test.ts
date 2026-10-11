import { describe, expect, it } from "vitest";

import type { HeldOn } from "./api";
import type { Statement } from "./cas";
import type { DematStatement } from "./depository";
import { reviewCams, reviewDemat } from "./statement";

const held = (kind: string, isin: string, quantity: number, cost = 0): HeldOn => ({ sectionId: kind, kind, key: isin, isin, name: `Held ${isin}`, quantity, cost });

const cams: Statement = {
  from: "2026-04-01",
  to: "2026-09-30",
  warnings: [],
  folios: [
    {
      folio: "111",
      amc: "Pretend MF",
      pan: "",
      schemes: [
        {
          name: "Pretend Flexi Cap Fund",
          code: "P1",
          isin: "INF000A01011",
          rta: "CAMS",
          advisor: null,
          open: 0,
          close: 30,
          nav: 10,
          value: 300,
          valuedOn: "2026-09-30",
          cost: 300,
          transactions: [
            { date: "2026-05-01", description: "Purchase", amount: 100, units: 10, nav: 10, balance: 10, type: "purchase" },
            { date: "2026-06-01", description: "Purchase", amount: 200, units: 20, nav: 10, balance: 30, type: "purchase" },
          ],
        },
        {
          name: "Pretend Liquid Fund",
          code: "P2",
          isin: "INF000B01012",
          rta: "CAMS",
          advisor: null,
          open: 5,
          close: 5,
          nav: 1000,
          value: 5000,
          valuedOn: "2026-09-30",
          cost: 5000,
          transactions: [],
        },
      ],
    },
  ],
};

describe("reviewCams", () => {
  it("adds only the transactions Ebenezer lacks", () => {
    const items = reviewCams(cams, [held("funds", "INF000A01011", 10), held("funds", "INF000B01012", 5)], [{ date: "2026-05-01", scheme: "Pretend Flexi Cap Fund", units: "10.000", action: "Purchase" }]);
    expect(items[0]).toMatchObject({ status: "adds", label: "Adds 1 transaction", on: true });
    expect(items[0].rows).toHaveLength(1);
    expect(items[0].rows[0].date).toBe("2026-06-01");
    expect(items[1]).toMatchObject({ status: "match", label: "Matches", rows: [] });
  });

  it("says when the totals still disagree after adding", () => {
    const items = reviewCams(cams, [], []);
    expect(items[0].status).toBe("adds");
    expect(items[1]).toMatchObject({ status: "differs", label: "Differs by 5 units" });
  });
});

const demat: DematStatement = {
  depository: "NSDL",
  from: "2026-09-01",
  to: "2026-09-30",
  warnings: [],
  holdings: [
    { isin: "INE000A01010", name: "MADE UP", kind: "stocks", quantity: 10, price: 100, value: 1000, cost: null },
    { isin: "INE000B01018", name: "ALSO MADE UP", kind: "stocks", quantity: 4, price: 50, value: 200, cost: null },
    { isin: "INF000Z01019", name: "PRETEND ETF", kind: "funds", quantity: 3, price: 20, value: 60, cost: null },
    { isin: "INE000C01016", name: "THIRD", kind: "stocks", quantity: 7, price: 10, value: 70, cost: null },
  ],
};

describe("reviewDemat", () => {
  const { items, unchecked } = reviewDemat(demat, [
    held("stocks", "INE000A01010", 10),
    held("stocks", "INE000B01018", 6),
    held("stocks", "INF000Z01019", 3),
    held("stocks", "INE000D01014", 2, 300),
    { ...held("stocks", "", 1), isin: "" },
  ]);
  const by = Object.fromEntries(items.map((i) => [i.isin, i]));

  it("matches by ISIN in whichever section holds it", () => {
    expect(by.INE000A01010).toMatchObject({ status: "match", on: false });
    expect(by.INF000Z01019).toMatchObject({ status: "match", kind: "stocks" });
  });

  it("offers an unchecked adjustment for a difference", () => {
    expect(by.INE000B01018).toMatchObject({ status: "differs", label: "Differs: statement 4, Ebenezer 6", on: false });
    expect(by.INE000B01018.rows).toEqual([{ date: "2026-09-30", isin: "INE000B01018", action: "Sell", quantity: "2", price: "50" }]);
  });

  it("offers a checked opening position for what is missing", () => {
    expect(by.INE000C01016).toMatchObject({ status: "missing", on: true });
    expect(by.INE000C01016.rows).toEqual([{ date: "2026-09-30", isin: "INE000C01016", action: "Buy", quantity: "7", price: "10" }]);
  });

  it("flags holdings the statement does not have", () => {
    expect(by.INE000D01014).toMatchObject({ status: "absent", on: false });
    expect(by.INE000D01014.rows[0]).toMatchObject({ action: "Sell", quantity: "2", price: "150" });
    expect(unchecked).toBe(1);
  });
});
