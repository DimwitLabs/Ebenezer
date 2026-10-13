import "@fontsource-variable/roboto-flex/wdth.css";
import "material-symbols/rounded.css";
import "../src/design-system/design-system.css";
import "../src/styles.css";
import "../src/lib/md";
import "./demo.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Outlet } from "react-router-dom";

import { Root } from "../src/App";
import { SnackProvider } from "../src/design-system/Snack";
import { SessionProvider } from "../src/lib/session";
import { restoreSeed } from "../src/lib/theme";
import { installDemoApi } from "./api";

const params = new URLSearchParams(location.search);
const path = params.get("path") || "/p/family";
const embed = params.get("embed") === "1";

installDemoApi();
restoreSeed();
if (embed) document.documentElement.setAttribute("data-embed", "");
const theme = params.get("theme");
if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);

// An embed is the screen alone, in the same container the app's main area uses.
const bare = (
  <div className="main">
    <main className="view">
      <Outlet />
    </main>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[path]}>
      <SnackProvider>
        <SessionProvider>
          <Root shell={embed ? bare : undefined} />
        </SessionProvider>
      </SnackProvider>
    </MemoryRouter>
  </StrictMode>,
);
