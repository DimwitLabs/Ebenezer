import { useState, type FormEvent } from "react";

import type { User } from "../lib/api";
import { SwitchRow, TextField } from "../design-system/Fields";
import { FormActions } from "../design-system/FormActions";

export interface InviteBody {
  email: string;
  name: string;
  password: string;
  send: boolean;
}

interface Props {
  users: User[];
  mailReady: boolean;
  // Names the portfolio being shared; an existing account then needs no password.
  share?: string;
  label: string;
  onSubmit: (body: InviteBody) => Promise<void>;
  onCancel: () => void;
}

export default function InviteForm({ users, mailReady, share, label, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<InviteBody>({ email: "", name: "", password: "", send: mailReady });
  const [busy, setBusy] = useState(false);
  const known = users.find((u) => u.email === form.email.trim().toLowerCase());
  const existing = !!share && !!known;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="fields3">
        <TextField label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoFocus required />
        {!existing && <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />}
        {!existing && (
          <TextField
            label="First password"
            type="password"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            minLength={10}
            autocomplete="new-password"
            required={!form.send}
            placeholder={form.send ? "Leave empty to make one up" : undefined}
            info="They choose their own the first time they sign in, and this one stops working."
          />
        )}
      </div>
      {existing && (
        <p className="help">
          {known.name} already has an account here, so they keep their password and find {share} in their portfolio menu.
        </p>
      )}
      {mailReady && (
        <SwitchRow
          checked={form.send}
          onChange={(send) => setForm({ ...form, send })}
          title={existing ? `Let ${known.name.split(" ")[0]} know by email` : "Email them an invite"}
          detail={existing ? `A short note that ${share} is shared with them.` : "With their first password and a link to sign in."}
        />
      )}
      <FormActions label={existing ? "Share" : label} busy={busy} onCancel={onCancel} />
    </form>
  );
}
