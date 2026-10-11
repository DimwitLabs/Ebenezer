export interface ScriptResult {
  rows: Record<string, string>[];
  logs: string[];
}

const TIMEOUT_MS = 5000;

// A fresh worker per run, so scripts never see each other's rows and a runaway loop dies with the worker.
export function runScript(script: string, rows: Record<string, string>[], raw: Record<string, string>[]): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/sandbox.ts", import.meta.url), { type: "module", name: "sandbox" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("The script ran for more than 5 seconds and was stopped"));
    }, TIMEOUT_MS);
    worker.onmessage = (
      e: MessageEvent<{
        ok: boolean;
        rows?: Record<string, string>[];
        error?: string;
        logs: string[];
      }>,
    ) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.ok) resolve({ rows: e.data.rows ?? [], logs: e.data.logs });
      else
        reject(
          Object.assign(new Error(e.data.error ?? "The script failed"), {
            logs: e.data.logs,
          }),
        );
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || "The script couldn't start"));
    };
    worker.postMessage({ script, rows, raw });
  });
}
