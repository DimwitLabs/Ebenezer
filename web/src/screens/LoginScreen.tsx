import { useState, type FormEvent } from "react";

import { post, type User } from "../lib/api";
import { TextField } from "../design-system/Fields";
import { useSession } from "../lib/session";

export default function LoginScreen() {
  const { signedIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signedIn(await post<User>("/login", { email, password }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <img src="/favicon.svg" alt="" />
        <h1>Sign in</h1>
        <p className="lead">I'm Ebenezer, and I keep the books. Sign in to see yours.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <TextField label="Email" name="email" type="email" value={email} onChange={setEmail} autocomplete="username" required />
        <TextField label="Password" name="password" type="password" value={password} onChange={setPassword} autocomplete="current-password" required />
        <md-filled-button className="wide" type="submit" disabled={busy}>
          Sign in
        </md-filled-button>
      </form>
    </div>
  );
}
