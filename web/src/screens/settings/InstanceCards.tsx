import { useEffect, useState } from "react";

import { Select, SwitchRow, TextField } from "../../design-system/Fields";
import Fold from "../../design-system/Fold";
import { Adder } from "../../design-system/Adder";
import { FormActions } from "../../design-system/FormActions";
import { aiReady, runTest, saveInstance, TestButton, TestRow, useAIForm, useMailForm, useSecretRemoval, type Inst, type Pending } from "../../components/InstanceSetup";
import { Item } from "../../design-system/Item";
import SecretField from "../../design-system/SecretField";
import { useSnack } from "../../design-system/Snack";
import { put, type InstanceSettings, type SecretName } from "../../lib/api";
import { price, toNumber, zoneLabel } from "../../lib/format";
import { useSession } from "../../lib/session";

function stamp(s: string): string {
  const d = new Date(s);
  const hm = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${d.getDate()} ${d.toLocaleDateString("en-IN", { month: "short" })} ${hm}`;
}

function AIFold({ inst }: { inst: Inst }) {
  const ai = useAIForm(inst);
  return (
    <Fold id="ai" icon="auto_awesome" title="AI" summary="OpenRouter key and model" badge={aiReady(inst.data!) ? undefined : "Not set"}>
      <p className="help">I reach AI models through OpenRouter, so you choose the model and pay only for what I use.</p>
      {ai.form}
      {inst.data!.canEdit && (
        <div className="acts">
          <md-filled-button onClick={() => void ai.save()}>Save</md-filled-button>
          {ai.testButton}
        </div>
      )}
    </Fold>
  );
}

function MailAdder({ inst, open, onOpenChange }: { inst: Inst; open: boolean; onOpenChange: (open: boolean) => void }) {
  const mail = useMailForm(inst);
  return (
    <Adder label="Set up email" open={open} onOpenChange={onOpenChange} onSubmit={async (close) => (await mail.save()) && close()}>
      {(close) => (
        <>
          {mail.form}
          <FormActions label="Save" disabled={!mail.ready} onCancel={close} />
          {mail.providers}
        </>
      )}
    </Adder>
  );
}

export default function InstanceCards({ inst }: { inst: Inst }) {
  const say = useSnack();
  const [s, setS] = useState<InstanceSettings | null>(null);
  const [gold, setGold] = useState("");
  const [silver, setSilver] = useState("");
  const [own, setOwn] = useState(false);
  const { timeZone } = useSession();
  const [drafts, setDrafts] = useState<Partial<Record<SecretName, string>>>({});
  const [version, setVersion] = useState(0);
  const [ntfyTest, setNtfyTest] = useState<Pending>(null);
  const [mailTest, setMailTest] = useState<Pending>(null);
  const [editAlerts, setEditAlerts] = useState(false);
  const [editMail, setEditMail] = useState(false);
  const [auth, setAuth] = useState<"none" | "token" | "password">("none");
  const removeSecret = useSecretRemoval(inst, () => setVersion((x) => x + 1));
  useEffect(() => {
    if (!inst.data || s) return;
    setS(inst.data.settings);
    setGold(String(inst.data.settings.goldPerGram));
    setSilver(String(inst.data.settings.silverPerGram));
    setOwn(inst.data.settings.goldPerGram > 0 || inst.data.settings.silverPerGram > 0);
    setAuth(inst.data.secrets.ntfy_token.set ? "token" : inst.data.settings.ntfyUser ? "password" : "none");
  }, [inst.data, s]);

  if (!inst.data || !s) return null;
  const view = inst.data;
  const edit = view.canEdit;
  const draft = (n: SecretName) => drafts[n] ?? "";
  const setDraft = (n: SecretName) => (v: string) => setDrafts((d) => ({ ...d, [n]: v }));

  const save = async (keys: (keyof InstanceSettings)[], secrets: SecretName[] = [], extra: Partial<InstanceSettings> = {}) => {
    const picked = Object.fromEntries(keys.map((k) => [k, s[k]]));
    try {
      await saveInstance({ ...picked, ...extra }, Object.fromEntries(secrets.map((n) => [n, draft(n)])));
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !secrets.includes(k as SecretName))));
      setVersion((x) => x + 1);
      say("Saved for everyone on this Ebenezer");
      inst.reload();
      return true;
    } catch (e) {
      say((e as Error).message, true);
      return false;
    }
  };

  const savePrices = () => {
    if (!own) return void save(["pricesTime", "healthTime"], [], { goldPerGram: 0, silverPerGram: 0 });
    const goldPerGram = toNumber(gold);
    const silverPerGram = toNumber(silver);
    if (goldPerGram === null || goldPerGram < 0) return say("Gold price must be a number, 0 or more", true);
    if (silverPerGram === null || silverPerGram < 0) return say("Silver price must be a number, 0 or more", true);
    void save(["pricesTime", "healthTime"], [], { goldPerGram, silverPerGram });
  };

  const secret = (n: SecretName, label: string, placeholder?: string) => (
    <SecretField key={`${n}${version}`} label={label} state={view.secrets[n]} value={draft(n)} onChange={setDraft(n)} onRemove={() => removeSecret(n)} disabled={!edit} placeholder={placeholder} />
  );

  const note = edit ? "Shared by every portfolio on this Ebenezer." : "Shared by every portfolio. Only the owner can change these.";
  const m = view.metals;
  const fetched =
    m.goldPerGram > 0
      ? `${price(m.goldPerGram)}/g gold${m.silverPerGram > 0 ? ` · ${price(m.silverPerGram)}/g silver` : ""} · from ${m.source}, ${stamp(m.at)}`
      : "Not fetched yet. Run Prices under Schedules to fetch them.";

  return (
    <>
      <Fold id="data" icon="price_change" title="Prices and data" summary="When prices are fetched, where they come from, and gold and silver rates">
        <p className="help">{note}</p>
        <div className="fields2">
          <TextField
            label={`Fetch prices at, ${zoneLabel(timeZone)}`}
            type="time"
            value={s.pricesTime}
            disabled={!edit}
            onChange={(v) => setS({ ...s, pricesTime: v })}
            info="Weekdays. Exchanges publish closing files by early evening."
          />
          <TextField label={`Check sources at, ${zoneLabel(timeZone)}`} type="time" value={s.healthTime} disabled={!edit} onChange={(v) => setS({ ...s, healthTime: v })} />
        </div>
        <Item icon="diamond" tone={m.goldPerGram > 0 ? undefined : "idle"} title="Gold and silver" detail={fetched} />
        <Item
          icon="candlestick_chart"
          title="Index history"
          detail="From NSE's daily files. For days before those files begin, Nifty 50, Nifty Bank and Nifty IT closes come from Yahoo Finance, which isn't an official source."
        />
        <SwitchRow
          checked={own}
          onChange={setOwn}
          disabled={!edit}
          title="Use my own gold and silver rates"
          detail="Only if the fetched rate is wrong for you, say your jeweller quotes differently, or no source answers. Otherwise gold is valued at the fetched rate."
        />
        {own && (
          <div className="fields2">
            <TextField label="Gold, ₹ per gram, 24 karat" inputMode="decimal" value={gold} disabled={!edit} onChange={setGold} info="22 and 18 karat follow from this." />
            <TextField label="Silver, ₹ per gram" inputMode="decimal" value={silver} disabled={!edit} onChange={setSilver} info="0 keeps the fetched silver rate." />
          </div>
        )}
        {edit && (
          <div className="acts">
            <md-filled-button onClick={savePrices}>Save</md-filled-button>
          </div>
        )}
      </Fold>

      <AIFold inst={inst} />

      <Fold id="alerts" icon="notifications" title="Alerts" summary="Where to be told when a source breaks">
        <p className="help">Every day I check each public file I rely on, and send an alert through ntfy after two failures in a row.</p>
        {!editAlerts && view.settings.ntfyUrl ? (
          <>
            <Item
              icon="notifications_active"
              title={view.settings.ntfyUrl.replace(/^https?:\/\//, "")}
              detail={auth === "token" ? "Signs in with a token" : auth === "password" ? `Signs in as ${view.settings.ntfyUser}` : "No sign-in"}
            >
              <TestButton pending={ntfyTest} onClick={() => runTest("/settings/ntfy-test", {}, setNtfyTest)}>
                Send a test
              </TestButton>
              {edit && (
                <md-icon-button onClick={() => setEditAlerts(true)} aria-label="Edit alerts" title="Edit">
                  <md-icon>edit</md-icon>
                </md-icon-button>
              )}
            </Item>
            <TestRow result={ntfyTest} ok="Test alert sent" bad="The alert didn't go through" />
          </>
        ) : (
          edit && (
            <Adder
              label="Set up alerts"
              open={editAlerts}
              onOpenChange={setEditAlerts}
              onSubmit={async () => {
                const keep: SecretName[] = auth === "token" ? ["ntfy_token"] : auth === "password" ? ["ntfy_password"] : [];
                const stale = (["ntfy_token", "ntfy_password"] as SecretName[]).filter((n) => !keep.includes(n) && view.secrets[n].set);
                if (!(await save(["ntfyUrl"], keep, { ntfyUser: auth === "password" ? s.ntfyUser : "" }))) return;
                try {
                  for (const n of stale) await put(`/settings/secrets/${n}`, { value: "" });
                } catch (e) {
                  say((e as Error).message, true);
                }
                inst.reload();
                setEditAlerts(false);
              }}
            >
              {() => (
                <>
                  <TextField label="ntfy topic address" value={s.ntfyUrl} onChange={(v) => setS({ ...s, ntfyUrl: v })} placeholder="https://ntfy.sh/your-secret-topic" autoFocus required />
                  <Select
                    label="Sign-in"
                    value={auth}
                    onChange={(v) => setAuth(v as typeof auth)}
                    options={[
                      { value: "none", label: "None", supporting: "A public topic with a hard-to-guess name" },
                      { value: "token", label: "Access token", supporting: "For a protected topic" },
                      { value: "password", label: "Username and password", supporting: "For a protected topic" },
                    ]}
                  />
                  {auth === "token" && secret("ntfy_token", "Token", "tk_…")}
                  {auth === "password" && (
                    <div className="fields2">
                      <TextField label="Username" value={s.ntfyUser} onChange={(v) => setS({ ...s, ntfyUser: v })} autocomplete="off" required />
                      {secret("ntfy_password", "Password")}
                    </div>
                  )}
                  <FormActions label="Save" onCancel={() => (setS({ ...s, ntfyUrl: view.settings.ntfyUrl, ntfyUser: view.settings.ntfyUser }), setEditAlerts(false))} />
                </>
              )}
            </Adder>
          )
        )}
      </Fold>

      <Fold id="email" icon="alternate_email" title="Email" summary="The mail server reports and invites go out through" badge={view.settings.smtpHost ? undefined : "Not set"}>
        <p className="help">I send reports and invites through a mail server you choose. Any SMTP service works, including your own mailbox's.</p>
        {!editMail && view.settings.smtpHost ? (
          <>
            <Item
              icon="outgoing_mail"
              title={view.settings.smtpFrom || view.settings.smtpHost}
              detail={`${view.settings.smtpHost}:${view.settings.smtpPort} · ${view.settings.smtpSecurity === "none" ? "no encryption" : view.settings.smtpSecurity.toUpperCase()}`}
            >
              <TestButton pending={mailTest} onClick={() => runTest("/settings/smtp-test", {}, setMailTest)}>
                Send a test
              </TestButton>
              {edit && (
                <md-icon-button onClick={() => setEditMail(true)} aria-label="Edit email" title="Edit">
                  <md-icon>edit</md-icon>
                </md-icon-button>
              )}
            </Item>
            <TestRow result={mailTest} ok="Test email sent to you" bad="The test email didn't go through" />
          </>
        ) : (
          edit && <MailAdder key={String(editMail)} inst={inst} open={editMail} onOpenChange={setEditMail} />
        )}
      </Fold>
    </>
  );
}
