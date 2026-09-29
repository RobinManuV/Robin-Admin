import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronRight, GraduationCap, Loader2, Sparkles } from "lucide-react";
import robinLogoTransparent from "./assets/robin-logo-transparent.png";

import { isAdminUser } from "./session.js";
import { CREAM, NAVY, NAVY_DARK } from "./theme.js";
import { Btn, Field } from "./ui.jsx";
import { reportClientError } from "./client-utils.js";
import { AdminPortal } from "./application/AdminPortal.jsx";
import { PortalShell } from "./application/ApplicationPortals.jsx";
import {
  OnboardingContract,
  OnboardingDNI,
  OnboardingOrigin,
  OnboardingPayment,
  OnboardingProfile,
} from "./application/onboarding/OnboardingFlow.jsx";
import {
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  onboardingState,
  paymentsVerify,
} from "./api.js";

function nextOnboardingStep(user) {
  if (!user.requires_onboarding) return null;
  if (!user.origin) return "origin";
  if (!user.dni_completed) return "dni";
  if (!user.contract_signed) return "contract";
  if (!user.profile_completed) return "profile";
  if (!user.pago_completed) return "payment";
  return null;
}

export default function PortalRobin() {
  const [authState, setAuthState] = useState({
    loading: true,
    user: null,
    needsOnboarding: false,
    onboardingStep: null,
  });
  const [active, setActive] = useState("estado");
  const [selectedPortal, setSelectedPortal] = useState(null);
  const isSelectorRoute = typeof window !== "undefined" && /^\/login\/?$/.test(window.location.pathname);

  function setAuthenticatedUser(user) {
    const onboardingStep = nextOnboardingStep(user);
    setAuthState({
      loading: false,
      user,
      needsOnboarding: !!onboardingStep,
      onboardingStep,
    });
  }

  useEffect(() => {
    (async () => {
      try {
        setAuthenticatedUser(await apiMe());
      } catch (_error) {
        setAuthState({ loading: false, user: null, needsOnboarding: false, onboardingStep: null });
      }
    })();
  }, []);

  useEffect(() => {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (_error) { return; }
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    (async () => {
      try { await paymentsVerify(sessionId); } catch (error) { reportClientError("optional_operation", error); }
      try { setAuthenticatedUser(await apiMe()); } catch (error) { reportClientError("optional_operation", error); }
      setActive("pagos");
      try { window.history.replaceState({}, "", window.location.pathname); } catch (error) { reportClientError("optional_operation", error); }
    })();
  }, []);

  async function handleLogin(username, password) {
    const data = await apiLogin(username.trim(), password);
    setAuthenticatedUser(await apiMe());
    setActive("estado");
    return data;
  }

  async function handleLogout() {
    await apiLogout();
    setAuthState({ loading: false, user: null, needsOnboarding: false, onboardingStep: null });
    setActive("estado");
  }

  async function refreshUser() {
    try {
      const user = await apiMe();
      setAuthState((previous) => ({ ...previous, user }));
      return user;
    } catch (_error) {
      return null;
    }
  }

  async function refreshState() {
    const state = await onboardingState();
    const user = await apiMe();
    setAuthState({
      loading: false,
      user,
      needsOnboarding: !!state.requires_onboarding && !!state.next_step,
      onboardingStep: state.next_step,
    });
  }

  if (authState.loading) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: CREAM }}>
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando portal…
        </div>
      </div>
    );
  }

  if (!authState.user && isSelectorRoute && !selectedPortal) return <PortalSelector onSelectPortal={() => window.location.assign("/portal/")} />;
  if (!authState.user) return <LoginScreen onLogin={handleLogin} onBack={() => window.location.assign("/login")} />;
  if (isAdminUser(authState.user)) return <AdminPortal user={authState.user} onLogout={handleLogout} />;

  const onboardingProps = { user: authState.user, onLogout: handleLogout, onDone: refreshState };
  if (authState.needsOnboarding && authState.onboardingStep === "origin") return <OnboardingOrigin {...onboardingProps} />;
  if (authState.needsOnboarding && authState.onboardingStep === "dni") return <OnboardingDNI {...onboardingProps} />;
  if (authState.needsOnboarding && authState.onboardingStep === "contract") return <OnboardingContract {...onboardingProps} />;
  if (authState.needsOnboarding && authState.onboardingStep === "payment") return <OnboardingPayment {...onboardingProps} />;
  if (authState.needsOnboarding && authState.onboardingStep === "profile") return <OnboardingProfile {...onboardingProps} />;

  const user = authState.user;
  const clientName = (user.nombre ? `${user.nombre} ${user.apellidos || ""}` : user.email || user.username || "").trim();
  return (
    <PortalShell
      user={user}
      clientName={clientName}
      onLogout={handleLogout}
      active={active}
      setActive={setActive}
      onUserRefresh={refreshUser}
    />
  );
}

function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex bg-[#f4f5f7]" style={{ fontFamily: "'system-ui', sans-serif" }}>
      <div
        className="hidden lg:flex flex-col justify-between w-[min(39vw,480px)] flex-shrink-0 px-11 py-11 relative overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${NAVY_DARK} 0%, ${NAVY} 60%, #2a4a8e 100%)` }}
      >
        <div className="absolute inset-0 opacity-5">
          {[...Array(6)].map((_, index) => (
            <div
              key={index}
              className="absolute rounded-full border border-white"
              style={{ width: (index + 1) * 180, height: (index + 1) * 180, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
            />
          ))}
        </div>
        <div className="relative flex items-center gap-3" aria-label="Robin">
          <img src={robinLogoTransparent} alt="Robin" className="h-[94px] w-28 object-contain" />
        </div>
        <div className="relative">
          <div className="text-[clamp(36px,3.6vw,46px)] font-bold text-white mb-5 tracking-[-.03em]" style={{ fontFamily: "'Georgia', serif", lineHeight: 1.1 }}>
            Tu futuro<br />empieza aquí.
          </div>
          <div className="max-w-[300px] text-[13px] text-white/60 leading-relaxed">
            Project Robin te acompaña en cada paso del proceso de admisión a las mejores universidades.
          </div>
        </div>
        <div className="relative text-white/30 text-xs">© Project Robin · Portal de Cliente</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-7 py-12 bg-[radial-gradient(circle_at_75%_15%,#fff_0,transparent_34%)]">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8 text-[#29395f]">
            <img src={robinLogoTransparent} alt="Robin" className="h-20 w-24 rounded-2xl bg-[#29395f] p-2 object-contain" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function PortalSelector({ onSelectPortal }) {
  const choices = [
    {
      title: "Portal de aplicación",
      description: "Tu proceso de admisión, documentación y seguimiento personalizado.",
      icon: GraduationCap,
      onClick: onSelectPortal,
    },
    {
      title: "The Robin Plan",
      description: "Tu suscripción, ventajas y servicios para tu vida internacional.",
      icon: Sparkles,
      onClick: () => { window.location.assign("/therobinplan/"); },
    },
  ];

  return (
    <AuthShell>
      <div className="space-y-7">
        <div>
          <div className="text-2xl font-bold text-slate-900 mb-2">¿A qué portal quieres acceder?</div>
          <div className="text-sm text-slate-500">Elige el espacio que quieres gestionar.</div>
        </div>
        <div className="grid gap-3">
          {choices.map(({ title, description, icon: Icon, onClick }) => (
            <button key={title} type="button" onClick={onClick} className="group w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/40">
              <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-slate-200"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <strong className="block text-base text-slate-900">{title}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span>
              </span>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400 transition group-hover:translate-x-1" />
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

function LoginScreen({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (submitError) {
      setError(submitError.status === 401 ? "Usuario o contraseña incorrectos." : submitError.message || "No hemos podido iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="bg-white rounded-3xl shadow-[0_24px_70px_rgba(31,48,83,.10)] border border-slate-200/80 overflow-hidden">
        <div className="p-7 sm:p-8 space-y-5">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Cambiar de portal
          </button>
          <div>
            <div className="text-xl font-bold text-slate-900 mb-1" style={{ fontFamily: "'Georgia', serif" }}>Bienvenido de vuelta</div>
            <div className="text-sm text-slate-500">Accede a tu portal personalizado</div>
          </div>
          <Field label="Usuario o correo" value={email} onChange={setEmail} placeholder="tu@correo.com" />
          <Field label="Contraseña" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
            </div>
          )}
          <Btn onClick={submit} disabled={!email || !password || loading} className="w-full" size="lg">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Entrando…</> : <>Entrar <ChevronRight className="h-4 w-4" /></>}
          </Btn>
          <div className="text-xs text-slate-400 text-center">
            Si acabas de unirte, tu usuario es el número de ID que te enviamos.
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
