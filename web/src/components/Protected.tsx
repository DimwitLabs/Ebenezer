import type { Protection } from "../lib/api";
import { date, daysTo, money, plural } from "../lib/format";
import Amount from "../design-system/Amount";
import { IconBadge } from "../design-system/Badge";
import { Stats } from "../design-system/Stat";

const STEP: Record<string, number> = { monthly: 1, quarterly: 3, "half-yearly": 6, yearly: 12 };

// Rolls a past renewal date forward by the premium's period, as the server does.
export function nextDue(day: string, pays: string): string {
  const d = new Date(`${day}T00:00:00`);
  const step = STEP[pays.toLowerCase()];
  if (Number.isNaN(d.getTime()) || !step) return day;
  while (daysTo(iso(d)) < 0) d.setMonth(d.getMonth() + step);
  return iso(d);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const when = (day: string) => {
  const n = daysTo(day);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
};

const figure = (n: number) => (n ? <Amount n={n} /> : "—");

export default function Protected({ p, owed, onOpen }: { p: Protection; owed: number; onOpen: () => void }) {
  const times = owed > 0 && p.life > 0 ? ` · ${(p.life / owed).toFixed(1)}× what you owe` : "";
  return (
    <section className="card prot s12">
      <div className="prot-h">
        <IconBadge icon="shield" size={32} tone="tertiary" />
        <h3>Protected</h3>
        <md-text-button trailingIcon onClick={onOpen}>
          Insurance<md-icon slot="icon">chevron_right</md-icon>
        </md-text-button>
      </div>
      <Stats
        look="tile"
        className="prot-b"
        items={[
          { label: "Life cover", value: figure(p.life), sub: p.lifeN ? `${plural(p.lifeN, "plan")}${times}` : "none listed" },
          { label: "Health cover", value: figure(p.health), sub: p.healthN ? plural(p.healthN, "policy") : "none listed" },
          { label: "Premiums", value: figure(p.premiums), sub: p.premiums ? "a year" : "none listed" },
          {
            label: "Next renewal",
            value: p.next ? date(p.next.day).replace(/ \d{4}$/, "") : "—",
            sub: p.next ? `${p.next.policy}, ${when(p.next.day)}${p.next.premium > 0 ? ` · ${money(p.next.premium)}` : ""}` : "no dates listed",
          },
        ]}
      />
    </section>
  );
}
