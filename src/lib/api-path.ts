/** Route admin API calls through the Cloudflare Worker portal proxy when the
 * admin UI is mounted at /admin on project-robin.com. */
export function apiPath(path: string): string {
  if (typeof window === "undefined" || !/^\/(api)\//.test(path)) return path;

  const isProjectRobin = /(^|\.)project-robin\.com$/i.test(window.location.hostname);
  const pathname = window.location.pathname;
  const usesPortalProxy = ["/portal", "/login"].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
  // /admin is served by the admin app directly, so its /api/admin and
  // /api/internal functions stay at the domain root. Only the shared portal
  // authentication/profile endpoints need the Worker proxy there.
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPortalEndpoint = !/^\/api\/(admin|internal)\//.test(path);

  return isProjectRobin && (usesPortalProxy || (isAdminRoute && isPortalEndpoint))
    ? `/portal${path}`
    : path;
}
