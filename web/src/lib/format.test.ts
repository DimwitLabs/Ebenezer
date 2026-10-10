import { describe, expect, it } from "vitest";

import { money, pct, sentence, short, signed, toNumber } from "./format";

describe("money", () => {
  it("shows a loss in brackets", () => {
    expect(money(-1234)).toBe("(₹1,234)");
    expect(money(123456)).toBe("₹1,23,456");
    expect(short(-480000)).toBe("(₹4.80\u202FL)");
    expect(signed(-4847)).toBe("(₹4,847)");
    expect(signed(4847)).toBe("+₹4,847");
    expect(pct(-0.371)).toBe("(37.1%)");
    expect(pct(0.02)).toBe("+2.0%");
  });

  it("never shows a negative zero", () => {
    expect(money(-0)).toBe("₹0");
    expect(money(-0.4)).toBe("₹0");
    expect(pct(-0.0001)).toBe("0.0%");
  });
});

describe("sentence", () => {
  it("capitalises and closes a message", () => {
    expect(sentence(" no key set ")).toBe("No key set.");
    expect(sentence("Done?")).toBe("Done?");
    expect(sentence("  ")).toBe("");
  });
});

describe("toNumber", () => {
  it("refuses blanks and junk", () => {
    expect(toNumber("6.5")).toBe(6.5);
    expect(toNumber(" ")).toBeNull();
    expect(toNumber("abc")).toBeNull();
  });
});
