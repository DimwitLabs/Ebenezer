import type { ReactNode } from "react";

export function CardHead({ title, help, children }: { title: ReactNode; help?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-h">
      {help ? (
        <div>
          <h3>{title}</h3>
          <p className="help">{help}</p>
        </div>
      ) : (
        <h3>{title}</h3>
      )}
      {children}
    </div>
  );
}
