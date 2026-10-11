import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { TextField } from "../design-system/Fields";
import { Item } from "../design-system/Item";
import { get, put, type Portfolio } from "../lib/api";
import { portfolioPath, useSession } from "../lib/session";

export default function FirstSignInScreen() {
  const { user, signedIn, choose } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [shared, setShared] = useState<Portfolio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await put("/me/password", { new: password });
      const ps = await get<Portfolio[]>("/portfolios");
      if (ps.length === 0) return go("/welcome");
      setShared(ps);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const go = async (to: string, p?: Portfolio) => {
    if (p) choose(p.id);
    await signedIn({ ...user!, mustChangePassword: false });
    navigate(to, { replace: true });
  };

  if (!shared) {
    return (
      <div className="auth">
        <form className="card" onSubmit={submit}>
          <img src="/favicon.svg" alt="" />
          <h1>Choose your password</h1>
          <p className="lead">You signed in with a first password someone sent you. Pick your own, and that one stops working.</p>
          {error && <p className="error">{error}</p>}
          <TextField label="New password" type="password" value={password} onChange={setPassword} autocomplete="new-password" minLength={10} autoFocus required info="At least 10 characters." />
          <md-filled-button className="wide" type="submit" disabled={busy}>
            Continue
          </md-filled-button>
        </form>
      </div>
    );
  }

  const names = shared.map((p) => p.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return (
    <div className="onb">
      <div className="onb-top">
        <img src="/favicon.svg" alt="" />
        Ebenezer
      </div>
      <div className="onb-b">
        <h1>Welcome, {user?.name.split(" ")[0]}</h1>
        <p className="lead">
          {list} {names.length === 1 ? "is" : "are"} shared with you. Look around first, or start a portfolio of your own. Either way, you can switch between them from the menu at the top.
        </p>
        <div className="bring">
          {shared.map((p) => (
            <Item key={p.id} className="first" icon={p.icon} tone="on" title={p.name} detail="Shared with you">
              <md-filled-button onClick={() => go(portfolioPath(p.slug), p)}>Open {p.name}</md-filled-button>
            </Item>
          ))}
          <Item icon="add" tone="on" title="Your own portfolio" detail="Name it, pick what you hold and bring it in">
            <md-filled-tonal-button onClick={() => go("/welcome")}>Start my own</md-filled-tonal-button>
          </Item>
        </div>
      </div>
    </div>
  );
}
