import type { Returns } from "../lib/api";
import { pct, realReturn, tone } from "../lib/format";
import Amount from "../design-system/Amount";
import type { HeroPill } from "../design-system/Hero";
import { Stats } from "../design-system/Stat";

export function returnsLine(r: Returns, benchmark: string, minDays: number): string {
  if (!r.days) return "No dated money yet, so no XIRR.";
  if (!r.eligible) return `XIRR shows after ${minDays} days. It has been ${r.days}.`;
  return `XIRR ${pct(r.xirr)} · ${pct(realReturn(r.xirr, r.inflation))} after ${r.inflation}% inflation · ${pct(r.benchmark)} in ${benchmark}`;
}

export function gainPill(gain: number, invested: number): HeroPill | undefined {
  if (invested <= 0) return undefined;
  return {
    icon: gain < 0 ? "south_east" : "north_east",
    bad: gain < 0,
    text: (
      <>
        <Amount n={gain} sign /> · {pct(gain / invested)}
      </>
    ),
  };
}

export default function ReturnsLine({ r, benchmark, minDays, label = "XIRR" }: { r: Returns; benchmark: string; minDays: number; label?: string }) {
  if (r.days === 0) return <p className="help">No dated money in yet, so there is no XIRR.</p>;
  if (!r.eligible) {
    return (
      <p className="help">
        XIRR shows once money has been in for {minDays} days. It has been {r.days}. Short spells make annual rates swing wildly.
      </p>
    );
  }
  const real = realReturn(r.xirr, r.inflation);
  return (
    <Stats
      look="mini"
      items={[
        { label, value: pct(r.xirr), tone: tone(r.xirr) },
        { label: `Same money in ${benchmark}`, value: pct(r.benchmark) },
        { label: `After ${r.inflation}% inflation`, value: pct(real), tone: tone(real) },
      ]}
    />
  );
}
