import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Chat, { ChatError, FollowUps, Mine, Stage, Theirs, Thinking } from "../design-system/Chat";
import { PageHead } from "../design-system/PageHead";
import SeesDialog from "../components/SeesDialog";
import { ApiError, ask, isNoAI, get, type Ledger, type Portfolio, type Turn } from "../lib/api";
import { sentence } from "../lib/format";
import { usePortfolio, useSession } from "../lib/session";

const STARTERS = [
  { icon: "trending_up", text: "Is HODL working for me?" },
  { icon: "compare_arrows", text: "Where am I losing to the index?" },
  { icon: "savings", text: "How much is sitting idle?" },
  { icon: "credit_score", text: "What does my debt cost me?" },
];

function LedgerDialog({ pid, onClose }: { pid: string; onClose: () => void }) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<Ledger>(`/portfolios/${pid}/ledger`)
      .then(setLedger)
      .catch((e: Error) => setError(e.message));
  }, [pid]);
  return <SeesDialog help="The plain text sent to the model with each question, along with your instructions from Settings." text={ledger?.ledger ?? null} error={error} onClose={onClose} />;
}

function Answer({ turn, typing, onTyped, onAsk }: { turn: Turn; typing: boolean; onTyped: () => void; onAsk?: (q: string) => void }) {
  return (
    <Theirs text={turn.content} typing={typing} onTyped={onTyped} after={onAsk && <FollowUps questions={turn.followUps ?? []} onAsk={onAsk} />}>
      {turn.redacted && (
        <p className="redacted">
          <span className="ms" aria-hidden="true">
            visibility_off
          </span>
          <span>Your OpenRouter account replaced some names with placeholders like [ADDRESS] before the model saw them. Turn off PII redaction for this key on OpenRouter.</span>
        </p>
      )}
    </Theirs>
  );
}

function Conversation({ p }: { p: Portfolio }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<{ message: string; noKey: boolean } | null>(null);
  const [ledger, setLedger] = useState(false);
  const { user } = useSession();
  const navigate = useNavigate();

  const send = async (question: string) => {
    if (busy || typing) return;
    const history = turns.slice(-8);
    setTurns((t) => [...t, { role: "user", content: question }]);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const { answer, redacted, followUps } = await ask(p.id, question, history);
      setTurns((t) => [...t, { role: "assistant", content: answer, redacted, followUps }]);
      setTyping(!!answer);
    } catch (e) {
      setTurns((t) => t.slice(0, -1));
      const status = e instanceof ApiError ? e.status : 0;
      const message =
        status === 429
          ? "That's a lot of questions at once. Give me a minute."
          : status === 502
            ? "I couldn't reach the model just now. Try again in a moment."
            : sentence((e as Error).message) || "Something went wrong. Try again.";
      setDraft(question);
      setError({ message, noKey: isNoAI(e) && !!user?.isOwner });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ask">
      <PageHead title="Ask Ebenezer" status={`Questions about ${p.name}, answered from the ledger`}>
        <md-text-button className="sees" onClick={() => setLedger(true)} aria-label="What Ebenezer sees" title="What Ebenezer sees">
          <md-icon slot="icon">visibility</md-icon>
          <span className="l">What Ebenezer sees</span>
        </md-text-button>
      </PageHead>
      <Chat
        className="card askc"
        fresh="A fresh chat each visit. Nothing you ask is kept."
        started={turns.length > 0 || busy || !!error}
        stage={
          <Stage
            heading="What do you want to know?"
            text="Ask about returns, idle money, debt or where the index beat you. I read the same ledger you can see."
            starters={STARTERS}
            onStarter={(s) => void send(s)}
          />
        }
        placeholder="Ask about your money"
        draft={draft}
        setDraft={setDraft}
        onSend={(t) => void send(t)}
        busy={busy || typing}
      >
        {turns.map((t, i) =>
          t.role === "user" ? (
            <Mine key={i} text={t.content} />
          ) : (
            <Answer key={i} turn={t} typing={typing && i === turns.length - 1} onTyped={() => setTyping(false)} onAsk={i === turns.length - 1 && !busy ? (q) => void send(q) : undefined} />
          ),
        )}
        {busy && <Thinking label="Going through the books" />}
        {error && <ChatError text={error.message} action={error.noKey ? { label: "Open AI settings", onClick: () => navigate("/admin#ai") } : undefined} />}
      </Chat>
      <p className="help ask-foot">Answers come from your ledger and an AI model you chose. Not advice.</p>
      {ledger && <LedgerDialog pid={p.id} onClose={() => setLedger(false)} />}
    </div>
  );
}

export default function AskScreen() {
  const p = usePortfolio();
  return <Conversation key={p.id} p={p} />;
}
