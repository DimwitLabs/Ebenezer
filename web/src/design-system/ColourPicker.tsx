import type { CSSProperties } from "react";

export interface Colour {
  value: string;
  name: string;
  swatch?: string;
}

const COLOURS: Colour[] = [
  { value: "#006c4b", name: "Ledger green" },
  { value: "#0061a4", name: "Blue" },
  { value: "#006a6a", name: "Teal" },
  { value: "#6750a4", name: "Purple" },
  { value: "#9c4146", name: "Red brown" },
  { value: "#7d5700", name: "Amber" },
  { value: "#984061", name: "Pink" },
  { value: "#535f70", name: "Slate" },
];

// A fixed set of colours leaves out the custom picker.
export function ColourPicker({ value, onChange, colours }: { value: string; onChange: (value: string) => void; colours?: Colour[] }) {
  const list = colours ?? COLOURS;
  const preset = list.some((c) => c.value === value);
  return (
    <div className="seeds" role="radiogroup" aria-label="Colour">
      {list.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.name}
          title={c.name}
          style={{ "--sw": c.swatch ?? c.value } as CSSProperties}
          onClick={() => onChange(c.value)}
        >
          <md-ripple />
          <md-focus-ring />
          {value === c.value && <span className="ms">check</span>}
        </button>
      ))}
      {!colours && (
        <label className={`own${preset ? "" : " on"}`} title="Your own colour" style={preset ? undefined : ({ "--sw": value } as CSSProperties)}>
          <md-ripple />
          <span className="ms">{preset ? "colorize" : "check"}</span>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Your own colour" />
        </label>
      )}
    </div>
  );
}
