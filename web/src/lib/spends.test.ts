import { describe, expect, it } from "vitest";

import type { Spend } from "./api";
import { biggest, pointsAt, trend } from "./spends";

const sp = (day: string, amount: number, category: string, item = "x"): Spend => ({ id: `${day}${amount}${item}`, day, item, amount, category, paidWith: "", asking: false, note: "" });

const spends = [
  sp("2026-10-10", 200, "Cabs"),
  sp("2026-10-03", 220, "Cabs"),
  sp("2026-09-28", 180, "Cabs"),
  sp("2026-09-20", 210, "Cabs"),
  sp("2026-10-01", 2400, "Bills", "Electricity"),
  sp("2026-10-05", -300, "Cabs"),
  sp("2026-07-01", 999, "Old"),
];

describe("trend", () => {
  it("sorts categories by how often and how big against the median", () => {
    const ps = pointsAt(spends, "2026-10-11", 215);
    expect(ps.find((p) => p.name === "Cabs")).toMatchObject({ n: 4, q: "so" });
    expect(ps.find((p) => p.name === "Bills")).toMatchObject({ n: 1, q: "br" });
    expect(ps.find((p) => p.name === "Old")).toBeUndefined();
  });

  it("uses the median of the range's spends and steps back a week at a time", () => {
    const t = trend(spends, 90, "2026-10-11");
    expect(t.big).toBe(210);
    expect(t.frames.at(-1)?.end).toBe("2026-10-11");
    expect(t.frames.at(-2)?.end).toBe("2026-10-04");
    expect(t.frames.length).toBeLessThanOrEqual(60);
  });

  it("names the biggest spends in the window", () => {
    expect(biggest(spends, "2026-10-11", null, 1)[0].item).toBe("Electricity");
  });
});
