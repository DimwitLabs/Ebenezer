import { useState } from "react";

import { useConfirm } from "./Confirm";
import { TextField } from "./Fields";

export interface SecretState {
  set: boolean;
}

interface Props {
  label: string;
  state: SecretState;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  disabled?: boolean;
  placeholder?: string;
}

// Secrets are write-only: the server never sends them back, only whether one is set.
export default function SecretField({ label, state, value, onChange, onRemove, disabled, placeholder }: Props) {
  const [replacing, setReplacing] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  if (state.set && !replacing) {
    return (
      <div className="fld">
        <span className="flabel">{label}</span>
        <div className="secret">
          <span className="ms" aria-hidden="true">
            key
          </span>
          <span className="v">Saved, hidden</span>
          {!disabled && (
            <>
              <md-icon-button onClick={() => setReplacing(true)} aria-label={`Replace the ${label.toLowerCase()}`} title="Replace">
                <md-icon>edit</md-icon>
              </md-icon-button>
              <md-icon-button
                onClick={async () =>
                  (await confirm({ title: `Remove the saved ${label.toLowerCase()}?`, message: "Anything that uses it stops working until a new one is saved.", action: "Remove" })) && onRemove()
                }
                aria-label={`Remove the ${label.toLowerCase()}`}
                title="Remove"
              >
                <md-icon>delete</md-icon>
              </md-icon-button>
            </>
          )}
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <TextField
      label={label}
      type="password"
      value={value}
      disabled={disabled}
      onChange={onChange}
      placeholder={state.set ? "Leave empty to keep the saved one" : placeholder}
      autocomplete="off"
      info={state.set ? undefined : "I keep it sealed once saved and never show it again."}
    />
  );
}
