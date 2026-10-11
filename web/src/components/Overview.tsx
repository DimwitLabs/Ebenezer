import { NO_RETURNS, type Returns, type Section, type SectionResult, type Summary } from "../lib/api";
import { date, pct, plainPct, short, tone } from "../lib/format";
import Amount from "../design-system/Amount";
import Chart, { token } from "../design-system/Chart";
import { CardHead } from "../design-system/CardHead";
import { Hero } from "../design-system/Hero";
import { Notes } from "./Note";
import { gainPill, returnsLine } from "./Returns";
import { ListRow } from "../design-system/ListRow";
import Treemap, { type Block } from "./Treemap";

const NONE = new Set<string>();

interface Line {
  s: Section;
  r: SectionResult;
  liability: boolean;
  gain: number | null;
  share: number | null;
}

function lines(summary: Summary): Line[] {
  // Insurance has its own card; a row of ₹0 here would read as money missing.
  return summary.sectionList
    .filter((s) => s.valuation !== "cover")
    .map((s) => {
      const r = summary.sections.find((x) => x.sectionId === s.id) ?? { sectionId: s.id, value: 0, invested: 0, positions: [], unpriced: 0, returns: NO_RETURNS };
      const liability = s.valuation === "liability";
      return {
        s,
        r,
        liability,
        gain: !liability && r.invested > 0 ? r.value - (r.unknown ?? 0) - r.invested : null,
        share: !liability && s.counts && summary.assets > 0 ? Math.max(0, r.value) / summary.assets : null,
      };
    });
}

const MARKET = new Set(["stocks", "funds", "bonds", "gold", "crypto"]);

function gap(r?: Returns): number | null {
  if (!r?.eligible || r.xirr === null || r.benchmark === null) return null;
  return r.xirr - r.benchmark;
}

function pts(g: number): string {
  const s = `${Math.abs(g * 100).toFixed(1)} pts`;
  if (s.startsWith("0.0")) return s;
  return g > 0 ? `+${s}` : `(${s})`;
}

interface Props {
  summary: Summary;
  minDays: number;
  onOpen: (sectionId: string) => void;
}

export default function Overview({ summary, minDays, onOpen }: Props) {
  const all = lines(summary);
  const gain = summary.assets - summary.unknown - summary.invested;
  // Only market-linked classes are set against the index; deposits and savings answer to inflation.
  const rated = all.filter((l) => MARKET.has(l.s.kind) && l.r.returns?.eligible && l.r.returns.xirr !== null);
  const blocks: Block[] = all.filter((l) => l.share !== null && l.share > 0).map((l) => ({ key: l.s.id, label: l.s.name, value: l.r.value, count: l.r.positions.length }));
  const counted = all.filter((l) => l.s.counts).length;

  return (
    <div className="grid">
      <Hero
        icon="account_balance_wallet"
        title="Whole portfolio"
        meta={`${counted} section${counted === 1 ? "" : "s"}${summary.pricedOn ? ` · priced ${date(summary.pricedOn)}` : ""}`}
        value={<Amount n={summary.netWorth} />}
        pill={gainPill(gain, summary.invested)}
        stats={[
          { label: "Owned", value: <Amount n={summary.assets} /> },
          { label: "Owed", value: summary.liabilities ? <Amount n={summary.liabilities} /> : "Nothing" },
          { label: "Put in", value: <Amount n={summary.invested} /> },
        ]}
        footIcon="schedule"
        foot={returnsLine(summary.wealth, summary.benchmark, minDays)}
      />
      <Notes id="overview" summary={summary} onOpen={onOpen} />
      {blocks.length > 1 && (
        <div className="card s12">
          <CardHead title="Where the money sits" />
          <Treemap blocks={blocks} noun={["holding", "holdings"]} selected={NONE} onToggle={onOpen} />
        </div>
      )}
      <div className="card s12">
        <CardHead title="Sections" />
        <div className="hlist">
          {all.map((l) => {
            const r = l.r.returns;
            const g = gap(r);
            const n = l.r.positions.length;
            const xirr = l.liability || !r?.days ? "" : !r.eligible ? `XIRR after ${minDays} days` : `XIRR ${pct(r.xirr)}${g !== null ? `, ${pts(g)} against ${summary.benchmark}` : ""}`;
            const sub =
              n === 0
                ? "Nothing in it yet"
                : [`${n} holding${n === 1 ? "" : "s"}`, l.share !== null ? `${plainPct(l.share, 0)} of what you own` : l.liability ? "owed" : "not counted", xirr].filter(Boolean).join(" · ");
            return (
              <ListRow
                key={l.s.id}
                icon={l.s.icon}
                title={l.s.name}
                sub={sub}
                value={short(Math.abs(l.r.value))}
                valueTone={l.liability ? "down" : undefined}
                note={l.gain !== null ? pct(l.gain / l.r.invested) : undefined}
                noteTone={tone(l.gain)}
                onClick={() => onOpen(l.s.id)}
              />
            );
          })}
        </div>
      </div>
      {rated.length > 0 && (
        <div className="card s12">
          <CardHead title={`Each section against ${summary.benchmark}`} />
          <Chart
            height={Math.max(180, 70 + rated.length * 56)}
            deps={[summary]}
            option={() => ({
              grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
              legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: token("--text2") } },
              tooltip: {
                trigger: "axis",
                axisPointer: { type: "shadow" },
                valueFormatter: (v: number | null) => (v === null || v === undefined || Number.isNaN(v) ? "No index history that far back" : pct(v / 100)),
              },
              xAxis: { type: "value", splitLine: { lineStyle: { color: token("--line") } }, axisLabel: { color: token("--text3"), formatter: (v: number) => `${v}%` } },
              yAxis: {
                type: "category",
                inverse: true,
                data: rated.map((l) => l.s.name),
                axisLine: { lineStyle: { color: token("--line") } },
                axisTick: { show: false },
                axisLabel: { color: token("--text2") },
              },
              series: [
                { name: "XIRR", type: "bar", barGap: "20%", barMaxWidth: 16, itemStyle: { color: token("--accent"), borderRadius: 4 }, data: rated.map((l) => +(l.r.returns!.xirr! * 100).toFixed(1)) },
                {
                  name: `Same money in ${summary.benchmark}`,
                  type: "bar",
                  barMaxWidth: 16,
                  itemStyle: { color: token("--text3"), borderRadius: 4 },
                  data: rated.map((l) => (l.r.returns!.benchmark === null ? null : +(l.r.returns!.benchmark * 100).toFixed(1))),
                },
              ],
            })}
          />
        </div>
      )}
    </div>
  );
}
