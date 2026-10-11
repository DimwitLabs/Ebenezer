export function DayPicker<K extends string>({ label, days, on, onPick }: { label: string; days: [K, string, string][]; on: (k: K) => boolean; onPick: (k: K) => void }) {
  return (
    <div className="days" role="group" aria-label={label}>
      {days.map(([k, letter, name]) => (
        <button key={k} type="button" aria-pressed={on(k)} aria-label={name} title={name} onClick={() => onPick(k)}>
          <md-ripple />
          <md-focus-ring />
          {letter}
        </button>
      ))}
    </div>
  );
}
