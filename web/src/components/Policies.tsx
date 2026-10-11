import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Row, Section, Summary } from "../lib/api";
import { date, daysTo, plural, short } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { useTo } from "../lib/session";
import Amount from "../design-system/Amount";
import { CardHead } from "../design-system/CardHead";
import { RemovableChips } from "../design-system/Chips";
import { Empty } from "../design-system/Empty";
import { Hero } from "../design-system/Hero";
import { ListRow } from "../design-system/ListRow";
import { Stats } from "../design-system/Stat";
import { Notes } from "./Note";
import { nextDue, when } from "./Protected";
import Treemap, { type Block } from "./Treemap";

const PER: Record<string, string> = { monthly: "a month", quarterly: "a quarter", "half-yearly": "a half-year", yearly: "a year", once: "once" };
const ICON: Record<string, string> = { "Term life": "shield_person", Health: "health_and_safety", "Life with savings": "savings", Vehicle: "directions_car", Home: "home", Other: "shield" };
const SOON = 45;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => Number(text(v).replace(/[₹,\s]/g, "")) || 0;

interface Policy {
  id: string;
  name: string;
  type: string;
  insurer: string;
  cover: number;
  premium: number;
  pays: string;
  renews: string;
  ends: string;
  covers: string;
  nominee: string;
}

const policy = (r: Row): Policy => {
  const d = r.data;
  const pays = text(d.pays).toLowerCase();
  return {
    id: r.id,
    name: text(d.policy) || "Unnamed policy",
    type: text(d.type) || "Other",
    insurer: text(d.insurer),
    cover: num(d.cover),
    premium: num(d.premium),
    pays,
    renews: text(d.renews_on) && nextDue(text(d.renews_on), pays),
    ends: text(d.ends_on),
    covers: text(d.covers),
    nominee: text(d.nominee),
  };
};

const soon = (p: Policy) => !!p.renews && daysTo(p.renews) >= 0 && daysTo(p.renews) <= SOON;

function PolicyCard({ p, onEdit }: { p: Policy; onEdit: () => void }) {
  const facts = (
    [
      ["Premium", p.premium ? `${short(p.premium)} ${PER[p.pays] ?? ""}`.trim() : ""],
      ["Renews", p.renews ? `${date(p.renews)}${soon(p) ? `, ${when(p.renews)}` : ""}` : ""],
      ["Ends", p.ends ? date(p.ends) : ""],
      ["Covers", p.covers],
      ["Nominee", p.nominee],
    ] as [string, string][]
  ).filter(([, v]) => v);
  return (
    <div className="pcard">
      <ListRow icon={ICON[p.type] ?? "shield"} title={p.name} sub={[p.type, p.insurer].filter(Boolean).join(" · ")}>
        <md-icon-button onClick={onEdit} aria-label={`Change ${p.name} in Data`}>
          <md-icon>edit</md-icon>
        </md-icon-button>
      </ListRow>
      <b className="pcard-v num">
        <Amount n={p.cover} />
      </b>
      <span className="pcard-l">Cover</span>
      {facts.length > 0 && <Stats look="plain" className="pcard-f" items={facts.map(([l, v]) => ({ label: l, value: v, tone: l === "Renews" && soon(p) ? "down" : undefined }))} />}
    </div>
  );
}

export default function Policies({ section, summary }: { section: Section; summary: Summary }) {
  const protection = summary.protection;
  const owed = summary.liabilities;
  const { data: rows } = useLoad<Row[]>(`/sections/${section.id}/rows`);
  const navigate = useNavigate();
  const to = useTo();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const list = (rows ?? []).map(policy).filter((p) => !p.ends || daysTo(p.ends) >= 0);
  if (rows && list.length === 0) {
    return (
      <div className="card">
        <Empty icon={section.icon} title="No policies yet">
          <md-filled-tonal-button onClick={() => navigate(to("/data"), { state: { section: section.id, action: "add" } })}>Add a policy</md-filled-tonal-button>
        </Empty>
      </div>
    );
  }

  const types = new Map<string, Block>();
  for (const p of list) {
    const b = types.get(p.type) ?? { key: p.type, label: p.type, value: 0, count: 0 };
    b.value += p.cover;
    b.count = (b.count ?? 0) + 1;
    types.set(p.type, b);
  }
  const toggle = (k: string) => {
    const next = new Set(picked);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setPicked(next);
  };
  const shown = list.filter((p) => picked.size === 0 || picked.has(p.type)).sort((a, b) => b.cover - a.cover);
  const next = protection?.next;
  const life = protection?.life ?? 0;
  const health = protection?.health ?? 0;
  const lifeN = protection?.lifeN ?? 0;
  const healthN = protection?.healthN ?? 0;
  const n = protection?.policies ?? list.length;

  return (
    <div className="grid">
      <Hero
        icon={section.icon}
        title={section.name}
        meta={`${n} ${n === 1 ? "policy" : "policies"} in force`}
        pair={[
          {
            label: "Life cover",
            value: life ? <Amount n={life} /> : "—",
            sub: lifeN ? `${plural(lifeN, "plan")}${owed > 0 && life > 0 ? ` · ${(life / owed).toFixed(1)}× what you owe` : ""}` : "None listed",
          },
          { label: "Health cover", value: health ? <Amount n={health} /> : "—", sub: healthN ? plural(healthN, "policy") : "None listed" },
        ]}
        stats={[
          { label: "Premiums", value: protection?.premiums ? <Amount n={protection.premiums} /> : "None" },
          { label: "Next renewal", value: next ? date(next.day) : "None due" },
          {
            label: owed > 0 ? (life >= owed ? "Left after loans" : "Short of loans") : "Loans",
            value: owed > 0 ? <Amount n={Math.abs(life - owed)} /> : "None",
            tone: owed > 0 && life < owed ? "down" : undefined,
          },
        ]}
        foot="Cover is what a policy pays out. It protects your net worth, so it is never counted in it."
      />
      <Notes id={section.id} summary={summary} />
      {types.size > 1 && (
        <div className="card s12">
          <CardHead title="What you are covered for" />
          <Treemap blocks={[...types.values()]} noun={["policy", "policies"]} selected={picked} onToggle={toggle} />
        </div>
      )}
      <div className="card s12">
        <CardHead title="Policies">{picked.size > 0 && <RemovableChips className="filters" items={[...picked].map((k) => [k, k])} onRemove={toggle} />}</CardHead>
        <div className="pcards">
          {shown.map((p) => (
            <PolicyCard key={p.id} p={p} onEdit={() => navigate(to("/data"), { state: { section: section.id, row: p.id } })} />
          ))}
        </div>
      </div>
    </div>
  );
}
