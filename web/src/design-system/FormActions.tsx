export function FormActions({ label, onCancel, busy, disabled }: { label: string; onCancel: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <div className="acts">
      <md-filled-button type="submit" disabled={busy || disabled}>
        {label}
      </md-filled-button>
      <md-text-button type="button" onClick={onCancel}>
        Cancel
      </md-text-button>
    </div>
  );
}
