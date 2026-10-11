import { describe, expect, it } from "vitest";

import type { Field } from "./api";
import { applyMapping, guessMapping, parseCSV } from "./csv";

describe("parseCSV", () => {
  it("reads quoted cells with commas and doubled quotes", () => {
    const t = parseCSV('Date,Stock,Qty\n2025-01-02,"ITC, Ltd",10\n2025-01-03,"Say ""hi""",5\n');
    expect(t.headers).toEqual(["Date", "Stock", "Qty"]);
    expect(t.rows).toEqual([
      ["2025-01-02", "ITC, Ltd", "10"],
      ["2025-01-03", 'Say "hi"', "5"],
    ]);
  });

  it("detects tabs from a spreadsheet paste and skips blank lines", () => {
    const t = parseCSV("Date\tSymbol\r\n\r\n2025-01-02\tITC\r\n");
    expect(t.rows).toEqual([["2025-01-02", "ITC"]]);
  });
});

describe("guessMapping", () => {
  const fields: Field[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "symbol", label: "Symbol", type: "text" },
    { key: "action", label: "Action", type: "choice" },
    { key: "quantity", label: "Quantity", type: "number" },
    { key: "price", label: "Price", type: "money" },
  ];

  it("maps broker headers to fields without reusing a column", () => {
    const m = guessMapping(["Trade Date", "Stock Symbol", "Buy/Sell", "Qty", "Trade Price", "Order ID"], fields);
    expect(m).toEqual({ date: "Trade Date", symbol: "Stock Symbol", action: "Buy/Sell", quantity: "Qty", price: "Trade Price" });
  });

  it("applies the mapping", () => {
    const rows = applyMapping({ headers: ["Qty", "Ticker"], rows: [["3", "TCS"]] }, { quantity: "Qty", symbol: "Ticker" });
    expect(rows).toEqual([{ quantity: "3", symbol: "TCS" }]);
  });
});
