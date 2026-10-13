import { useMemo, useState } from "react";

import { post, put, type InstanceSettings, type InstanceView, type Model, type SecretName, type TestResult } from "../lib/api";
import { sentence } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { Select, TextField } from "../design-system/Fields";
import SecretField from "../design-system/SecretField";
import { useSnack } from "../design-system/Snack";
import Spinner from "../design-system/Spinner";

export type Inst = ReturnType<typeof useLoad<InstanceView>>;
export type Pending = TestResult | "busy" | null;

function usd(n: number): string {
  return `$${n > 0 && n < 0.1 ? n.toFixed(3).replace(/0$/, "") : n.toFixed(2)}`;
}

function priceText(m: Model): string {
  if (m.prompt < 0 || m.completion < 0) return "Price varies";
  if (!m.prompt && !m.completion) return "Free";
  return `${usd(m.prompt)} / ${usd(m.completion)} per M tokens`;
}

const provider = (id: string) => id.split("/")[0];

// Keeps the current choice even when the list has not loaded or no longer has it.
export function modelOptions(models: Model[] | null | undefined, current: string | undefined) {
  const list = [...(models ?? [])].sort((a, b) => provider(a.id).localeCompare(provider(b.id)) || a.name.localeCompare(b.name));
  const opts = list.map((m) => ({ value: m.id, label: m.name || m.id, supporting: `${m.id} · ${priceText(m)}` }));
  if (current && !list.some((m) => m.id === current)) opts.unshift({ value: current, label: current, supporting: models ? "Not in OpenRouter's list right now" : "Loading the list of models" });
  return opts;
}

export async function runTest(path: string, body: unknown, set: (p: Pending) => void) {
  set("busy");
  try {
    const r = await post<Partial<TestResult>>(path, body);
    set({ ok: r.ok !== false, detail: r.detail ?? "" });
  } catch (e) {
    set({ ok: false, detail: sentence((e as Error).message) });
  }
}

export function TestRow({ result, ok = "Connection works", bad = "Connection failed" }: { result: Pending; ok?: string; bad?: string }) {
  if (!result || result === "busy") return null;
  return (
    <div className={`test ${result.ok ? "ok" : "bad"}`} role="status">
      <span className="ms" aria-hidden="true">
        {result.ok ? "check_circle" : "error"}
      </span>
      <div>
        <b>{result.ok ? ok : bad}</b>
        {result.detail && <span>{result.detail}</span>}
      </div>
    </div>
  );
}

export function TestButton({ pending, onClick, disabled, children }: { pending: Pending; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <md-text-button onClick={onClick} disabled={disabled || pending === "busy"}>
      {pending === "busy" ? <Spinner size={18} slot="icon" label="Testing" /> : <md-icon slot="icon">bolt</md-icon>}
      {children}
    </md-text-button>
  );
}

export const aiReady = (v: InstanceView) => v.secrets.openrouter_key.set;
export const mailReady = (v: InstanceView) => !!v.settings.smtpHost;

export async function saveInstance(picked: Partial<InstanceSettings>, secrets: Partial<Record<SecretName, string>> = {}) {
  await put("/settings", picked);
  for (const [n, v] of Object.entries(secrets)) if (v?.trim()) await put(`/settings/secrets/${n}`, { value: v.trim() });
}

export function useSecretRemoval(inst: Inst, done: () => void) {
  const say = useSnack();
  return async (n: SecretName) => {
    try {
      await put(`/settings/secrets/${n}`, { value: "" });
      done();
      say("Removed");
      inst.reload();
    } catch (e) {
      say((e as Error).message, true);
    }
  };
}

export function useAIForm(inst: Inst) {
  const say = useSnack();
  const view = inst.data!;
  const [model, setModel] = useState(view.settings.openRouterModel);
  const [key, setKey] = useState("");
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<Pending>(null);
  const models = useLoad<Model[]>("/settings/models");
  const choices = useMemo(() => modelOptions(models.data, model), [models.data, model]);
  const remove = useSecretRemoval(inst, () => setVersion((x) => x + 1));
  const edit = view.canEdit;

  const save = async () => {
    try {
      await saveInstance({ openRouterModel: model }, { openrouter_key: key });
      setKey("");
      setVersion((x) => x + 1);
      inst.reload();
      say("Saved. Everyone on this Ebenezer gets it too");
      return true;
    } catch (e) {
      say((e as Error).message, true);
      return false;
    }
  };
  const test = () => runTest("/settings/ai-test", { key: key.trim() || undefined, model }, setPending);

  const form = (
    <>
      <div className="fields2">
        <SecretField
          key={version}
          label="OpenRouter key"
          state={view.secrets.openrouter_key}
          value={key}
          onChange={setKey}
          onRemove={() => remove("openrouter_key")}
          disabled={!edit}
          placeholder="sk-or-…"
        />
        {models.error ? (
          <TextField label="Model" value={model} disabled={!edit} onChange={setModel} info={`I couldn't load the list, so type a model name. ${sentence(models.error)}`} />
        ) : (
          <Select
            key={models.data ? "listed" : "waiting"}
            label="Model"
            value={model}
            disabled={!edit}
            onChange={setModel}
            options={choices}
            info={models.data ? `${models.data.length} models, by provider. Prices are per million tokens in and out.` : "Loading the list of models…"}
          />
        )}
      </div>
      {!aiReady(view) && (
        <p className="help keyhint">
          <span className="ms" aria-hidden="true">
            key
          </span>
          <span>
            No key yet? Make one at{" "}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
              openrouter.ai/keys
            </a>{" "}
            and add a few dollars of credit.
          </span>
        </p>
      )}
      <TestRow result={pending} ok="The model answered" bad="The model didn't answer" />
    </>
  );
  const ready = aiReady(view) || !!key.trim();
  const testButton = (
    <TestButton pending={pending} onClick={() => void test()} disabled={!edit || !ready}>
      Test
    </TestButton>
  );
  return { form, testButton, save, ready };
}

const PROVIDERS: [string, Pick<InstanceSettings, "smtpHost" | "smtpPort" | "smtpSecurity">][] = [
  ["Gmail", { smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecurity: "starttls" }],
  ["Outlook", { smtpHost: "smtp-mail.outlook.com", smtpPort: 587, smtpSecurity: "starttls" }],
  ["Zoho", { smtpHost: "smtp.zoho.com", smtpPort: 587, smtpSecurity: "starttls" }],
];

type Mail = Pick<InstanceSettings, "smtpHost" | "smtpPort" | "smtpSecurity" | "smtpUser" | "smtpFrom">;
const mailOf = (s: InstanceSettings): Mail => ({ smtpHost: s.smtpHost, smtpPort: s.smtpPort || 587, smtpSecurity: s.smtpSecurity, smtpUser: s.smtpUser, smtpFrom: s.smtpFrom });

// The server's test mail goes out through the saved settings, so testing saves first.
export function useMailForm(inst: Inst) {
  const say = useSnack();
  const view = inst.data!;
  const [m, setM] = useState<Mail>(mailOf(view.settings));
  const [password, setPassword] = useState("");
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<Pending>(null);
  const remove = useSecretRemoval(inst, () => setVersion((x) => x + 1));
  const set = (patch: Partial<Mail>) => setM({ ...m, ...patch });
  const ready = !!m.smtpHost.trim() && !!m.smtpFrom.trim();

  const store = async () => {
    await saveInstance(m, { smtp_password: password });
    setPassword("");
    setVersion((x) => x + 1);
    inst.reload();
  };
  const save = async () => {
    try {
      await store();
      say("Saved. Reports and invites go out through it now");
      return true;
    } catch (e) {
      say((e as Error).message, true);
      return false;
    }
  };
  const test = async () => {
    try {
      await store();
    } catch (e) {
      return setPending({ ok: false, detail: sentence((e as Error).message) });
    }
    await runTest("/settings/smtp-test", {}, setPending);
  };

  const form = (
    <>
      <div className="fields3">
        <TextField label="SMTP host" value={m.smtpHost} onChange={(v) => set({ smtpHost: v })} placeholder="smtp.example.com" autocomplete="off" autoFocus required />
        <TextField label="Port" type="number" value={String(m.smtpPort || "")} onChange={(v) => set({ smtpPort: Number(v) || 0 })} />
        <Select
          label="Security"
          value={m.smtpSecurity}
          onChange={(v) => set({ smtpSecurity: v as Mail["smtpSecurity"] })}
          options={[
            { value: "starttls", label: "STARTTLS", supporting: "Usually port 587" },
            { value: "tls", label: "TLS", supporting: "Usually port 465" },
            { value: "none", label: "None", supporting: "Only on a trusted network" },
          ]}
        />
      </div>
      <div className="fields3">
        <TextField label="Username" value={m.smtpUser} onChange={(v) => set({ smtpUser: v })} placeholder="Often your email address" autocomplete="off" />
        <SecretField key={version} label="Password" state={view.secrets.smtp_password} value={password} onChange={setPassword} onRemove={() => remove("smtp_password")} />
        <TextField label="From address" type="email" value={m.smtpFrom} onChange={(v) => set({ smtpFrom: v })} placeholder="ebenezer@example.com" required />
      </div>
      <TestRow result={pending} ok="Test email sent to you" bad="The test email didn't go through" />
    </>
  );
  const providers = (
    <div className="known">
      <span>Gmail, Outlook or Zoho? Pick yours to fill in the server for it.</span>
      {PROVIDERS.map(([name, p]) => (
        <md-assist-chip key={name} label={name} onClick={() => set(p)}>
          <md-icon slot="icon">mail</md-icon>
        </md-assist-chip>
      ))}
    </div>
  );
  const testButton = (
    <TestButton pending={pending} onClick={() => void test()} disabled={!ready}>
      Send me a test
    </TestButton>
  );
  return { form, providers, testButton, save, ready };
}
