import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { composing } from "./Fields";
import { still } from "./motion";

const Follow = createContext<() => void>(() => {});
// Hands a whole reply to the screen reader at once, while the bubble types it out letter by letter.
const Announce = createContext<(text: string) => void>(() => {});

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

// Types the reply out at a steady pace, so even a long answer is done in about a second and a half.
export function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(() => (still() ? text.length : 0));
  const follow = useContext(Follow);
  const announce = useContext(Announce);
  const done = useRef(onDone);
  useEffect(() => announce(text), [text, announce]);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (still()) {
      setN(text.length);
      done.current?.();
      return;
    }
    const rate = Math.max(text.length / 1500, 0.3);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(text.length, Math.ceil((t - t0) * rate));
      setN(k);
      if (k < text.length) raf = requestAnimationFrame(step);
      else done.current?.();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  useLayoutEffect(() => follow(), [n, follow]);
  return <Said text={text.slice(0, n)} />;
}

// With typing set, text types itself out and children and after wait until it is done.
export function Theirs({ text, typing = false, onTyped, children, after }: { text?: string; typing?: boolean; onTyped?: () => void; children?: ReactNode; after?: ReactNode }) {
  return (
    <div className="msg eb">
      <img src="/favicon.svg" alt="Ebenezer" />
      <div className="eb-b">
        <div className="bub">
          {text && (typing ? <Typed text={text} onDone={onTyped} /> : <Said text={text} />)}
          {!typing && children}
        </div>
        {!typing && after}
      </div>
    </div>
  );
}

export function FollowUps({ questions, onAsk }: { questions: string[]; onAsk: (q: string) => void }) {
  if (!questions.length) return null;
  return (
    <div className="follow-ups">
      {questions.map((q) => (
        <md-assist-chip key={q} label={q} title={q} onClick={() => onAsk(q)}>
          <md-icon slot="icon">subdirectory_arrow_right</md-icon>
        </md-assist-chip>
      ))}
    </div>
  );
}

export function Thinking({ label }: { label: string }) {
  return (
    <div className="msg eb">
      <img src="/favicon.svg" alt="Ebenezer" />
      <div className="bub thinking">
        <md-circular-progress indeterminate aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

export function ChatError({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="chat-err" role="status">
      <span className="ms" aria-hidden="true">
        info
      </span>
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
            <span className="ms" aria-hidden="true">
              {s.icon}
            </span>
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
  const [heard, setHeard] = useState("");
  const id = useId();
  const stick = useCallback(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, []);

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
    if (e.key === "Enter" && !e.shiftKey && !composing(e)) send(e);
  };

  return (
    <div className={`chat ${className}`.trim()}>
      <div className="msgs" ref={box}>
        {started ? (
          <Follow.Provider value={stick}>
            <Announce.Provider value={setHeard}>{children}</Announce.Provider>
          </Follow.Provider>
        ) : (
          <>
            <p className="fnote">
              <span className="ms" aria-hidden="true">
                history_toggle_off
              </span>
              {fresh}
            </p>
            {stage}
          </>
        )}
      </div>
      <p className="sr" aria-live="polite">
        {heard}
      </p>
      <form className={`compose${draft ? " typing" : ""}`} onSubmit={send}>
        <label htmlFor={`${id}-say`} className="sr">
          Message
        </label>
        <textarea ref={field} id={`${id}-say`} rows={1} value={draft} placeholder={placeholder} maxLength={1000} onChange={(e) => setDraft(e.target.value)} onKeyDown={key} />
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
