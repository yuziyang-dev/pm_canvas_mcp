import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-canvas",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        canvas: resolve(__dirname, "canvas.html"),
      },
    },
  },
});
