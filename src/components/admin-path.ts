// Admin interface component for admin path; composed by the shell or a feature module.
export function adminPath(path: string) {
  if (typeof window === "undefined" || !/(^|\.)project-robin\.com$/i.test(window.location.hostname)) return path;
  return `/admin${path === "/" ? "" : path}`;
}
