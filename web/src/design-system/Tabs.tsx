import { useEffect, useRef, useState, type ReactNode } from "react";

import type { MdTabs } from "@material/web/tabs/tabs.js";

export function Tabs({ active, onChange, label, children }: { active: number; onChange: (i: number) => void; label: string; children: ReactNode }) {
  const tabs = useRef<MdTabs>(null);
  const strip = useRef<HTMLElement | null>(null);
  const [more, setMore] = useState({ before: false, after: false });
  const measure = () => {
    const s = strip.current;
    if (!s) return;
    const before = s.scrollLeft > 1;
    const after = s.scrollLeft + s.clientWidth < s.scrollWidth - 1;
    setMore((m) => (m.before === before && m.after === after ? m : { before, after }));
  };

  useEffect(() => {
    const el = tabs.current;
    if (!el) return;
    let off = () => {};
    void el.updateComplete.then(() => {
      // md-tabs scrolls an inner strip in its shadow root, not the host.
      const s = el.shadowRoot?.querySelector<HTMLElement>(".tabs") ?? el;
      strip.current = s;
      const seen = new ResizeObserver(measure);
      seen.observe(s);
      s.addEventListener("scroll", measure, { passive: true });
      measure();
      off = () => {
        seen.disconnect();
        s.removeEventListener("scroll", measure);
      };
    });
    return () => off();
  }, []);

  useEffect(measure, [children]);

  const nudge = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div className={`tabs-w${more.before ? " before" : ""}${more.after ? " after" : ""}`}>
      <md-tabs ref={tabs} className="tabs" aria-label={label} activeTabIndex={active} onChange={(e) => onChange(e.currentTarget.activeTabIndex)}>
        {children}
      </md-tabs>
      <button type="button" className="tabs-more prev" tabIndex={-1} aria-hidden="true" onClick={() => nudge(-1)}>
        <span className="ms" aria-hidden="true">
          chevron_left
        </span>
      </button>
      <button type="button" className="tabs-more next" tabIndex={-1} aria-hidden="true" onClick={() => nudge(1)}>
        <span className="ms" aria-hidden="true">
          chevron_right
        </span>
      </button>
    </div>
  );
}
