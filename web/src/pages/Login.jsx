import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { USERS } from "../lib/appData.js";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("kuberan@experience.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          e<span>X</span>perience.com
        </div>
        <h1>Sign in</h1>
        <p className="login__sub">Release notes &amp; product updates</p>

        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="login__error">{error}</p>}

          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login__demo">
          <p>
            Accounts below share one password, held server-side as{" "}
            <code>APP_PASSWORD</code>. It is not in this page or the bundle.
          </p>
          <ul>
            {USERS.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => setEmail(u.email)}>
                  {u.email}
                </button>
                <span>
                  {u.role} · {u.permissions.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
