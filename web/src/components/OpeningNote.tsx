import type { Summary } from "../lib/api";
import Amount from "../design-system/Amount";

export default function OpeningNote({ summary }: { summary: Summary }) {
  const n = summary.sections.reduce((a, r) => a + r.positions.filter((p) => p.costUnknown).length, 0);
  if (n === 0) return null;
  return (
    <div className="opening" role="note">
      <span className="ms">pending</span>
      <p>
        <b>
          {n} holding{n === 1 ? " has" : "s have"} no purchase price.
        </b>{" "}
        {n === 1 ? "It" : "They"} came from a statement, which lists what you hold but not what you paid, so <Amount n={summary.unknown} /> is counted in your net worth at the statement day's price
        and left out of every gain. Import your tradebook or order history and its trades replace these opening positions, scrip by scrip.
      </p>
    </div>
  );
}
