import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

// Models sometimes bold a phrase with **; show that as bold and drop stray asterisks.
export function Said({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((para, i) => (
          <p key={i}>
            {para.split(/\*\*/).map((bit, j) => {
              const lines = bit.replace(/\*/g, "").split("\n");
              const body = lines.map((l, k) => (
                <span key={k}>
                  {k > 0 && <br />}
                  {l}
                </span>
              ));
              return j % 2 ? <strong key={j}>{body}</strong> : <span key={j}>{body}</span>;
            })}
          </p>
        ))}
    </>
  );
}

export function Mine({ text }: { text: string }) {
  return (
    <div className="msg me">
      <div className="bub">
        <Said text={text} />
      </div>
    </div>
  );
}

export function Theirs({ children, after }: { children: ReactNode; after?: ReactNode }) {
  return (
    <div className="msg eb">
      <img src="/favicon.svg" alt="Ebenezer" />
      <div className="eb-b">
        <div className="bub">{children}</div>
        {after}
      </div>
    </div>
  );
}

export function Thinking({ label }: { label: string }) {
  return (
    <div className="msg eb">
      <img src="/favicon.svg" alt="Ebenezer" />
      <div className="bub thinking">
        <md-circular-progress indeterminate aria-label={label} />
        {label}
      </div>
    </div>
  );
}

export function ChatError({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="chat-err" role="status">
      <span className="ms">info</span>
      <span className="t">{text}</span>
      {action && <md-text-button onClick={action.onClick}>{action.label}</md-text-button>}
    </div>
  );
}

export interface Starter {
  icon: string;
  text: string;
}

export function Stage({ heading, text, starters, onStarter, children }: { heading: string; text: string; starters: Starter[]; onStarter: (s: string) => void; children?: ReactNode }) {
  return (
    <div className="stage">
      <img className="stage-logo" src="/favicon.svg" alt="" />
      <h2>{heading}</h2>
      <p>{text}</p>
      {children}
      <div className="starters">
        {starters.map((s) => (
          <button key={s.text} type="button" onClick={() => onStarter(s.text)}>
            <md-ripple />
            <md-focus-ring />
            <span className="ms">{s.icon}</span>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  className?: string;
  fresh: string;
  started: boolean;
  stage: ReactNode;
  children: ReactNode;
  placeholder: string;
  draft: string;
  setDraft: (s: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
  focus?: number;
}

export default function Chat({ className = "", fresh, started, stage, children, placeholder, draft, setDraft, onSend, busy, focus }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (started) box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  });

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (draft.trim() && !busy) onSend(draft.trim());
  };

  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
  };

  return (
    <div className={`chat ${className}`.trim()}>
      <div className="msgs" ref={box}>
        {started ? (
          children
        ) : (
          <>
            <p className="fnote">
              <span className="ms">history_toggle_off</span>
              {fresh}
            </p>
            {stage}
          </>
        )}
      </div>
      <form className={`compose${draft ? " typing" : ""}`} onSubmit={send}>
        <textarea ref={field} rows={1} value={draft} placeholder={placeholder} aria-label={placeholder} maxLength={1000} onChange={(e) => setDraft(e.target.value)} onKeyDown={key} />
        <span className="kh">
          <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </span>
        <md-icon-button type="submit" className="send" disabled={!draft.trim() || busy} aria-label="Send" title="Send (Enter)">
          <md-icon>arrow_upward</md-icon>
        </md-icon-button>
      </form>
    </div>
  );
}
