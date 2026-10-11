import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { Badge } from "./Badge";

interface Props {
  id?: string;
  icon: string;
  title: string;
  summary?: string;
  badge?: string;
  to?: string;
  children?: ReactNode;
}

function Head({ icon, title, summary, badge, chevron }: { icon: string; title: string; summary?: string; badge?: string; chevron: string }) {
  return (
    <>
      <md-focus-ring />
      <span className="fold-i ms" aria-hidden="true">
        {icon}
      </span>
      <span className="tt">
        <h3>{title}</h3>
        {summary && <span className="sum">{summary}</span>}
      </span>
      {badge && <Badge tone="bad">{badge}</Badge>}
      <span className="chev ms" aria-hidden="true">
        {chevron}
      </span>
    </>
  );
}

// Drafts live in the parent, so closing keeps them; buttons stay out of the header so it is one target.
export default function Fold({ id = "", icon, title, summary, badge, to, children }: Props) {
  const { hash } = useLocation();
  const [open, setOpen] = useState(hash === `#${id}`);
  useEffect(() => {
    if (!id || hash !== `#${id}`) return;
    setOpen(true);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [hash, id]);

  if (to)
    return (
      <section className="card fold">
        <Link to={to} className="fold-t">
          <Head icon={icon} title={title} summary={summary} badge={badge} chevron="chevron_right" />
        </Link>
      </section>
    );
  return (
    <section className={`card fold${open ? " open" : ""}`} id={id}>
      <button type="button" className="fold-t" id={`${id}-t`} aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen(!open)}>
        <Head icon={icon} title={title} summary={summary} badge={badge} chevron="expand_more" />
      </button>
      {open && (
        <div className="fold-b" id={`${id}-b`} role="region" aria-labelledby={`${id}-t`}>
          {children}
        </div>
      )}
    </section>
  );
}
