import { defineConfig } from "vite";

// React and ReactDOM load from cdnjs as UMD globals in the published page;
// everything else (app code, icons, styles) is bundled into one script.
export default defineConfig({
  esbuild: { jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" },
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      external: ["react", "react-dom", "react-dom/client"],
      output: {
        format: "iife",
        globals: { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" },
        entryFileNames: "app.js",
        assetFileNames: "app.[ext]",
        inlineDynamicImports: true,
      },
    },
  },
  test: { environment: "node" },
} as never);
