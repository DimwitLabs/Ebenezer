import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Counts from "../components/Counts";
import ImportDialog from "../components/ImportDialog";
import { Badge } from "../design-system/Badge";
import { CardHead } from "../design-system/CardHead";
import { PageHead } from "../design-system/PageHead";
import { Item } from "../design-system/Item";
import { Middle } from "../design-system/Middle";
import { Tile } from "../design-system/Tile";
import RowDialog from "../components/RowDialog";
import SectionDialog from "../components/SectionDialog";
import StatementDialog from "../components/StatementDialog";
import { useSnack } from "../design-system/Snack";
import { del, type Holding, type Import, type Row, type Section, type Template } from "../lib/api";
import { ago, money, nameCase, qty } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { usePortfolio } from "../lib/session";

type Open = { kind: "import" } | { kind: "statement" } | { kind: "row"; row: Row | null } | { kind: "section"; section: Section | null } | null;

const PAGE = 100;

function Rows({ section, rows, reload, onEdit }: { section: Section; rows: Row[] | null; reload: () => void; onEdit: (r: Row) => void }) {
  const say = useSnack();
  const [shown, setShown] = useState(PAGE);
  if (!rows) return null;
  if (rows.length === 0) return <p className="help">No rows yet.</p>;
  const dateKey = section.fields.find((f) => f.type === "date")?.key;
  const list = [...rows].reverse();
  if (dateKey) list.sort((a, b) => String(b.data[dateKey] ?? "").localeCompare(String(a.data[dateKey] ?? "")));
  const remove = async (r: Row) => {
    try {
      await del(`/sections/${section.id}/rows/${r.id}`);
      reload();
      say("Row deleted");
    } catch (e) {
      say((e as Error).message, true);
    }
  };
  return (
    <>
      <div className="tw">
        <table>
          <thead>
            <tr>
              {section.fields.map((f) => (
                <th key={f.key} className={f.type === "text" || f.type === "choice" || f.type === "date" ? "l" : ""}>
                  {f.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((r) => (
              <tr key={r.id}>
                {section.fields.map((f) => (
                  <td key={f.key} className={f.type === "text" || f.type === "choice" || f.type === "date" ? "l" : "num"}>
                    {f.type === "text" ? <Middle text={String(r.data[f.key] ?? "")} /> : String(r.data[f.key] ?? "")}
                  </td>
                ))}
                <td className="rowacts">
                  <md-icon-button onClick={() => onEdit(r)} aria-label="Edit row">
                    <md-icon>edit</md-icon>
                  </md-icon-button>
                  <md-icon-button onClick={() => remove(r)} aria-label="Delete row">
                    <md-icon>delete</md-icon>
                  </md-icon-button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > shown && (
        <md-text-button onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}
        </md-text-button>
      )}
    </>
  );
}

function Holdings({ holdings }: { holdings: Holding[] }) {
  const held = holdings.filter((h) => h.quantity > 0);
  if (held.length === 0) return null;
  return (
    <div className="card">
      <CardHead title="Worked out from the rows" help="First in, first out. I can't price a holding without an ISIN; add the ISIN or the exchange symbol to its rows." />
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th className="l">Holding</th>
              <th className="l">ISIN</th>
              <th>Quantity</th>
              <th>Cost</th>
              <th>Realised</th>
              <th className="l">Since</th>
            </tr>
          </thead>
          <tbody>
            {held.map((h) => (
              <tr key={h.key}>
                <td className="l">
                  <span className="nm">
                    <Middle text={nameCase(h.name) || h.symbol} />
                  </span>
                  <span className="sm">{h.symbol}</span>
                </td>
                <td className="l">{h.isin || <Badge tone="bad">none</Badge>}</td>
                <td className="num">{qty(h.quantity)}</td>
                <td className="num">{money(h.cost)}</td>
                <td className="num">{money(h.realised)}</td>
                <td className="l">{h.firstDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DataScreen() {
  const p = usePortfolio();
  const say = useSnack();
  const location = useLocation();
  const navigate = useNavigate();
  const sections = useLoad<Section[]>(`/portfolios/${p.id}/sections`);
  const templates = useLoad<Template[]>(`/portfolios/${p.id}/templates`);
  const imports = useLoad<Import[]>(`/portfolios/${p.id}/imports`);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const st = location.state as { section?: string; action?: "import" | "add"; row?: string } | null;
    if (!st?.section) return;
    setSelected(st.section);
    if (st.row) setEditing(st.row);
    else if (st.action) setOpen(st.action === "add" ? { kind: "row", row: null } : { kind: "import" });
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const list = sections.data ?? [];
  const section = list.find((s) => s.id === selected) ?? list[0] ?? null;
  const holdings = section && (section.kind === "stocks" || section.kind === "funds" || section.kind === "bonds" || section.kind === "crypto");
  const rows = useLoad<Row[]>(section ? `/sections/${section.id}/rows` : null);
  const held = useLoad<Holding[]>(holdings ? `/sections/${section.id}/holdings` : null);

  useEffect(() => {
    const row = editing && rows.data?.find((r) => r.id === editing);
    if (!row) return;
    setEditing(null);
    setOpen({ kind: "row", row });
  }, [editing, rows.data]);

  const changed = () => {
    setOpen(null);
    rows.reload();
    held.reload();
    sections.reload();
    imports.reload();
    templates.reload();
  };

  const removeTemplate = async (t: Template) => {
    try {
      await del(`/portfolios/${p.id}/templates/${t.id}`);
      templates.reload();
      say(`Template ${t.name} deleted`);
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  return (
    <>
      <PageHead title="Data" status="Everything I count comes from these rows.">
        <md-filled-button onClick={() => setOpen({ kind: "statement" })}>
          <md-icon slot="icon">upload_file</md-icon>Upload a statement
        </md-filled-button>
      </PageHead>
      <div className="pick">
        {list.map((s) => (
          <Tile
            key={s.id}
            icon={s.icon}
            title={s.name}
            pressed={section?.id === s.id}
            onClick={() => setSelected(s.id)}
            hint={`${s.rows} row${s.rows === 1 ? "" : "s"}${s.holdings > 0 ? ` · ${s.holdings} holding${s.holdings === 1 ? "" : "s"}` : ""} · ${s.lastImport ? `imported ${ago(s.lastImport)}` : "nothing imported"}`}
          >
            <Counts counts={s.counts} owed={s.valuation === "liability"} />
          </Tile>
        ))}
        <Tile add icon="add" title="New section" hint="Another kind, or one of your own" onClick={() => setOpen({ kind: "section", section: null })} />
      </div>

      {section && (
        <div className="set-body gap">
          <div className="card">
            <CardHead title={section.name} help={section.description}>
              <div className="acts secacts">
                <md-icon-button onClick={() => setOpen({ kind: "section", section })} aria-label="Edit section" title="Edit section">
                  <md-icon>tune</md-icon>
                </md-icon-button>
                <md-filled-tonal-button onClick={() => setOpen({ kind: "import" })}>
                  <md-icon slot="icon">upload</md-icon>Import
                </md-filled-tonal-button>
                <md-text-button onClick={() => setOpen({ kind: "row", row: null })}>Add by hand</md-text-button>
              </div>
            </CardHead>
            <Rows key={section.id} section={section} rows={rows.data} reload={rows.reload} onEdit={(row) => setOpen({ kind: "row", row })} />
          </div>
          {holdings && <Holdings holdings={held.data ?? []} />}
          <div className="grid">
            <div className="card s6">
              <CardHead title="Recent imports" />
              <div className="items">
                {(imports.data ?? []).slice(0, 8).map((i) => (
                  <Item key={i.id} icon="upload_file" title={i.sectionName} detail={`${i.source} · ${i.added} added${i.skipped ? `, ${i.skipped} already there` : ""} · ${ago(i.createdAt)}`} />
                ))}
              </div>
              {(imports.data ?? []).length === 0 && <p className="help">Nothing imported yet.</p>}
            </div>
            <div className="card s6">
              <CardHead title="Templates" />
              <div className="items">
                {(templates.data ?? []).map((t) => (
                  <Item
                    key={t.id}
                    icon="description"
                    title={t.name}
                    detail={`${t.kind} · ${t.payload.processed ? "already processed" : "runs a script"} · ${Object.keys(t.payload.mapping).length} columns matched`}
                  >
                    <md-icon-button onClick={() => removeTemplate(t)} aria-label={`Delete template ${t.name}`}>
                      <md-icon>delete</md-icon>
                    </md-icon-button>
                  </Item>
                ))}
              </div>
              {(templates.data ?? []).length === 0 && <p className="help">Turn on Save as a template on the last step of an import to reuse its columns and rules next time.</p>}
            </div>
          </div>
        </div>
      )}

      {open?.kind === "statement" && <StatementDialog portfolioId={p.id} onClose={() => setOpen(null)} onDone={changed} />}
      {open?.kind === "import" && section && <ImportDialog target={{ kind: "section", section }} onClose={() => setOpen(null)} onDone={changed} />}
      {open?.kind === "row" && section && <RowDialog section={section} row={open.row} onClose={() => setOpen(null)} onDone={changed} />}
      {open?.kind === "section" && (
        <SectionDialog
          portfolioId={p.id}
          section={open.section}
          existing={list.map((s) => s.kind)}
          onClose={() => setOpen(null)}
          onDone={(id) => {
            if (id) setSelected(id);
            changed();
          }}
        />
      )}
    </>
  );
}
