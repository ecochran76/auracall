import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: "/console/",
  plugins: [react()],
  build: {
    outDir: path.resolve(root, "../../dist/console-ux"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: false,
  },
});
