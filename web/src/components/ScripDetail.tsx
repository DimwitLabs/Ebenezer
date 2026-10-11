import { type ReactNode, useState } from "react";

import { post, type Position, type ScripView } from "../lib/api";
import { ago, date, money, pct, price, qty, short, tone, years } from "../lib/format";
import { useLoad } from "../lib/hooks";
import Chart, { token } from "../design-system/Chart";
import FilingPDF from "./FilingPDF";
import { ListRow } from "../design-system/ListRow";
import { Segmented } from "../design-system/Segmented";
import Verdict from "./Verdict";
import { Empty } from "../design-system/Empty";
import Spinner, { Wait } from "../design-system/Spinner";
import { Stats } from "../design-system/Stat";

const tick = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

export default function ScripDetail({ pid, position, news, actions }: { pid: string; position: Position; news: boolean; actions?: ReactNode }) {
  const { data, error, reload } = useLoad<ScripView>(`/portfolios/${pid}/scrips/${position.isin}`);
  const [checking, setChecking] = useState(false);
  const [tab, setTab] = useState<"news" | "trades">("news");
  const [checked, setChecked] = useState<string | null>(null);
  const fetchNews = async () => {
    setChecking(true);
    setChecked(null);
    try {
      const r = await post<{ added: number; checked: boolean }>(`/portfolios/${pid}/scrips/${position.isin}/news`);
      if (r.added > 0) reload();
      setChecked(!r.checked ? "I checked a moment ago; try again in a couple of minutes." : r.added ? `${r.added} new ${r.added === 1 ? "story" : "stories"}.` : "Nothing new.");
    } catch (e) {
      setChecked((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  if (error) return <p className="help">{error}</p>;
  if (!data) return <Wait />;

  const h = data.holding;
  const closes = data.history.map((c) => c.close);
  const cost = h.quantity > 0 ? h.cost / h.quantity : null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const lo = Math.min(...closes, cost ?? Infinity);
  const hi = Math.max(...closes, cost ?? -Infinity);
  const pad = (hi - lo) * 0.06 || hi * 0.02;
  const step = 10 ** Math.floor(Math.log10(hi - lo + pad * 2 || 1)) / 2;
  const yMin = Math.max(0, Math.floor((lo - pad) / step) * step);
  const yMax = Math.ceil((hi + pad) / step) * step;
  const held = h.firstDate ? Math.round((Date.now() - new Date(h.firstDate).getTime()) / 86_400_000) : 0;
  const sec = data.security;
  // Paise only matter on small prices, and a coin's lakhs read better short; either keeps the range on one line.
  const band = (v: number) => (v >= 1e5 ? short(v) : v >= 100 ? money(v) : price(v));
  const span = data.history.length > 1 ? Math.round((new Date(data.history[data.history.length - 1].day).getTime() - new Date(data.history[0].day).getTime()) / 86_400_000) : 0;
  const period = span >= 300 ? "the year" : `${span} days`;
  const fund = sec?.kind === "fund";
  const coin = h.isin.startsWith("CRYPTO-");
  const facts: [string, string, string?][] = [
    ...(sec?.symbol ? [[fund ? "AMFI code" : "NSE", sec.symbol] as [string, string]] : []),
    ...(sec?.bseCode ? [["BSE", sec.bseCode] as [string, string]] : []),
    coin ? ["Coin", h.isin.slice("CRYPTO-".length)] : ["ISIN", h.isin],
    ...(fund && sec?.category ? [["Category", sec.category] as [string, string]] : []),
    ...(h.firstDate ? [["Held since", `${date(h.firstDate)}, ${years(held)}`] as [string, string]] : []),
    ...(cost !== null ? [[fund ? "Average NAV" : "Average cost", price(cost)] as [string, string]] : []),
    ...(h.quantity > 0 ? [[fund ? "Units" : "Quantity", qty(h.quantity)] as [string, string]] : []),
    ...(h.realised ? [["Booked on sales", money(h.realised), tone(h.realised)] as [string, string, string]] : []),
    ...(closes.length > 1 ? [["Last day", pct(last / prev - 1), tone(last - prev)] as [string, string, string]] : []),
    ...(closes.length > 1 ? [[`Over ${period}`, pct(last / first - 1), tone(last - first)] as [string, string, string]] : []),
    ...(closes.length > 1 ? [[span >= 300 ? "Year range" : `${span}-day range`, `${band(Math.min(...closes))} – ${band(Math.max(...closes))}`] as [string, string]] : []),
  ];
  const signal = data.news.filter((n) => n.verdict === "signal");
  const rest = data.news.filter((n) => n.verdict !== "signal");

  const chart =
    closes.length > 1 ? (
      <Chart
        height={180}
        deps={[data.history, cost]}
        option={() => ({
          grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
          tooltip: { trigger: "axis", valueFormatter: (v: number) => price(v) },
          xAxis: { type: "category", data: data.history.map((c) => c.day), show: false },
          yAxis: { type: "value", min: yMin, max: yMax, splitLine: { lineStyle: { color: token("--line") } }, axisLabel: { color: token("--text3"), formatter: (v: number) => tick.format(v) } },
          series: [
            {
              type: "line",
              data: closes,
              showSymbol: false,
              lineStyle: { width: 2, color: token(last >= (cost ?? first) ? "--gain" : "--loss") },
              itemStyle: { color: token(last >= (cost ?? first) ? "--gain" : "--loss") },
              areaStyle: { color: token(last >= (cost ?? first) ? "--gain" : "--loss"), opacity: 0.08 },
              markLine:
                cost !== null
                  ? {
                      symbol: "none",
                      silent: true,
                      label: { formatter: "Your cost", color: token("--text2"), position: "insideEndTop" },
                      lineStyle: { type: "dashed", color: token("--text3") },
                      data: [{ yAxis: cost }],
                    }
                  : undefined,
            },
          ],
        })}
      />
    ) : (
      <p className="help">No closes for this scrip yet. I fetch the last month of closes after each import, so check back in a minute.</p>
    );

  const details = (
    <>
      <Stats look="plain" className="facts" items={facts.map(([label, value, tone]) => ({ label, value, tone }))} />
      <div className="scrip-act">
        {news && (
          <md-filled-tonal-button onClick={fetchNews} disabled={checking}>
            {checking ? <Spinner size={18} slot="icon" label="Fetching news" /> : <md-icon slot="icon">refresh</md-icon>}
            {checking ? "Fetching" : "Fetch latest news"}
          </md-filled-tonal-button>
        )}
        {actions}
      </div>
      {checked && <p className="help">{checked}</p>}
    </>
  );

  const newsItems = [...signal, ...rest].map((n) => (
    <article className={`snews${n.verdict === "signal" ? "" : " dim"}`} key={n.id}>
      <a href={n.link} target="_blank" rel="noreferrer noopener">
        {n.title}
      </a>
      <div className="meta">
        <Verdict verdict={n.verdict} judge={{ pid, id: n.id }} onJudged={reload} />
        <FilingPDF pid={pid} item={n} />
        <span>{n.source}</span>
        <span>{ago(n.publishedAt)}</span>
      </div>
      {n.reason && <p>{n.reason}</p>}
    </article>
  ));
  const tradeItems = data.trades.map((t, i) => (
    <ListRow
      key={i}
      icon={t.sell ? "remove" : "add"}
      tone={t.sell ? "sell" : undefined}
      title={t.action || (t.sell ? "Sell" : "Buy")}
      sub={`${date(t.date)} · ${qty(t.quantity)}${fund ? " units" : ""}${t.amount ? ` at ${price(t.amount / t.quantity)}` : ""}`}
      value={t.amount ? money(t.amount) : "—"}
      note={t.opening ? "Opening balance" : undefined}
    />
  ));
  const showing = news ? tab : "trades";
  const items = showing === "news" ? newsItems : tradeItems;

  return (
    <div className="scrip-d">
      <div className="scrip-l">
        {chart}
        {details}
      </div>
      <div className="scrip-r">
        <div className="scrip-rh">
          {news ? (
            <Segmented
              label="Show"
              options={[
                ["news", "News"],
                ["trades", "Transactions"],
              ]}
              counts={{ news: data.news.length, trades: data.trades.length }}
              value={tab}
              onChange={setTab}
            />
          ) : (
            <h4>Transactions</h4>
          )}
        </div>
        {items.length === 0 ? (
          <Empty
            icon={showing === "news" ? "newspaper" : "receipt_long"}
            title={showing === "news" ? (checking ? "Looking for news…" : "No news in the last 30 days") : "No transactions recorded"}
            line={showing === "news" ? "I look twice a day. Fetch latest news checks this one now." : "Trades you import or add in Data show here."}
          />
        ) : (
          <div className="snews-list">{items}</div>
        )}
      </div>
    </div>
  );
}
