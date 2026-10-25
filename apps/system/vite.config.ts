import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@heavy-rain/system-ui": new URL(
        "../../packages/heavy-rain-ui/src/index.tsx",
        import.meta.url,
      ).pathname,
      "@heavy-rain/organization-ui": new URL(
        "../../packages/organization-ui/src/index.tsx",
        import.meta.url,
      ).pathname,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 43170,
    strictPort: true,
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        "../..",
        "../../packages",
        "../../__grounding",
      ],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 43170,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
