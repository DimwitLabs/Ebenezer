import { useState } from "react";
import { useNavigate } from "react-router-dom";

import RunNow, { Status, useFinished, useJobs } from "../components/RunNow";
import FilingPDF from "../components/FilingPDF";
import Progress from "../design-system/Progress";
import { Badge } from "../design-system/Badge";
import { ToggleChips } from "../design-system/Chips";
import { Empty } from "../design-system/Empty";
import { PageHead } from "../design-system/PageHead";
import Verdict from "../components/Verdict";
import type { NewsItem } from "../lib/api";
import { ago } from "../lib/format";
import { useInterval, useLoad } from "../lib/hooks";
import { usePortfolio, useTo } from "../lib/session";

type Filter = "signal" | "humbug" | "all";

function dayOf(iso: string | null): string {
  if (!iso) return "Undated";
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

// Stories arrive newest first, so each day's group keeps that order.
function byDay(items: NewsItem[]): [string, NewsItem[]][] {
  const out: [string, NewsItem[]][] = [];
  for (const n of items) {
    const day = dayOf(n.publishedAt);
    if (out.at(-1)?.[0] === day) out.at(-1)![1].push(n);
    else out.push([day, [n]]);
  }
  return out;
}

const FILTERS: [Filter, string][] = [
  ["signal", "Signal"],
  ["humbug", "Humbug"],
  ["all", "Everything"],
];

export default function NewsScreen() {
  const p = usePortfolio();
  const news = useLoad<NewsItem[]>(`/portfolios/${p.id}/news`);
  const jobs = useJobs();
  const job = jobs.data?.find((j) => j.name === "news");
  const [filter, setFilter] = useState<Filter | null>(null);
  const navigate = useNavigate();
  const to = useTo();
  useFinished(job, news.reload);
  useInterval(news.reload, job?.running ? 4000 : null);

  // Without an AI key nothing is judged, so the screen opens on everything instead of an empty Signal list.
  const shown: Filter = filter ?? ((news.data ?? []).some((n) => n.verdict === "signal") ? "signal" : "all");
  const items = (news.data ?? []).filter((n) => shown === "all" || n.verdict === shown);
  const counts = Object.fromEntries(FILTERS.map(([f]) => [f, (news.data ?? []).filter((n) => f === "all" || n.verdict === f).length]));

  return (
    <>
      <PageHead title="News" />
      <Status job={job}>
        <md-text-button onClick={() => navigate(to("/settings#news"))}>{p.settings.news.enabled ? `At ${p.settings.news.times.join(", ") || "no times"}` : "Schedule off"}</md-text-button>
        <RunNow job={job} onDone={jobs.reload} label="Fetch now" />
      </Status>
      {job?.running && job.progress && <Progress done={job.progress.done} total={job.progress.total} label="Scrips read" />}
      <ToggleChips label="Filter" radio options={FILTERS.map(([f, label]) => [f, `${label} ${counts[f]}`])} on={(f) => shown === f} onPick={setFilter} />
      {items.length === 0 && (
        <div className="card">
          <Empty
            icon="newspaper"
            title={
              job?.running
                ? "I'm reading the first scrips. Stories appear here as I judge each few."
                : news.data?.length
                  ? "Nothing under this filter."
                  : "No news yet. Fetch now, or wait for the schedule."
            }
            line="I search news by each company's full name, never a bare ticker, and the AI judges it when a key is set."
          />
        </div>
      )}
      {byDay(items).map(([day, stories]) => (
        <section className="card newsday" key={day}>
          <div className="newsday-h">
            <b>{day}</b>
            <span>
              {stories.length} {stories.length === 1 ? "story" : "stories"}
            </span>
          </div>
          {stories.map((n) => (
            <article className="nrow" key={n.id}>
              <Badge tone="ok" title={n.scrips.join(", ")}>
                {n.scrips[0] ?? "News"}
                {n.scrips.length > 1 && ` +${n.scrips.length - 1}`}
              </Badge>
              <div className="nt">
                <a href={n.link} target="_blank" rel="noreferrer noopener" title={n.title}>
                  {n.title}
                </a>
                <span>
                  {(shown === "all" || !n.verdict) && <Verdict verdict={n.verdict} judge={{ pid: p.id, id: n.id }} onJudged={news.reload} />}
                  {n.reason || n.snippet}
                </span>
              </div>
              <span className="nw">
                {n.source}
                <i>
                  {ago(n.publishedAt)}
                  {n.also > 0 && ` · +${n.also} similar`}
                </i>
              </span>
              <span className="npdf">
                <FilingPDF pid={p.id} item={n} />
              </span>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
