import "@fontsource-variable/roboto-flex/wdth.css";
import "material-symbols/rounded.css";
import "./design-system/design-system.css";
import "./styles.css";
import "./lib/md";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { applyTheme, restoreSeed, savedTheme } from "./lib/theme";

applyTheme(savedTheme());
restoreSeed();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
