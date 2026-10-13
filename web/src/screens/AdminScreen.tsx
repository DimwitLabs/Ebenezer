import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { TextField } from "../design-system/Fields";
import Fold from "../design-system/Fold";
import { Adder } from "../design-system/Adder";
import { FormActions } from "../design-system/FormActions";
import { Item } from "../design-system/Item";
import { PageHead } from "../design-system/PageHead";
import Progress from "../design-system/Progress";
import RunNow, { CatchUp, useJobs } from "../components/RunNow";
import { useSnack } from "../design-system/Snack";
import { del, post, put, type InstanceView, type Job, type Schedule, type User } from "../lib/api";
import { ago } from "../lib/format";
import { useInterval, useLoad } from "../lib/hooks";
import { usePortfolio, useSession, useTo } from "../lib/session";
import SetupList from "../components/SetupList";
import InstanceCards from "./settings/InstanceCards";
import { useConfirm } from "../design-system/Confirm";
import InviteForm, { type InviteBody } from "../components/Invite";
import Facts from "../design-system/Facts";

const SET_IN: Record<string, string> = { prices: "/admin#data", crypto: "/admin#data", health: "/admin#data", news: "settings#news", report: "settings#report" };

type State = "done" | "fail" | "run" | "wait";

function stateOf(j: Job | undefined, waiting: boolean): State {
  if (j?.running) return "run";
  if (waiting || !j?.lastRun) return "wait";
  return j.lastRun.ok === false ? "fail" : j.lastRun.ok ? "done" : "wait";
}

function Dot({ state, big }: { state: State; big?: boolean }) {
  return (
    <span className={`dot ${state}${big ? " big" : ""}`} aria-hidden="true">
      {state === "run" ? <span className="step-spin" /> : <span className="ms">{state === "fail" ? "priority_high" : state === "done" ? "check" : "more_horiz"}</span>}
    </span>
  );
}

const said = (j: Job) => {
  const m = j.lastRun?.message || (j.lastRun?.ok ? "Done" : "Failed");
  return m.charAt(0).toUpperCase() + m.slice(1);
};

function nextText(s: Schedule): string {
  if (!s.nextAt) return s.next;
  const at = new Date(s.nextAt);
  const day = new Date(at).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  const when = day === today ? "today" : day - today === 864e5 ? "tomorrow" : at.toLocaleDateString("en-IN", { weekday: "short" });
  return `Next run ${when} ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function StepRow({ step, job, state, onDone }: { step: Schedule["steps"][number]; job: Job; state: State; onDone: () => void }) {
  const p = job.progress;
  return (
    <li className={state}>
      <Dot state={state} />
      <div className="l1">
        <span>{step.label}</span>
        <span className="acts1">
          {state !== "run" && state !== "wait" && job.lastRun && job.lastRun.facts.length > 0 && <Facts title={step.label} when={ago(job.lastRun.startedAt)} facts={job.lastRun.facts} />}
          {state !== "run" && <RunNow job={job} onDone={onDone} icon label={`Run ${step.label} alone`} />}
        </span>
      </div>
      {state === "run" ? (
        <div className="l2 prog-line">
          {p && p.total > 0 ? <Progress done={p.done} total={p.total} label={step.label} /> : null}
          <span className="dim">{p?.text ?? "Running now"}</span>
        </div>
      ) : (
        <div className="l2">
          {state === "wait" && !job.running ? (
            <span className="faint">{job.lastRun ? `Waiting · last ran ${ago(job.lastRun.startedAt)}` : "Never run"}</span>
          ) : (
            <>
              <span className="faint">{ago(job.lastRun!.startedAt)}</span>
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <span className={state === "fail" ? "bad" : "dim"}>{said(job)}</span>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function ScheduleRow({ s, byName, onAct, onDone }: { s: Schedule; byName: Map<string, Job>; onAct: () => void; onDone: () => void }) {
  const navigate = useNavigate();
  const to = useTo();
  const jobs = s.steps.map((st) => byName.get(st.job));
  const at = s.running ? jobs.findIndex((j) => j?.running) : -1;
  const states = jobs.map((j, i) => stateOf(j, s.running && (at < 0 || i > at)));
  const failed = states.findIndex((x) => x === "fail");
  const state: State = s.running ? "run" : failed >= 0 ? "fail" : states.every((x) => x === "wait") ? "wait" : "done";
  const [opened, setOpened] = useState<boolean | null>(null);
  const open = opened ?? (state === "fail" || state === "run");
  const last = jobs.filter((j) => j?.lastRun).sort((a, b) => b!.lastRun!.startedAt.localeCompare(a!.lastRun!.startedAt))[0];
  const live = at >= 0 ? jobs[at] : undefined;

  let status;
  if (state === "run") status = <span className="dim">{live ? `Step ${at + 1} of ${s.steps.length} · ${s.steps[at].label}` : "Starting"}</span>;
  else if (state === "fail") status = <span className="bad">{`${s.steps.length > 1 ? `${s.steps[failed].label} failed` : said(jobs[failed]!)} ${ago(jobs[failed]!.lastRun!.startedAt)}`}</span>;
  else if (last) status = <span className="dim">{`${s.steps.length > 1 ? "Done" : said(last)} ${ago(last.lastRun!.startedAt)}`}</span>;
  else status = <span className="dim">Never run</span>;

  return (
    <section className={`run${open ? " open" : ""}`}>
      <header>
        <Dot state={state} big />
        <button type="button" className="rt" onClick={() => setOpened(!open)} aria-expanded={open}>
          <b>{s.label}</b>
          <span className="rl">
            {status}
            <span className="sep" aria-hidden="true">
              ·
            </span>
            <span className="faint">{nextText(s)}</span>
            {state !== "run" && <CatchUp run={jobs[0]?.lastRun} />}
          </span>
          {state === "run" && live?.progress && live.progress.total > 0 && <Progress className="run-prog" done={live.progress.done} total={live.progress.total} label={s.label} />}
        </button>
        {SET_IN[s.name] ? (
          <md-icon-button
            className="cal"
            onClick={() => navigate(SET_IN[s.name].startsWith("/") ? SET_IN[s.name] : to(`/${SET_IN[s.name]}`))}
            aria-label={`Change when ${s.label} runs`}
            title={s.next}
          >
            <md-icon>edit_calendar</md-icon>
          </md-icon-button>
        ) : (
          <span className="cal" />
        )}
        <md-icon-button className="rchev" onClick={() => setOpened(!open)} aria-label={open ? "Hide steps" : "Show steps"} aria-expanded={open}>
          <md-icon>expand_more</md-icon>
        </md-icon-button>
        {s.running ? (
          <md-outlined-button className="go" onClick={onAct}>
            <md-icon slot="icon">stop</md-icon>Stop
          </md-outlined-button>
        ) : (
          <md-filled-tonal-button className="go" onClick={onAct}>
            <md-icon slot="icon">play_arrow</md-icon>Run now
          </md-filled-tonal-button>
        )}
      </header>
      {open && (
        <ol className="rsteps">
          {s.steps.map((st, i) => {
            const job = jobs[i];
            return job && <StepRow key={st.job} step={st} job={job} state={states[i]} onDone={onDone} />;
          })}
        </ol>
      )}
    </section>
  );
}

function JobsCard({ jobs }: { jobs: ReturnType<typeof useJobs> }) {
  const p = usePortfolio();
  const say = useSnack();
  const schedules = useLoad<Schedule[]>(`/portfolios/${p.id}/schedules`);
  const byName = new Map((jobs.data ?? []).map((j) => [j.name, j]));
  const reload = () => {
    schedules.reload();
    jobs.reload();
  };
  // Between steps no job is running, so the schedules themselves keep both lists fresh.
  useInterval(reload, (schedules.data ?? []).some((s) => s.running) ? 2000 : null);
  const act = async (s: Schedule) => {
    try {
      if (s.running) await del(`/portfolios/${p.id}/schedules/${s.name}`);
      else await post(`/portfolios/${p.id}/schedules/${s.name}`);
      say(`${s.label} ${s.running ? "stopped" : "started"}`);
      reload();
    } catch (e) {
      say((e as Error).message, true);
    }
  };
  return (
    <Fold id="jobs" icon="schedule" title="Schedules" summary="Everything I run on my own">
      {(schedules.data ?? []).map((s) => (
        <ScheduleRow key={s.name} s={s} byName={byName} onAct={() => void act(s)} onDone={reload} />
      ))}
    </Fold>
  );
}

function PeopleCard() {
  const [confirm, confirmDialog] = useConfirm();
  const { user } = useSession();
  const say = useSnack();
  const users = useLoad<User[]>("/users");
  const inst = useLoad<InstanceView>("/settings");
  const mailReady = !!(inst.data?.settings.smtpHost && inst.data.settings.smtpFrom);

  const add = async (body: InviteBody, close: () => void) => {
    try {
      await post("/users", body);
      say(body.send ? `Invite sent to ${body.email}` : `${body.name} can now sign in`);
      close();
    } catch (err) {
      say((err as Error).message, true);
    } finally {
      users.reload();
    }
  };
  const reinvite = async (u: User) => {
    const ask = { title: `Email ${u.name} a new first password?`, message: "The one they have now stops working.", action: "Send", icon: "forward_to_inbox" };
    if (!(await confirm(ask))) return;
    try {
      await post(`/users/${u.id}/invite`, {});
      say(`Invite sent to ${u.email}`);
    } catch (e) {
      say((e as Error).message, true);
    }
  };
  const remove = async (u: User) => {
    if (!(await confirm({ title: `Remove ${u.name}?`, message: "They won't be able to sign in any more.", action: "Remove", icon: "person_remove" }))) return;
    try {
      await del(`/users/${u.id}`);
      users.reload();
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  return (
    <Fold id="people" icon="badge" title="People" summary="Who can sign in">
      {(users.data ?? []).map((u) => (
        <Item
          key={u.id}
          icon={u.isOwner ? "admin_panel_settings" : "person"}
          title={u.id === user?.id ? `${u.name} (you)` : u.name}
          detail={u.isOwner ? `${u.email} · Admin` : u.mustChangePassword ? `${u.email} · Not signed in yet` : u.email}
        >
          {user?.isOwner && mailReady && u.mustChangePassword && (
            <md-icon-button onClick={() => reinvite(u)} aria-label={`Email ${u.name} a new first password`} title="Send invite">
              <md-icon>forward_to_inbox</md-icon>
            </md-icon-button>
          )}
          {user?.isOwner && !u.isOwner && (
            <md-icon-button onClick={() => remove(u)} aria-label={`Remove ${u.name}`} title="Remove">
              <md-icon>person_remove</md-icon>
            </md-icon-button>
          )}
        </Item>
      ))}
      {user?.isOwner && <Adder label="Add someone">{(close) => <InviteForm users={users.data ?? []} mailReady={mailReady} label="Add" onSubmit={(b) => add(b, close)} onCancel={close} />}</Adder>}
      {confirmDialog}
    </Fold>
  );
}

function AccountCard() {
  const say = useSnack();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (close: () => void) => {
    setBusy(true);
    try {
      await put("/me/password", { current, new: next });
      setCurrent("");
      setNext("");
      say("Password changed");
      close();
    } catch (err) {
      say((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Fold id="account" icon="key" title="Your account" summary="Your password">
      <Item icon="password" title="Password" detail="At least 10 characters." />
      <Adder label="Change password" onSubmit={(close) => void submit(close)}>
        {(close) => (
          <>
            <div className="fields2">
              <TextField label="Current password" type="password" value={current} onChange={setCurrent} autocomplete="current-password" autoFocus required />
              <TextField label="New password" type="password" value={next} onChange={setNext} autocomplete="new-password" minLength={10} required />
            </div>
            <FormActions label="Change password" busy={busy} onCancel={close} />
          </>
        )}
      </Adder>
    </Fold>
  );
}

export default function AdminScreen() {
  const { user } = useSession();
  const owner = !!user?.isOwner;
  return (
    <>
      <PageHead title={user?.name} status={owner ? "Your account, and everything shared by every portfolio on this Ebenezer." : "Your account on this Ebenezer."} />
      <div className="folds">
        <AccountCard />
        <Fold to="/admin/export" icon="download" title="Export your data" summary="Every portfolio you can see, as CSV files you can bring back in" />
        {owner && <OwnerCards />}
      </div>
    </>
  );
}

function OwnerCards() {
  const jobs = useJobs();
  const inst = useLoad<InstanceView>("/settings");
  return (
    <>
      <p className="label fold-group">This Ebenezer</p>
      <SetupList inst={inst} />
      <PeopleCard />
      <JobsCard jobs={jobs} />
      <InstanceCards inst={inst} />
    </>
  );
}
