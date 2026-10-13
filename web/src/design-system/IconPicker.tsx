export function IconPicker({ icons, value, onChange }: { icons: string[]; value: string; onChange: (icon: string) => void }) {
  return (
    <div className="icons" role="radiogroup" aria-label="Icon">
      {icons.map((ic) => (
        <button key={ic} type="button" role="radio" aria-checked={value === ic} aria-pressed={value === ic} onClick={() => onChange(ic)} aria-label={ic.replace(/_/g, " ")}>
          <md-ripple />
          <md-focus-ring />
          <span className="ms" aria-hidden="true">
            {ic}
          </span>
        </button>
      ))}
    </div>
  );
}
