import { Segmented } from "../design-system/Segmented";

export type Ghost = "past" | "present" | "future";

// Drawn on the 24 grid at Material Symbols Rounded weight; at icon size only the eyes can carry meaning.
const EYES: Record<Ghost, number> = { past: -1.6, present: 0, future: 1.6 };

function Shape({ ghost }: { ghost: Ghost }) {
  const dx = EYES[ghost];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M5 19.5V11a7 7 0 0 1 14 0v8.5a2.33 2.33 0 0 1-4.67 0 2.33 2.33 0 0 1-4.66 0A2.33 2.33 0 0 1 5 19.5Z" />
      <ellipse cx={9.6 + dx} cy="11" rx="1.2" ry="1.7" fill="currentColor" stroke="none" />
      <ellipse cx={14.4 + dx} cy="11" rx="1.2" ry="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

const LABEL: Record<Ghost, string> = { past: "Past", present: "Present", future: "Future" };

export default function Ghosts({ value, onChange }: { value: Ghost; onChange: (g: Ghost) => void }) {
  return (
    <Segmented
      label="Which ghost"
      value={value}
      onChange={onChange}
      options={(["past", "present", "future"] as Ghost[]).map((g) => [
        g,
        <>
          <Shape ghost={g} />
          {LABEL[g]}
        </>,
      ])}
    />
  );
}
