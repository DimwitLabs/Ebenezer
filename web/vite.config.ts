import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  define: { __VERSION__: JSON.stringify(pkg.version) },
  // Both serve the CSP: inlined data: fonts would be blocked, and the server keys the sandbox's no-network policy on its file name.
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
  worker: { format: "es", rollupOptions: { output: { entryFileNames: "assets/[name]-[hash].js" } } },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8080" },
  },
  test: { environment: "node" },
});
