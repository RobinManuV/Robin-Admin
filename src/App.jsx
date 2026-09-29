import { useEffect, useState } from "react";
import { AdminApp } from "./components/admin-app";
import { portalClient } from "./services/portal";
import robinLogo from "./robin-platform/portal-source/src/assets/robin-wordmark.png";

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    portalClient.me().then((sessionUser) => { if (active) setUser(sessionUser); }).catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await portalClient.login(username, password);
      setUser(await portalClient.me());
    } catch (loginError) {
      setError(loginError?.message || "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  // La comprobación de sesión es silenciosa para evitar un flash intermedio.
  if (!ready) return null;
  if (!user) return <div className="auth-shell"><form className="auth-card" onSubmit={submit}><span className="auth-mark"><img src={robinLogo} alt="Robin" /></span><small>ROBIN ADMIN PLATFORM</small><h1>Acceso administrativo</h1><p>Usa tus credenciales de administrador de Robin Platform.</p><label>Usuario o email<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="auth-error">{error}</div>}<button className="ui-button" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button></form></div>;

  return <AdminApp authUser={user} onLogout={async () => { await portalClient.logout(); setUser(null); }} />;
}
