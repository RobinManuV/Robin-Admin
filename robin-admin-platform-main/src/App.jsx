import { useEffect, useState } from "react";
import { AdminApp } from "./components/admin-app";
import { isSupabaseConfigured, supabase } from "./services/supabase";

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!ready) return <div className="auth-shell"><div className="auth-card"><span className="auth-mark">R</span><h1>Robin Admin</h1><p>Preparando el CRM…</p></div></div>;
  if (supabase && !session) return <div className="auth-shell"><form className="auth-card" onSubmit={async (event) => { event.preventDefault(); setMessage("Enviando enlace…"); const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }); setMessage(error ? error.message : "Revisa tu correo para acceder al CRM."); }}><span className="auth-mark">R</span><small>ROBIN ADMIN PLATFORM</small><h1>Acceso al CRM</h1><p>Recibirás un enlace seguro de acceso por email.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><button className="ui-button" type="submit">Enviar enlace</button>{message && <p>{message}</p>}</form></div>;
  return <AdminApp />;
}
