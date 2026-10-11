import Dialog from "../design-system/Dialog";
import Spinner from "../design-system/Spinner";

export default function SeesDialog({ help, text, error, onClose }: { help: string; text: string | null; error?: string | null; onClose: () => void }) {
  return (
    <Dialog title="What Ebenezer sees" icon="visibility" onClose={onClose}>
      <p className="help">{help}</p>
      {error && <p className="error">{error}</p>}
      {text === null && !error && <Spinner className="loading" />}
      {text !== null && <pre className="ledger">{text}</pre>}
    </Dialog>
  );
}
