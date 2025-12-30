import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: "es2018",
    cssTarget: "chrome61",
    minify: "esbuild",
    sourcemap: false,
    assetsInlineLimit: 1024 * 1024 * 100, // inline everything into the HTML bundle
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
});
