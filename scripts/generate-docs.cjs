const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const check = process.argv.includes("--check");
const excluded = new Set([".git", "node_modules", "dist", "build", ".netlify", "coverage", "artifacts"]);
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".jsx", ".json", ".md", ".mjs", ".sql", ".toml", ".ts", ".tsx", ".yml", ".yaml"]);

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  return [...new Set(output.split("\0").filter(Boolean).map((file) => file.replace(/\\/g, "/")))]
    .filter((file) => !file.split("/").some((part) => excluded.has(part)))
    .filter((file) => !file.startsWith("docs/codebase/"))
    .filter((file) => !["docs/FILE_MAP.md", "docs/FILE_INDEX.generated.md", "docs/API_INVENTORY.md"].includes(file))
    .filter((file) => fs.existsSync(path.join(root, file)))
    .sort();
}

function relativeLink(from, to) {
  return path.posix.relative(path.posix.dirname(from), to) || ".";
}

function routeMap() {
  const config = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
  const routes = new Map();
  for (const block of config.split("[[redirects]]").slice(1)) {
    const from = /\bfrom\s*=\s*"([^"]+)"/.exec(block)?.[1];
    const handler = /\bto\s*=\s*"\/.netlify\/functions\/([^"]+)"/.exec(block)?.[1];
    if (from && handler) routes.set(handler, [...(routes.get(handler) || []), from]);
  }
  for (const match of config.matchAll(/\[functions\."([^"]+)"\]([\s\S]*?)(?=\r?\n\[|$)/g)) {
    const schedule = /schedule\s*=\s*"([^"]+)"/.exec(match[2])?.[1];
    if (schedule) routes.set(match[1], [...(routes.get(match[1]) || []), `schedule ${schedule}`]);
  }
  return routes;
}

function purpose(file, source, routes) {
  const known = {
    "README.md": "Project entry point and quick-start guide.",
    "READMELONG.md": "Extended technical project and runtime overview.",
    "USERGUIDE.md": "Navigable technical guide to source modules and cross-repository flows.",
    "ARCHITECTURE.md": "Repository layers, responsibilities, and runtime boundaries.",
    "CLOUDFLARE_ROUTING.md": "Cloudflare ingress, path rewrites, and downstream Netlify routing.",
    "netlify.toml": "Netlify build, publish directory, Function redirects, headers, and schedules.",
    "package.json": "Node dependencies and project commands.",
    "vite.config.mjs": "Vite frontend build, aliases, nonce, and output chunk strategy.",
    "src/main.jsx": "React browser entry point; mounts the application and global stylesheet.",
    "src/App.jsx": "Session bootstrap, login form, and transition to the authenticated admin shell.",
    "src/components/admin-app.tsx": "Authenticated admin shell, navigation, permissions, data loading, and feature dispatch.",
    "src/components/feature-modules.tsx": "Lazy feature registry mapping admin routes to feature components.",
    "src/services/portal.ts": "Same-origin client for shared identity, admin, profile, snapshot, and developer APIs.",
    "src/services/admin-data.ts": "CRM client normalization and lead, note, call, and email operations.",
    "src/services/integrations.ts": "Typed clients for finance, sales, Meta, payment, and integration analytics.",
    "src/lib/api-path.ts": "Cloudflare-aware path prefixing for shared portal identity requests.",
  };
  if (known[file]) return known[file];
  if (file.startsWith("netlify/functions/")) {
    const name = path.basename(file, ".js");
    const mapped = routes.get(name) || [];
    return `Netlify Function handler for ${name}${mapped.length ? `; route(s): ${mapped.join(", ")}` : "; invoked by its function path or schedule"}.`;
  }
  if (file.startsWith("netlify/edge-functions/")) return "Edge Function executed before matching Netlify requests.";
  if (file.startsWith("lib/")) return `Backend domain service or provider adapter for ${path.basename(file, path.extname(file)).replace(/[-_]/g, " ")}.`;
  if (file.startsWith("src/features/")) return `Admin feature module: ${path.basename(file, path.extname(file)).replace(/[-_]/g, " ")}.`;
  if (file.startsWith("src/components/")) return `Reusable application component: ${path.basename(file, path.extname(file)).replace(/[-_]/g, " ")}.`;
  if (file.startsWith("src/services/")) return `Browser service/API client: ${path.basename(file, path.extname(file)).replace(/[-_]/g, " ")}.`;
  if (file.startsWith("src/types/")) return "Shared TypeScript domain and API types.";
  if (file.startsWith("src/styles/")) return "Global or feature stylesheet.";
  if (file.startsWith("tests/")) return `Automated regression coverage for ${path.basename(file, path.extname(file))}.`;
  if (file.startsWith("scripts/")) return `Operator or maintenance script: ${path.basename(file, path.extname(file))}.`;
  if (file.startsWith("supabase/")) return "Database migration, seed, or schema support file.";
  if (file.startsWith("docs/")) return "Maintained project documentation.";
  if (/\.(png|jpe?g|webp|pdf|svg)$/i.test(file)) return "Static image, icon, or downloadable public resource.";
  if (source) {
    const firstComment = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(source)?.[1]?.replace(/^\s*\*?\s?/gm, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).join(" ");
    if (firstComment) return firstComment.replace(/\|/g, "\\|").slice(0, 240);
  }
  return `Repository file: ${path.basename(file)}.`;
}

function symbols(source, file) {
  const found = new Set();
  for (const match of source.matchAll(/\b(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) found.add(match[1]);
  for (const match of source.matchAll(/\bexport\s+(?:const|let|var|class|type|interface)\s+([A-Za-z_$][\w$]*)/g)) found.add(match[1]);
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g)) found.add(match[1]);
  for (const match of source.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) found.add(match[1]);
  const exportedObject = /module\.exports\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(source)?.[1] || "";
  for (const match of exportedObject.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*(?:[:,(])/gm)) found.add(match[1]);
  if (file.startsWith("netlify/functions/")) {
    if (/exports\.handler\s*=/.test(source) || /module\.exports\s*=\s*\{[^}]*handler/.test(source)) found.add("handler (Netlify entrypoint)");
  }
  return [...found].join(", ");
}

function relatedLinks(file, source, files, routes) {
  const refs = new Set();
  for (const match of source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const request = match[1];
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), request));
    const candidates = [base, ...[".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"].map((extension) => `${base}${extension}`), ...["index.js", "index.jsx", "index.ts", "index.tsx"].map((index) => path.posix.join(base, index))];
    const destination = candidates.find((candidate) => files.includes(candidate));
    if (destination) refs.add(destination);
  }
  if (file.startsWith("netlify/functions/")) {
    const endpointName = path.basename(file, ".js");
    for (const route of routes.get(endpointName) || []) refs.add(`route:${route}`);
  }
  return [...refs].map((ref) => ref.startsWith("route:") ? `\`${ref.slice(6)}\`` : `[${ref}](${relativeLink("docs/FILE_INDEX.generated.md", ref)})`).join(", ");
}

function generatedDocs(files) {
  const routes = routeMap();
  const generated = new Map();
  const fileMapPath = "docs/FILE_INDEX.generated.md";
  const apiPath = "docs/API_INVENTORY.md";
  const contents = new Map(files.map((file) => [file, textExtensions.has(path.extname(file).toLowerCase()) ? fs.readFileSync(path.join(root, file), "utf8") : ""]));
  generated.set(fileMapPath, [
    "# Generated file index",
    "",
    "Generated by `npm run docs:generate` from tracked and non-ignored working-tree files. The maintained architecture and module map is `docs/FILE_MAP.md`.",
    "Each row links to the source; functions/exports, imports, or public routes are recorded by conservative static name matching. Read the source for signatures and behavior.",
    "",
    "| File | Responsibility | Named functions / exports (static) | Direct links |",
    "|---|---|---|---|",
    ...files.filter((file) => !file.startsWith("docs/codebase/")).map((file) => {
      const source = contents.get(file) || "";
      const description = purpose(file, source, routes).replace(/\|/g, "\\|");
      const exported = symbols(source, file).replace(/\|/g, "\\|");
      const related = relatedLinks(file, source, files, routes).replace(/\|/g, "\\|");
      return `| [\`${file}\`](../${file}) | ${description} | ${exported || "—"} | ${related || "—"} |`;
    }),
    "",
  ].join("\n"));

  const apiRows = [];
  for (const block of fs.readFileSync(path.join(root, "netlify.toml"), "utf8").split("[[redirects]]").slice(1)) {
    const route = /\bfrom\s*=\s*"([^"]+)"/.exec(block)?.[1];
    const handler = /\bto\s*=\s*"\/.netlify\/functions\/([^"]+)"/.exec(block)?.[1];
    if (!route || !handler) continue;
    const file = `netlify/functions/${handler}.js`;
    const source = contents.get(file) || "";
    const methods = [...new Set([...source.matchAll(/(?:httpMethod|\bmethod)\s*(?:===|!==)\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g)].map((match) => match[1]))].sort().join(", ") || "See handler";
    apiRows.push(`| \`${route}\` | [\`${handler}\`](../${file}) | ${methods} |`);
  }
  generated.set(apiPath, [
    "# API inventory",
    "",
    "Generated from `netlify.toml` redirect rules and the corresponding Function source.",
    "Methods are statically inferred and should be confirmed in the handler; scheduled Functions and routes without redirects are documented in the routing guide.",
    "",
    "| Public route | Handler | Method(s) (static) |",
    "|---|---|---|",
    ...apiRows,
    "",
  ].join("\n"));

  const directories = new Set(["."]);
  for (const file of files) {
    let dir = path.posix.dirname(file);
    while (dir !== ".") { directories.add(dir); dir = path.posix.dirname(dir); }
  }
  const descriptions = {
    ".": "Robin Admin source tree, grouped by runtime responsibility.",
    "src": "React application executed in the browser.",
    "src/components": "Application shell, navigation, dashboards, and shared UI components.",
    "src/features": "Feature-level React modules loaded by the admin shell.",
    "src/services": "Typed browser clients for backend APIs and data normalization.",
    "src/lib": "Browser-safe path and permission helpers.",
    "lib": "Server-side domain services and provider integrations consumed by Netlify Functions.",
    "netlify": "Deployment configuration, Edge Functions, and serverless handlers.",
    "netlify/functions": "HTTP and scheduled Netlify Function entrypoints.",
    "netlify/edge-functions": "Edge middleware for request limits and identity handling.",
    "supabase": "SQL migrations and seed material for managed database projects.",
    "scripts": "Historical CRM import and documentation maintenance utilities.",
    "tests": "Node test-runner regression tests.",
    "docs": "Maintained architecture, routing, and user-guide documentation.",
  };
  const allFiles = [...new Set([...files, ...generated.keys()])].sort();
  for (const dir of [...directories].sort()) {
    const out = path.posix.join("docs/codebase", dir, "README.md");
    const children = [...directories].filter((child) => child !== "." && path.posix.dirname(child) === dir).sort();
    const ownFiles = allFiles.filter((file) => path.posix.dirname(file) === dir && file !== out);
    const up = dir === "." ? "" : `[← Parent](../README.md) · [Source directory](${path.posix.relative(path.posix.dirname(out), dir)})\n\n`;
    const childRows = children.map((child) => `| [\`${path.posix.basename(child)}/\`](${path.posix.relative(path.posix.dirname(out), path.posix.join("docs/codebase", child, "README.md"))}) | ${descriptions[child] || "See the linked module files."} |`).join("\n");
    const fileRows = ownFiles.map((file) => `| [\`${path.posix.basename(file)}\`](${relativeLink(out, file)}) | ${purpose(file, contents.get(file) || "", routes).replace(/\|/g, "\\|")} |`).join("\n");
    const title = dir === "." ? "Repository guide tree" : `\`${dir}/\``;
    generated.set(out, [
      `# ${title}`,
      "",
      up + (descriptions[dir] || "Maintained files in this directory and links to their responsibilities."),
      "",
      ...(children.length ? ["## Subdirectories", "", "| Directory | Responsibility |", "|---|---|", childRows, ""] : []),
      ...(ownFiles.length ? ["## Files", "", "| File | Responsibility |", "|---|---|", fileRows, ""] : []),
      `Generated by \`npm run docs:generate\`; use the root [USERGUIDE](${path.posix.relative(path.posix.dirname(out), "USERGUIDE.md")}) for end-to-end flows.`,
      "",
    ].join("\n"));
  }
  return generated;
}

const files = trackedFiles();
const generated = generatedDocs(files);
let stale = 0;
for (const [file, content] of generated) {
  const absolute = path.join(root, file);
  if (check) {
    if (!fs.existsSync(absolute) || fs.readFileSync(absolute, "utf8") !== content) {
      console.error(`Stale documentation: ${file}`);
      stale++;
    }
  } else {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
}
if (stale) process.exitCode = 1;
else console.log(`${generated.size} generated documentation files ${check ? "verified" : "written"}.`);
