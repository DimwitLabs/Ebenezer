import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const web = fileURLToPath(new URL(".", import.meta.url));

// The site's screenshots come from the real app on sample data; this serves it for shots/capture.mjs and is never deployed.
export default defineConfig({
  root: `${web}shots`,
  publicDir: `${web}public`,
  plugins: [react()],
  cacheDir: `${web}node_modules/.vite-shots`,
  server: { port: 5180 },
});
