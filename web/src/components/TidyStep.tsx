import { useEffect, useMemo, useRef, useState } from "react";

import { post, type Field } from "../lib/api";
import { check, TEXT } from "../lib/rows";
import { runScript } from "../lib/sandbox";
import { TextField } from "../design-system/Fields";
import Tip from "../design-system/Tip";
import { IconBadge } from "../design-system/Badge";
import Spinner from "../design-system/Spinner";

export interface Tidied {
  summary: string;
  code: string;
}

interface Props {
  pid: string;
  fields: Field[];
  columns: string[];
  mapped: Record<string, string>[];
  raw: Record<string, string>[];
  tidy: Tidied | null;
  setTidy: (t: Tidied | null) => void;
  onOutput: (rows: Record<string, string>[] | null) => void;
  onPending: (n: number) => void;
}

type Reply = { ai: false } | ({ ai: true } & Tidied);
type Row = Record<string, string>;

// Each row carries where it came from through the script, so a changed value can show what it was.
const SOURCE = "_i";
const NONE: Row[] = [];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const missing = (f: Field) => (f.choices ? `${f.choices.join(" or ")}?` : `${f.label}?`);

function Cell({ field, value, was, problem, onFix }: { field: Field; value: string; was?: string; problem?: string; onFix: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cls = TEXT.has(field.type) ? "l" : "num";
  if (!problem) return <td className={`${cls}${was !== undefined ? " changed" : ""}`}>{was !== undefined ? <Tip text={was ? `Was “${was}”` : "Was empty"}>{value}</Tip> : value}</td>;
  if (field.choices)
    return (
      <td className={`${cls} fixcell`}>
        <Tip text={problem} focusable={false}>
          <button type="button" className={`fix${value ? "" : " blank"}`} onClick={() => setEditing(!editing)}>
            {value || missing(field)}
          </button>
        </Tip>
        {editing && (
          <span className="fixpick" onMouseLeave={() => setEditing(false)}>
            {field.choices.map((c) => (
              <button type="button" key={c} onClick={() => (onFix(c), setEditing(false))}>
                {c}
              </button>
            ))}
          </span>
        )}
      </td>
    );
  if (editing)
    return (
      <td className={`${cls} fixcell`}>
        <input
          className="fixin"
          size={Math.max(draft.length, 6)}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          aria-label={field.label}
          value={draft}
          placeholder={field.type === "date" ? "2024-06-18" : field.label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => (onFix(draft.trim()), setEditing(false))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") (setDraft(value), setEditing(false));
          }}
        />
      </td>
    );
  return (
    <td className={`${cls} fixcell`}>
      <Tip text={problem} focusable={false}>
        <button type="button" className={`fix${value ? "" : " blank"}`} onClick={() => (setDraft(value), setEditing(true))}>
          {value || missing(field)}
        </button>
      </Tip>
    </td>
  );
}

export default function TidyStep({ pid, fields, columns, mapped, raw, tidy, setTidy, onOutput, onPending }: Props) {
  const [out, setOut] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [change, setChange] = useState("");
  const [answers, setAnswers] = useState<Record<number, Row>>({});
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const asked = useRef(false);

  const asIs = useMemo(() => check(mapped, fields), [mapped, fields]);
  const badAsIs = asIs.filter((c) => c.problems.length > 0);
  const base = useMemo(() => (tidy ? (out ?? NONE) : mapped), [tidy, out, mapped]);
  const fixed = useMemo(() => base.map((r, i) => (answers[i] ? { ...r, ...answers[i] } : r)), [base, answers]);
  const checked = useMemo(() => check(fixed, fields), [fixed, fields]);
  // Rows that failed before any answer stay open to edit, so one does not jump away mid-fix.
  const failed = useMemo(() => new Set(check(base, fields).flatMap((c, i) => (c.problems.length > 0 ? [i] : []))), [base, fields]);
  const open = [...failed].filter((i) => !skipped.has(i) && checked[i].problems.length > 0);
  const waiting = busy || (!!tidy && !out);
  const shown = fields.filter((f) => f.key !== "isin" && f.key !== "folio" && base.some((r) => r[f.key]));

  useEffect(() => {
    setAnswers({});
    setSkipped(new Set());
  }, [base]);

  useEffect(() => {
    onPending(waiting ? 0 : open.length);
    onOutput(waiting || open.length > 0 ? null : fixed.filter((_, i) => !skipped.has(i)).map(({ [SOURCE]: _, ...r }) => r));
  }, [waiting, open.length, fixed, skipped, onOutput, onPending]);

  useEffect(() => {
    if (!tidy) return void setOut(null);
    let live = true;
    runScript(
      tidy.code,
      mapped.map((r, i) => ({ ...r, [SOURCE]: String(i) })),
      raw,
    )
      .then((r) => {
        if (!live) return;
        setOut(r.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? "" : String(v)]))));
        setError(null);
      })
      .catch((e: Error) => {
        if (!live) return;
        setOut(null);
        setError(`The script stopped: ${e.message}`);
      });
    return () => {
      live = false;
    };
  }, [tidy, mapped, raw]);

  const ask = async (previous?: string) => {
    setBusy(true);
    setError(null);
    try {
      const sample = [...badAsIs, ...asIs.filter((c) => c.problems.length === 0)].slice(0, 3);
      const r = await post<Reply>(`/portfolios/${pid}/tidy`, {
        fields: fields.map((f) => ({ key: f.key, type: f.type, required: f.required, choices: f.choices })),
        columns,
        sample: sample.map((c) => ({ row: c.row, problems: c.problems })),
        previous,
        change: change.trim() || undefined,
      });
      if (!r.ai) {
        setError("I need an AI model to tidy rows; set one up under Admin. Until then, fix them below.");
        return;
      }
      setTidy({ summary: r.summary, code: r.code });
      setChange("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (asked.current || tidy || badAsIs.length === 0) return;
    asked.current = true;
    void ask();
    // Only on opening the step; later runs come from the person.
  }, []);

  const fix = (i: number, key: string, v: string) => setAnswers({ ...answers, [i]: { ...answers[i], [key]: v } });
  const toggle = (i: number) => {
    const next = new Set(skipped);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSkipped(next);
  };
  const source = (r: Row) => (r[SOURCE] !== undefined ? mapped[Number(r[SOURCE])] : undefined);
  const left = base.length - skipped.size;

  return (
    <>
      <div className="tidy-said">
        {busy ? <Spinner size={28} label="Tidying" /> : <IconBadge icon="auto_awesome" size={28} round tone="note" />}
        <p>
          {busy ? (
            "Tidying your rows…"
          ) : (
            <>
              {tidy ? `${tidy.summary} ` : badAsIs.length === 0 ? "Nothing needs tidying. " : ""}
              <span className="faint">
                {open.length > 0
                  ? `Fix the ${plural(open.length, "underlined row", "underlined rows")} below, or leave ${open.length === 1 ? "it" : "them"} out.`
                  : `All ${plural(left, "row is", "rows are")} ready.`}
              </span>
            </>
          )}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          {!busy && !tidy && (
            <button type="button" className="linkbtn" onClick={() => void ask()}>
              Try again
            </button>
          )}
        </p>
      )}
      {!waiting && (
        <div className="tw tidy-table">
          <table>
            <thead>
              <tr>
                {shown.map((f) => (
                  <th className={TEXT.has(f.type) ? "l" : ""} key={f.key}>
                    {f.label}
                  </th>
                ))}
                <th aria-label="Leave out" />
              </tr>
            </thead>
            <tbody>
              {fixed.map((r, i) => {
                const from = source(r);
                const out = skipped.has(i);
                return (
                  <tr key={i} className={out ? "left-out" : undefined}>
                    {shown.map((f) => {
                      const was = from && (from[f.key] ?? "") !== (base[i][f.key] ?? "") ? (from[f.key] ?? "") : undefined;
                      const problem = !out && failed.has(i) && checked[i].bad.has(f.key) ? checked[i].problems.find((p) => p.startsWith(f.label)) : undefined;
                      return <Cell key={f.key} field={f} value={r[f.key] ?? ""} was={was} problem={problem} onFix={(v) => fix(i, f.key, v)} />;
                    })}
                    <td className="num">
                      {failed.has(i) && (
                        <md-icon-button onClick={() => toggle(i)} aria-label={out ? "Keep this row" : "Leave this row out"} title={out ? "Keep this row" : "Leave this row out"}>
                          <md-icon>{out ? "add_circle_outline" : "remove_circle_outline"}</md-icon>
                        </md-icon-button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!waiting && tidy && <p className="help">Green values were changed; hover to see what they were.</p>}
      <form
        className="tidy-change"
        onSubmit={(e) => {
          e.preventDefault();
          if (change.trim() && !busy) void ask(tidy?.code);
        }}
      >
        <TextField className="compact" aria-label="What to change" value={change} onChange={setChange} placeholder="Change something, like “leave out rows before 2024”" maxLength={500} />
        <md-filled-tonal-button type="submit" disabled={!change.trim() || busy}>
          {busy ? "Working…" : "Change"}
        </md-filled-tonal-button>
      </form>
    </>
  );
}
