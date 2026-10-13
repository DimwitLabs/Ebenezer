import { useEffect, useState } from "react";

import { post, type Expenses, type TidyChange, type TidyProposal } from "../lib/api";
import { usePortfolio } from "../lib/session";
import Dialog from "../design-system/Dialog";
import { DialogActions } from "../design-system/DialogActions";
import { TextField } from "../design-system/Fields";
import { useSnack } from "../design-system/Snack";
import { Wait } from "../design-system/Spinner";

const GROUPS: [TidyChange["kind"], string][] = [
  ["join", "Join"],
  ["rename", "Rename"],
  ["move", "Move spends"],
];

const keyOf = (c: TidyChange) => `${c.kind}|${c.from}|${c.item ?? ""}`;

export default function CategoryTidy({ onClose, onDone }: { onClose: () => void; onDone: (e: Expenses) => void }) {
  const p = usePortfolio();
  const say = useSnack();
  const [proposal, setProposal] = useState<TidyProposal | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const suggest = async (feedback = "") => {
    setBusy(true);
    setError(null);
    try {
      const t = await post<TidyProposal>(`/portfolios/${p.id}/categories/tidy`, { feedback, previous: feedback ? proposal?.changes : undefined });
      setProposal(t);
      setOff(new Set());
      setReply("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void suggest();
    // Suggests once on opening; later rounds come from a reply.
  }, []);

  const changes = proposal?.changes ?? [];
  const chosen = changes.filter((c) => !off.has(keyOf(c)));
  const flip = (keys: string[], on: boolean) => {
    const next = new Set(off);
    keys.forEach((k) => (on ? next.delete(k) : next.add(k)));
    setOff(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      onDone(await post<Expenses>(`/portfolios/${p.id}/categories/apply`, { changes: chosen }));
      say(`${chosen.length} ${chosen.length === 1 ? "change" : "changes"} saved`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Tidy your categories?"
      icon="auto_fix_high"
      narrow
      onClose={onClose}
      footer={
        <DialogActions
          onCancel={onClose}
          cancel="Leave it"
          icon="done_all"
          label={`Save ${chosen.length} ${chosen.length === 1 ? "change" : "changes"}`}
          onClick={() => void save()}
          disabled={busy || chosen.length === 0}
        />
      }
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy && !proposal ? (
        <Wait text="Reading your categories…" />
      ) : (
        proposal && (
          <>
            <p className="tidy-sum">{proposal.summary}</p>
            {GROUPS.map(([kind, label]) => {
              const group = changes.filter((c) => c.kind === kind);
              if (group.length === 0) return null;
              const keys = group.map(keyOf);
              const all = keys.every((k) => !off.has(k));
              return (
                <div className="tgrp" key={kind}>
                  <label className="tgrp-h">
                    <md-checkbox checked={all} indeterminate={!all && keys.some((k) => !off.has(k))} onChange={() => flip(keys, !all)} />
                    {label}
                    <span className="n">{group.length}</span>
                  </label>
                  {group.map((c) => (
                    <label key={keyOf(c)} className={`trow${off.has(keyOf(c)) ? " skip" : ""}`}>
                      <md-checkbox checked={!off.has(keyOf(c))} onChange={() => flip([keyOf(c)], off.has(keyOf(c)))} />
                      <span>{c.kind === "move" ? `${c.count > 1 ? `${c.count} × ` : ""}${c.item}` : c.from}</span>
                      <span className="ms" aria-hidden="true">
                        arrow_forward
                      </span>
                      <span>{c.to}</span>
                      <em>{c.kind === "move" ? `from ${c.from}` : `${c.count} ${c.count === 1 ? "spend" : "spends"}`}</em>
                    </label>
                  ))}
                </div>
              );
            })}
            <form
              className="tidy-change"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim() && !busy) void suggest(reply.trim());
              }}
            >
              <TextField
                className="compact"
                aria-label="Reply to Tidy"
                value={reply}
                onChange={setReply}
                placeholder="Optional. Reply and Tidy suggests again, like: keep Zepto apart"
                maxLength={500}
              />
              <md-filled-tonal-button type="submit" disabled={!reply.trim() || busy}>
                {busy ? "Working…" : "Suggest again"}
              </md-filled-tonal-button>
            </form>
          </>
        )
      )}
    </Dialog>
  );
}
