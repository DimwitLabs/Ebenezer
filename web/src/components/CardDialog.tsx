import { useState } from "react";

import { del, post, put, type Card, type CardKind, type CardTerms, type Expenses } from "../lib/api";
import { money } from "../lib/format";
import { usePortfolio } from "../lib/session";
import { isoDay, todayISO, toTime } from "../lib/spends";
import { COLOURS, faceBackground, NETWORKS } from "./CardFace";
import { useConfirm } from "../design-system/Confirm";
import { ColourPicker } from "../design-system/ColourPicker";
import { DialogActions } from "../design-system/DialogActions";
import Spinner from "../design-system/Spinner";
import { Stats } from "../design-system/Stat";
import Dialog from "../design-system/Dialog";
import { Label, Select, TextField } from "../design-system/Fields";
import { Segmented } from "../design-system/Segmented";
import { useSnack } from "../design-system/Snack";

const num = (v: string) => {
  const n = Number(v.replace(/[,₹\s%]/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
};

const text = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

// The most recent statement on that day of the month, so a new card starts from the statement in hand.
function lastStatementOn(day: number): string {
  const t = new Date(toTime(todayISO()));
  for (let back = 0; back < 2; back++) {
    const y = t.getUTCFullYear();
    const m = t.getUTCMonth() - back;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = Date.UTC(y, m, Math.min(day, last));
    if (d <= toTime(todayISO())) return isoDay(d);
  }
  return todayISO();
}

export default function CardDialog({ card, onClose, onSaved }: { card: Card | null; onClose: () => void; onSaved: (e: Expenses) => void }) {
  const p = usePortfolio();
  const say = useSnack();
  const [confirm, confirming] = useConfirm();
  const [kind, setKind] = useState<CardKind>(card?.kind ?? "credit");
  const [bank, setBank] = useState(card?.bank ?? "");
  const [name, setName] = useState(card?.name ?? "");
  const [nickname, setNickname] = useState(card?.nickname ?? "");
  const [network, setNetwork] = useState(card?.network || "visa");
  const [color, setColor] = useState(card?.color ?? COLOURS[0]);
  const [day, setDay] = useState(text(card?.statementDay));
  const [due, setDue] = useState(text(card?.dueDays ?? 20));
  const [limit, setLimit] = useState(text(card?.limit));
  const [interest, setInterest] = useState(text(card?.interest));
  const [fee, setFee] = useState(text(card?.annualFee));
  const [balance, setBalance] = useState(text(card?.statementBalance ?? 0));
  const [paid, setPaid] = useState(text(card?.paid ?? 0));
  const [before, setBefore] = useState(text(card?.spentBefore ?? 0));
  const [on, setOn] = useState(card ? card.statementOn.slice(0, 10) : "");
  const [terms, setTerms] = useState<CardTerms | null>(null);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statementDay = num(day);
  const shownOn = on || (statementDay && statementDay >= 1 && statementDay <= 31 ? lastStatementOn(statementDay) : "");

  const look = async () => {
    setLooking(true);
    setError(null);
    try {
      setTerms(await post<CardTerms>(`/portfolios/${p.id}/cards/terms`, { bank, name }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLooking(false);
    }
  };

  const fill = () => {
    if (!terms) return;
    if (terms.interest !== null) setInterest(String(terms.interest));
    if (terms.annualFee !== null) setFee(String(terms.annualFee));
    if (terms.dueDays !== null) setDue(String(terms.dueDays));
    say("Filled in from the usual terms");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        kind,
        bank,
        name,
        nickname,
        network,
        color,
        limit: kind === "credit" ? num(limit) : null,
        statementDay: statementDay ?? 0,
        dueDays: num(due) ?? 0,
        interest: kind === "credit" ? num(interest) : null,
        annualFee: num(fee),
        statementOn: shownOn,
        statementBalance: num(balance) ?? 0,
        paid: num(paid) ?? 0,
        spentBefore: num(before) ?? 0,
      };
      onSaved(card ? await put<Expenses>(`/portfolios/${p.id}/cards/${card.id}`, body) : await post<Expenses>(`/portfolios/${p.id}/cards`, body));
      say(card ? "Card saved" : `${name} added`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!card || !(await confirm({ title: `Remove ${card.name}?`, message: "Its spends stay in the ledger, with no card against them.", action: "Remove" }))) return;
    try {
      onSaved(await del<Expenses>(`/portfolios/${p.id}/cards/${card.id}`));
      say("Card removed");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog
      title={card ? `Edit ${card.name}` : "Add a card"}
      icon="add_card"
      narrow
      onClose={onClose}
      footer={
        <DialogActions
          remove={card ? { label: "Remove", onClick: () => void remove() } : undefined}
          onCancel={onClose}
          label={card ? "Save" : "Add card"}
          onClick={() => void save()}
          disabled={busy || !bank.trim() || !name.trim() || !statementDay || (kind === "credit" && !num(limit))}
        />
      }
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="cardform">
        <div className="full">
          <Segmented
            label="Kind of card"
            value={kind}
            onChange={setKind}
            options={[
              [
                "credit",
                <>
                  <span className="ms" aria-hidden="true">
                    credit_card
                  </span>
                  Credit card
                </>,
              ],
              [
                "charge",
                <>
                  <span className="ms" aria-hidden="true">
                    all_inclusive
                  </span>
                  Charge card
                </>,
              ],
            ]}
          />
        </div>
        <TextField label="Bank" value={bank} onChange={setBank} maxLength={60} placeholder="HDFC Bank" />
        <TextField label="Card" value={name} onChange={setName} maxLength={60} placeholder="Regalia Gold" />
        <TextField label="Nickname" value={nickname} onChange={setNickname} maxLength={40} info="What you call it, like Travel card. You can say this name in the chat." />
        <Select label="Network" value={network} onChange={setNetwork} options={NETWORKS.map(([value, label]) => ({ value, label }))} />
        {!terms ? (
          <div className="lookup full">
            <span className="ms" aria-hidden="true">
              travel_explore
            </span>
            <p>
              <b>Not sure of the terms?</b>I can look up {name || "the card"}'s usual interest, fees and due days on the bank's site.
            </p>
            <md-filled-tonal-button onClick={() => void look()} disabled={looking || !bank.trim() || !name.trim()}>
              {looking ? <Spinner size={18} slot="icon" label="Looking" /> : <md-icon slot="icon">search</md-icon>}
              {looking ? "Looking" : "Look them up"}
            </md-filled-tonal-button>
          </div>
        ) : terms.found ? (
          <div className="sugg full">
            <div className="sugg-h">
              <span className="ms" aria-hidden="true">
                travel_explore
              </span>
              {name}'s usual terms<small>{terms.source ? `${terms.source}, just now` : "Just now"}</small>
            </div>
            <Stats
              look="plain"
              className="sugg-s"
              items={[
                ...(terms.interest !== null ? [{ label: "Interest", value: `${terms.interest}% a month` }] : []),
                ...(terms.annualFee !== null ? [{ label: "Annual fee", value: money(terms.annualFee) }] : []),
                ...(terms.dueDays !== null ? [{ label: "Due", value: `${terms.dueDays} days after` }] : []),
                ...(terms.lateFee ? [{ label: "Late fee", value: terms.lateFee }] : []),
              ]}
            />
            <div className="row">
              <p>Your statement has the terms that apply to you.</p>
              <md-filled-tonal-button onClick={fill}>
                <md-icon slot="icon">done</md-icon>Fill these in
              </md-filled-tonal-button>
            </div>
          </div>
        ) : (
          <div className="sugg full">
            <div className="sugg-h">
              <span className="ms" aria-hidden="true">
                search_off
              </span>
              I couldn't find {name}'s terms
            </div>
            <div className="row">
              <p>Your statement lists the interest, fees and due days.</p>
              <md-text-button onClick={() => setTerms(null)}>Try again</md-text-button>
            </div>
          </div>
        )}
        <TextField label="Statement day" value={day} onChange={setDay} inputMode="numeric" info="The day of the month your statement is made, like 17." />
        <TextField label="Payment due, days after" value={due} onChange={setDue} inputMode="numeric" />
        {kind === "credit" && <TextField label="Credit limit" value={limit} onChange={setLimit} inputMode="decimal" />}
        {kind === "credit" && <TextField label="Interest, % a month" value={interest} onChange={setInterest} inputMode="decimal" placeholder="Look up or type" />}
        <TextField label="Annual fee" value={fee} onChange={setFee} inputMode="decimal" />
        <p className="sect full">
          <span className="ms" aria-hidden="true">
            flag
          </span>
          Where it stands today
        </p>
        <TextField label="Last statement balance" value={balance} onChange={setBalance} inputMode="decimal" info="The total on your last statement, before any payment." />
        <TextField label="Paid towards it so far" value={paid} onChange={setPaid} inputMode="decimal" />
        <TextField
          label="Spent since that statement"
          value={before}
          onChange={setBefore}
          inputMode="decimal"
          info="Spends after the statement that you won't tell me about. Spends you do tell me are added on top."
        />
        <TextField label="Last statement was on" type="date" value={shownOn} onChange={setOn} max={todayISO()} />
        <div className="full">
          <Label text="Colour" />
          <ColourPicker value={color} onChange={setColor} colours={COLOURS.map((c) => ({ value: c, name: c === "metal" ? "Metal" : c, swatch: faceBackground(c) }))} />
        </div>
      </div>
      {confirming}
    </Dialog>
  );
}
