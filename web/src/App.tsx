import { useEffect, type ReactElement } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";

import AppShell from "./components/AppShell";
import { SnackProvider } from "./design-system/Snack";
import { portfolioPath, SessionProvider, useSession } from "./lib/session";
import AskScreen from "./screens/AskScreen";
import CardsScreen from "./screens/CardsScreen";
import DataScreen from "./screens/DataScreen";
import ExpensesScreen from "./screens/ExpensesScreen";
import ExportScreen from "./screens/ExportScreen";
import FirstSignInScreen from "./screens/FirstSignInScreen";
import HealthScreen from "./screens/HealthScreen";
import LoginScreen from "./screens/LoginScreen";
import NewsScreen from "./screens/NewsScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import PortfolioScreen from "./screens/PortfolioScreen";
import AdminScreen from "./screens/AdminScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SetupScreen from "./screens/SetupScreen";
import TodayScreen from "./screens/TodayScreen";

// A stale slug (renamed, or no longer shared) falls back to the same screen of the current portfolio.
function PortfolioRoute() {
  const { slug } = useParams();
  const { pathname, hash } = useLocation();
  const { portfolios, portfolio, choose } = useSession();
  const named = portfolios.find((p) => p.slug === slug);
  useEffect(() => {
    if (named && named.id !== portfolio?.id) choose(named.id);
  }, [named, portfolio, choose]);
  if (!named) {
    const rest = pathname.split("/").slice(3).join("/");
    return <Navigate to={portfolioPath(portfolio!.slug, rest ? `/${rest}` : "/") + hash} replace />;
  }
  return named.id === portfolio?.id ? <Outlet /> : null;
}

function Home() {
  const { portfolio } = useSession();
  return <Navigate to={portfolioPath(portfolio!.slug)} replace />;
}

// The demo passes its own shell to show a screen without the navigation.
export function Root({ shell = <AppShell /> }: { shell?: ReactElement }) {
  const { status, portfolio, retry, user } = useSession();
  if (status === "loading") return null;
  if (status === "unreachable") {
    return (
      <div className="auth">
        <div className="card">
          <img src="/favicon.svg" alt="" />
          <h1>I'm not answering right now</h1>
          <p className="lead">I may be restarting. Your data is safe.</p>
          <md-filled-button className="wide" onClick={retry}>
            Try again
          </md-filled-button>
        </div>
      </div>
    );
  }
  if (status === "setup") return <SetupScreen />;
  if (status === "signed-out") return <LoginScreen />;
  if (user?.mustChangePassword) return <FirstSignInScreen />;
  return (
    <Routes>
      <Route path="/welcome" element={<OnboardingScreen />} />
      <Route element={portfolio ? shell : <Navigate to="/welcome" replace />}>
        <Route path="/p/:slug" element={<PortfolioRoute />}>
          <Route index element={<TodayScreen />} />
          <Route path="portfolio" element={<PortfolioScreen />} />
          <Route path="expenses" element={<ExpensesScreen />} />
          <Route path="expenses/cards" element={<CardsScreen />} />
          <Route path="news" element={<NewsScreen />} />
          <Route path="ask" element={<AskScreen />} />
          <Route path="data" element={<DataScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to=".." replace />} />
        </Route>
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/admin/export" element={<ExportScreen />} />
        <Route path="/health" element={<HealthScreen />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SnackProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </SnackProvider>
    </BrowserRouter>
  );
}
