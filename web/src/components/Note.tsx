import { useState } from "react";

import type { Summary } from "../lib/api";
import { date } from "../lib/format";
import { Empty } from "../design-system/Empty";
import SeesDialog from "./SeesDialog";

export interface Note {
  icon: string;
  text: string;
  action?: { label: string; onClick: () => void };
}

function Go({ action }: { action?: Note["action"] }) {
  if (!action) return null;
  return (
    <md-icon-button className="note-go" onClick={action.onClick} aria-label={action.label} title={action.label}>
      <md-icon>arrow_forward</md-icon>
    </md-icon-button>
  );
}

export function EbenezerNote({
  lead,
  quiet,
  action,
  lines,
  sees,
  signoff,
  meta,
  className = "",
}: {
  lead: string;
  quiet?: string;
  action?: Note["action"];
  lines: Note[];
  sees?: string;
  signoff?: string;
  meta: string;
  className?: string;
}) {
  const [seeing, setSeeing] = useState(false);
  return (
    <div className={`card notecard ${className}`.trim()}>
      <div className="note-h">
        <img src="/favicon.svg" alt="" />
        <div>
          <b>Ebenezer's note</b>
          <span>{meta}</span>
        </div>
        <md-icon-button className="note-see" onClick={() => setSeeing(true)} aria-label="What Ebenezer sees" title="What Ebenezer sees">
          <md-icon>visibility</md-icon>
        </md-icon-button>
      </div>
      {quiet ? (
        <Empty icon="done_all" title={quiet} />
      ) : (
        <div className="note-lead">
          <p>{lead}</p>
          <Go action={action} />
        </div>
      )}
      {lines.length > 0 && (
        <ul className="note-list">
          {lines.map((l) => (
            <li key={l.text}>
              <span className="ms">{l.icon}</span>
              <span>{l.text}</span>
              <Go action={l.action} />
            </li>
          ))}
        </ul>
      )}
      {signoff && <p className="note-foot">{signoff}</p>}
      {seeing && <SeesDialog help="The plain text sent to the model to write this note, along with your instructions from Settings." text={sees ?? null} onClose={() => setSeeing(false)} />}
    </div>
  );
}

const PRICED = ["market", "nav", "gold"];

// The sign-off stays on Today, said once rather than on every tab.
export function Notes({ id, summary, onOpen }: { id: string; summary: Summary; onOpen?: (section: string) => void }) {
  const tab = summary.tabNotes[id] ?? { lines: [] };
  const name = (sid: string) => summary.sectionList.find((s) => s.id === sid)?.name ?? "section";
  const notes: Note[] = tab.lines.map((l) => ({
    icon: l.icon,
    text: l.text,
    action: l.section && onOpen ? { label: `Open ${name(l.section)}`, onClick: () => onOpen(l.section!) } : undefined,
  }));
  const [first, ...rest] = notes;
  const quiet = first ? undefined : (tab.quiet ?? "Nothing here needs you.");
  const valuation = summary.sectionList.find((s) => s.id === id)?.valuation;
  const priced = !valuation || PRICED.includes(valuation);
  return (
    <EbenezerNote
      className="s4"
      lead={first?.text ?? ""}
      quiet={quiet}
      action={first?.action}
      lines={rest}
      sees={tab.sees}
      meta={priced ? (summary.pricedOn ? `Prices from ${date(summary.pricedOn)}` : "No prices fetched yet") : "From your rows"}
    />
  );
}
