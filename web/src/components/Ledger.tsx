import { useMemo, useRef, useState } from "react";

import type { MdMenu } from "@material/web/menu/menu.js";

import { del, post, put, type Expenses, type Method, type PaidResult, type Spend } from "../lib/api";
import { money } from "../lib/format";
import { colorOf, dayLabel, dayOf, iconOf, METHOD_ICON, todayISO } from "../lib/spends";
import { usePortfolio } from "../lib/session";
import CategoryDialog from "./CategoryDialog";
import { Badge, IconBadge } from "../design-system/Badge";
import { CardHead } from "../design-system/CardHead";
import { DialogActions } from "../design-system/DialogActions";
import { Empty } from "../design-system/Empty";
import { useConfirm } from "../design-system/Confirm";
import Dialog from "../design-system/Dialog";
import { Select, TextField } from "../design-system/Fields";
import { useSnack } from "../design-system/Snack";

export type LedgerFilter = { kind: "all" } | { kind: "asking" } | { kind: "category"; name: string } | { kind: "method"; key: string } | { kind: "import"; id: string };

export function Pick({ methods, chosen, onPick }: { methods: Method[]; chosen?: string; onPick: (key: string) => void }) {
  return (
    <div className={`paypick${chosen ? " done" : ""}`}>
      {methods.map((m) => (
        <button key={m.key} type="button" className={chosen === m.key ? "on" : ""} disabled={!!chosen} onClick={() => onPick(m.key)}>
          <md-ripple />
          <md-focus-ring />
          <span className="ms" aria-hidden="true">
            {METHOD_ICON[m.kind]}
          </span>
          {m.name}
        </button>
      ))}
    </div>
  );
}

export function CategoryIcon({ e, name, small }: { e: Expenses; name: string; small?: boolean }) {
  return <IconBadge icon={iconOf(e.categories, name)} size={small ? 32 : 36} color={colorOf(name || "No category")} />;
}

const NEW = "\u0000new";

function SpendDialog({ e, spend, onClose, onSaved }: { e: Expenses; spend: Spend | null; onClose: () => void; onSaved: (x: Expenses) => void }) {
  const p = usePortfolio();
  const say = useSnack();
  const [confirm, confirming] = useConfirm();
  const [day, setDay] = useState(spend ? dayOf(spend.day) : todayISO());
  const [item, setItem] = useState(spend?.item ?? "");
  const [amount, setAmount] = useState(spend ? String(spend.amount) : "");
  const [category, setCategory] = useState(spend?.category ?? "");
  const [fresh, setFresh] = useState("");
  const [paidWith, setPaidWith] = useState(spend?.paidWith ?? "");
  const [note, setNote] = useState(spend?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { day, item, amount: Number(amount.replace(/[,₹\s]/g, "")), category: category === NEW ? fresh.trim() : category, paidWith, note };
      onSaved(spend ? await put<Expenses>(`/portfolios/${p.id}/spends/${spend.id}`, body) : await post<Expenses>(`/portfolios/${p.id}/spends`, body));
      say(spend ? "Saved" : `${item.trim()} added`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!spend || !(await confirm({ title: "Remove this spend?", message: `${spend.item}, ${money(spend.amount)} on ${dayLabel(spend.day)}, comes out of the ledger.`, action: "Remove" }))) return;
    try {
      onSaved(await post<Expenses>(`/portfolios/${p.id}/spends/undo`, { ids: [spend.id] }));
      say("Removed");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog
      title={spend ? "Edit spend" : "Add a spend"}
      icon={spend ? iconOf(e.categories, spend.category) : "add"}
      narrow
      onClose={onClose}
      footer={
        <DialogActions
          remove={spend ? { label: "Remove", onClick: () => void remove() } : undefined}
          onCancel={onClose}
          label={spend ? "Save" : "Add"}
          onClick={() => void save()}
          disabled={busy || !item.trim() || !amount.trim() || (category === NEW && !fresh.trim())}
        />
      }
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="fields2">
        <TextField label="What" value={item} onChange={setItem} maxLength={120} autoFocus={!spend} placeholder={spend ? undefined : "Swiggy"} />
        <TextField label="Amount" value={amount} onChange={setAmount} inputMode="decimal" info="A refund is negative." />
        <TextField label="Date" type="date" value={day} onChange={setDay} max={todayISO()} />
        <Select label="Paid from" value={paidWith} onChange={setPaidWith} options={[{ value: "", label: "Not known" }, ...e.methods.map((m) => ({ value: m.key, label: m.name }))]} />
        <Select
          label="Category"
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: "None" }, ...e.categories.map((c) => ({ value: c.name, label: c.name })), { value: NEW, label: "A new one…" }]}
        />
        {category === NEW ? <TextField label="New category" value={fresh} onChange={setFresh} maxLength={40} autoFocus /> : <span />}
      </div>
      <TextField label="Note" value={note} onChange={setNote} maxLength={500} />
      {confirming}
    </Dialog>
  );
}

export default function Ledger({ e, onChange, filter, setFilter }: { e: Expenses; onChange: (x: Expenses) => void; filter: LedgerFilter; setFilter: (f: LedgerFilter) => void }) {
  const p = usePortfolio();
  const say = useSnack();
  const [confirm, confirming] = useConfirm();
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [query, setQuery] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [editing, setEditing] = useState<Spend | "new" | null>(null);
  const [managing, setManaging] = useState(false);
  const menu = useRef<MdMenu>(null);

  const q = query?.trim().toLowerCase() ?? "";
  const across = q !== "" || filter.kind !== "all";
  const shown = useMemo(
    () =>
      e.spends.filter((s) => {
        if (!across) return s.day.startsWith(month);
        if (q && !`${s.item} ${s.category} ${s.note}`.toLowerCase().includes(q)) return false;
        switch (filter.kind) {
          case "asking":
            return s.asking;
          case "category":
            return s.category === filter.name;
          case "method":
            return s.paidWith === filter.key;
          case "import":
            return s.importId === filter.id;
        }
        return true;
      }),
    [e.spends, across, month, q, filter],
  );
  const days = useMemo(() => {
    const m = new Map<string, Spend[]>();
    for (const s of shown) m.set(dayOf(s.day), [...(m.get(dayOf(s.day)) ?? []), s]);
    return [...m];
  }, [shown]);
  const total = shown.reduce((t, s) => t + s.amount, 0);
  const methodName = (key: string) => e.methods.find((m) => m.key === key)?.name ?? "";

  const step = (by: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  const paid = async (s: Spend, key: string) => {
    try {
      const r = await put<PaidResult>(`/portfolios/${p.id}/spends/${s.id}/paid`, { paidWith: key });
      onChange(r.expenses);
      setAsking(null);
      say(`Saved · ${r.saved}`);
    } catch (err) {
      say((err as Error).message, true);
    }
  };

  const imp = filter.kind === "import" ? e.imports.find((i) => i.id === filter.id) : undefined;
  const removeImport = async () => {
    if (!imp) return;
    if (!(await confirm({ title: "Remove this import?", message: `The ${imp.added} spends “${imp.source}” brought in come out of the ledger together.`, action: "Remove all" }))) return;
    try {
      onChange(await del<Expenses>(`/portfolios/${p.id}/spend-imports/${imp.id}`));
      setFilter({ kind: "all" });
      say("Import removed");
    } catch (err) {
      say((err as Error).message, true);
    }
  };

  const label =
    filter.kind === "asking"
      ? "Needs how you paid"
      : filter.kind === "category"
        ? filter.name || "No category"
        : filter.kind === "method"
          ? methodName(filter.key)
          : filter.kind === "import"
            ? (imp?.source ?? "An import")
            : "";

  return (
    <div className="card led">
      <CardHead title="Ledger">
        <div className="acts">
          <md-icon-button onClick={() => setEditing("new")} aria-label="Add a spend by hand" title="Add by hand">
            <md-icon>add</md-icon>
          </md-icon-button>
          <md-icon-button onClick={() => setQuery(query === null ? "" : null)} aria-label="Search the ledger" title="Search">
            <md-icon>{query === null ? "search" : "search_off"}</md-icon>
          </md-icon-button>
          <span className="anchor">
            <md-icon-button id="led-filter" onClick={() => menu.current && (menu.current.open = !menu.current.open)} aria-label="Filter the ledger" title="Filter">
              <md-icon>filter_list</md-icon>
            </md-icon-button>
            <md-menu ref={menu} anchor="led-filter" positioning="popover" className="ledmenu">
              <md-menu-item onClick={() => setFilter({ kind: "all" })}>
                <div slot="headline">Everything</div>
              </md-menu-item>
              {e.spends.some((s) => s.asking) && (
                <md-menu-item onClick={() => setFilter({ kind: "asking" })}>
                  <md-icon slot="start">help</md-icon>
                  <div slot="headline">Needs how you paid</div>
                </md-menu-item>
              )}
              <md-divider role="separator" />
              {e.categories.map((c) => (
                <md-menu-item key={c.name} onClick={() => setFilter({ kind: "category", name: c.name })}>
                  <md-icon slot="start">{c.icon}</md-icon>
                  <div slot="headline">{c.name}</div>
                </md-menu-item>
              ))}
              <md-divider role="separator" />
              {e.methods.map((m) => (
                <md-menu-item key={m.key} onClick={() => setFilter({ kind: "method", key: m.key })}>
                  <md-icon slot="start">{METHOD_ICON[m.kind]}</md-icon>
                  <div slot="headline">{m.name}</div>
                </md-menu-item>
              ))}
              {e.categories.length > 0 && (
                <md-menu-item onClick={() => setManaging(true)}>
                  <md-icon slot="start">edit</md-icon>
                  <div slot="headline">Edit categories</div>
                </md-menu-item>
              )}
              {e.imports.length > 0 && <md-divider role="separator" />}
              {e.imports.map((i) => (
                <md-menu-item key={i.id} onClick={() => setFilter({ kind: "import", id: i.id })}>
                  <md-icon slot="start">move_to_inbox</md-icon>
                  <div slot="headline">{i.source}</div>
                  <div slot="supporting-text">
                    {i.added} spends, {new Date(i.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </div>
                </md-menu-item>
              ))}
            </md-menu>
          </span>
        </div>
      </CardHead>
      {query !== null && (
        <div className="ledsearch">
          <TextField className="compact" aria-label="Search spends" placeholder="Search what, category or note" value={query} onChange={setQuery} autoFocus />
        </div>
      )}
      {across ? (
        <div className="month">
          {label && (
            <md-input-chip
              label={label}
              onremove={(ev) => {
                ev.preventDefault();
                setFilter({ kind: "all" });
              }}
            />
          )}
          <b>{q ? `${shown.length} found` : ""}</b>
          <span className="tot num">{money(total)}</span>
        </div>
      ) : (
        <div className="month">
          <md-icon-button onClick={() => step(-1)} aria-label="Earlier month">
            <md-icon>chevron_left</md-icon>
          </md-icon-button>
          <b>{monthName}</b>
          <span className="tot num">{money(total)}</span>
          <md-icon-button onClick={() => step(1)} aria-label="Later month" disabled={month >= todayISO().slice(0, 7)}>
            <md-icon>chevron_right</md-icon>
          </md-icon-button>
        </div>
      )}
      {imp && (
        <div className="ledimp">
          <span className="help">
            {imp.added} spends came in with this import on {new Date(imp.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
          </span>
          <md-text-button className="danger" onClick={() => void removeImport()}>
            Remove all
          </md-text-button>
        </div>
      )}
      <div className="ledlist">
        {days.length === 0 &&
          (across ? <Empty icon="search_off" title="Nothing matches" /> : <Empty icon="receipt_long" title={`No spends in ${monthName}`} line="Tell the chat what you spent and it lands here." />)}
        {days.map(([d, rows]) => (
          <div key={d}>
            <div className="day">
              <span>{dayLabel(d)}</span>
              <span>{money(rows.reduce((t, s) => t + s.amount, 0))}</span>
            </div>
            {rows.map((s) => (
              <div key={s.id} className="lr-w">
                <div className="lr" role="button" tabIndex={0} onClick={() => setEditing(s)} onKeyDown={(ev) => ev.key === "Enter" && setEditing(s)}>
                  <CategoryIcon e={e} name={s.category} small />
                  <div>
                    <b>{s.item}</b>
                    <span className="s">
                      {[s.category || "No category", methodName(s.paidWith)].filter(Boolean).join(" · ")}
                      {s.asking && (
                        <Badge
                          tone="on"
                          icon="help"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setAsking(asking === s.id ? null : s.id);
                          }}
                        >
                          How did you pay?
                        </Badge>
                      )}
                    </span>
                  </div>
                  <span className={`amt-r num${s.amount < 0 ? " up" : ""}`}>{money(s.amount)}</span>
                </div>
                {asking === s.id && <Pick methods={e.methods} onPick={(k) => void paid(s, k)} />}
              </div>
            ))}
          </div>
        ))}
      </div>
      {managing && <CategoryDialog e={e} onClose={() => setManaging(false)} onSaved={onChange} />}
      {editing && <SpendDialog e={e} spend={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={onChange} />}
      {confirming}
    </div>
  );
}
