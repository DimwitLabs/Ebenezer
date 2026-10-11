import { useRef, useState } from "react";

import { get, post, type HeldOn, type Import, type Row, type Section } from "../lib/api";
import type { HoldingKind } from "../lib/depository";
import { date, qty } from "../lib/format";
import { onlyFields } from "../lib/rows";
import { asOf, readStatement, reviewCams, reviewDemat, type Item, type Parsed } from "../lib/statement";
import { Badge } from "../design-system/Badge";
import Dialog from "../design-system/Dialog";
import { DialogActions } from "../design-system/DialogActions";
import { DropZone } from "../design-system/DropZone";
import { TextField } from "../design-system/Fields";
import { useSnack } from "../design-system/Snack";

interface Props {
  portfolioId: string;
  onClose: () => void;
  onDone: () => void;
}

const KINDS: { kind: HoldingKind; name: string }[] = [
  { kind: "stocks", name: "Stocks" },
  { kind: "funds", name: "Mutual Funds" },
  { kind: "bonds", name: "Bonds" },
];

const TONE: Record<Item["status"], "ok" | "new" | "bad"> = { match: "ok", adds: "new", missing: "new", differs: "bad", absent: "bad" };

interface Review {
  parsed: Parsed;
  items: Item[];
  sections: Section[];
  warnings: string[];
}

export default function StatementDialog({ portfolioId, onClose, onDone }: Props) {
  const say = useSnack();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reads = useRef(0);

  const open = async (f: File, pw?: string) => {
    const n = ++reads.current;
    setReading(true);
    setError(null);
    try {
      const { readPages } = await import("../lib/pdf");
      const parsed = readStatement(await readPages(await f.arrayBuffer(), pw));
      const [sections, held] = await Promise.all([get<Section[]>(`/portfolios/${portfolioId}/sections`), get<HeldOn[]>(`/portfolios/${portfolioId}/positions?on=${asOf(parsed)}`)]);
      let items: Item[];
      const warnings = [...parsed.st.warnings];
      if (parsed.type === "cams") {
        const funds = sections.find((s) => s.kind === "funds");
        const rows = funds ? await get<Row[]>(`/sections/${funds.id}/rows`) : [];
        items = reviewCams(
          parsed.st,
          held,
          rows.map((r) => r.data),
        );
      } else {
        const r = reviewDemat(parsed.st, held);
        items = r.items;
        if (r.unchecked > 0) warnings.push(`${r.unchecked} of your holdings have no ISIN in my books, so I couldn't check them against the statement.`);
      }
      if (n !== reads.current) return;
      setReview({ parsed, items, sections, warnings });
      setPicked(Object.fromEntries(items.map((i) => [i.id, i.on])));
      setNeedsPassword(false);
      setPassword("");
    } catch (e) {
      if (n !== reads.current) return;
      const err = e as { name?: string; wrong?: boolean; message: string };
      if (err.name === "PasswordNeeded") {
        setNeedsPassword(true);
        if (err.wrong) setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      if (n === reads.current) setReading(false);
    }
  };

  const pick = (f: File) => {
    setFile(f);
    setNeedsPassword(false);
    void open(f);
  };

  const back = () => {
    reads.current++;
    setReview(null);
    setFile(null);
    setError(null);
  };

  const chosen = (review?.items ?? []).filter((i) => picked[i.id] && i.rows.length > 0);
  const plan = KINDS.map(({ kind, name }) => {
    const section = review?.sections.find((s) => s.kind === kind) ?? null;
    const items = chosen.filter((i) => i.kind === kind);
    return { kind, name: section?.name ?? name, section, items, rows: items.flatMap((i) => i.rows) };
  }).filter((p) => p.rows.length > 0);
  const total = plan.reduce((a, p) => a + p.rows.length, 0);
  const creating = plan.filter((p) => !p.section).map((p) => p.name);

  const save = async () => {
    if (!review || !file) return;
    setBusy(true);
    setError(null);
    try {
      let added = 0;
      let skipped = 0;
      let replaced = 0;
      const sections = [...review.sections];
      for (const p of plan) {
        let section = sections.find((s) => s.kind === p.kind);
        if (!section) {
          section = await post<Section>(`/portfolios/${portfolioId}/sections`, { kind: p.kind });
          sections.push(section);
          setReview({ ...review, sections: [...sections] });
        }
        const fields = section.fields;
        // One import per basis, as the server marks a whole batch the same way.
        for (const basis of ["", "opening", "snapshot"] as const) {
          const rows = p.items.filter((i) => (i.basis ?? "") === basis).flatMap((i) => i.rows);
          if (rows.length === 0) continue;
          const imp = await post<Import>(`/sections/${section.id}/import`, { source: file.name, rows: rows.map((r) => onlyFields(r, fields)), replace: false, basis });
          added += imp.added;
          skipped += imp.skipped;
          replaced += imp.replaced ?? 0;
        }
      }
      say(`Added ${added} row${added === 1 ? "" : "s"}${skipped ? `, ${skipped} already there` : ""}${replaced ? `, replaced ${replaced} opening position${replaced === 1 ? "" : "s"}` : ""}`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const kindLabel = review?.parsed.type === "cams" ? "CAMS or KFintech" : review?.parsed.st.depository;
  const fresh =
    creating.length === 0 ? "" : creating.length === 1 ? `, including a new ${creating[0]} section` : `, including new sections for ${creating.slice(0, -1).join(", ")} and ${creating.at(-1)}`;
  const summary = total === 0 ? "Nothing to add" : `Adds ${total} row${total === 1 ? "" : "s"} across ${plan.length} section${plan.length === 1 ? "" : "s"}${fresh}`;

  const footer = review ? <DialogActions note={summary} onBack={back} busy={busy} icon="download_done" label="Save" onClick={() => void save()} disabled={total === 0} /> : <DialogActions note="" />;

  return (
    <Dialog title="Upload a statement" icon="upload_file" onClose={onClose} steps={["Choose the file", "Review"]} step={review ? 1 : 0} footer={footer}>
      {error && <p className="error">{error}</p>}

      {!review && (
        <>
          <p className="sentence">
            A <b>detailed</b> CAMS or KFintech statement brings in every mutual fund transaction. An NSDL or CDSL statement has everything in your demat accounts, as holdings on one day. I add what's
            missing and check what I already have.
          </p>
          <DropZone
            icon="picture_as_pdf"
            title={file ? file.name : "Drop the PDF here or choose it"}
            hint="Statements are protected with the password you set when you asked for them, usually your PAN."
            accept="application/pdf"
            busy={reading}
            onFile={pick}
          />
          {needsPassword && file && (
            <form
              className="pwrow"
              onSubmit={(e) => {
                e.preventDefault();
                void open(file, password);
              }}
            >
              <TextField label="Statement password" type="password" value={password} onChange={setPassword} autoFocus autocomplete="off" />
              <md-filled-tonal-button type="submit" disabled={!password || reading}>
                Open
              </md-filled-tonal-button>
            </form>
          )}
          <p className="help gap">The file and its password stay in this tab. Only the rows you approve come to me.</p>
        </>
      )}

      {review && (
        <>
          <p className="help">
            {kindLabel} statement, holdings on {date(asOf(review.parsed))}. My numbers are for the same day.
          </p>
          {review.warnings.length > 0 && (
            <ul className="warns">
              {review.warnings.map((w) => (
                <li key={w}>
                  <span className="ms" aria-hidden="true">
                    info
                  </span>
                  {w}
                </li>
              ))}
            </ul>
          )}
          {KINDS.map(({ kind, name }) => {
            const items = review.items.filter((i) => i.kind === kind);
            if (items.length === 0) return null;
            const section = review.sections.find((s) => s.kind === kind);
            const notes = new Set(items.map((i) => i.note));
            const shared = notes.size === 1 && items.length > 1 ? items[0].note : undefined;
            return (
              <div key={kind}>
                <p className="label gap">
                  {section?.name ?? name}
                  {!section && " · new section"}
                </p>
                {shared && <p className="help">{shared}</p>}
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th className="l" />
                        <th className="l">Holding</th>
                        <th>Statement</th>
                        <th>Ebenezer</th>
                        <th className="l">Status</th>
                        <th className="l">Adds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id}>
                          <td className="l">
                            <md-checkbox
                              checked={!!picked[i.id] && i.rows.length > 0}
                              disabled={i.rows.length === 0}
                              onChange={(e) => {
                                const on = e.currentTarget.checked;
                                setPicked((p) => ({ ...p, [i.id]: on }));
                              }}
                              aria-label={`Add rows for ${i.name}`}
                            />
                          </td>
                          <td className="l wrap">
                            <span className="nm">{i.name}</span>
                            <span className="sm">{i.isin ?? "no ISIN, so it won't be priced"}</span>
                            {i.note && !shared && <span className="sm">{i.note}</span>}
                          </td>
                          <td className="num">{i.statement === null ? "—" : qty(i.statement)}</td>
                          <td className="num">{qty(i.ebenezer)}</td>
                          <td className="l">
                            <Badge tone={TONE[i.status]}>{i.label}</Badge>
                          </td>
                          <td className="l">{i.adds}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </Dialog>
  );
}
