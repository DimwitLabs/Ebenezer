import type { ReactNode } from "react";

export function Segmented<K extends string>({
  options,
  value,
  desc,
  counts,
  onChange,
  label,
}: {
  options: [K, ReactNode, string?][];
  value: K;
  desc?: boolean;
  counts?: Partial<Record<K, number>>;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([k, l, name]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} aria-label={name} title={name} onClick={() => onChange(k)}>
          <md-focus-ring />
          {l}
          {counts?.[k] !== undefined && <i className="seg-n">{counts[k]}</i>}
          {value === k && desc !== undefined && (
            <span className="ms" aria-hidden="true">
              {desc ? "arrow_downward" : "arrow_upward"}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
