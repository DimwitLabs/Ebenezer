import type { ReactNode } from "react";

export function ListRow({
  badge,
  icon,
  tone,
  title,
  sub,
  value,
  valueTone,
  note,
  noteTone,
  onClick,
  children,
}: {
  badge?: string;
  icon?: string;
  tone?: string;
  title: string;
  sub: ReactNode;
  value?: string;
  valueTone?: string;
  note?: string;
  noteTone?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className={`av${icon ? " ms" : ""}${tone ? ` ${tone}` : ""}`}>{icon ?? badge}</span>
      <span className="ht">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
      {value !== undefined && (
        <span className="hv">
          <b className={valueTone}>{value}</b>
          <span className={noteTone}>{note ?? "\u00a0"}</span>
        </span>
      )}
      {children}
    </>
  );
  if (!onClick) return <div className="hrow">{body}</div>;
  return (
    <button type="button" className="hrow" onClick={onClick}>
      <md-ripple />
      <md-focus-ring />
      {body}
    </button>
  );
}
