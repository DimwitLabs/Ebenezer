import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Amount from "../design-system/Amount";
import CategoryTidy from "../components/CategoryTidy";
import { Badge } from "../design-system/Badge";
import Chat, { ChatError, Mine, Stage, Theirs, Thinking } from "../design-system/Chat";
import { Hero } from "../design-system/Hero";
import { PageHead } from "../design-system/PageHead";
import { EbenezerNote, type Note } from "../components/Note";
import ImportDialog from "../components/ImportDialog";
import Ledger, { CategoryIcon, Pick, type LedgerFilter } from "../components/Ledger";
import { useSnack } from "../design-system/Snack";
import Spinner from "../design-system/Spinner";
import Trends from "../components/Trends";
import { ApiError, isNoAI, post, put, type ChatResult, type Expenses, type Note as NoteData, type PaidResult, type Spend } from "../lib/api";
import { money, nameCase, sentence } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { usePortfolio, useSession, useTo } from "../lib/session";
import { dayLabel, shortDay } from "../lib/spends";

export type Show = "ov" | "chat" | "led";

export function PhoneTabs({ show, onShow }: { show: Show | "cards"; onShow: (s: Show | "cards") => void }) {
  const tabs: [Show | "cards", string][] = [
    ["ov", "Overview"],
    ["chat", "Chat"],
    ["led", "Ledger"],
    ["cards", "Cards"],
  ];
  return (
    <div className="ptabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={show === k} className={show === k ? "on" : ""} onClick={() => onShow(k)}>
          <md-ripple />
          {l}
        </button>
      ))}
    </div>
  );
}

export function NoteCard({ note, meta, onLine }: { note: NoteData; meta: string; onLine: (target: string) => void }) {
  const lines: Note[] = note.lines.map((l) => ({ icon: l.icon, text: l.text, action: l.section ? { label: "Show me", onClick: () => onLine(l.section!) } : undefined }));
  const first = note.lead ? undefined : lines[0];
  const rest = note.lead ? lines : lines.slice(1);
  return (
    <EbenezerNote
      className="s4"
      lead={note.lead || first?.text || ""}
      quiet={first || note.lead ? undefined : "Nothing here needs you."}
      action={first?.action}
      lines={rest}
      sees={note.sees}
      meta={meta}
    />
  );
}

function SpendHero({ e }: { e: Expenses }) {
  const o = e.overview;
  const d = o.total - o.lastSoFar;
  return (
    <Hero
      icon="receipt_long"
      title={`${o.month} so far`}
      meta={`${o.count} ${o.count === 1 ? "spend" : "spends"}${o.through ? ` · to ${shortDay(o.through)}` : ""}`}
      value={<Amount n={o.total} />}
      pill={
        o.lastSoFar > 0 && Math.round(d) !== 0
          ? { icon: d > 0 ? "north_east" : "south_east", bad: d > 0, text: `${money(Math.abs(d))} ${d > 0 ? "more" : "less"} than by this day in ${o.lastMonth}` }
          : undefined
      }
      stats={[
        { label: "A usual month", value: o.usual ? <Amount n={o.usual} /> : "—" },
        { label: "Bills still to come", value: o.billsToCome ? <Amount n={o.billsToCome} /> : "None" },
        { label: "On cards, not billed yet", value: e.cards.length ? <Amount n={o.onCards} /> : "—" },
      ]}
      foot={
        o.bills.length > 0
          ? `Still to come: ${o.bills.map(nameCase).join(", ")}, going by the last three months.`
          : o.usual
            ? "A usual month is the middle of your last six."
            : "A usual month shows once you have a month behind you."
      }
    />
  );
}

type Entry =
  { kind: "me"; text: string } | { kind: "eb"; res: ChatResult; undone?: boolean; picked: Record<string, string>; paid: string[]; offer: boolean } | { kind: "err"; text: string; noAI: boolean };

function said(res: ChatResult): string {
  if (res.reply) return res.reply;
  return `Saved ${res.saved.map((s) => `${s.item} ${money(s.amount)} in ${s.category || "no category"}`).join("; ")}.`;
}

function SpendRows({ e, spends, fresh }: { e: Expenses; spends: Spend[]; fresh: string[] }) {
  return (
    <div className="spends">
      {spends.map((s) => (
        <div key={s.id} className="srow">
          <CategoryIcon e={e} name={s.category} />
          <div>
            <b>{s.item}</b>
            <span className="s">
              {dayLabel(s.day)} {s.category && <Badge tone={fresh.includes(s.category) ? "on" : undefined}>{fresh.includes(s.category) ? `${s.category} · new` : s.category}</Badge>}{" "}
              {e.methods.find((m) => m.key === s.paidWith)?.name}
            </span>
          </div>
          <span className="num">{money(s.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function SpendChat({ e, onChange, onTidy }: { e: Expenses; onChange: (x: Expenses) => void; onTidy: () => void }) {
  const p = usePortfolio();
  const say = useSnack();
  const { user } = useSession();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [focus, setFocus] = useState(0);
  const [pending, setPending] = useState<Record<string, string>>({});

  const history = entries.flatMap((x) => (x.kind === "me" ? [{ role: "user", content: x.text }] : x.kind === "eb" ? [{ role: "assistant", content: said(x.res) }] : [])).slice(-8);

  const send = async (text: string) => {
    setEntries((xs) => [...xs, { kind: "me", text }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await post<ChatResult>(`/portfolios/${p.id}/expenses/chat`, { message: text, history });
      setEntries((xs) => [...xs, { kind: "eb", res, picked: {}, paid: [], offer: res.offerTidy }]);
      setTyping(!!res.reply);
      onChange(res.expenses);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setEntries((xs) => [...xs, { kind: "err", text: status === 429 ? "That's a lot of messages at once. Give me a minute." : sentence((err as Error).message), noAI: isNoAI(err) }]);
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, f: (x: Extract<Entry, { kind: "eb" }>) => Extract<Entry, { kind: "eb" }>) => setEntries((xs) => xs.map((x, j) => (j === i && x.kind === "eb" ? f(x) : x)));

  const pay = async (s: Spend, key: string, i?: number) => {
    try {
      const r = await put<PaidResult>(`/portfolios/${p.id}/spends/${s.id}/paid`, { paidWith: key });
      onChange(r.expenses);
      const line = [`Saved · ${r.saved}`, ...r.effects].join(" · ");
      if (i === undefined) setPending((x) => ({ ...x, [s.id]: line }));
      else update(i, (x) => ({ ...x, picked: { ...x.picked, [s.id]: key }, paid: [...x.paid, line] }));
    } catch (err) {
      say((err as Error).message, true);
    }
  };

  const undo = async (i: number, ids: string[]) => {
    try {
      onChange(await post<Expenses>(`/portfolios/${p.id}/spends/undo`, { ids }));
      update(i, (x) => ({ ...x, undone: true, offer: false }));
    } catch (err) {
      say((err as Error).message, true);
    }
  };

  const asking = e.spends.filter((s) => s.asking).slice(0, 3);
  const card = e.methods.find((m) => m.kind === "card")?.name;
  const account = e.methods.find((m) => m.kind === "account")?.name;
  const starters = [
    { icon: "edit_note", text: `swiggy 450${card ? ` on ${card.toLowerCase()}` : ""}` },
    { icon: "edit_note", text: `electricity 2,340${account ? ` from ${account.toLowerCase()}` : ""}` },
    { icon: "query_stats", text: "how much on food this month?" },
    card ? { icon: "credit_card", text: `what's left on ${card.toLowerCase()}?` } : { icon: "date_range", text: "what did I spend last week?" },
  ];

  return (
    <Chat
      className="card chatc"
      fresh="A fresh chat each visit. What you save stays in the ledger."
      started={entries.length > 0}
      focus={focus}
      stage={
        <Stage
          heading="What did you spend?"
          text="Say it as you would to a friend. I'll sort it into categories and keep the ledger."
          starters={starters}
          onStarter={(s) => {
            setDraft(s);
            setFocus((n) => n + 1);
          }}
        >
          {asking.map((s) => (
            <div className="pendc" key={s.id}>
              <div className="pend-h">
                <CategoryIcon e={e} name={s.category} />
                <div>
                  <b>
                    {s.item} · {money(s.amount)}
                  </b>
                  <span className="s">{dayLabel(s.day)} · missing how you paid</span>
                </div>
              </div>
              {pending[s.id] ? (
                <p className="saved">
                  <span className="ms">check_circle</span>
                  {pending[s.id]}
                </p>
              ) : (
                <Pick methods={e.methods} onPick={(k) => void pay(s, k)} />
              )}
            </div>
          ))}
        </Stage>
      }
      placeholder="A spend, or a question about them"
      draft={draft}
      setDraft={setDraft}
      onSend={(t) => void send(t)}
      busy={busy || typing}
    >
      {entries.map((x, i) => {
        if (x.kind === "me") return <Mine key={i} text={x.text} />;
        if (x.kind === "err") return <ChatError key={i} text={x.text} action={x.noAI && user?.isOwner ? { label: "Open AI settings", onClick: () => navigate("/admin#ai") } : undefined} />;
        const { res } = x;
        const asks = res.saved.filter((s) => res.asking.includes(s.id));
        const same = res.saved.every((s) => s.paidWith && s.paidWith === res.saved[0].paidWith) ? e.methods.find((m) => m.key === res.saved[0]?.paidWith)?.name : undefined;
        return (
          <Theirs
            key={i}
            text={res.reply}
            typing={typing && i === entries.length - 1}
            onTyped={() => setTyping(false)}
            after={
              <>
                {res.saved.length > 0 && (
                  <p className="saved">
                    <span className="ms">{x.undone ? "undo" : "check_circle"}</span>
                    {x.undone ? "Removed from the ledger" : [`Saved ${res.saved.length > 1 ? res.saved.length : ""}`.trim(), ...res.effects].join(" · ")}
                    {!x.undone && (
                      <md-text-button
                        className="undo"
                        onClick={() =>
                          void undo(
                            i,
                            res.saved.map((s) => s.id),
                          )
                        }
                      >
                        Undo
                      </md-text-button>
                    )}
                  </p>
                )}
                {x.paid.map((l) => (
                  <p className="saved" key={l}>
                    <span className="ms">check_circle</span>
                    {l}
                  </p>
                ))}
                {x.offer && (
                  <div className="offer">
                    <span className="ms">auto_fix_high</span>
                    <p>
                      <b>
                        {res.newCategories.join(", ")} {res.newCategories.length === 1 ? "is a new category" : "are new categories"}.
                      </b>
                      Want me to tidy your categories? You'll see every change first.
                    </p>
                    <div className="oa">
                      <md-filled-tonal-button onClick={() => (update(i, (y) => ({ ...y, offer: false })), onTidy())}>Tidy now</md-filled-tonal-button>
                      <md-text-button onClick={() => update(i, (y) => ({ ...y, offer: false }))}>Not now</md-text-button>
                    </div>
                  </div>
                )}
              </>
            }
          >
            {res.saved.length > 1 && !res.reply && <p>{`${res.saved.length} spends${same ? ` on ${same}` : ""}:`}</p>}
            {res.saved.length > 0 && <SpendRows e={e} spends={res.saved} fresh={res.newCategories} />}
            {!x.undone &&
              asks.map((s) => (
                <div key={s.id} className="ask-pay">
                  <p>{asks.length > 1 ? `${s.item}, ${money(s.amount)}: what did you pay with?` : "What did you pay with?"}</p>
                  <Pick methods={e.methods} chosen={x.picked[s.id]} onPick={(k) => void pay(s, k, i)} />
                </div>
              ))}
          </Theirs>
        );
      })}
      {busy && <Thinking label="Writing it down" />}
    </Chat>
  );
}

export default function ExpensesScreen() {
  const p = usePortfolio();
  const navigate = useNavigate();
  const to = useTo();
  const { data: e, error, setData } = useLoad<Expenses>(`/portfolios/${p.id}/expenses`);
  const arrived = (useLocation().state ?? {}) as { show?: Show; filter?: LedgerFilter };
  const [show, setShow] = useState<Show>(arrived.show ?? "chat");
  const [filter, setFilter] = useState<LedgerFilter>(arrived.filter ?? { kind: "all" });
  const [tidy, setTidy] = useState(false);
  const [importing, setImporting] = useState(false);
  const ledger = useRef<HTMLDivElement>(null);

  if (error) return <p className="error">{error}</p>;
  if (!e) return <Spinner className="loading" />;

  const toLedger = (f: LedgerFilter) => {
    setFilter(f);
    setShow("led");
    ledger.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const onLine = (target: string) => {
    if (target.startsWith("card:")) return navigate(`${to("/expenses/cards")}#${target.slice(5)}`);
    if (target.startsWith("category:")) return toLedger({ kind: "category", name: target.slice(9) });
    if (target === "asking") return toLedger({ kind: "asking" });
    if (target === "cards") return navigate(to("/expenses/cards"));
    if (target === "portfolio") return navigate(to("/portfolio"));
  };

  return (
    <>
      <PageHead className="exhead" title="Expenses" status="Tell me what you spent and I'll keep the ledger">
        <md-outlined-button onClick={() => setImporting(true)}>
          <md-icon slot="icon">move_to_inbox</md-icon>
          Import
        </md-outlined-button>
        <md-filled-tonal-button onClick={() => setTidy(true)} disabled={e.spends.length === 0}>
          <md-icon slot="icon">auto_fix_high</md-icon>
          Tidy
        </md-filled-tonal-button>
      </PageHead>
      <PhoneTabs show={show} onShow={(s) => (s === "cards" ? navigate(to("/expenses/cards")) : setShow(s))} />
      <div className="exp" data-show={show}>
        <div className="grid top2">
          <SpendHero e={e} />
          <NoteCard note={e.note} meta={e.overview.count ? `${e.overview.count} spends in ${e.overview.month}` : "From your ledger"} onLine={onLine} />
        </div>
        <SpendChat e={e} onChange={setData} onTidy={() => setTidy(true)} />
        <div className="side" ref={ledger}>
          <Ledger e={e} onChange={setData} filter={filter} setFilter={setFilter} />
        </div>
        <Trends spends={e.spends} categories={e.categories} />
      </div>
      {tidy && <CategoryTidy onClose={() => setTidy(false)} onDone={setData} />}
      {importing && <ImportDialog target={{ kind: "expenses", expenses: e, onSaved: setData }} onClose={() => setImporting(false)} onDone={() => setImporting(false)} />}
    </>
  );
}
