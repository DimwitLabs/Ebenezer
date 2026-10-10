import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { get, onUnauthorized, post, type Catalogue, type Portfolio, type Status, type User } from "./api";

interface Session {
  status: "loading" | "setup" | "signed-out" | "ready" | "unreachable";
  user: User | null;
  portfolios: Portfolio[];
  portfolio: Portfolio | null;
  catalogue: Catalogue | null;
  choose: (id: string) => void;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  signedIn: (u: User) => Promise<void>;
  signOut: () => Promise<void>;
  replace: (p: Portfolio) => void;
  timeZone: string;
}

const SessionContext = createContext<Session | null>(null);

const CURRENT = "ebenezer.portfolio";

function remembered(): string | null {
  try {
    return localStorage.getItem(CURRENT);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(remembered);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");

  const signedOut = useCallback(() => {
    setUser(null);
    setPortfolios([]);
    setStatus("signed-out");
  }, []);

  useEffect(() => onUnauthorized(signedOut), [signedOut]);

  const load = useCallback(async () => {
    const [ps, cat] = await Promise.all([get<Portfolio[]>("/portfolios"), get<Catalogue>("/kinds")]);
    setPortfolios(ps);
    setCatalogue(cat);
    setStatus("ready");
  }, []);

  const start = useCallback(async () => {
    setStatus("loading");
    // A server that is restarting is not a reason to show the sign-in screen, so retry first.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const s = await get<Status>("/status");
        if (s.timeZone) setTimeZone(s.timeZone);
        if (s.needsSetup) return setStatus("setup");
        if (!s.user) return setStatus("signed-out");
        setUser(s.user);
        if (s.user.mustChangePassword) return setStatus("ready");
        return await load();
      } catch {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    setStatus("unreachable");
  }, [load]);

  useEffect(() => {
    void start();
  }, [start]);

  const choose = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(CURRENT, id);
    } catch {
      // Private windows refuse storage; the choice still holds for this visit.
    }
  }, []);

  const value = useMemo<Session>(() => {
    const portfolio = portfolios.find((p) => p.id === currentId) ?? portfolios[0] ?? null;
    return {
      status,
      user,
      portfolios,
      portfolio,
      catalogue,
      choose,
      refresh: load,
      retry: start,
      signedIn: async (u) => {
        setUser(u);
        if (u.mustChangePassword) setStatus("ready");
        else await load();
      },
      signOut: async () => {
        await post("/logout");
        signedOut();
      },
      replace: (p) => setPortfolios((ps) => ps.map((x) => (x.id === p.id ? p : x))),
      timeZone,
    };
  }, [status, user, portfolios, currentId, catalogue, choose, load, start, signedOut, timeZone]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

export function portfolioPath(slug: string, path = "/"): string {
  return `/p/${slug}${path === "/" ? "" : path}`;
}

export function useTo(): (path: string) => string {
  const slug = useSession().portfolio?.slug ?? "";
  return (path) => portfolioPath(slug, path);
}

export function usePortfolio(): Portfolio {
  const p = useSession().portfolio;
  if (!p) throw new Error("no portfolio");
  return p;
}
