import { useRef, useState, type ReactNode } from "react";

import Spinner from "./Spinner";

export function DropZone({ icon, title, hint, accept, busy, onFile }: { icon: string; title: ReactNode; hint: ReactNode; accept: string; busy?: boolean; onFile: (f: File) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <input
        ref={picker}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <button
        type="button"
        className={`dropzone${over ? " over" : ""}`}
        disabled={busy}
        onClick={() => picker.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        <md-ripple disabled={busy} />
        <md-focus-ring />
        {busy ? (
          <Spinner size={32} label="Reading" />
        ) : (
          <span className="ms" aria-hidden="true">
            {icon}
          </span>
        )}
        <b>{title}</b>
        <span className="help">{hint}</span>
      </button>
    </>
  );
}
