import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const repositoryRoot = import.meta.dirname;

export default defineConfig({
  root: path.resolve(repositoryRoot, "src/robin-platform/portal-source"),
  base: "/portal/",
  plugins: [react()],
  build: {
    outDir: path.resolve(repositoryRoot, "dist/portal"),
    emptyOutDir: true,
  },
});
