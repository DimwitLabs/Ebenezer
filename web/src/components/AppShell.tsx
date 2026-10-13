import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import type { MdMenu } from "@material/web/menu/menu.js";

import { get, patch, type Portfolio } from "../lib/api";
import { short } from "../lib/format";
import { portfolioPath, useSession, useTo } from "../lib/session";
import BugDialog from "./BugDialog";
import { applySeed, applyTheme, reportPalette, savedTheme, type Theme } from "../lib/theme";
import { morph } from "../design-system/motion";

const NAV = [
  { to: "/", id: "nav-today", icon: "today", label: "Today" },
  { to: "/portfolio", id: "nav-portfolio", icon: "account_balance_wallet", label: "Portfolio" },
  { to: "/expenses", id: "nav-expenses", icon: "receipt_long", label: "Expenses", end: true },
  { to: "/expenses/cards", id: "nav-cards", icon: "credit_card", label: "Cards" },
  { to: "/news", id: "nav-news", icon: "newspaper", label: "News" },
  { to: "/ask", id: "nav-ask", icon: "forum", label: "Ask" },
  { to: "/data", id: "nav-data", icon: "table_chart", label: "Data" },
  { to: "/settings", id: "nav-settings", icon: "settings", label: "Settings" },
];

const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON: Record<Theme, string> = { system: "contrast", light: "light_mode", dark: "dark_mode" };

function people(names: string[], me?: string): string {
  const others = names.filter((n) => n !== me);
  if (others.length === 0) return "Just you";
  if (others.length === 1) return `You and ${others[0]}`;
  return `You, ${others[0]} and ${others.length - 1} more`;
}

export default function AppShell() {
  const { portfolios, portfolio, choose, signOut, user, replace } = useSession();
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [reporting, setReporting] = useState(false);
  const [worth, setWorth] = useState<Record<string, number>>({});

  useEffect(() => {
    if (portfolio?.color) applySeed(portfolio.color);
  }, [portfolio?.color]);

  // The emailed report uses colours computed here, so missing or stale saved ones are quietly backfilled.
  useEffect(() => {
    if (!portfolio) return;
    const palette = reportPalette(portfolio.color);
    const saved = portfolio.settings.palette ?? {};
    if (Object.keys(palette).every((k) => saved[k] === palette[k])) return;
    patch<Portfolio>(`/portfolios/${portfolio.id}`, { palette })
      .then(replace)
      .catch(() => {});
  }, [portfolio, replace]);
  const menu = useRef<MdMenu>(null);
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const to = useTo();

  const switchTo = (id: string) => {
    const next = portfolios.find((p) => p.id === id);
    if (!next) return;
    choose(id);
    const screen = pathname.startsWith("/p/") ? pathname.split("/").slice(3).join("/") : "";
    navigate(portfolioPath(next.slug, screen ? `/${screen}` : "/"));
  };

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  const cycleTheme = () => {
    const t = NEXT_THEME[theme];
    morph(() => applyTheme(t));
    setTheme(t);
  };

  const loadWorth = () =>
    portfolios.forEach((p) =>
      get<{ netWorth: number }>(`/portfolios/${p.id}/summary`)
        .then((s) => setWorth((w) => ({ ...w, [p.id]: s.netWorth })))
        .catch(() => {}),
    );

  const toggleMenu = () => {
    if (menu.current && !menu.current.open) loadWorth();
    if (menu.current) menu.current.open = !menu.current.open;
  };

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <img className="logo" src="/favicon.svg" alt="" />
          <span className="word">Ebenezer</span>
        </div>
        <nav className="nav" aria-label="Screens">
          {NAV.map((n) => (
            <NavLink key={n.to} id={n.id} to={to(n.to)} end={n.to === "/" || n.end} viewTransition className={({ isActive }) => (isActive ? "active" : n.end && pathname.endsWith("/expenses/cards") ? "parent" : "")}>
              <span className="ind">
                <md-ripple htmlFor={n.id} />
                <md-focus-ring htmlFor={n.id} />
                <span className="ms" aria-hidden="true">
                  {n.icon}
                </span>
              </span>
              <span className="lbl">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <NavLink to="/admin" id="nav-admin" viewTransition className={({ isActive }) => `who${isActive ? " active" : ""}`} title="Your account and this Ebenezer">
          <span className="ind">
            <md-ripple htmlFor="nav-admin" />
            <md-focus-ring htmlFor="nav-admin" />
            <span className="ms" aria-hidden="true">
              {user?.isOwner ? "admin_panel_settings" : "person"}
            </span>
          </span>
          <span className="lbl">{user?.name}</span>
        </NavLink>
      </aside>
      <div className="main">
        <header className="bar">
          <span className="anchor">
            <md-outlined-button id="pf-anchor" className="pf" aria-haspopup="menu" onClick={toggleMenu} aria-label="Switch portfolio">
              <span slot="icon" className="pfi ms" style={{ "--sw": portfolio?.color } as CSSProperties}>
                {portfolio?.icon ?? "account_balance_wallet"}
              </span>
              <span className="pfn">{portfolio?.name ?? "Portfolio"}</span>
              <md-icon className="caret">unfold_more</md-icon>
            </md-outlined-button>
            <md-menu ref={menu} anchor="pf-anchor" positioning="popover" className="pfmenu">
              {portfolios.map((p) => (
                <md-menu-item key={p.id} selected={p.id === portfolio?.id} onClick={() => switchTo(p.id)}>
                  <span slot="start" className="pfi ms" style={{ "--sw": p.color } as CSSProperties}>
                    {p.icon}
                  </span>
                  <div slot="headline">{p.name}</div>
                  <div slot="supporting-text">
                    {people(p.people ?? [], user?.name)}
                    {worth[p.id] !== undefined && (worth[p.id] === 0 ? " · nothing in it yet" : ` · ${short(worth[p.id])}`)}
                  </div>
                  {p.id === portfolio?.id && <md-icon slot="end">check</md-icon>}
                </md-menu-item>
              ))}
              <md-divider role="separator" />
              <md-menu-item onClick={() => navigate("/welcome")}>
                <md-icon slot="start">add</md-icon>
                <div slot="headline">New portfolio</div>
              </md-menu-item>
            </md-menu>
          </span>
          <div className="r">
            <md-icon-button className="admin-btn" onClick={() => navigate("/admin")} aria-label="Your account and this Ebenezer" title="Your account and this Ebenezer">
              <md-icon>{user?.isOwner ? "admin_panel_settings" : "person"}</md-icon>
            </md-icon-button>
            <md-icon-button onClick={() => setReporting(true)} aria-label="Report a bug" title="Report a bug">
              <md-icon>bug_report</md-icon>
            </md-icon-button>
            <md-icon-button onClick={cycleTheme} aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`}>
              <md-icon>{THEME_ICON[theme]}</md-icon>
            </md-icon-button>
            <md-icon-button onClick={signOut} aria-label="Sign out" title="Sign out">
              <md-icon>logout</md-icon>
            </md-icon-button>
          </div>
        </header>
        <main className="view">
          <Outlet />
        </main>
        {reporting && <BugDialog onClose={() => setReporting(false)} />}
      </div>
    </div>
  );
}
