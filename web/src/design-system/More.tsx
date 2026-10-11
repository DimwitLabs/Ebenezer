import { useState, type ReactNode } from "react";

export function More({ label, children, open: start = false }: { label: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start);
  return (
    <div className={`more${open ? " open" : ""}`}>
      <md-text-button onClick={() => setOpen(!open)} aria-expanded={open}>
        <md-icon slot="icon">{open ? "expand_less" : "expand_more"}</md-icon>
        {label}
      </md-text-button>
      {open && <div className="more-b">{children}</div>}
    </div>
  );
}
