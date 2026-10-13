import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Amount from "../design-system/Amount";
import CardDialog from "../components/CardDialog";
import { CardFace } from "../components/CardFace";
import ImportDialog from "../components/ImportDialog";
import { Badge } from "../design-system/Badge";
import { Hero } from "../design-system/Hero";
import { PageHead } from "../design-system/PageHead";
import { Stats } from "../design-system/Stat";
import { Tile } from "../design-system/Tile";
import { useSnack } from "../design-system/Snack";
import Spinner from "../design-system/Spinner";
import { post, type CardState, type Expenses } from "../lib/api";
import { daysTo, money, plainPct } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { usePortfolio, useTo } from "../lib/session";
import { shortDay, toTime } from "../lib/spends";
import { NoteCard, PhoneTabs } from "./ExpensesScreen";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

function DueBadge({ c }: { c: CardState }) {
  const owe = c.unpaid;
  const [icon, text] =
    owe > 0 && daysTo(c.due) < 0
      ? ["schedule", `Due ${shortDay(c.due)}, check`]
      : owe > 0
        ? ["event", `Due ${shortDay(c.due)}${c.kind === "charge" ? ", pay in full" : ""}`]
        : ["event", daysTo(c.nextStatement) === 0 ? "Statement today" : `Statement in ${daysTo(c.nextStatement)} days`];
  return (
    <Badge icon={icon} className="soon">
      {text}
    </Badge>
  );
}

function CardTile({ c, onSpends, onPaid, onEdit }: { c: CardState; onSpends: () => void; onPaid: () => void; onEdit: () => void }) {
  const owe = c.unpaid;
  const scale = c.limit ?? Math.max(c.peak, c.owed, 1);
  const width = (v: number) => `${Math.min(100, (Math.max(0, v) / scale) * 100)}%`;
  const was = owe <= 0 ? ", paid" : daysTo(c.due) < 0 ? `, was due ${shortDay(c.due)}` : `, due ${c.kind === "charge" ? "in full " : ""}${shortDay(c.due)}`;
  return (
    <div className="card cc" id={c.id}>
      <CardFace color={c.color} bank={c.bank} name={c.name} nickname={c.nickname} network={c.network} badge={<DueBadge c={c} />} />
      <div className="use">
        <div className="use-h">
          <span>
            <b>{money(c.owed)}</b> {c.limit !== null ? `of ${money(c.limit)} used` : "owed"}
          </span>
          <span>{c.limit !== null ? plainPct(c.owed / c.limit, 0) : `Biggest statement this year, ${money(scale)}`}</span>
        </div>
        <div className="meter" role="img" aria-label={`${money(c.owed)} ${c.limit !== null ? `of ${money(c.limit)} used` : "owed"}`}>
          {owe > 0 && <i className="prev" style={{ width: width(owe) }} />}
          {c.cycle > 0 && <i style={{ width: width(c.cycle) }} />}
          <i className="rest" />
        </div>
        <div className="lg">
          <span>
            <i className="prev" />
            Last statement {money(c.billed)}
            {was}
          </span>
          <span>
            <i />
            This cycle {money(c.cycle)}
          </span>
        </div>
      </div>
      <Stats
        look="plain"
        className="cstats"
        items={[
          { label: c.limit !== null ? "Left to spend" : "Limit", value: c.limit !== null ? money(Math.max(0, c.limit - c.owed)) : "No preset limit" },
          { label: "Statement on", value: `${ordinal(c.statementDay)} of the month` },
          { label: c.kind === "charge" ? "Repayment" : "Interest", value: c.kind === "charge" ? "In full each month" : c.interest !== null ? `${c.interest}% a month` : "—" },
          { label: "Annual fee", value: c.annualFee !== null ? money(c.annualFee) : "—" },
        ]}
      />
      <div className="cact">
        <md-text-button onClick={onSpends}>
          <md-icon slot="icon">receipt_long</md-icon>Spends
        </md-text-button>
        {owe > 0 && (
          <md-text-button onClick={onPaid}>
            <md-icon slot="icon">task_alt</md-icon>Mark paid
          </md-text-button>
        )}
        <md-text-button onClick={onEdit}>
          <md-icon slot="icon">edit</md-icon>Edit
        </md-text-button>
      </div>
    </div>
  );
}

export default function CardsScreen() {
  const p = usePortfolio();
  const navigate = useNavigate();
  const to = useTo();
  const say = useSnack();
  const { hash } = useLocation();
  const { data: e, error, setData } = useLoad<Expenses>(`/portfolios/${p.id}/expenses`);
  const [editing, setEditing] = useState<CardState | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (e && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [e, hash]);

  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!e) return <Spinner className="loading" />;

  const owed = e.cards.reduce((t, c) => t + c.owed, 0);
  const billed = e.cards.reduce((t, c) => t + c.unpaid, 0);
  const cycle = e.cards.reduce((t, c) => t + c.cycle, 0);
  const credit = e.cards.filter((c) => c.limit !== null);
  const left = credit.reduce((t, c) => t + (c.limit ?? 0) - c.owed, 0);
  const next = e.cards.filter((c) => c.unpaid > 0).sort((a, b) => toTime(a.due) - toTime(b.due))[0];

  const paid = async (c: CardState) => {
    try {
      setData(await post<Expenses>(`/portfolios/${p.id}/cards/${c.id}/paid`));
      say(`${c.name}'s ${money(c.unpaid)} marked paid`);
    } catch (err) {
      say((err as Error).message, true);
    }
  };

  return (
    <>
      <PageHead className="exhead" title="Credit Cards" status="Statements, dues and what each card has spent">
        <md-outlined-button onClick={() => setImporting(true)}>
          <md-icon slot="icon">move_to_inbox</md-icon>
          Import
        </md-outlined-button>
        <md-filled-tonal-button onClick={() => setEditing("new")}>
          <md-icon slot="icon">add_card</md-icon>
          Add a card
        </md-filled-tonal-button>
      </PageHead>
      <PhoneTabs show="cards" onShow={(s) => s !== "cards" && navigate(to("/expenses"), { state: { show: s } })} />
      <div className="grid top2">
        <Hero
          icon="credit_card"
          title="Owed on cards"
          meta={`${e.cards.length} ${e.cards.length === 1 ? "card" : "cards"} · counted in what you owe`}
          value={<Amount n={owed} />}
          pill={next && { icon: "event", bad: daysTo(next.due) < 0, text: `${money(next.unpaid)} ${daysTo(next.due) < 0 ? "was due" : "due by"} ${shortDay(next.due)}` }}
          stats={[
            { label: "Billed, not paid yet", value: <Amount n={billed} /> },
            { label: "This cycle so far", value: <Amount n={cycle} /> },
            { label: "Limit left", value: credit.length ? <Amount n={left} /> : "—" },
          ]}
          foot="I only keep count; paying the card is up to you. Mark a bill paid once you have."
        />
        <NoteCard
          note={e.cardNote}
          meta={e.cards.length ? `${e.cards.length} ${e.cards.length === 1 ? "card" : "cards"}` : "No cards yet"}
          onLine={(t) =>
            t.startsWith("card:")
              ? document.getElementById(t.slice(5))?.scrollIntoView({ behavior: "smooth", block: "center" })
              : navigate(to(t === "chat" ? "/expenses" : `/${t}`), t === "chat" ? { state: { show: "chat" } } : undefined)
          }
        />
      </div>
      <div className="cards">
        {e.cards.map((c) => (
          <CardTile
            key={c.id}
            c={c}
            onSpends={() => navigate(to("/expenses"), { state: { show: "led", filter: { kind: "method", key: `card:${c.id}` } } })}
            onPaid={() => void paid(c)}
            onEdit={() => setEditing(c)}
          />
        ))}
        <Tile add icon="add_card" title="Add a card" hint="Its statements and dues, counted from here on" onClick={() => setEditing("new")} />
      </div>
      {importing && <ImportDialog target={{ kind: "cards", onSaved: setData }} onClose={() => setImporting(false)} onDone={() => setImporting(false)} />}
      {editing && <CardDialog card={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={setData} />}
    </>
  );
}
