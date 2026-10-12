import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/public", emptyOutDir: true },
  server: { host: "0.0.0.0", proxy: { "/api": "http://localhost:3000" } },
});
