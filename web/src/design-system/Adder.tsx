import { useState, type FormEvent, type ReactNode } from "react";

type Props = {
  label: string;
  onSubmit?: (close: () => void) => void;
  children: (close: () => void) => ReactNode;
} & ({ open: boolean; onOpenChange: (open: boolean) => void } | { open?: never; onOpenChange?: never });

export function Adder({ label, open: given, onOpenChange, onSubmit, children }: Props) {
  const [own, setOwn] = useState(false);
  const open = given ?? own;
  const set = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOwn(v));
  const close = () => set(false);
  if (!open)
    return (
      <md-text-button className="adder-b" onClick={() => set(true)}>
        <md-icon slot="icon">add</md-icon>
        {label}
      </md-text-button>
    );
  if (onSubmit) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      onSubmit(close);
    };
    return (
      <form className="adder" onSubmit={submit}>
        {children(close)}
      </form>
    );
  }
  return <div className="adder">{children(close)}</div>;
}
