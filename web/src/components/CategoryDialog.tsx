import { useState } from "react";

import { post, type Expenses, type SpendCategory } from "../lib/api";
import { money } from "../lib/format";
import { usePortfolio } from "../lib/session";
import Dialog from "../design-system/Dialog";
import { DialogActions } from "../design-system/DialogActions";
import { Select, TextField } from "../design-system/Fields";
import { IconPicker } from "../design-system/IconPicker";
import { CategoryIcon } from "./Ledger";
import { useSnack } from "../design-system/Snack";

function Editor({ e, c, onDone, onSaved }: { e: Expenses; c: SpendCategory; onDone: () => void; onSaved: (x: Expenses) => void }) {
  const p = usePortfolio();
  const say = useSnack();
  const [name, setName] = useState(c.name);
  const [icon, setIcon] = useState(c.icon);
  const [removing, setRemoving] = useState(false);
  const [into, setInto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = e.categories.filter((o) => o.name !== c.name);
  const joins = others.find((o) => o.name.toLowerCase() === name.trim().toLowerCase());
  const count = e.spends.filter((s) => s.category === c.name).length;

  const run = async (path: string, body: object, said: string) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await post<Expenses>(`/portfolios/${p.id}/categories/${path}`, body));
      say(said);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (removing) {
    return (
      <div className="catedit">
        {error && <p className="error">{error}</p>}
        <p>
          Remove <b>{c.name}</b>? Its {count === 1 ? "spend stays" : `${count} spends stay`} in the ledger.
        </p>
        <Select label="Move them to" value={into} onChange={setInto} options={[{ value: "", label: "No category" }, ...others.map((o) => ({ value: o.name, label: o.name }))]} />
        <div className="row">
          <DialogActions onBack={() => setRemoving(false)} label="Remove" danger disabled={busy} onClick={() => void run("remove", { name: c.name, into }, `${c.name} removed`)} />
        </div>
      </div>
    );
  }

  return (
    <div className="catedit">
      {error && <p className="error">{error}</p>}
      <TextField
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          const hit = others.find((o) => o.name.toLowerCase() === v.trim().toLowerCase());
          if (hit) setIcon(hit.icon);
        }}
        maxLength={40}
        autoFocus
        info="Give it another category's name to join the two."
      />
      {joins && <p className="help">Its spends join {joins.name}.</p>}
      <IconPicker icons={e.icons} value={icon} onChange={setIcon} />
      <div className="row">
        <DialogActions
          remove={{ label: "Remove", onClick: () => setRemoving(true) }}
          onCancel={onDone}
          label={joins ? "Join" : "Save"}
          disabled={busy || !name.trim() || (name.trim() === c.name && icon === c.icon)}
          onClick={() => void run("edit", { from: c.name, to: joins?.name ?? name.trim(), icon }, joins ? `Joined into ${joins.name}` : "Saved")}
        />
      </div>
    </div>
  );
}

export default function CategoryDialog({ e, onClose, onSaved }: { e: Expenses; onClose: () => void; onSaved: (x: Expenses) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const totals = (name: string) => e.spends.filter((s) => s.category === name).reduce(([n, t], s) => [n + 1, t + s.amount], [0, 0]);

  return (
    <Dialog title="Your categories" icon="category" narrow onClose={onClose}>
      {e.categories.length === 0 ? (
        <p className="help">Categories come with your spends. Add a spend and give it one.</p>
      ) : (
        <div className="cats">
          {e.categories.map((c) => {
            const [n, t] = totals(c.name);
            return open === c.name ? (
              <div key={c.name} className="cat on">
                <div className="cat-h">
                  <CategoryIcon e={e} name={c.name} small />
                  <b>{c.name}</b>
                </div>
                <Editor e={e} c={c} onDone={() => setOpen(null)} onSaved={onSaved} />
              </div>
            ) : (
              <button key={c.name} type="button" className="cat" onClick={() => setOpen(c.name)}>
                <md-ripple />
                <md-focus-ring />
                <CategoryIcon e={e} name={c.name} small />
                <span>
                  <b>{c.name}</b>
                  <span className="help">
                    {n} {n === 1 ? "spend" : "spends"} · {money(t)}
                  </span>
                </span>
                <span className="ms">edit</span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
