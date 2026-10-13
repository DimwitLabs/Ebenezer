import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Say = (message: string, error?: boolean) => void;

const SnackContext = createContext<Say>(() => {});

// The snackbar is a manual popover so it shows above an open modal dialog, which sits in the top layer.
function Bar({ message, error }: { message: string; error: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    try {
      el?.showPopover();
    } catch {
      // Already showing, or popovers are unsupported; it still renders in place.
    }
    return () => {
      try {
        el?.hidePopover();
      } catch {
        return;
      }
    };
  }, [message]);
  return (
    <div ref={ref} popover="manual" className={`snack${error ? " err" : ""}`} aria-hidden="true">
      {error && (
        <span className="ms" aria-hidden="true">
          error
        </span>
      )}
      {message}
    </div>
  );
}

export function SnackProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<{ message: string; error: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = useCallback<Say>((message, error = false) => {
    clearTimeout(timer.current);
    setSnack({ message, error });
    timer.current = setTimeout(() => setSnack(null), error ? 6000 : 3500);
  }, []);
  return (
    <SnackContext.Provider value={say}>
      {children}
      {snack && <Bar message={snack.message} error={snack.error} />}
      {/* Live regions announce changes, not arrivals, so these stay mounted and only their text changes. */}
      <p className="sr-only" role="status">
        {snack && !snack.error ? snack.message : ""}
      </p>
      <p className="sr-only" role="alert">
        {snack?.error ? snack.message : ""}
      </p>
    </SnackContext.Provider>
  );
}

export const useSnack = () => useContext(SnackContext);
