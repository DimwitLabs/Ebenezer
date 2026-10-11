import { useEffect, useRef, type ReactNode } from "react";

import type { MdDialog } from "@material/web/dialog/dialog.js";

import { IconBadge } from "./Badge";

interface Props {
  title: string;
  icon?: string;
  onClose: () => void;
  narrow?: boolean;
  steps?: string[];
  step?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export default function Dialog({ title, icon, onClose, narrow, steps, step = 0, footer, children }: Props) {
  const ref = useRef<MdDialog>(null);
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const closed = () => latest.current();
    d.addEventListener("closed", closed);
    return () => d.removeEventListener("closed", closed);
  }, []);

  return (
    <md-dialog ref={ref} open className={narrow ? "narrow" : "wide"} aria-label={title}>
      <div slot="headline" className="dlg-h">
        {icon && <IconBadge icon={icon} size={44} tone="pc" />}
        <span className="dlg-t">{title}</span>
        <md-icon-button onClick={() => ref.current?.close()} aria-label="Close">
          <md-icon>close</md-icon>
        </md-icon-button>
      </div>
      <div slot="content" className="dlg-b">
        {steps && (
          <div className="steps">
            {steps.map((s, i) => (
              <span key={s} className={`step${i === step ? " on" : i < step ? " done" : ""}`}>
                <i>{i < step ? "✓" : i + 1}</i>
                {s}
              </span>
            ))}
          </div>
        )}
        {children}
      </div>
      {footer && (
        <div slot="actions" className="dlg-f">
          {footer}
        </div>
      )}
    </md-dialog>
  );
}
