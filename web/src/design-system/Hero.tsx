import type { ReactNode } from "react";

import { IconBadge } from "./Badge";
import { Stats, type StatItem } from "./Stat";

export interface HeroPill {
  icon: string;
  text: ReactNode;
  bad?: boolean;
}

interface Props {
  icon: string;
  title: string;
  meta: ReactNode;
  value?: ReactNode;
  pill?: HeroPill;
  pair?: StatItem[];
  sub?: ReactNode;
  stats?: StatItem[];
  foot: ReactNode;
  footIcon?: string;
}

export function Hero({ icon, title, meta, value, pill, pair, sub, stats = [], foot, footIcon = "info" }: Props) {
  return (
    <div className="card hero s8 sec-hero">
      <div className="sec-top">
        <IconBadge icon={icon} size={44} round tone="primary" />
        <b>{title}</b>
        <span className="sec-m">{meta}</span>
      </div>
      {pair ? (
        <div className="pair">
          {pair.map((p, i) => (
            <div key={i}>
              <span className="pair-l">{p.label}</span>
              <span className="big num">{p.value}</span>
              <span className="pair-h">{p.sub}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="worth">
          <span className="big num">{value}</span>
          {pill && (
            <span className={`pill${pill.bad ? " neg" : ""}`}>
              <span className="ms" aria-hidden="true">
                {pill.icon}
              </span>
              {pill.text}
            </span>
          )}
        </div>
      )}
      {sub && <p className="sec-sub">{sub}</p>}
      {stats.length > 0 && <Stats look="box" items={stats} />}
      <p className="sec-foot">
        <span className="ms" aria-hidden="true">
          {footIcon}
        </span>
        {foot}
      </p>
    </div>
  );
}
