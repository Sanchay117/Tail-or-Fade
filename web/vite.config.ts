import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: {
    port: 5195,
    proxy: { "/api": { target: "http://localhost:8790", changeOrigin: true } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
