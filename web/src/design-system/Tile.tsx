import type { ReactNode } from "react";

export function Tile({
  icon,
  title,
  hint,
  pressed,
  disabled,
  add,
  onClick,
  children,
}: {
  icon: string;
  title: string;
  hint: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  add?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className={`ptile${add ? " add" : ""}`} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <md-ripple disabled={disabled} />
      <md-focus-ring />
      {children}
      <span className="ms big" aria-hidden="true">
        {icon}
      </span>
      <b>{title}</b>
      <span className="h">{hint}</span>
    </button>
  );
}
