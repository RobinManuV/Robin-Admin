/** Route admin API calls through the Cloudflare Worker portal proxy when the
 * admin UI is mounted at /admin on project-robin.com. */
export function apiPath(path: string): string {
  if (typeof window === "undefined" || !/^\/(api)\//.test(path)) return path;

  const isProjectRobin = /(^|\.)project-robin\.com$/i.test(window.location.hostname);
  const pathname = window.location.pathname;
  const usesPortalProxy = ["/portal", "/login", "/admin"].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );

  return isProjectRobin && usesPortalProxy ? `/portal${path}` : path;
}
