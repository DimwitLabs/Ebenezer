import { useCallback, useRef, useState, type ReactNode } from "react";

import Dialog from "./Dialog";
import { DialogActions } from "./DialogActions";

interface Ask {
  title: string;
  message: string;
  action: string;
  icon?: string;
}

// confirm() resolves true only for the action button.
export function useConfirm(): [(ask: Ask) => Promise<boolean>, ReactNode] {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolve = useRef<(yes: boolean) => void>(() => {});
  const confirm = useCallback(
    (a: Ask) =>
      new Promise<boolean>((r) => {
        resolve.current = r;
        setAsk(a);
      }),
    [],
  );
  const answer = (yes: boolean) => {
    setAsk(null);
    resolve.current(yes);
  };
  const dialog = ask && (
    <Dialog
      title={ask.title}
      icon={ask.icon ?? "delete"}
      narrow
      onClose={() => answer(false)}
      footer={<DialogActions onCancel={() => answer(false)} label={ask.action} danger onClick={() => answer(true)} />}
    >
      <p className="confirm-m">{ask.message}</p>
    </Dialog>
  );
  return [confirm, dialog];
}
