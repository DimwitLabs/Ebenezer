import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { TextField } from "../design-system/Fields";
import { Badge } from "../design-system/Badge";
import { Item } from "../design-system/Item";
import { Tile } from "../design-system/Tile";
import StatementDialog from "../components/StatementDialog";
import { get, patch, post, type InstanceView, type Portfolio, type Section, type Voice } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { useAIForm, useMailForm, type Inst } from "../components/InstanceSetup";
import Progress from "../design-system/Progress";
import Spinner from "../design-system/Spinner";
import VoicePicker from "../components/VoicePicker";
import { portfolioPath, useSession } from "../lib/session";

const SUGGESTED = ["stocks", "funds", "deposits", "savings"];

function Welcome({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <>
      <div className="onb-b">
        <h1>Welcome, {name}</h1>
        <p className="lead">Ebenezer is at your service. Two settings let me do my whole job, and then we set up your first portfolio.</p>
        <div className="bring">
          {[
            ["auto_awesome", "Connect an AI model", "So I can sort your spends, write notes, read the news for you and answer questions", "2 minutes"],
            ["alternate_email", "Set up email", "So I can send your daily report and invite the people you choose", "2 minutes"],
            ["account_balance_wallet", "Your first portfolio", "Tell me what you hold and I'll keep the books", "5 minutes"],
          ].map(([icon, title, hint, time]) => (
            <Item key={title} icon={icon} tone="on" title={title} detail={hint}>
              <Badge>{time}</Badge>
            </Item>
          ))}
        </div>
      </div>
      <div className="onb-f">
        <span className="help onb-note">
          <span className="ms" aria-hidden="true">
            schedule
          </span>
          Skip anything you like; it'll wait for you on Today.
        </span>
        <md-filled-button onClick={onNext}>Let's begin</md-filled-button>
      </div>
    </>
  );
}

function StepFoot({ ready, save, onBack, onNext }: { ready: boolean; save: () => Promise<boolean>; onBack: () => void; onNext: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="onb-f">
      <md-text-button onClick={onBack}>Back</md-text-button>
      <div className="onb-r">
        <md-text-button onClick={onNext}>Do it later</md-text-button>
        <md-filled-button
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            if (await save()) onNext();
            setBusy(false);
          }}
        >
          Save and continue
        </md-filled-button>
      </div>
    </div>
  );
}

function AIStep({ inst, onBack, onNext }: { inst: Inst; onBack: () => void; onNext: () => void }) {
  const ai = useAIForm(inst);
  return (
    <>
      <div className="onb-b">
        <h1>Connect an AI model</h1>
        <p className="lead">I reach AI models through OpenRouter, so you choose the model and pay only for what I use. A month of notes and spends costs a few rupees on a small model.</p>
        <div className="card onb-panel">
          {ai.form}
          <div className="acts">{ai.testButton}</div>
        </div>
      </div>
      <StepFoot ready={ai.ready} save={ai.save} onBack={onBack} onNext={onNext} />
    </>
  );
}

function MailStep({ inst, onBack, onNext }: { inst: Inst; onBack: () => void; onNext: () => void }) {
  const mail = useMailForm(inst);
  return (
    <>
      <div className="onb-b">
        <h1>Set up email</h1>
        <p className="lead">I send your daily report and invites through a mail server you choose. Any SMTP service works, including your own mailbox's.</p>
        <div className="card onb-panel">
          {mail.form}
          <div className="acts">{mail.testButton}</div>
        </div>
        {mail.providers}
      </div>
      <StepFoot ready={mail.ready} save={mail.save} onBack={onBack} onNext={onNext} />
    </>
  );
}

export default function OnboardingScreen() {
  const { catalogue, refresh, choose, user, portfolios } = useSession();
  const [first] = useState(portfolios.length === 0);
  // The owner's first portfolio is also the instance's first run, so it starts with the AI model and the mail server.
  const owning = first && !!user?.isOwner;
  const pre = owning ? 3 : 0;
  const steps = pre + 4;
  const inst = useLoad<InstanceView>(owning ? "/settings" : null);
  const navigate = useNavigate();
  const [at, setAt] = useState(0);
  const step = at - pre;
  const setStep = (n: number) => setAt(n + pre);
  const [name, setName] = useState(first ? `${user?.name.split(" ")[0] ?? "My"}'s money` : "");
  const [picked, setPicked] = useState<string[]>(SUGGESTED);
  const [voice, setVoice] = useState<Pick<Voice, "personality" | "custom" | "tone">>({ personality: "accountant", custom: "", tone: "dry" });
  const [sections, setSections] = useState<Section[]>([]);
  const [pid, setPid] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const kinds = (catalogue?.kinds ?? []).filter((k) => k.key !== "custom");
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await post<Portfolio>("/portfolios", { name, kinds: picked });
      const p = await patch<Portfolio>(`/portfolios/${made.id}`, { settings: { ...made.settings, voice: { ...made.settings.voice, ...voice, custom: voice.custom.trim() } } });
      setSections(await get<Section[]>(`/portfolios/${p.id}/sections`));
      setPid(p.id);
      setSlug(p.slug);
      choose(p.id);
      await refresh();
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploaded = async () => {
    setUploading(false);
    if (pid) setSections(await get<Section[]>(`/portfolios/${pid}/sections`).catch(() => sections));
  };

  // Each step is a form, so Enter moves on and the browser checks the name before it does.
  const next = (e: FormEvent) => {
    e.preventDefault();
    if (step === 0) {
      if (name.trim()) setStep(1);
      else setError("Give the portfolio a name.");
    } else if (step === 1 && picked.length) setStep(2);
    else if (step === 2) create();
  };

  // A new step is a new page to a screen reader, so focus moves to its heading. The name field keeps its own autofocus.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step > 0) heading.current?.focus();
    setError(null);
  }, [step]);

  const open = (section: Section, action: "import" | "add") => navigate(portfolioPath(slug!, "/data"), { state: { section: section.id, action } });

  return (
    <div className="onb">
      <div className="onb-top">
        <img src="/favicon.svg" alt="" />
        Ebenezer
        {!first && (
          <md-icon-button onClick={() => navigate("/")} aria-label="Close">
            <md-icon>close</md-icon>
          </md-icon-button>
        )}
      </div>
      <div className="lin">
        <Progress done={at + 1} total={steps} label={`Step ${at + 1} of ${steps}`} />
      </div>
      {at < pre &&
        (!inst.data ? (
          <Spinner className="loading" />
        ) : at === 0 ? (
          <Welcome name={user?.name.split(" ")[0] ?? ""} onNext={() => setAt(1)} />
        ) : at === 1 ? (
          <AIStep inst={inst} onBack={() => setAt(0)} onNext={() => setAt(2)} />
        ) : (
          <MailStep inst={inst} onBack={() => setAt(1)} onNext={() => setAt(3)} />
        ))}
      {at >= pre && (
        <form className="onb-form" onSubmit={next}>
          <div className="onb-b">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {step === 0 && (
              <>
                <h1 ref={heading} tabIndex={-1}>
                  Name this portfolio
                </h1>
                <p className="lead">A portfolio is one set of books. Keep yours and your parents' apart, or put the whole household in one.</p>
                <TextField label="Name" name="portfolio" value={name} onChange={setName} autoFocus maxLength={80} required />
              </>
            )}
            {step === 1 && (
              <>
                <h1 ref={heading} tabIndex={-1}>
                  What do you hold?
                </h1>
                <p className="lead">Each one becomes a section. Shares and funds are priced every evening from the exchanges and AMFI. You can add your own kinds later, like a car or a chit fund.</p>
                <div className="pick">
                  {kinds.map((k) => (
                    <Tile key={k.key} icon={k.icon} title={k.name} hint={k.hint} pressed={picked.includes(k.key)} onClick={() => toggle(k.key)}>
                      <span className="chk">
                        <span className="ms" aria-hidden="true">
                          check
                        </span>
                      </span>
                    </Tile>
                  ))}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h1 ref={heading} tabIndex={-1}>
                  How should I talk to you?
                </h1>
                <p className="lead">This is how I'll sound in my notes, the daily report and my answers about {name.trim() || "this portfolio"}. You can change it any time in Settings.</p>
                <VoicePicker value={voice} onChange={setVoice} />
              </>
            )}
            {step === 3 && (
              <>
                <h1 ref={heading} tabIndex={-1}>
                  Bring it in
                </h1>
                <p className="lead">Start from a statement, then paste from a spreadsheet or a broker export, or type rows in. Each section takes rows from all three.</p>
                <div className="bring">
                  <Item className="first" icon="description" tone="on" title="Start with a statement" detail="CAMS or KFintech for mutual funds, NSDL or CDSL for everything in demat">
                    <md-filled-button type="button" onClick={() => setUploading(true)} disabled={!pid}>
                      <md-icon slot="icon">upload_file</md-icon>Upload a statement
                    </md-filled-button>
                  </Item>
                  {sections.map((s) => (
                    <Item key={s.id} icon={s.icon} tone="on" title={s.name} detail={catalogue?.kinds.find((k) => k.key === s.kind)?.hint}>
                      <md-filled-tonal-button type="button" onClick={() => open(s, "import")}>
                        <md-icon slot="icon">upload</md-icon>Import
                      </md-filled-tonal-button>
                      <md-text-button type="button" onClick={() => open(s, "add")}>
                        Add by hand
                      </md-text-button>
                    </Item>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="onb-f">
            {(step === 1 || step === 2 || (step === 0 && owning)) && (
              <md-text-button type="button" onClick={() => setAt(at - 1)}>
                Back
              </md-text-button>
            )}
            {step === 0 && <md-filled-button type="submit">Next</md-filled-button>}
            {step === 1 && (
              <md-filled-button type="submit" disabled={picked.length === 0}>
                Next
              </md-filled-button>
            )}
            {step === 2 && (
              <md-filled-button type="submit" disabled={busy || (voice.personality === "custom" && !voice.custom.trim())}>
                Create portfolio
              </md-filled-button>
            )}
            {step === 3 && (
              <md-filled-button type="button" onClick={() => navigate(slug ? portfolioPath(slug) : "/")}>
                Done for now
              </md-filled-button>
            )}
          </div>
        </form>
      )}
      {uploading && pid && <StatementDialog portfolioId={pid} onClose={() => setUploading(false)} onDone={uploaded} />}
    </div>
  );
}
