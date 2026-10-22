// Admin shares the public Robin login and only mounts for an authenticated admin identity.
import { useEffect, useState } from "react";
import { AdminApp } from "./components/admin-app";
import { portalClient } from "./services/portal";

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    portalClient.me()
      .then((sessionUser) => {
        if (!active) return;
        if (sessionUser.is_application_admin !== true) {
          window.location.replace("https://project-robin.com/portal/");
          return;
        }
        setUser(sessionUser);
      })
      .catch(() => {
        window.location.replace("https://project-robin.com/login?next=%2Fadmin");
      })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  if (!ready || !user) return null;
  return (
    <AdminApp
      authUser={user}
      onLogout={async () => {
        await portalClient.logout();
        try {
          await fetch("/therobinplan/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
          });
        } catch (_) {}
        window.location.replace("https://project-robin.com/login");
      }}
    />
  );
}
