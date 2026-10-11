import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import Fold from "../design-system/Fold";
import { Adder } from "../design-system/Adder";
import { RemovableChips } from "../design-system/Chips";
import { FormActions } from "../design-system/FormActions";
import { ColourPicker } from "../design-system/ColourPicker";
import { Group } from "../design-system/Group";
import { IconPicker } from "../design-system/IconPicker";
import { Item } from "../design-system/Item";
import { More } from "../design-system/More";
import { PageHead } from "../design-system/PageHead";
import { Select, SwitchRow, TextField } from "../design-system/Fields";
import RunNow, { Status, useJobs } from "../components/RunNow";
import { useSnack } from "../design-system/Snack";
import { del, patch, post, put, type InstanceView, type Model, type Portfolio, type User } from "../lib/api";
import { toNumber, zoneLabel } from "../lib/format";
import { applySeed, reportPalette } from "../lib/theme";
import { useLoad } from "../lib/hooks";
import { usePortfolio, useSession } from "../lib/session";
import { merged, toOverride, toText, type Judge, type JudgeText } from "./settings/judge";
import ReportCard from "./settings/ReportCard";
import { modelOptions } from "../components/InstanceSetup";
import { useConfirm } from "../design-system/Confirm";
import VoicePicker from "../components/VoicePicker";
import InviteForm, { type InviteBody } from "../components/Invite";

const BENCHMARKS = ["Nifty 50", "Nifty 100", "Nifty 500", "Nifty Next 50", "Nifty Midcap 150", "Nifty Smallcap 250", "Nifty LargeMidcap 250"];
const PORTFOLIO_ICONS = [
  "account_balance_wallet",
  "family_restroom",
  "person",
  "group",
  "savings",
  "work",
  "home",
  "child_care",
  "elderly",
  "school",
  "favorite",
  "pets",
  "flight",
  "diamond",
  "science",
  "star",
];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function PortfolioCard() {
  const [confirm, confirmDialog] = useConfirm();
  const p = usePortfolio();
  const { replace, refresh } = useSession();
  const say = useSnack();
  const navigate = useNavigate();
  const [name, setName] = useState(p.name);
  const [icon, setIcon] = useState(p.icon);
  const [color, setColor] = useState(p.color);
  const [fyStart, setFyStart] = useState(p.fyStart);
  const [benchmark, setBenchmark] = useState(p.settings.benchmark);
  const [inflation, setInflation] = useState(String(p.settings.inflation));
  const [minDays, setMinDays] = useState(String(p.settings.xirrMinDays));
  const [busy, setBusy] = useState(false);
  const saved = useRef(p.color);
  saved.current = p.color;
  useEffect(() => () => applySeed(saved.current), []);

  const save = async () => {
    const inf = toNumber(inflation);
    const days = toNumber(minDays);
    if (inf === null) return say("Inflation must be a number", true);
    if (days === null || !Number.isInteger(days) || days < 0) return say("XIRR days must be a whole number", true);
    setBusy(true);
    try {
      replace(await patch<Portfolio>(`/portfolios/${p.id}`, { name, icon, color, palette: reportPalette(color), fyStart, settings: { ...p.settings, benchmark, inflation: inf, xirrMinDays: days } }));
      say("Portfolio saved");
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${p.name}?`, message: "Every section and row in it goes too. This can't be undone.", action: "Delete portfolio" }))) return;
    try {
      await del(`/portfolios/${p.id}`);
      await refresh();
      navigate("/");
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  return (
    <Fold id="portfolio" icon={p.icon} title="Portfolio" summary="Name, icon, colour, financial year, benchmark and inflation">
      <p className="help">These apply to {p.name} only. Other portfolios keep their own.</p>
      <Group label="Icon">
        <IconPicker icons={PORTFOLIO_ICONS} value={icon} onChange={setIcon} />
      </Group>
      <Group label="Colour">
        <ColourPicker
          value={color}
          onChange={(hex) => {
            setColor(hex);
            applySeed(hex);
          }}
        />
      </Group>
      <div className="fields2">
        <TextField label="Name" value={name} onChange={setName} maxLength={80} />
        <Select label="Financial year starts in" value={String(fyStart)} onChange={(v) => setFyStart(Number(v))} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        <Select
          label="Compare against"
          value={benchmark}
          onChange={setBenchmark}
          options={BENCHMARKS.map((b) => ({ value: b, label: b }))}
          info="The same money on the same days, put into this index instead."
        />
        <TextField label="Inflation, % a year" inputMode="decimal" value={inflation} onChange={setInflation} />
        <TextField label="Show XIRR after this many days" inputMode="numeric" value={minDays} onChange={setMinDays} info="An annual rate over a few weeks swings wildly, so 90 days is sensible." />
      </div>
      <div className="acts">
        <md-filled-button onClick={save} disabled={busy}>
          Save
        </md-filled-button>
        <span className="spacer" />
        <md-text-button className="danger" onClick={remove}>
          Delete portfolio
        </md-text-button>
      </div>
      {confirmDialog}
    </Fold>
  );
}

function NewsCard({ jobs }: { jobs: ReturnType<typeof useJobs> }) {
  const p = usePortfolio();
  const { replace } = useSession();
  const say = useSnack();
  const [n, setN] = useState(p.settings.news);
  const [newTime, setNewTime] = useState("12:00");
  const [windowDays, setWindowDays] = useState(String(p.settings.news.windowDays));
  const [perScrip, setPerScrip] = useState(String(p.settings.news.perScrip));
  const fallback = useLoad<Judge>("/judge/default");
  const [judge, setJudge] = useState<JudgeText | null>(null);
  const [busy, setBusy] = useState(false);
  const { timeZone } = useSession();
  useEffect(() => {
    if (fallback.data && !judge) setJudge(toText(merged(fallback.data, p.settings.news.judge)));
  }, [fallback.data, judge, p.settings.news.judge]);
  const job = jobs.data?.find((j) => j.name === "news");

  const save = async () => {
    const days = toNumber(windowDays);
    const per = toNumber(perScrip);
    if (days === null || days < 1) return say("Look back days must be a number, at least 1", true);
    if (per === null || per < 1) return say("Stories per scrip must be a number, at least 1", true);
    let parsed: unknown = p.settings.news.judge ?? null;
    if (fallback.data && judge) {
      const o = toOverride(fallback.data, judge);
      if (typeof o === "string") return say(o, true);
      parsed = o;
    }
    setBusy(true);
    try {
      replace(await patch<Portfolio>(`/portfolios/${p.id}`, { settings: { ...p.settings, news: { ...n, windowDays: days, perScrip: per, judge: parsed } } }));
      say("News settings saved");
      jobs.reload();
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Fold id="news" icon="newspaper" title="News" summary="When news is fetched and how it is judged">
      <Status job={job}>
        <RunNow job={job} onDone={jobs.reload} label="Fetch now" />
      </Status>
      <div className="fields2">
        <TextField label="Look back, days" inputMode="numeric" value={windowDays} onChange={setWindowDays} />
        <TextField label="Stories per scrip, at most" inputMode="numeric" value={perScrip} onChange={setPerScrip} />
      </div>
      <SwitchRow checked={n.enabled} onChange={(v) => setN({ ...n, enabled: v })} title="Fetch news on a schedule" detail="Fetch now works either way." />
      {n.enabled && (
        <div className="under">
          <Group label={`Times each day, ${zoneLabel(timeZone)}`}>
            <RemovableChips items={n.times.map((t) => [t, t])} onRemove={(t) => setN({ ...n, times: n.times.filter((x) => x !== t) })} />
            <Adder label="Add a time">
              {(close) => (
                <form
                  className="inline-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newTime && !n.times.includes(newTime)) setN({ ...n, times: [...n.times, newTime].sort() });
                    close();
                  }}
                >
                  <TextField className="compact time" type="time" value={newTime} onChange={setNewTime} aria-label="New time" autoFocus />
                  <FormActions label="Add" onCancel={close} />
                </form>
              )}
            </Adder>
          </Group>
        </div>
      )}
      <SwitchRow
        checked={n.aiJudge}
        onChange={(v) => setN({ ...n, aiJudge: v })}
        title="Have the AI judge each story"
        detail="Signal or humbug, with a one-line reason. Needs an AI model under Admin."
      />
      {n.aiJudge && judge && fallback.data && (
        <More label="How the judge decides">
          <div className="sub-h">
            <p className="help">Plain words, read by the AI as written. Change a line, or add your own below the default.</p>
            <md-text-button onClick={() => setJudge(toText(fallback.data!))}>Reset to the default</md-text-button>
          </div>
          <TextField type="textarea" rows={4} label="Worth reading" value={judge.signal} onChange={(v) => setJudge({ ...judge, signal: v })} info="Stories like these are kept as signal." />
          <TextField type="textarea" rows={4} label="Noise" value={judge.humbug} onChange={(v) => setJudge({ ...judge, humbug: v })} info="Stories like these are set aside as humbug." />
          <TextField type="textarea" rows={3} label="Anything else the judge should know" value={judge.rules} onChange={(v) => setJudge({ ...judge, rules: v })} info="One rule per line." />
          <TextField
            type="textarea"
            rows={5}
            label="Filings to skip without asking"
            value={judge.skip}
            onChange={(v) => setJudge({ ...judge, skip: v })}
            info="One phrase per line. Case, punctuation and spaces don't matter, so “half yearly report” also catches “Half-Yearly Report”."
          />
          <div className="fields2">
            <TextField label="News is old after, days" inputMode="numeric" value={judge.staleDays} onChange={(v) => setJudge({ ...judge, staleDays: v })} />
            <TextField label="Reasons at most, words" inputMode="numeric" value={judge.words} onChange={(v) => setJudge({ ...judge, words: v })} />
          </div>
        </More>
      )}
      <div className="acts">
        <md-filled-button onClick={save} disabled={busy}>
          Save
        </md-filled-button>
      </div>
    </Fold>
  );
}

function VoiceCard() {
  const p = usePortfolio();
  const { replace } = useSession();
  const say = useSnack();
  const [v, setV] = useState(p.settings.voice);
  const [busy, setBusy] = useState(false);
  const ledger = useLoad<{ defaultInstructions: string }>(`/portfolios/${p.id}/ledger`);
  const fallback = ledger.data?.defaultInstructions ?? "";
  const models = useLoad<Model[]>("/settings/models");
  const choices = [{ value: "", label: "The instance's model", supporting: "Whatever the admin set in Settings" }, ...modelOptions(models.data, v.model)];

  const save = async () => {
    if (v.personality === "custom" && !v.custom.trim()) return say("Describe the voice you want, or pick one of the others", true);
    setBusy(true);
    try {
      replace(
        await patch<Portfolio>(`/portfolios/${p.id}`, { settings: { ...p.settings, voice: { ...v, custom: v.custom.trim(), instructions: v.instructions.trim(), model: (v.model ?? "").trim() } } }),
      );
      say("Ebenezer's voice saved");
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Fold id="ebenezer" icon="record_voice_over" title="Ebenezer" summary="Personality, tone, model and what to look for">
      <p className="help">How I speak about {p.name}. This shapes my note on Today, the report, the reasons I give for news and my answers.</p>
      <VoicePicker value={v} onChange={(x) => setV({ ...v, ...x })} />
      {models.error ? (
        <TextField
          label="Model"
          value={v.model ?? ""}
          onChange={(x) => setV({ ...v, model: x })}
          info="I couldn't load OpenRouter's list, so type a model name, or leave it empty for the instance's."
        />
      ) : (
        <Select
          key={models.data ? "listed" : "waiting"}
          label="Model"
          value={v.model ?? ""}
          onChange={(x) => setV({ ...v, model: x })}
          options={choices}
          info={models.data ? "Writes the notes, the report, news reasons and answers. Prices are per million tokens in and out." : undefined}
        />
      )}
      <More label="What Ebenezer looks for" open={!!v.instructions}>
        <TextField
          type="textarea"
          rows={5}
          aria-label="What to look for"
          value={v.instructions}
          onChange={(x) => setV({ ...v, instructions: x })}
          maxLength={4000}
          placeholder={fallback}
          info="Leave it empty to use the default, shown faintly in the box."
        />
        <div className="acts">
          <md-text-button onClick={() => setV({ ...v, instructions: fallback })} disabled={!fallback}>
            Start from the default
          </md-text-button>
          {v.instructions && <md-text-button onClick={() => setV({ ...v, instructions: "" })}>Use the default</md-text-button>}
        </div>
      </More>
      <div className="acts">
        <md-filled-button onClick={save} disabled={busy}>
          Save
        </md-filled-button>
      </div>
    </Fold>
  );
}

function SharingCard() {
  const p = usePortfolio();
  const { user } = useSession();
  const say = useSnack();
  const users = useLoad<User[]>("/users");
  const members = useLoad<User[]>(`/portfolios/${p.id}/members`);
  const memberIds = new Set((members.data ?? []).map((m) => m.id));
  const owner = !!user?.isOwner;
  const inst = useLoad<InstanceView>("/settings");
  const mailReady = !!(inst.data?.settings.smtpHost && inst.data.settings.smtpFrom);

  const invite = async (body: InviteBody, close: () => void) => {
    try {
      const r = await post<{ user: User; existing: boolean }>(`/portfolios/${p.id}/invite`, body);
      say(body.send ? `${p.name} shared, and ${r.user.name} told by email` : `${p.name} shared with ${r.user.name}`);
      close();
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      users.reload();
      members.reload();
    }
  };

  const toggle = async (u: User, on: boolean) => {
    try {
      if (on) await put(`/portfolios/${p.id}/members/${u.id}`, {});
      else await del(`/portfolios/${p.id}/members/${u.id}`);
      members.reload();
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  return (
    <Fold id="sharing" icon="group" title="Shared with" summary="Who can open this portfolio">
      <p className="help">{owner ? `Turn someone on to let them open ${p.name}.` : `Only the admin can change who opens ${p.name}.`}</p>
      {(users.data ?? []).map((u) => (
        <Item key={u.id} icon={u.isOwner ? "admin_panel_settings" : "person"} title={u.id === user?.id ? `${u.name} (you)` : u.name} detail={u.email}>
          <md-switch selected={memberIds.has(u.id)} disabled={!owner || u.id === user?.id} onChange={(e) => void toggle(u, e.currentTarget.selected)} aria-label={`${u.name} can open ${p.name}`} />
        </Item>
      ))}
      {owner && (
        <Adder label="Invite by email">
          {(close) => <InviteForm users={users.data ?? []} mailReady={mailReady} share={p.name} label="Invite" onSubmit={(b) => invite(b, close)} onCancel={close} />}
        </Adder>
      )}
    </Fold>
  );
}

export default function SettingsScreen() {
  const p = usePortfolio();
  const jobs = useJobs();
  const inst = useLoad<InstanceView>("/settings");
  const smtpReady = !!(inst.data?.settings.smtpHost && inst.data.settings.smtpFrom);
  return (
    <>
      <PageHead title="Settings" status={`How ${p.name} is set up. Your account and this Ebenezer live under your name.`} />
      <div className="folds">
        <PortfolioCard key={p.id} />
        <SharingCard key={p.id} />
        <VoiceCard key={p.id} />
        <ReportCard key={p.id} jobs={jobs} smtpReady={smtpReady} />
        <NewsCard key={p.id} jobs={jobs} />
      </div>
    </>
  );
}
