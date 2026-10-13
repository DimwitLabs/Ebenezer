import { useState } from "react";

import { SwitchRow } from "../design-system/Fields";
import { PageHead } from "../design-system/PageHead";
import Spinner from "../design-system/Spinner";
import type { ExportFile, ExportPortfolio } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { useSession } from "../lib/session";
import { todayISO } from "../lib/spends";

const OWN_FILES = ["expenses.csv", "credit-cards.csv"];
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const rowsIn = (fs: ExportFile[]) => fs.reduce((t, f) => t + f.rows, 0);

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `About ${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `About ${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function contents(p: ExportPortfolio, people: string[], me?: string): string {
  const others = people.filter((n) => n !== me);
  const sections = p.files.filter((f) => !OWN_FILES.includes(f.name));
  const spends = p.files.find((f) => f.name === "expenses.csv")?.rows ?? 0;
  const cards = p.files.find((f) => f.name === "credit-cards.csv")?.rows ?? 0;
  return [
    others.length ? `Shared with ${others.join(", ")}` : "Only you",
    sections.length ? `${count(sections.length, "section")}, ${count(rowsIn(sections), "row")}` : "",
    spends ? count(spends, "spend") : "",
    cards ? count(cards, "card") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ExportScreen() {
  const { user, portfolios } = useSession();
  const { data, error } = useLoad<ExportPortfolio[]>("/export");
  const [off, setOff] = useState<string[]>([]);

  const chosen = (data ?? []).filter((p) => !off.includes(p.id));
  const zip = chosen.length === 1 ? `ebenezer-${chosen[0].slug}-${todayISO()}.zip` : `ebenezer-${todayISO()}.zip`;
  const bytes = chosen.reduce((t, p) => t + p.files.reduce((s, f) => s + f.size, 0), 0);
  const href = `/api/export/zip?${new URLSearchParams(chosen.map((p) => ["p", p.id]))}`;

  return (
    <>
      <PageHead title="Export your data" status="Every row you put in, as CSV files in one zip. Each file opens in a spreadsheet and comes back in through Import as it is." />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <Spinner className="loading" />}
      {data && (
        <div className="xgrid">
          <div className="card xc">
            <h3>Which portfolios</h3>
            <div className="opts">
              {data.map((p) => (
                <SwitchRow
                  key={p.id}
                  checked={!off.includes(p.id)}
                  onChange={(on) => setOff(on ? off.filter((id) => id !== p.id) : [...off, p.id])}
                  title={p.name}
                  detail={contents(p, portfolios.find((q) => q.id === p.id)?.people ?? [], user?.name)}
                />
              ))}
            </div>
            <h3>What is in the zip</h3>
            {chosen.length === 0 ? (
              <p className="help">Choose at least one portfolio.</p>
            ) : (
              <div className="files">
                {chosen.map((p) => (
                  <div key={p.id}>
                    <div className="dir">
                      <span className="ms" aria-hidden="true">
                        folder
                      </span>
                      <b>{p.slug}/</b>
                    </div>
                    {p.files.map((f) => (
                      <div key={f.name} className="in">
                        <span className="ms" aria-hidden="true">
                          description
                        </span>
                        {f.name}
                        <span>{count(f.rows, "row")}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="xf">
              <span className="help">{chosen.length ? size(bytes) : ""}</span>
              {chosen.length > 0 ? (
                <md-filled-button href={href} download={zip}>
                  <md-icon slot="icon">download</md-icon>
                  Download {zip}
                </md-filled-button>
              ) : (
                <md-filled-button disabled>
                  <md-icon slot="icon">download</md-icon>
                  Download
                </md-filled-button>
              )}
            </div>
          </div>
          <div className="card xt">
            <div className="xt-l">
              <div>
                <span className="ms" aria-hidden="true">
                  block
                </span>
                <b>Left out</b>
                <p>Prices, news and my notes. I fetch or write them again after you bring the rest back in.</p>
              </div>
              <div>
                <span className="ms" aria-hidden="true">
                  lock
                </span>
                <b>Never in an export</b>
                <p>Your OpenRouter key, mail server password and anyone's sign-in. Settings like these stay on this Ebenezer.</p>
              </div>
              <div>
                <span className="ms" aria-hidden="true">
                  move_to_inbox
                </span>
                <b>Bringing it back</b>
                <p>Import each file from Data, the expenses file from Expenses and the cards file from Credit Cards. I know my own columns, so there's nothing to match.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
