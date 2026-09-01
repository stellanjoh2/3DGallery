import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    lib: {
      entry: "src/lib.ts",
      name: "RingGallery",
      fileName: (format) =>
        format === "es" ? "ring-gallery.js" : "ring-gallery.iife.js",
      formats: ["es", "iife"],
    },
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
});
