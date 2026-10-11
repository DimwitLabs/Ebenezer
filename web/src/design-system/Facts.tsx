import { useId, useRef } from "react";

export interface Fact {
  label: string;
  value: string;
}

export default function Facts({ title, when, facts }: { title: string; when: string; facts: Fact[] }) {
  const id = useId();
  const at = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const place = (e: React.ToggleEvent<HTMLDivElement>) => {
    const b = box.current;
    const a = at.current?.getBoundingClientRect();
    if (e.newState !== "open" || !b || !a) return;
    const sheet = innerWidth <= 600;
    b.classList.toggle("sheet", sheet);
    if (sheet) return;
    const { width, height } = b.getBoundingClientRect();
    const below = a.bottom + 8;
    b.style.top = `${below + height <= innerHeight - 8 ? below : Math.max(8, a.top - height - 8)}px`;
    b.style.left = `${Math.min(Math.max(8, a.left - 16), innerWidth - width - 8)}px`;
  };

  return (
    <>
      <button ref={at} type="button" className="ib-sm" popoverTarget={id} aria-label={`Details of ${title}`} title="Details">
        <span className="ms">info</span>
      </button>
      <div ref={box} id={id} popover="auto" className="facts-pop" role="dialog" aria-label={title} onToggle={place}>
        <div className="facts-h">
          <b>{title}</b>
          <span>{when}</span>
          <button type="button" className="ib-sm" popoverTarget={id} popoverTargetAction="hide" aria-label="Close">
            <span className="ms">close</span>
          </button>
        </div>
        <dl className="facts-l">
          {facts.map((f, i) => (
            <div key={i} className={f.value.length > 16 ? "wide" : undefined}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
