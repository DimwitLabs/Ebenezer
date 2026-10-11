import { useState } from "react";

import { post } from "../lib/api";
import { Badge } from "../design-system/Badge";
import { useSnack } from "../design-system/Snack";

export default function Verdict({ verdict, judge, onJudged }: { verdict: string; judge?: { pid: string; id: number }; onJudged?: () => void }) {
  const say = useSnack();
  const [busy, setBusy] = useState(false);
  if (verdict === "signal") return <Badge className="verdict signal">Signal</Badge>;
  if (verdict === "humbug") return <Badge className="verdict humbug">Humbug</Badge>;
  if (verdict) return <Badge className="verdict">{verdict[0].toUpperCase() + verdict.slice(1)}</Badge>;
  if (!judge) return <Badge className="verdict">Unjudged</Badge>;
  const run = async () => {
    setBusy(true);
    try {
      await post(`/portfolios/${judge.pid}/news/${judge.id}/judge`);
      onJudged?.();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Badge className="verdict judge" onClick={() => void run()} disabled={busy} title="Ask Ebenezer to judge this story">
      {busy ? (
        "Judging…"
      ) : (
        <>
          <span className="off">Unjudged</span>
          <span className="on">
            <span className="ms">gavel</span>Judge now
          </span>
        </>
      )}
    </Badge>
  );
}
