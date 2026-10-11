import { useState } from "react";
import SetupList from "../components/SetupList";
import { useNavigate } from "react-router-dom";

import Chart, { SEG, token } from "../design-system/Chart";
import Ghosts, { type Ghost } from "../components/Ghosts";
import ReturnsLine from "../components/Returns";
import Amount from "../design-system/Amount";
import { EbenezerNote } from "../components/Note";
import { CardHead } from "../design-system/CardHead";
import { Empty } from "../design-system/Empty";
import { PageHead } from "../design-system/PageHead";
import { Stat } from "../design-system/Stat";
import OpeningNote from "../components/OpeningNote";
import { Item } from "../design-system/Item";
import Protected from "../components/Protected";
import type { NewsItem, Snapshot, Summary } from "../lib/api";
import { date, money, pct, plainPct, realReturn, short, tone, years } from "../lib/format";
import { useInterval, useLoad } from "../lib/hooks";
import { usePortfolio, useTo } from "../lib/session";
import { tabOf } from "./PortfolioScreen";
import Spinner from "../design-system/Spinner";

function Past({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) {
    return <p className="help">I write down your net worth every evening after prices come in. This chart fills in from the second evening. You can run a snapshot from Settings.</p>;
  }
  return (
    <Chart
      deps={[snapshots]}
      option={() => ({
        grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
        tooltip: { trigger: "axis", valueFormatter: (v: number) => money(v) },
        xAxis: { type: "category", data: snapshots.map((s) => s.day), axisLine: { lineStyle: { color: token("--hero-line") } }, axisLabel: { color: token("--hero-ink2") } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: token("--hero-line") } }, axisLabel: { color: token("--hero-ink2"), formatter: (v: number) => short(v) } },
        series: [
          {
            name: "Net worth",
            type: "line",
            data: snapshots.map((s) => s.netWorth),
            showSymbol: false,
            lineStyle: { width: 3, color: token("--seg1") },
            itemStyle: { color: token("--seg1") },
            areaStyle: { color: token("--seg1"), opacity: 0.15 },
          },
          {
            name: "Put in",
            type: "line",
            data: snapshots.map((s) => s.invested),
            showSymbol: false,
            lineStyle: { width: 1.5, type: "dashed", color: token("--hero-ink2") },
            itemStyle: { color: token("--hero-ink2") },
          },
        ],
      })}
    />
  );
}

function Present({ summary }: { summary: Summary }) {
  const rows = summary.sectionList
    .flatMap((s) => {
      const r = summary.sections.find((x) => x.sectionId === s.id);
      return s.counts && r && r.value > 0 ? [{ s, r }] : [];
    })
    .map((x, i) => ({ ...x, color: `var(${SEG[i % SEG.length]})` }));
  const assets = rows.reduce((a, x) => a + x.r.value, 0);
  if (assets === 0) return <p className="help">Nothing counted yet. Bring something in from Data.</p>;
  return (
    <>
      <div className="alloc">
        {rows.map((x) => (
          <i key={x.s.id} style={{ width: `${(x.r.value / assets) * 100}%`, background: x.color }} title={x.s.name} />
        ))}
      </div>
      <div className="allocl">
        {rows.map((x) => (
          <div key={x.s.id}>
            <i style={{ background: x.color }} />
            {x.s.name} <b className="num">{plainPct(x.r.value / assets, 0)}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function Future({ summary }: { summary: Summary }) {
  const r = summary.wealth;
  const rate = r.eligible && r.xirr !== null ? r.xirr : null;
  const infl = r.inflation / 100;
  const horizon = [5, 10, 20];
  return (
    <>
      <p className="sentence">If nothing new goes in. Not a prediction; the future ghost only points.</p>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th className="l">In</th>
              <th>{rate !== null ? `At your ${pct(rate)}` : "At your XIRR"}</th>
              <th>At {r.inflation}%, just keeping up</th>
              <th>
                What today's <Amount n={summary.netWorth} /> buys then
              </th>
            </tr>
          </thead>
          <tbody>
            {horizon.map((y) => (
              <tr key={y}>
                <td className="l">{y} years</td>
                <td className="num">{rate !== null ? <Amount n={summary.netWorth * (1 + rate) ** y} /> : "—"}</td>
                <td className="num">
                  <Amount n={summary.netWorth * (1 + infl) ** y} />
                </td>
                <td className="num">
                  <Amount n={summary.netWorth / (1 + infl) ** y} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Note({ summary, onOpen }: { summary: Summary; onOpen: (tab: string) => void }) {
  const { lead, sees, lines = [], signoff } = summary.note;
  const notes = lines.map((l) => {
    const s = l.section ? summary.sectionList.find((x) => x.id === l.section) : undefined;
    return { icon: l.icon, text: l.text, action: s ? { label: `Open ${s.name}`, onClick: () => onOpen(tabOf(s)) } : undefined };
  });
  return <EbenezerNote className="s4" lead={lead} lines={notes} sees={sees} signoff={signoff} meta={summary.pricedOn ? `Prices from ${date(summary.pricedOn)}` : "No prices fetched yet"} />;
}

function WealthTiles({ summary, minDays }: { summary: Summary; minDays: number }) {
  const r = summary.wealth;
  const ready = r.eligible && r.xirr !== null;
  const real = realReturn(r.xirr, r.inflation);
  const wait = r.days === 0 ? "no dated money in yet" : `shows after ${minDays} days, at ${r.days}`;
  return (
    <>
      <Stat className="card tile s3" label="Wealth XIRR" value={ready ? pct(r.xirr) : "—"} tone={ready ? tone(r.xirr) : undefined} sub={ready ? "a year, every rupee counted" : wait} />
      <Stat
        className="card tile s3"
        label={`Same money in ${summary.benchmark}`}
        value={ready ? pct(r.benchmark) : "—"}
        tone={ready ? tone(r.benchmark) : undefined}
        sub={ready ? "a year, on the same days" : wait}
      />
      <Stat className="card tile s3" label={`After ${r.inflation}% inflation`} value={ready ? pct(real) : "—"} tone={ready ? tone(real) : undefined} sub={ready ? "a year, in today's rupees" : wait} />
      {summary.liabilities > 0 ? (
        <Stat className="card tile s3" label="You owe" value={<Amount n={summary.liabilities} />} sub={`against ${short(summary.assets)} owned`} />
      ) : (
        <Stat className="card tile s3" label="You own" value={<Amount n={summary.assets} />} sub="nothing owed" />
      )}
    </>
  );
}

function StockGap({ summary }: { summary: Summary }) {
  const s = summary.stocks;
  if (!s.eligible || s.xirr === null || s.benchmark === null) return null;
  const pts = Math.abs(s.xirr - s.benchmark) * 100;
  const behind = s.xirr < s.benchmark;
  return (
    <div className="gapline">
      <span className="ms">{behind ? "trending_down" : "trending_up"}</span>
      {behind ? "Behind" : "Ahead of"} the index by {pts.toFixed(1)} points a year
      {s.days > 0 && <span className="dim"> · held {years(s.days)}</span>}
    </div>
  );
}

export default function TodayScreen() {
  const p = usePortfolio();
  const { data: summary, error, reload } = useLoad<Summary>(`/portfolios/${p.id}/summary`);
  useInterval(reload, summary?.notesPending ? 4000 : null);
  const { data: snapshots } = useLoad<Snapshot[]>(`/portfolios/${p.id}/snapshots`);
  const { data: news } = useLoad<NewsItem[]>(`/portfolios/${p.id}/news`);
  const [ghost, setGhost] = useState<Ghost>("present");
  const navigate = useNavigate();
  const to = useTo();

  if (error) return <p className="error">{error}</p>;
  if (!summary) return <Spinner className="loading" />;
  // Holdings with no known cost sit outside the comparison, or their whole value would read as gain.
  const gain = summary.assets - summary.unknown - summary.invested;
  const signal = (news ?? []).filter((n) => n.verdict === "signal").slice(0, 4);

  return (
    <>
      <PageHead title="Today" status={summary.pricedOn ? `Priced ${date(summary.pricedOn)}` : "Not priced yet"}>
        <Ghosts value={ghost} onChange={setGhost} />
      </PageHead>
      <SetupList />
      <div className="grid">
        {summary.unknown > 0 && (
          <div className="s12">
            <OpeningNote summary={summary} />
          </div>
        )}
        <section className="card hero s8">
          <span className="eyebrow">Net worth</span>
          <span className="big num">
            <Amount n={summary.netWorth} />
          </span>
          {summary.invested > 0 && (
            <span className={`delta ${tone(gain)}`}>
              <span className="ms">{gain < 0 ? "south_east" : "north_east"}</span>
              <b className="num">
                <Amount n={gain} sign />
              </b>{" "}
              {gain < 0 ? "below" : "above"} the <Amount n={summary.invested} /> you put in
              {summary.unknown > 0 && (
                <span className="dim">
                  {" "}
                  · <Amount n={summary.unknown} /> with no known cost left out
                </span>
              )}
            </span>
          )}
          <div className="lens">
            {ghost === "past" && <Past snapshots={snapshots ?? []} />}
            {ghost === "present" && <Present summary={summary} />}
            {ghost === "future" && <Future summary={summary} />}
          </div>
        </section>
        <Note summary={summary} onOpen={(tab) => navigate(to(`/portfolio?tab=${tab}`))} />
        <WealthTiles summary={summary} minDays={p.settings.xirrMinDays} />
        {summary.protection && <Protected p={summary.protection} owed={summary.liabilities} onOpen={() => navigate(to("/portfolio?tab=insurance"))} />}
        <section className="card s6">
          <CardHead title={`Stocks against ${summary.benchmark}`}>
            <md-text-button trailingIcon onClick={() => navigate(to("/portfolio"))}>
              Holdings<md-icon slot="icon">chevron_right</md-icon>
            </md-text-button>
          </CardHead>
          <ReturnsLine r={summary.stocks} benchmark={summary.benchmark} minDays={p.settings.xirrMinDays} label="Your XIRR" />
          <StockGap summary={summary} />
        </section>
        <section className="card s6 todnews">
          <CardHead title="News">
            <md-text-button trailingIcon onClick={() => navigate(to("/news"))}>
              All news<md-icon slot="icon">chevron_right</md-icon>
            </md-text-button>
          </CardHead>
          {signal.map((n) => (
            <Item key={n.id} icon="article" title={n.title} detail={`${n.scrips.join(", ")} · ${n.reason || n.source}`} />
          ))}
          {signal.length === 0 && <Empty inline icon="notifications_paused" title={`Nothing worth your time in the last ${p.settings.news.windowDays} days.`} />}
        </section>
      </div>
    </>
  );
}
