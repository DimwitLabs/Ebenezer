import type { ReactNode } from "react";

interface Props {
  note?: ReactNode;
  remove?: { label: string; onClick: () => void };
  onBack?: () => void;
  onCancel?: () => void;
  cancel?: string;
  label?: ReactNode;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  children?: ReactNode;
}

export function DialogActions({ note, remove, onBack, onCancel, cancel = "Cancel", label, icon, onClick, disabled, busy, danger, children }: Props) {
  return (
    <>
      {note !== undefined && <span className="l">{note}</span>}
      {remove && (
        <md-text-button className="danger l" onClick={remove.onClick}>
          {remove.label}
        </md-text-button>
      )}
      {onBack && (
        <md-text-button onClick={onBack} disabled={busy}>
          Back
        </md-text-button>
      )}
      {onCancel && <md-text-button onClick={onCancel}>{cancel}</md-text-button>}
      {children}
      {label && (
        <md-filled-button className={danger ? "danger" : undefined} onClick={onClick} disabled={busy || disabled}>
          {icon && <md-icon slot="icon">{icon}</md-icon>}
          {label}
        </md-filled-button>
      )}
    </>
  );
}
