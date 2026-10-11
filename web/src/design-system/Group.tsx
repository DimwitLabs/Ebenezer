import type { ReactNode } from "react";

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group" role="group" aria-label={label}>
      <span className="flabel">{label}</span>
      {children}
    </div>
  );
}
