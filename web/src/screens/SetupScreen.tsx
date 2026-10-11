import { useState, type FormEvent } from "react";

import { post, type User } from "../lib/api";
import { TextField } from "../design-system/Fields";
import { useSession } from "../lib/session";

export default function SetupScreen() {
  const { signedIn } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signedIn(await post<User>("/setup", { name, email, password }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <img src="/favicon.svg" alt="" />
        <h1>Set up Ebenezer</h1>
        <p className="lead">You're the first one here, so this Ebenezer is yours to run. You can bring people in later.</p>
        {error && <p className="error">{error}</p>}
        <TextField label="Your name" value={name} onChange={setName} autocomplete="name" required />
        <TextField label="Email" type="email" value={email} onChange={setEmail} autocomplete="email" required />
        <TextField label="Password" type="password" value={password} onChange={setPassword} autocomplete="new-password" minLength={10} required info="At least 10 characters." />
        <md-filled-button className="wide" type="submit" disabled={busy}>
          Create account
        </md-filled-button>
      </form>
    </div>
  );
}
