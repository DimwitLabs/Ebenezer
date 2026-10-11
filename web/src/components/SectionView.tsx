import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { MdMenu } from "@material/web/menu/menu.js";

import { NO_RETURNS, type Position, type Section, type Summary } from "../lib/api";
import { money, nameCase, pct, plainPct, qty, short, signed, tone } from "../lib/format";
import { usePortfolio, useTo } from "../lib/session";
import Amount from "../design-system/Amount";
import Dialog from "../design-system/Dialog";
import { TextField } from "../design-system/Fields";
import { CardHead } from "../design-system/CardHead";
import { RemovableChips } from "../design-system/Chips";
import { Empty } from "../design-system/Empty";
import { Hero } from "../design-system/Hero";
import { Stats, type StatItem } from "../design-system/Stat";
import { Notes } from "./Note";
import { gainPill, returnsLine } from "./Returns";
import { ListRow } from "../design-system/ListRow";
import { Segmented } from "../design-system/Segmented";
import ScripDetail from "./ScripDetail";
import Treemap, { type Block } from "./Treemap";

type SortKey = "value" | "gain" | "name";
type Move = (p: Position, to: string, done: string) => void;

const NOUN: Record<string, [string, string]> = {
  stocks: ["stock", "stocks"],
  funds: ["fund", "funds"],
  bonds: ["bond", "bonds"],
  crypto: ["coin", "coins"],
  savings: ["account", "accounts"],
};

const known = (p: Position) => p.invested > 0 && !p.costUnknown;
const growth = (p: Position) => (known(p) ? (p.value - p.invested) / p.invested : null);
const groupOf = (p: Position) => p.group || "Other";

const ORDER: Record<SortKey, (p: Position) => string | number> = {
  value: (p) => Math.abs(p.value),
  gain: (p) => growth(p) ?? -Infinity,
  name: (p) => nameCase(p.name).toLowerCase(),
};

interface Target {
  to: string;
  name: string;
}

function HoldingDialog({
  p,
  section,
  sections,
  goldName,
  total,
  minDays,
  onMove,
  onClose,
}: {
  p: Position;
  section: Section;
  sections: Section[];
  goldName: string;
  total: number;
  minDays: number;
  onMove: Move;
  onClose: () => void;
}) {
  const { id: pid } = usePortfolio();
  const g = growth(p);
  const nameOf = (id?: string) => sections.find((s) => s.id === id)?.name ?? "its section";
  const others = sections.filter((s) => s.valuation !== "liability" && s.valuation !== "cover" && s.id !== section.id && s.id !== p.from);
  const gold = others.filter((s) => s.kind === "gold");
  const targets: Target[] = !p.isin
    ? []
    : [
        ...(section.kind === "gold" ? [] : gold.length ? gold.map((s) => ({ to: s.id, name: s.name })) : [{ to: "gold", name: goldName }]),
        ...others.filter((s) => s.kind !== "gold").map((s) => ({ to: s.id, name: s.name })),
      ];
  const isGold = (t: Target) => t.to === "gold" || sections.find((s) => s.id === t.to)?.kind === "gold";
  const suggest = p.bullion ? targets.find(isGold) : undefined;
  const rest = targets.filter((t) => t !== suggest);
  const menu = useRef<MdMenu>(null);
  const move = (t: Target) => {
    onMove(p, t.to, `Counted under ${t.name}.`);
    onClose();
  };
  const stats: StatItem[] = [
    { label: "Put in", value: known(p) ? money(p.invested) : "Unknown" },
    { label: "XIRR", value: p.xirr === null ? "—" : p.days < minDays ? `After ${minDays} days` : pct(p.xirr), tone: p.days >= minDays ? tone(p.xirr) : undefined },
    { label: `Of ${section.name.toLowerCase()}`, value: plainPct(Math.abs(p.value) / total) },
  ];
  const actions = (
    <>
      {p.from && (
        <md-text-button onClick={() => (onMove(p, "", `Moved back to ${nameOf(p.from)}.`), onClose())}>
          <md-icon slot="icon">undo</md-icon>Move back to {nameOf(p.from)}
        </md-text-button>
      )}
      {suggest && (
        <md-text-button onClick={() => move(suggest)}>
          <md-icon slot="icon">diamond</md-icon>Count under {suggest.name}
        </md-text-button>
      )}
      {rest.length > 0 && (
        <span className="anchor">
          <md-text-button id="count-elsewhere" onClick={() => menu.current?.show()}>
            <md-icon slot="icon">drive_file_move</md-icon>Count elsewhere
          </md-text-button>
          <md-menu ref={menu} anchor="count-elsewhere" positioning="popover">
            {rest.map((t) => (
              <md-menu-item key={t.to} onClick={() => move(t)}>
                <div slot="headline">{t.name}</div>
              </md-menu-item>
            ))}
          </md-menu>
        </span>
      )}
    </>
  );
  return (
    <Dialog title={nameCase(p.name) || "Unnamed"} icon={section.icon} onClose={onClose}>
      <div className="hstrip">
        <div className="hstrip-v">
          <b className="num">{money(p.value)}</b>
          {known(p) && g !== null && (
            <span className={`pill sm${g < 0 ? " neg" : ""}`}>
              <span className="ms">{g < 0 ? "south_east" : "north_east"}</span>
              {signed(p.value - p.invested)} · {pct(g)}
            </span>
          )}
        </div>
        <Stats look="box" items={stats} />
      </div>
      {p.isin ? <ScripDetail pid={pid} position={p} news={section.kind === "stocks"} actions={actions} /> : p.from && <div className="scrip-act">{actions}</div>}
    </Dialog>
  );
}

const initials = (name: string) =>
  nameCase(name)
    .replace(/[^A-Za-z0-9 &]/g, "")
    .split(/\s+/)
    .filter((w) => w && !/^(of|the|and|&|ltd|limited|fund)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

const PAGE = 16;

export default function SectionView({ summary, section, goldName, onMove }: { summary: Summary; section: Section; goldName: string; onMove: Move }) {
  const navigate = useNavigate();
  const to = useTo();
  const { settings } = usePortfolio();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "value", desc: true });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Position | null>(null);
  const [query, setQuery] = useState<string | null>(null);

  const result = summary.sections.find((r) => r.sectionId === section.id) ?? { sectionId: section.id, value: 0, invested: 0, positions: [], unpriced: 0, returns: NO_RETURNS };
  const owed = section.valuation === "liability";
  const balance = section.valuation === "balance";
  const ps = useMemo(() => [...result.positions].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)), [result.positions]);
  const total = Math.abs(result.value) || 1;
  const grouped = (section.kind === "stocks" || section.kind === "funds") && ps.some((p) => p.group);
  const noun = NOUN[section.kind] ?? ["holding", "holdings"];

  const blocks = useMemo(() => {
    const m = new Map<string, Block>();
    for (const p of ps) {
      const k = grouped ? groupOf(p) : p.key;
      const b = m.get(k) ?? { key: k, label: grouped ? k : nameCase(p.name), value: 0, count: grouped ? 0 : undefined };
      b.value += Math.abs(p.value);
      if (b.count !== undefined) b.count++;
      m.set(k, b);
    }
    return [...m.values()];
  }, [ps, grouped]);

  const rows = useMemo(() => {
    const val = ORDER[sort.key];
    return ps
      .filter((p) => picked.size === 0 || picked.has(grouped ? groupOf(p) : p.key))
      .filter((p) => !query?.trim() || `${p.name} ${p.group ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return sort.desc ? -c : c;
      });
  }, [ps, picked, sort, grouped, query]);

  if (section.valuation === "cover") return null;
  if (ps.length === 0) {
    return (
      <div className="card">
        <Empty icon={section.icon} title={`Nothing in ${section.name} yet`}>
          <md-filled-tonal-button onClick={() => navigate(to("/data"), { state: { section: section.id } })}>Bring it in</md-filled-tonal-button>
        </Empty>
      </div>
    );
  }

  const gain = result.value - (result.unknown ?? 0) - result.invested;
  const share = summary.assets > 0 && !owed ? plainPct(result.value / summary.assets, 0) : null;
  const toggle = (k: string) => {
    const next = new Set(picked);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setPicked(next);
    setAll(next.size > 0);
  };
  const shown = all ? rows : rows.slice(0, PAGE);
  const largest = `Largest, ${nameCase(ps[0].name).split(" ").slice(0, 3).join(" ")}`;

  return (
    <div className="grid">
      <Hero
        icon={section.icon}
        title={section.name}
        meta={`${ps.length} ${ps.length === 1 ? noun[0] : noun[1]}${share ? ` · ${share} of what you own` : ""}${section.counts ? "" : " · not counted"}`}
        value={<Amount n={Math.abs(result.value)} />}
        pill={owed || balance ? undefined : gainPill(gain, result.invested)}
        sub={owed ? "Owed" : undefined}
        stats={
          balance
            ? [
                { label: "Of what you own", value: share ?? "—" },
                { label: largest, value: <Amount n={ps[0].value} /> },
                { label: ps.length === 1 ? "Account" : "Accounts", value: String(ps.length) },
              ]
            : owed
              ? [
                  { label: "Of what you own", value: summary.assets > 0 ? plainPct(Math.abs(result.value) / summary.assets, 0) : "—" },
                  { label: largest, value: <Amount n={Math.abs(ps[0].value)} /> },
                  { label: "You own", value: <Amount n={summary.assets} /> },
                ]
              : [
                  { label: "Put in", value: result.invested > 0 ? <Amount n={result.invested} /> : "—" },
                  { label: "Cost unknown", value: result.unknown ? <Amount n={result.unknown} /> : "None" },
                  { label: largest, value: <Amount n={ps[0].value} /> },
                ]
        }
        footIcon={balance ? "info" : "schedule"}
        foot={balance ? "A balance earns only the interest you entered for it; it is not counted as a gain." : returnsLine(result.returns ?? NO_RETURNS, summary.benchmark, settings.xirrMinDays)}
      />
      <Notes id={section.id} summary={summary} />
      {blocks.length > 1 && (
        <div className="card s12">
          <CardHead title="Where the money sits">{grouped && <span className="help">{section.kind === "funds" ? "By category" : "By sector"}</span>}</CardHead>
          <Treemap blocks={blocks} noun={noun} selected={picked} onToggle={toggle} />
        </div>
      )}
      <div className="card s12">
        <CardHead title="Holdings">
          {picked.size > 0 && <RemovableChips className="filters" items={[...picked].map((k) => [k, grouped ? k : nameCase(ps.find((p) => p.key === k)?.name ?? k)])} onRemove={toggle} />}
          <div className="acts">
            <Segmented
              label="Sort by"
              options={
                balance
                  ? [
                      ["value", "Value"],
                      ["name", "Name"],
                    ]
                  : [
                      ["value", "Value"],
                      ["gain", "Gain"],
                      ["name", "Name"],
                    ]
              }
              value={sort.key}
              desc={sort.desc}
              onChange={(key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "name" }))}
            />
            <md-icon-button onClick={() => setQuery(query === null ? "" : null)} aria-label={`Search ${section.name}`} title="Search">
              <md-icon>{query === null ? "search" : "search_off"}</md-icon>
            </md-icon-button>
          </div>
        </CardHead>
        {query !== null && (
          <div className="ledsearch">
            <TextField className="compact" aria-label={`Search ${section.name}`} placeholder={`Search ${noun[1]} by name`} value={query} onChange={setQuery} autoFocus />
          </div>
        )}
        {rows.length === 0 && (
          <p className="help ledempty">
            No {noun[1]} match “{query}”.
          </p>
        )}
        <div className="hlist">
          {shown.map((p) => {
            const g = growth(p);
            const sub = [
              grouped ? groupOf(p) : "",
              p.quantity ? `${qty(p.quantity)} ${section.kind === "funds" ? "units" : section.kind === "stocks" ? "shares" : ""}`.trim() : "",
              `${plainPct(Math.abs(p.value) / total, 0)} of ${section.name.toLowerCase()}`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <ListRow
                key={p.key}
                badge={initials(p.name)}
                title={nameCase(p.name) || "Unnamed"}
                sub={`${sub}${p.costUnknown && ps.some((x) => !x.costUnknown) ? " · cost unknown" : ""}${p.stale ? " · no price" : ""}${p.from ? " · moved here" : ""}${p.bullion && section.kind !== "gold" ? " · looks like gold" : ""}`}
                value={short(p.value)}
                note={g !== null && !balance ? pct(g) : undefined}
                noteTone={tone(g)}
                onClick={() => setOpen(p)}
              />
            );
          })}
        </div>
        {rows.length > PAGE && (
          <md-text-button className="adder-b" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${rows.length}`}
          </md-text-button>
        )}
      </div>
      {open && (
        <HoldingDialog p={open} section={section} sections={summary.sectionList} goldName={goldName} total={total} minDays={settings.xirrMinDays} onMove={onMove} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
