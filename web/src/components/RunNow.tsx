import { useEffect, useRef, useState, type ReactNode } from "react";

import { del, post, type Job } from "../lib/api";
import { ago } from "../lib/format";
import { useInterval, useLoad } from "../lib/hooks";
import { usePortfolio } from "../lib/session";
import { useSnack } from "../design-system/Snack";

export function useJobs() {
  const p = usePortfolio();
  const jobs = useLoad<Job[]>(`/portfolios/${p.id}/jobs`);
  const busy = (jobs.data ?? []).some((j) => j.running);
  useInterval(jobs.reload, busy ? 2000 : null);
  return jobs;
}

export function useFinished(job: Job | undefined, onFinish: () => void) {
  const seen = useRef<string | null | undefined>(undefined);
  const done = job?.lastRun?.finishedAt ? `${job.lastRun.id}:${job.lastRun.finishedAt}` : null;
  useEffect(() => {
    if (!job) return;
    if (seen.current !== undefined && done && done !== seen.current) onFinish();
    seen.current = done;
  }, [job, done, onFinish]);
}

export function lastRunText(j: Job): string {
  if (j.running) return j.progress ? `Running · ${j.progress.text}` : "Running now";
  if (!j.lastRun) return "Never run";
  const when = ago(j.lastRun.startedAt);
  if (j.lastRun.ok === null) return `Started ${when}`;
  return `${j.lastRun.ok ? "Ran" : "Failed"} ${when}${j.lastRun.message ? ` · ${j.lastRun.message}` : ""}`;
}

interface Props {
  job: Job | undefined;
  onDone: () => void;
  label?: string;
  disabled?: boolean;
  // A bare play button, with label as its accessible name.
  icon?: boolean;
}

export default function RunNow({ job, onDone, label = "Run now", disabled, icon }: Props) {
  const p = usePortfolio();
  const say = useSnack();
  const [starting, setStarting] = useState(false);
  const running = starting || !!job?.running;
  const run = async () => {
    if (!job) return;
    setStarting(true);
    try {
      await post(`/portfolios/${p.id}/jobs/${job.name}`);
      say(`${job.label} started`);
      onDone();
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setStarting(false);
    }
  };
  const stop = async () => {
    if (!job) return;
    try {
      await del(`/portfolios/${p.id}/jobs/${job.name}`);
      say(`${job.label} stopped`);
      onDone();
    } catch (e) {
      say((e as Error).message, true);
    }
  };
  if (job?.running) {
    return (
      <md-outlined-button onClick={stop}>
        <md-icon slot="icon">stop</md-icon>Stop
      </md-outlined-button>
    );
  }
  if (icon) {
    return (
      <md-icon-button onClick={run} disabled={!job || running || disabled} aria-label={label} title={label}>
        <md-icon>play_arrow</md-icon>
      </md-icon-button>
    );
  }
  return (
    <md-filled-tonal-button onClick={run} disabled={!job || running || disabled}>
      <md-icon slot="icon">play_arrow</md-icon>
      {starting ? "Starting" : label}
    </md-filled-tonal-button>
  );
}

export function Status({ job, fallback, children }: { job?: Job; fallback?: string; children?: ReactNode }) {
  const tone = !job?.lastRun ? "idle" : job.lastRun.ok === false ? "bad" : "ok";
  return (
    <div className="status-row">
      <span className={`okdot${tone === "bad" ? " bad" : tone === "idle" ? " idle" : ""}`} />
      <span className="help">{job ? lastRunText(job) : (fallback ?? "…")}</span>
      {children && <span className="status-a">{children}</span>}
    </div>
  );
}
