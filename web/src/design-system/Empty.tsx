import type { ReactNode } from "react";

export function Empty({ icon, title, line, inline, children }: { icon: string; title: ReactNode; line?: ReactNode; inline?: boolean; children?: ReactNode }) {
  return (
    <div className={inline ? "empty inline" : "empty"}>
      <span className="ms" aria-hidden="true">
        {icon}
      </span>
      <b>{title}</b>
      {line && <p>{line}</p>}
      {children}
    </div>
  );
}
