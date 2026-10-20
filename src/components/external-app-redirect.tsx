import { useEffect } from "react";
import { ExternalLink } from "lucide-react";

export function ExternalAppRedirect({ href, name }: { href: string; name: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <main className="page">
      <div className="empty">
        <ExternalLink aria-hidden="true" />
        <h2>Abriendo {name}</h2>
        <p>Si no se abre automáticamente, puedes continuar desde aquí.</p>
        <a className="ui-button" href={href}>{`Abrir ${name}`}</a>
      </div>
    </main>
  );
}
