import { Item } from "../design-system/Item";
import { PageHead } from "../design-system/PageHead";
import Spinner from "../design-system/Spinner";
import RunNow, { Status, useFinished, useJobs } from "../components/RunNow";
import type { Check } from "../lib/api";
import { ago } from "../lib/format";
import { useLoad } from "../lib/hooks";

interface Health {
  health: { checks: Check[]; at: string | null };
}

// Deliberately not in the navigation: trouble arrives via ntfy and the owner types /health.
export default function HealthScreen() {
  const health = useLoad<Health>("/checks");
  const jobs = useJobs();
  const job = jobs.data?.find((j) => j.name === "health");
  useFinished(job, health.reload);

  if (health.error) return <p className="error">{health.error}</p>;
  const checks = health.data?.health.checks ?? [];

  return (
    <>
      <PageHead title="Source health" />
      <Status job={job}>
        <RunNow job={job} onDone={jobs.reload} label="Check now" />
      </Status>
      <div className="card">
        {!health.data ? <Spinner className="loading" /> : checks.length === 0 && <p className="help">No check has run yet.</p>}
        <div className="items">
          {checks.map((c) => (
            <Item
              key={c.name}
              icon={c.ok ? "check_circle" : "error"}
              tone={c.ok ? "on" : "bad"}
              title={c.name}
              detail={
                <>
                  {c.detail}
                  <br />
                  {c.ok ? "Working" : `Failing, ${c.failures} time${c.failures === 1 ? "" : "s"} in a row`} · checked {ago(c.at)}
                </>
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}
