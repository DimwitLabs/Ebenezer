import { useRef, useState, type FormEvent } from "react";

import { post, put, type Field, type Row, type Section } from "../lib/api";
import Dialog from "../design-system/Dialog";
import { DialogActions } from "../design-system/DialogActions";
import { Select, TextField } from "../design-system/Fields";
import { useSnack } from "../design-system/Snack";

interface Props {
  section: Section;
  row: Row | null;
  onClose: () => void;
  onDone: () => void;
}

function Input({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  if (field.type === "choice") {
    const choices = (field.choices ?? []).map((c) => ({ value: c, label: c }));
    return (
      <Select
        label={field.required ? `${field.label}*` : field.label}
        value={value}
        onChange={onChange}
        options={field.required ? choices : [{ value: "", label: "Not marked" }, ...choices]}
        info={field.key === "metal" ? "Unmarked rows count as 24 karat gold." : undefined}
      />
    );
  }
  return (
    <TextField
      label={field.label}
      type={field.type === "date" ? "date" : "text"}
      inputMode={field.type === "number" || field.type === "money" || field.type === "percent" ? "decimal" : undefined}
      value={value}
      onChange={onChange}
      required={field.required}
      placeholder={field.type === "date" ? undefined : field.example && `e.g. ${field.example}`}
    />
  );
}

export default function RowDialog({ section, row, onClose, onDone }: Props) {
  const say = useSnack();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(section.fields.map((f) => [f.key, row ? String(row.data[f.key] ?? "") : ""])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
    try {
      if (row) await put(`/sections/${section.id}/rows/${row.id}`, data);
      else await post(`/sections/${section.id}/rows`, data);
      say(row ? "Row saved" : "Row added");
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={row ? `Edit row in ${section.name}` : `Add to ${section.name}`}
      icon={section.icon}
      onClose={onClose}
      narrow
      footer={<DialogActions onCancel={onClose} label={row ? "Save" : "Add"} onClick={() => form.current?.requestSubmit()} busy={busy} />}
    >
      <form ref={form} onSubmit={submit}>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="fields2">
          {section.fields.map((f) => (
            <Input key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          ))}
        </div>
      </form>
    </Dialog>
  );
}
