import type { ReactNode } from "react";

export interface StatItem {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
}

export function Stat({ label, value, sub, tone, className }: StatItem & { className?: string }) {
  return (
    <div className={`stat${className ? ` ${className}` : ""}`}>
      <span className="stat-l">{label}</span>
      <b className={`stat-v num${tone ? ` ${tone}` : ""}`}>{value}</b>
      {sub !== undefined && <span className="stat-s">{sub}</span>}
    </div>
  );
}

export function Stats({ items, look, className }: { items: StatItem[]; look: "tile" | "mini" | "box" | "plain"; className?: string }) {
  return (
    <div className={`stats ${look}${className ? ` ${className}` : ""}`}>
      {items.map((s, i) => (
        <Stat key={i} {...s} />
      ))}
    </div>
  );
}
