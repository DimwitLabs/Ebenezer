export function ToggleChips<K extends string>({
  label,
  options,
  on,
  onPick,
  radio,
  grid,
}: {
  label: string;
  options: [K, string][];
  on: (k: K) => boolean;
  onPick: (k: K) => void;
  radio?: boolean;
  grid?: boolean;
}) {
  return (
    <md-chip-set className={`chips ${grid ? "grid" : "eq"}`} role={radio ? "radiogroup" : undefined} aria-label={label}>
      {options.map(([k, l]) => (
        <md-filter-chip
          key={k}
          label={l}
          selected={on(k)}
          role={radio ? "radio" : undefined}
          aria-checked={radio ? on(k) : undefined}
          onClick={(e) => {
            e.preventDefault();
            onPick(k);
          }}
        />
      ))}
    </md-chip-set>
  );
}

export function RemovableChips({
  items,
  onRemove,
  disabled,
  stack,
  className,
}: {
  items: [string, string][];
  onRemove: (key: string) => void;
  disabled?: boolean;
  stack?: boolean;
  className?: string;
}) {
  return (
    <md-chip-set className={className ?? (stack ? "chips stack" : "chips")}>
      {items.map(([k, l]) => (
        <md-input-chip
          key={k}
          label={l}
          disabled={disabled}
          aria-label={`Remove ${l}`}
          onremove={(e) => {
            e.preventDefault();
            onRemove(k);
          }}
        />
      ))}
    </md-chip-set>
  );
}
