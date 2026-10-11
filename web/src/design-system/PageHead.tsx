import type { ReactNode } from "react";

export function PageHead({ title, status, className, children }: { title: ReactNode; status?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={`head${className ? ` ${className}` : ""}`}>
      <div>
        <h1>{title}</h1>
        {status && <p className="status">{status}</p>}
      </div>
      {children && <div className="acts">{children}</div>}
    </div>
  );
}
