import { useNavigate, useSearchParams } from "react-router-dom";

import Amount from "../design-system/Amount";
import { Empty } from "../design-system/Empty";
import { PageHead } from "../design-system/PageHead";
import { Tabs } from "../design-system/Tabs";
import OpeningNote from "../components/OpeningNote";
import Overview from "../components/Overview";
import Policies from "../components/Policies";
import SectionView from "../components/SectionView";
import { useSnack } from "../design-system/Snack";
import { moveHolding, tabOf, type Position, type Summary } from "../lib/api";
import { useInterval, useLoad } from "../lib/hooks";
import { usePortfolio, useSession, useTo } from "../lib/session";
import Spinner from "../design-system/Spinner";

// Only custom sections can repeat a kind, so they go by id.

export default function PortfolioScreen() {
  const p = usePortfolio();
  const { catalogue, replace } = useSession();
  const { data: summary, error, reload } = useLoad<Summary>(`/portfolios/${p.id}/summary`);
  useInterval(reload, summary?.notesPending ? 4000 : null);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab");
  const setTab = (t: string | null) => setParams(t ? { tab: t } : {}, { replace: true });
  const navigate = useNavigate();
  const to = useTo();
  const say = useSnack();
  const goldName = catalogue?.kinds.find((k) => k.key === "gold")?.name ?? "Bullion";

  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!summary) return <Spinner className="loading" />;
  if (summary.sectionList.length === 0) {
    return (
      <Empty icon="account_balance_wallet" title="No sections yet">
        <md-filled-button onClick={() => navigate(to("/data"))}>Add one in Data</md-filled-button>
      </Empty>
    );
  }

  const openSection = (id: string) => {
    const s = summary.sectionList.find((x) => x.id === id);
    setTab(s ? tabOf(s) : null);
    window.scrollTo({ top: 0 });
  };

  const move = async (h: Position, to: string, done: string) => {
    if (!h.isin) return;
    try {
      replace(await moveHolding(p.id, h.isin, to));
      reload();
      say(done);
    } catch (e) {
      say((e as Error).message, true);
    }
  };

  const found = summary.sectionList.findIndex((s) => tabOf(s) === tab);
  const index = found + 1;
  const section = found >= 0 ? summary.sectionList[found] : null;

  return (
    <>
      <PageHead
        title="Portfolio"
        status={
          <>
            <Amount n={summary.netWorth} /> across every section
          </>
        }
      />
      <OpeningNote summary={summary} />
      <Tabs
        label="Sections"
        active={index}
        onChange={(i) => {
          const s = summary.sectionList[i - 1];
          setTab(i === 0 || !s ? null : tabOf(s));
        }}
      >
        <md-primary-tab active={index === 0} inlineIcon>
          <md-icon slot="icon">space_dashboard</md-icon>
          Overview
        </md-primary-tab>
        {summary.sectionList.map((s, i) => (
          <md-primary-tab key={s.id} active={i + 1 === index} inlineIcon>
            <md-icon slot="icon">{s.icon}</md-icon>
            {s.name}
          </md-primary-tab>
        ))}
      </Tabs>
      {section ? (
        section.valuation === "cover" ? (
          <Policies section={section} summary={summary} />
        ) : (
          <SectionView key={section.id} summary={summary} section={section} goldName={goldName} onMove={move} />
        )
      ) : (
        <Overview summary={summary} minDays={p.settings.xirrMinDays} onOpen={openSection} />
      )}
    </>
  );
}
