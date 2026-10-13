import { pct } from "../lib/format";
import Chart, { token } from "../design-system/Chart";
import { CardHead } from "../design-system/CardHead";

// ECharts writes a custom tooltip as HTML, and a section's name is whatever its owner typed.
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface Rated {
  name: string;
  xirr: number;
  benchmark: number | null;
}

// One bar per section: its XIRR minus the same money in the index, so a section behind reads as behind even when both returns are positive.
export default function AgainstIndex({ rows, benchmark, className = "card s12" }: { rows: Rated[]; benchmark: string; className?: string }) {
  const gaps = rows.map((r) => (r.benchmark === null ? null : +((r.xirr - r.benchmark) * 100).toFixed(1)));
  const reach = Math.max(5, Math.ceil(Math.max(...gaps.map((g) => Math.abs(g ?? 0))) / 5) * 5 + 5);
  const both = (r: Rated) => (r.benchmark === null ? `${pct(r.xirr)}, no index history that far back` : `${pct(r.xirr)} vs ${pct(r.benchmark)}`);
  return (
    <div className={className}>
      <CardHead title={`Each section against ${benchmark}`} />
      <Chart
        height={Math.max(160, 40 + rows.length * 52)}
        deps={[JSON.stringify(rows), benchmark]}
        option={() => ({
          grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (ps: { dataIndex: number }[]) => {
              const r = rows[ps[0].dataIndex];
              const g = gaps[ps[0].dataIndex];
              return `<b>${esc(r.name)}</b><br>${both(r)}${g === null ? "" : `<br>${Math.abs(g)} points a year ${g >= 0 ? "ahead of" : "behind"} ${esc(benchmark)}`}`;
            },
          },
          xAxis: {
            type: "value",
            min: -reach,
            max: reach,
            splitLine: { lineStyle: { color: token("--line") } },
            interval: reach,
            axisLabel: { color: token("--text3"), formatter: (v: number) => (v === 0 ? "Level" : `${v > 0 ? "+" : "−"}${Math.abs(v)} pts`) },
          },
          // Each section's two rates sit under its name, where they never collide with a bar however short it is.
          yAxis: {
            type: "category",
            inverse: true,
            data: rows.map((r) => r.name),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              formatter: (name: string, i: number) => `{n|${name}}\n{r|${both(rows[i])}}`,
              rich: { n: { color: token("--text"), fontSize: 13, fontWeight: 600, lineHeight: 18, align: "right" }, r: { color: token("--text3"), fontSize: 11, lineHeight: 16, align: "right" } },
            },
          },
          series: [
            {
              type: "bar",
              barMaxWidth: 22,
              markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: token("--text3"), type: "solid", width: 1 }, data: [{ xAxis: 0 }] },
              data: gaps.map((g) => ({
                value: g ?? 0,
                itemStyle: { color: token(g === null ? "--text3" : g >= 0 ? "--gain" : "--loss"), borderRadius: 6 },
              })),
            },
          ],
        })}
      />
    </div>
  );
}
