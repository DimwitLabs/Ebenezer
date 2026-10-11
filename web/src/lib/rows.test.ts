import { describe, expect, it } from "vitest";

import { check, preview } from "./rows";

describe("preview", () => {
  it("reads only whole sell words as sells", () => {
    const rows = ["Buy", "SIP", "Split", "Switch in", "Bonus"].map((action) => ({ symbol: "ITC", action, quantity: "10", price: "1" }));
    expect(preview("stocks", [...rows, { symbol: "ITC", action: "Sell", quantity: "20", price: "1" }])[0].quantity).toBe(30);
  });

  it("treats bracketed units and switch-outs as money going out", () => {
    const rows = [
      { scheme: "Fund", action: "Purchase", units: "100", amount: "1000" },
      { scheme: "Fund", action: "Transfer", units: "(12.5)", amount: "125" },
      { scheme: "Fund", action: "Switch-Out", units: "7.5", amount: "75" },
    ];
    expect(preview("funds", rows)[0].quantity).toBe(80);
  });

  it("flags a date that has the shape of one but does not exist", () => {
    const date = [{ key: "date", label: "Date", type: "date" as const, required: true }];
    expect(check([{ date: "2024-13-40" }], date)[0].problems).toEqual(["Date is not a date"]);
    expect(check([{ date: "2024-02-30" }], date)[0].problems).toEqual(["Date is not a date"]);
    expect(check([{ date: "2024-02-29" }, { date: "18/06/2024" }, { date: "2024-06-18 00:00:00" }, { date: "12 Apr 2023" }], date).every((c) => c.problems.length === 0)).toBe(true);
  });
});
