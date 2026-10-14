import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { get, post, put, type Expenses, type Field, type Import, type Kind, type Section, type SpendImport, type Template } from "../lib/api";
import { applyMapping, guessMapping, parseCSV, type Table } from "../lib/csv";
import { money, qty } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { check, onlyFields, preview, TEXT, type Checked, type Preview } from "../lib/rows";
import { usePortfolio, useSession } from "../lib/session";
import { Badge } from "../design-system/Badge";
import Dialog from "../design-system/Dialog";
import { DialogActions } from "../design-system/DialogActions";
import { DropZone } from "../design-system/DropZone";
import { Stats } from "../design-system/Stat";
import { Select, SwitchRow, TextField } from "../design-system/Fields";
import { useSnack } from "../design-system/Snack";
import TidyStep, { type Tidied } from "./TidyStep";

export type ImportTarget = { kind: "section"; section: Section } | { kind: "expenses"; expenses: Expenses; onSaved: (e: Expenses) => void } | { kind: "cards"; onSaved: (e: Expenses) => void };

interface Props {
  target: ImportTarget;
  onClose: () => void;
  onDone: () => void;
}

const STEPS = ["Bring it in", "Match columns", "Tidy up", "Check and save"];
const BLANK = "\u0000blank";

function RowsTable({ fields, rows, problems }: { fields: Field[]; rows: Record<string, string>[]; problems?: string[] }) {
  return (
    <div className="tw">
      <table className="rows-t">
        <thead>
          <tr>
            {problems && <th className="l">Problem</th>}
            {fields.map((f) => (
              <th key={f.key} className={TEXT.has(f.type) ? "l" : undefined}>
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {problems && <td className="l wrap down">{problems[i]}</td>}
              {fields.map((f) => (
                <td key={f.key} className={TEXT.has(f.type) ? "l" : "num"}>
                  {r[f.key] || <span className="faint">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Choice {
  value: string;
  label: string;
}

function MatchTable({
  title,
  values,
  choices,
  picked,
  onPick,
  statusOf,
}: {
  title: string;
  values: [string, number][];
  choices: (v: string) => Choice[];
  picked: Record<string, string>;
  onPick: (v: string, to: string) => void;
  statusOf: (v: string) => "auto" | "need" | "ign" | "new";
}) {
  const label = { auto: "Matched", need: "Needed", ign: "Empty", new: "New" };
  const tone = { auto: "ok", need: "bad", ign: undefined, new: "new" } as const;
  return (
    <div>
      <p className="label">{title}</p>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th className="l">In the file</th>
              <th>Rows</th>
              <th className="l">Yours</th>
              <th className="l">Status</th>
            </tr>
          </thead>
          <tbody>
            {values.map(([v, n]) => (
              <tr key={v}>
                <td className="l">{v || <span className="faint">Nothing written</span>}</td>
                <td className="num">{n}</td>
                <td className="l">
                  <Select
                    className="compact"
                    aria-label={`What ${v || "nothing written"} becomes`}
                    value={picked[v] ?? ""}
                    onChange={(to) => onPick(v, to)}
                    options={[...(picked[v] ? [] : [{ value: "", label: "Choose one" }]), ...choices(v)]}
                  />
                </td>
                <td className="l">
                  <Badge tone={tone[statusOf(v)]}>{label[statusOf(v)]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const counted = (rows: Record<string, string>[], key: string): [string, number][] => {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = (r[key] ?? "").trim();
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};

const low = (s: string) => s.trim().toLowerCase();

// A name that fits one card or account is matched; one that fits two, like "Savings", is left for the person.
function guessMethod(e: Expenses, v: string): string | undefined {
  if (!v.trim()) return BLANK;
  const exact = e.methods.filter((m) => low(m.name) === low(v) || (m.also && low(m.also) === low(v)));
  if (exact.length === 1) return exact[0].name;
  const loose = e.methods.filter((m) => low(v).includes(low(m.name)) || low(m.name).includes(low(v)) || (m.also && low(v).includes(low(m.also))));
  return loose.length === 1 ? loose[0].name : undefined;
}

function BringStep({
  kind,
  exp,
  mine,
  chosen,
  onTemplate,
  file,
  onFile,
  onDropFile,
  pasting,
  setPasting,
  text,
  setText,
  sample,
}: {
  kind: ImportTarget["kind"];
  exp: Expenses | null;
  mine: Template[];
  chosen: Template | null;
  onTemplate: (id: string) => void;
  file: { name: string; rows: number } | null;
  onFile: (f: File) => void;
  onDropFile: () => void;
  pasting: boolean;
  setPasting: (on: boolean) => void;
  text: string;
  setText: (t: string) => void;
  sample: string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const choose = (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (f) onFile(f);
  };
  return (
    <>
      <p className="sentence">
        {kind === "cards"
          ? "Bring in credit-cards.csv from an Ebenezer export, or any list of your cards. Cards you already have are skipped."
          : exp
            ? "Bring in the CSV export from the app you used before. Any columns work; you match them next."
            : "Bring in a CSV from your broker or a spreadsheet. Any columns work; you match them next."}
      </p>
      {mine.length > 0 && (
        <Select label="Use a saved template" value={chosen?.id ?? ""} onChange={onTemplate} options={[{ value: "", label: "None" }, ...mine.map((t) => ({ value: t.id, label: t.name }))]} />
      )}
      {file ? (
        <div className="filerow">
          <input ref={picker} type="file" accept=".csv,text/csv" hidden onChange={choose} />
          <span className="ms" aria-hidden="true">
            description
          </span>
          <span>
            <b>{file.name}</b>
            <span className="help">{file.rows.toLocaleString("en-IN")} rows</span>
          </span>
          <md-text-button onClick={() => picker.current?.click()}>Choose another</md-text-button>
          <md-icon-button onClick={onDropFile} aria-label="Remove this file" title="Remove">
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
      ) : (
        !pasting && <DropZone icon="upload_file" title="Choose a CSV file" hint="or drop it here" accept=".csv,text/csv" onFile={onFile} />
      )}
      {!file &&
        (pasting ? (
          <>
            <TextField type="textarea" className="paste" label="Rows, with the header row first" rows={exp ? 6 : 8} value={text} onChange={setText} placeholder={sample} spellCheck={false} autoFocus />
            <md-text-button className="alt" onClick={() => (setPasting(false), setText(""))}>
              <md-icon slot="icon">upload_file</md-icon>Choose a file instead
            </md-text-button>
          </>
        ) : (
          <md-text-button className="alt" onClick={() => setPasting(true)}>
            <md-icon slot="icon">content_paste</md-icon>Paste rows instead
          </md-text-button>
        ))}
      {exp && (
        <div className="tips">
          <div>
            <b>
              <span className="ms" aria-hidden="true">
                search
              </span>
              Finding the export
            </b>
            <p>Most money apps keep it under Settings, as Export, Backup or Download data. Choose CSV if it asks.</p>
          </div>
          <div>
            <b>
              <span className="ms" aria-hidden="true">
                lock
              </span>
              What the AI sees
            </b>
            <p>Only the column names and three sample rows, when rows need tidying or some columns go unmatched. Every other row is read here.</p>
          </div>
          <div>
            <b>
              <span className="ms" aria-hidden="true">
                undo
              </span>
              Nothing is final
            </b>
            <p>Every import shows in the ledger's filter, where it can be removed in one go.</p>
          </div>
        </div>
      )}
    </>
  );
}

const STATUS = { auto: ["ok", "Matched"], need: ["bad", "Needed"], ign: [undefined, "Empty"] } as const;

function MatchStep({
  fields,
  table,
  mapping,
  setMapping,
  matched,
  missing,
  exp,
  paidValues,
  catValues,
  paidAs,
  setPaidAs,
  catAs,
  setCatAs,
  unmatched,
  methodChoices,
  catChoices,
  isOwn,
}: {
  fields: Field[];
  table: Table;
  mapping: Record<string, string>;
  setMapping: (f: (m: Record<string, string>) => Record<string, string>) => void;
  matched: Record<string, string>[];
  missing: Field[];
  exp: Expenses | null;
  paidValues: [string, number][];
  catValues: [string, number][];
  paidAs: Record<string, string>;
  setPaidAs: (f: (m: Record<string, string>) => Record<string, string>) => void;
  catAs: Record<string, string>;
  setCatAs: (f: (m: Record<string, string>) => Record<string, string>) => void;
  unmatched: [string, number][];
  methodChoices: Choice[];
  catChoices: (v: string) => Choice[];
  isOwn: (v: string) => boolean;
}) {
  return (
    <>
      <div className="two">
        <div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th className="l">Field</th>
                  <th className="l">Your column</th>
                  <th className="l">Status</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const [tone, said] = STATUS[mapping[f.key] ? "auto" : f.required ? "need" : "ign"];
                  return (
                    <tr key={f.key}>
                      <td className="l">
                        {f.label}
                        {f.required && <span className="faint"> *</span>}
                      </td>
                      <td className="l">
                        <Select
                          className="compact"
                          value={mapping[f.key] ?? ""}
                          onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                          aria-label={`Column for ${f.label}`}
                          options={[{ value: "", label: "Leave empty" }, ...table.headers.map((h) => ({ value: h, label: h }))]}
                        />
                      </td>
                      <td className="l">
                        <Badge tone={tone}>{said}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p className="label">First rows, as I'll read them</p>
          <RowsTable fields={fields} rows={matched.slice(0, 5)} />
          {missing.length > 0 && <p className="help">Match {missing.map((f) => f.label).join(", ")} to go on.</p>}
        </div>
      </div>
      {exp && (paidValues.length > 0 || catValues.length > 0) && (
        <div className="two gap">
          {paidValues.length > 0 ? (
            <div>
              <MatchTable
                title="Paid from, matched to your cards and accounts"
                values={paidValues}
                choices={() => methodChoices}
                picked={paidAs}
                onPick={(v, to) => setPaidAs((m) => ({ ...m, [v]: to }))}
                statusOf={(v) => (!paidAs[v] ? "need" : paidAs[v] === BLANK ? "ign" : "auto")}
              />
              <p className="help">
                {unmatched.length > 0 ? `${unmatched.map(([v]) => `“${v}”`).join(", ")} could be more than one of yours, or none, so ${unmatched.length === 1 ? "it needs" : "they need"} you. ` : ""}
                Spends from a savings account come off its balance if they are after the day you set it.
              </p>
            </div>
          ) : (
            <div />
          )}
          {catValues.length > 0 && (
            <div>
              <MatchTable
                title="Categories, matched to yours"
                values={catValues}
                choices={catChoices}
                picked={catAs}
                onPick={(v, to) => setCatAs((m) => ({ ...m, [v]: to }))}
                statusOf={(v) => (isOwn(catAs[v]) ? "auto" : "new")}
              />
              <p className="help">New ones are added as they are. Tidy can join them with yours later.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function CheckStep({
  fields,
  checked,
  bad,
  holdings,
  will,
  section,
  exp,
  kind,
  replace,
  setReplace,
  saveTemplate,
  setSaveTemplate,
  tidied,
  templateName,
  setTemplateName,
}: {
  fields: Field[];
  checked: Checked[];
  bad: Checked[];
  holdings: boolean;
  will: Preview[];
  section: Section | null;
  exp: Expenses | null;
  kind?: Kind;
  replace: boolean;
  setReplace: (on: boolean) => void;
  saveTemplate: boolean;
  setSaveTemplate: (on: boolean) => void;
  tidied: boolean;
  templateName: string;
  setTemplateName: (name: string) => void;
}) {
  const good = checked.filter((c) => c.problems.length === 0);
  return (
    <>
      <Stats
        look="box"
        className="tiles"
        items={[
          { label: "rows ready", value: checked.length - bad.length },
          { label: "rows with problems, left out", value: bad.length },
          ...(holdings ? [{ label: `${section?.kind === "funds" ? "schemes" : section?.kind === "crypto" ? "coins" : "scrips"} you will hold`, value: will.length }] : []),
          ...(exp ? [{ label: "in all", value: money(good.reduce((t, c) => t + (Number(String(c.row.amount).replace(/[,₹\s]/g, "")) || 0), 0)) }] : []),
        ]}
      />
      {bad.length > 0 && (
        <>
          <RowsTable fields={fields} rows={bad.slice(0, 8).map((c) => c.row)} problems={bad.slice(0, 8).map((c) => c.problems.join("; "))} />
          {bad.length > 8 && <p className="help">And {bad.length - 8} more like these.</p>}
        </>
      )}
      {holdings && will.length > 0 && (
        <>
          <p className="label gap">How it will look, before today's prices</p>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th className="l">Holding</th>
                  <th>{section?.kind === "funds" ? "Units" : "Quantity"}</th>
                  <th>Put in</th>
                </tr>
              </thead>
              <tbody>
                {will.slice(0, 30).map((h) => (
                  <tr key={h.key}>
                    <td className="l wrap">{h.name}</td>
                    <td className="num">{qty(h.quantity)}</td>
                    <td className="num">{money(h.invested)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="opts gap">
        {section && (
          <SwitchRow
            checked={replace}
            onChange={setReplace}
            title="Replace what is there"
            detail={replace ? `Every row now in ${section.name} is removed first.` : "Rows already there are kept; exact repeats are skipped."}
          />
        )}
        <SwitchRow
          checked={saveTemplate}
          onChange={setSaveTemplate}
          title="Save as a template"
          detail={tidied ? "Reuse these columns and this tidying for the next file like this, with no AI needed." : "Reuse these columns for the next file like this."}
        />
        {saveTemplate && (
          <TextField
            className="compact"
            aria-label="Template name"
            value={templateName}
            onChange={setTemplateName}
            placeholder={kind?.template ? `Name, like ${kind.template.replace(/^e\.g\.\s*/, "")}` : exp ? "Name, like Walnut export" : "Name, like My broker export"}
            maxLength={80}
            autoFocus
          />
        )}
      </div>
    </>
  );
}

export default function ImportDialog({ target, onClose, onDone }: Props) {
  const p = usePortfolio();
  const say = useSnack();
  const { catalogue } = useSession();
  const exp = target.kind === "expenses" ? target.expenses : null;
  const section = target.kind === "section" ? target.section : null;
  const fields = useMemo(() => section?.fields ?? (target.kind === "cards" ? catalogue?.cardFields : catalogue?.expenseFields) ?? [], [section, catalogue, target.kind]);
  const tkind = section?.kind ?? target.kind;
  const name = section?.name ?? (target.kind === "cards" ? "Credit Cards" : "Expenses");
  const holdings = section?.kind === "stocks" || section?.kind === "funds" || section?.kind === "bonds" || section?.kind === "crypto";
  const templates = useLoad<Template[]>(`/portfolios/${p.id}/templates`);
  const mine = (templates.data ?? []).filter((t) => t.kind === tkind);
  const kind = catalogue?.kinds.find((k) => k.key === section?.kind);
  const cell = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const examples = fields.map((f) => f.example ?? kind?.fields.find((k) => k.key === f.key)?.example ?? "");
  const sample = [fields.map((f) => cell(f.label)), ...(examples.some(Boolean) ? [examples.map(cell)] : [])].map((r) => r.join(",")).join("\n");

  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [pasting, setPasting] = useState(false);
  const [file, setFile] = useState<{ name: string; text: string; rows: number } | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [paidAs, setPaidAs] = useState<Record<string, string>>({});
  const [catAs, setCatAs] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Template | null>(null);
  const [tidy, setTidy] = useState<Tidied | null>(null);
  const [output, setOutput] = useState<Record<string, string>[] | null>(null);
  const [pending, setPending] = useState(0);
  const [replace, setReplace] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapped = useMemo(() => (table ? applyMapping(table, mapping) : []), [table, mapping]);
  const paidValues = useMemo(() => (exp && mapping.paid_with ? counted(mapped, "paid_with") : []), [exp, mapped, mapping.paid_with]);
  const catValues = useMemo(() => (exp && mapping.category ? counted(mapped, "category").filter(([v]) => v) : []), [exp, mapped, mapping.category]);
  const matched = useMemo(
    () =>
      exp
        ? mapped.map((r) => {
            const paid = paidAs[(r.paid_with ?? "").trim()];
            return { ...r, paid_with: paid && paid !== BLANK ? paid : "", category: catAs[(r.category ?? "").trim()] ?? (r.category ?? "").trim() };
          })
        : mapped,
    [exp, mapped, paidAs, catAs],
  );
  const raw = useMemo(() => (table ? table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r[i]]))) : []), [table]);
  const final = output ?? [];
  const checked = useMemo(() => check(final, fields), [final, fields]);
  const bad = checked.filter((c) => c.problems.length > 0);
  const will = useMemo(() => (holdings && section ? preview(section.kind, final) : []), [holdings, section, final]);

  const fromTemplate = (t: Template, headers: string[]) => Object.fromEntries(Object.entries(t.payload.mapping).filter(([, h]) => headers.includes(h)));

  const read = (body: string): Table | null => {
    if (/^\s*[[{]/.test(body)) {
      setError("That's a JSON file. Export it as CSV, or open it in a spreadsheet and save it as CSV.");
      return null;
    }
    const t = parseCSV(body);
    if (t.headers.length < 2 || t.rows.length === 0) {
      setError("That doesn't look like a CSV table. It needs a header row and at least one row below it.");
      return null;
    }
    return t;
  };

  const take = async (f: File) => {
    setError(null);
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      setFile(null);
      setError(`${f.name} isn't a CSV file. Export it as CSV, or open it in a spreadsheet and save it as CSV.`);
      return;
    }
    const body = await f.text();
    const t = read(body);
    setFile(t ? { name: f.name, text: body, rows: t.rows.length } : null);
  };

  const next = () => {
    const t = read(file?.text ?? text);
    if (!t) return;
    setError(null);
    setTable(t);
    const kept = chosen ? fromTemplate(chosen, t.headers) : {};
    const used = Object.values(kept);
    const m = {
      ...guessMapping(
        t.headers.filter((h) => !used.includes(h)),
        fields.filter((f) => !kept[f.key]),
      ),
      ...kept,
    };
    setMapping(m);
    if (exp) {
      const rows = applyMapping(t, m);
      const paid: Record<string, string> = {};
      for (const [v] of counted(rows, "paid_with")) {
        const g = guessMethod(exp, v);
        if (g) paid[v] = g;
      }
      setPaidAs(paid);
      const cats: Record<string, string> = {};
      for (const [v] of counted(rows, "category")) {
        const hit = exp.categories.find((c) => low(c.name) === low(v));
        if (v) cats[v] = hit?.name ?? v;
      }
      setCatAs(cats);
    }
    setStep(1);
  };

  const applyTemplate = (id: string) => {
    const t = mine.find((x) => x.id === id) ?? null;
    setChosen(t);
    if (!t) return;
    setTidy(t.payload.script ? { code: t.payload.script, summary: t.payload.summary ?? `Tidied the way “${t.name}” does.` } : null);
    setSaveTemplate(true);
    setTemplateName(t.name);
    if (table) setMapping(fromTemplate(t, table.headers));
    say(`Using “${t.name}”`);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const good = checked.filter((c) => c.problems.length === 0).map((c) => onlyFields(c.row, fields));
      const tname = saveTemplate ? templateName.trim() : "";
      const source = file ? file.name : tname ? `Pasted with ${tname}` : "Pasted CSV";
      if (section) {
        const imp = await post<Import>(`/sections/${section.id}/import`, { source, rows: good, replace });
        say(
          `Added ${imp.added} row${imp.added === 1 ? "" : "s"}${imp.skipped ? `, ${imp.skipped} already there` : ""}${imp.replaced ? `, replaced ${imp.replaced} opening position${imp.replaced === 1 ? "" : "s"}` : ""}`,
        );
      } else if (target.kind === "cards") {
        const res = await post<{ added: number; skipped: number }>(`/portfolios/${p.id}/cards/import`, { rows: good });
        target.onSaved(await get<Expenses>(`/portfolios/${p.id}/expenses`));
        say(`Added ${res.added} card${res.added === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} already there` : ""}`);
      } else if (target.kind === "expenses") {
        const key = (n: string) => target.expenses.methods.find((m) => m.name === n)?.key ?? "";
        const imp = await post<SpendImport>(`/portfolios/${p.id}/spends/import`, { source, rows: good.map((r) => ({ ...r, paid_with: key(String(r.paid_with ?? "")) })) });
        target.onSaved(await get<Expenses>(`/portfolios/${p.id}/expenses`));
        say(`Added ${imp.added} spend${imp.added === 1 ? "" : "s"}${imp.skipped ? `, ${imp.skipped} already there` : ""}`);
      }
      if (tname) {
        await put(`/portfolios/${p.id}/templates`, { kind: tkind, name: tname, payload: { mapping, processed: !tidy, script: tidy?.code, summary: tidy?.summary, steps: tidy?.steps } });
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const missing = fields.filter((f) => f.required && !mapping[f.key]);
  const unmatched = paidValues.filter(([v]) => !paidAs[v]);
  const methodChoices: Choice[] = exp ? [...exp.methods.map((m) => ({ value: m.name, label: m.name })), { value: BLANK, label: "Leave it blank" }] : [];
  const catChoices = (v: string): Choice[] => {
    const own = exp?.categories.map((c) => ({ value: c.name, label: c.name })) ?? [];
    return own.some((c) => low(c.value) === low(v)) ? own : [...own, { value: v, label: `Add “${v}”` }];
  };
  const isOwn = (v: string) => exp?.categories.some((c) => c.name === v) ?? false;

  const note = [
    "",
    table ? `${table.rows.length} rows, ${table.headers.length} columns` : "",
    pending > 0 ? `${pending} to fix or leave out` : "",
    `${checked.length - bad.length} of ${checked.length} rows ready`,
  ][step];
  const forward = [
    { onClick: next, disabled: !file && !text.trim() },
    { onClick: () => setStep(2), disabled: missing.length > 0 || unmatched.length > 0 },
    { onClick: () => setStep(3), disabled: output === null },
    { onClick: () => void save(), disabled: checked.length === bad.length || (saveTemplate && !templateName.trim()), label: `Save ${checked.length - bad.length} rows`, icon: "download_done" },
  ][step];
  const footer = (
    <DialogActions
      note={note}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      busy={busy}
      label={forward.label ?? "Next"}
      icon={forward.icon}
      onClick={forward.onClick}
      disabled={forward.disabled}
    />
  );

  return (
    <Dialog title={`Import into ${name}`} icon={section?.icon ?? (target.kind === "cards" ? "credit_card" : "receipt_long")} onClose={onClose} steps={STEPS} step={step} footer={footer}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {step === 0 && (
        <BringStep
          kind={target.kind}
          exp={exp}
          mine={mine}
          chosen={chosen}
          onTemplate={applyTemplate}
          file={file}
          onFile={(f) => void take(f)}
          onDropFile={() => setFile(null)}
          pasting={pasting}
          setPasting={setPasting}
          text={text}
          setText={setText}
          sample={sample}
        />
      )}
      {step === 1 && table && (
        <MatchStep
          fields={fields}
          table={table}
          mapping={mapping}
          setMapping={setMapping}
          matched={matched}
          missing={missing}
          exp={exp}
          paidValues={paidValues}
          catValues={catValues}
          paidAs={paidAs}
          setPaidAs={setPaidAs}
          catAs={catAs}
          setCatAs={setCatAs}
          unmatched={unmatched}
          methodChoices={methodChoices}
          catChoices={catChoices}
          isOwn={isOwn}
        />
      )}
      {step === 2 && table && (
        <TidyStep pid={section?.portfolioId ?? p.id} fields={fields} columns={table.headers} unused={table.headers.filter((h) => !Object.values(mapping).includes(h))} mapped={matched} raw={raw} tidy={tidy} setTidy={setTidy} onOutput={setOutput} onPending={setPending} />
      )}
      {step === 3 && (
        <CheckStep
          fields={fields}
          checked={checked}
          bad={bad}
          holdings={!!holdings}
          will={will}
          section={section}
          exp={exp}
          kind={kind}
          replace={replace}
          setReplace={setReplace}
          saveTemplate={saveTemplate}
          setSaveTemplate={setSaveTemplate}
          tidied={!!tidy}
          templateName={templateName}
          setTemplateName={setTemplateName}
        />
      )}
    </Dialog>
  );
}
