import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Esta publicación contiene únicamente el analizador, sin recursos ni rutas de la web comercial.
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [react()],
  publicDir: false,
  build: { outDir: "../dist-analizador", emptyOutDir: true },
});
