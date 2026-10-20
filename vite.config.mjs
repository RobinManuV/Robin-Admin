// Shared vite config module.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  html: { cspNonce: "robin-vite" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
          if (id.includes("/node_modules/lucide-react/")) return "vendor-icons";
          if (id.includes("/node_modules/framer-motion/") || id.includes("/node_modules/motion-")) return "vendor-motion";
          if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-")) return "vendor-charts";
        },
      },
    },
  },
  server: { port: 5173 },
});
