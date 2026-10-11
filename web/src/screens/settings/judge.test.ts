import { describe, expect, it } from "vitest";

import { merged, toOverride, toText, type Judge } from "./judge";

const def: Judge = {
  staleAfterDays: 3,
  reasonMaxWords: 14,
  verdicts: { signal: "results and orders", humbug: "price targets", stale: "old" },
  extraRules: ["Use only what is given."],
  routineFilings: ["trading window", "esop"],
};

describe("judge text", () => {
  it("saves nothing when nothing changed", () => {
    expect(toOverride(def, toText(def))).toBeNull();
  });

  it("saves only what differs, and keeps the other verdicts", () => {
    const t = { ...toText(def), humbug: "price targets and tips", rules: "Use only what is given.\nIgnore crypto." };
    const o = toOverride(def, t);
    expect(o).toEqual({ verdicts: { humbug: "price targets and tips" }, extraRules: ["Use only what is given.", "Ignore crypto."] });
    expect(merged(def, o).verdicts.stale).toBe("old");
  });

  it("refuses nonsense numbers", () => {
    expect(typeof toOverride(def, { ...toText(def), staleDays: "0" })).toBe("string");
  });
});
