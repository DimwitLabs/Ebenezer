import { useState } from "react";
import { Link } from "react-router-dom";

import Dialog from "../../design-system/Dialog";
import { SwitchRow, TextField } from "../../design-system/Fields";
import Fold from "../../design-system/Fold";
import { Adder } from "../../design-system/Adder";
import { RemovableChips, ToggleChips } from "../../design-system/Chips";
import { DayPicker } from "../../design-system/DayPicker";
import { FormActions } from "../../design-system/FormActions";
import { Group } from "../../design-system/Group";
import RunNow, { Status, type useJobs } from "../../components/RunNow";
import { useSnack } from "../../design-system/Snack";
import { patch, reportPreview, type Portfolio } from "../../lib/api";
import { zoneLabel } from "../../lib/format";
import { usePortfolio, useSession } from "../../lib/session";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PARTS: [string, string][] = [
  ["summary", "Summary"],
  ["note", "Ebenezer's note"],
  ["sections", "Sections"],
  ["movers", "Movers"],
  ["news", "News"],
  ["health", "Source health"],
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toggle(list: string[], v: string, order: string[]): string[] {
  const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export default function ReportCard({ jobs, smtpReady }: { jobs: ReturnType<typeof useJobs>; smtpReady: boolean }) {
  const p = usePortfolio();
  const { replace, user, timeZone } = useSession();
  const owner = !!user?.isOwner;
  const say = useSnack();
  const [r, setR] = useState(() => ({ ...p.settings.report, to: p.settings.report.to ?? [], days: p.settings.report.days ?? [], sections: p.settings.report.sections ?? [] }));
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
  const job = jobs.data?.find((j) => j.name === "report");

  const add = (): boolean => {
    const a = address.trim();
    if (!EMAIL.test(a)) return (say("That doesn't look like an email address", true), false);
    if (r.to.length >= 10 && !r.to.includes(a)) return (say("Ten addresses at most", true), false);
    if (!r.to.includes(a)) setR({ ...r, to: [...r.to, a] });
    setAddress("");
    return true;
  };

  const save = async () => {
    const to = r.to;
    if (r.enabled && to.length === 0) return say(owner ? "Add an address to send the report to" : "Ask the owner to add who gets this email", true);
    if (r.enabled && r.days.length === 0) return say("Pick at least one day", true);
    if (r.sections.length === 0) return say("Pick at least one part to include", true);
    setBusy(true);
    try {
      replace(await patch<Portfolio>(`/portfolios/${p.id}`, { settings: { ...p.settings, report: { ...r, to } } }));
      say("Report settings saved");
      jobs.reload();
    } catch (e) {
      say((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    try {
      setPreview(await reportPreview(p.id));
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  return (
    <Fold id="report" icon="forward_to_inbox" title="Report" summary="The email I send on a schedule">
      <Status job={job} fallback={`A short email with what changed in ${p.name}.`}>
        <RunNow job={job} onDone={jobs.reload} label="Send now" disabled={!smtpReady} />
      </Status>
      {!smtpReady && (
        <p className="help">
          Set up <Link to="/admin#email">email</Link> under Admin to send it.
        </p>
      )}
      <SwitchRow checked={r.enabled} onChange={(v) => setR({ ...r, enabled: v })} title="Email a report on a schedule" detail="Send now works either way." />
      {r.enabled && (
        <div className="under">
          <TextField className="time" label={`Send at, ${zoneLabel(timeZone)}`} type="time" value={r.time} onChange={(v) => setR({ ...r, time: v })} />
          <Group label="Days">
            <DayPicker label="Days" days={DAYS.map((d, i) => [d, d[0], DAY_NAMES[i]])} on={(d) => r.days.includes(d)} onPick={(d) => setR({ ...r, days: toggle(r.days, d, DAYS) })} />
          </Group>
        </div>
      )}
      <Group label="Send to">
        {r.to.length > 0 ? (
          <RemovableChips stack items={r.to.map((a) => [a, a])} disabled={!owner} onRemove={(a) => setR({ ...r, to: r.to.filter((x) => x !== a) })} />
        ) : (
          <p className="help">Nobody yet.</p>
        )}
        {owner ? (
          <Adder label="Add an address">
            {(close) => (
              <form className="inline-add" onSubmit={(e) => (e.preventDefault(), add() && close())}>
                <TextField className="compact addr" type="email" value={address} onChange={setAddress} placeholder="name@example.com" aria-label="Email address to add" autoFocus />
                <FormActions label="Add" onCancel={close} />
              </form>
            )}
          </Adder>
        ) : (
          <p className="help">Only the admin can change who gets this email.</p>
        )}
      </Group>
      <Group label="Include">
        <ToggleChips
          label="Include"
          grid
          options={PARTS}
          on={(v) => r.sections.includes(v)}
          onPick={(v) =>
            setR({
              ...r,
              sections: toggle(
                r.sections,
                v,
                PARTS.map((x) => x[0]),
              ),
            })
          }
        />
      </Group>
      <div className="acts">
        <md-filled-button onClick={save} disabled={busy}>
          Save
        </md-filled-button>
        <md-text-button onClick={open}>
          <md-icon slot="icon">visibility</md-icon>Preview
        </md-text-button>
      </div>
      {preview && (
        <Dialog title="Report preview" icon="mail" onClose={() => setPreview(null)}>
          <p className="subject">
            <span className="faint">Subject</span> {preview.subject}
          </p>
          <iframe className="report-frame" title="Report preview" sandbox="" srcDoc={preview.html} />
        </Dialog>
      )}
    </Fold>
  );
}
