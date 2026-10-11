// The server sends this file with a no-network policy; deleting the globals just makes mistakes fail loudly.
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "Worker", "SharedWorker", "BroadcastChannel", "WebTransport"]) {
  try {
    Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false });
  } catch {
    continue;
  }
}

import { helpers } from "../lib/helpers";

type Row = Record<string, string>;

self.onmessage = (e: MessageEvent<{ script: string; rows: Row[]; raw: Row[] }>) => {
  const logs: string[] = [];
  const log = (...args: unknown[]) => logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  try {
    const run = new Function("rows", "raw", "helpers", "log", `"use strict";\n${e.data.script}`);
    const out = run(structuredClone(e.data.rows), structuredClone(e.data.raw), helpers, log);
    if (!Array.isArray(out)) throw new Error("The script must return a list of rows");
    const rows = out.map((r, i) => {
      if (!r || typeof r !== "object") throw new Error(`Row ${i + 1} is not an object`);
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]));
    });
    self.postMessage({ ok: true, rows, logs });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err), logs });
  }
};
