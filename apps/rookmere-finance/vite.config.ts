import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const orgUiRoot = resolve(__dirname, "../../packages/organization-ui");

export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@heavy-rain/organization-ui/styles.css",
        replacement: resolve(orgUiRoot, "src/styles.css"),
      },
      {
        find: "@heavy-rain/organization-ui/themes/rookmere/theme.css",
        replacement: resolve(orgUiRoot, "src/themes/rookmere/theme.css"),
      },
      {
        find: "@heavy-rain/organization-ui/themes/rookmere",
        replacement: resolve(orgUiRoot, "src/themes/rookmere/index.tsx"),
      },
      {
        find: "@heavy-rain/organization-ui",
        replacement: resolve(orgUiRoot, "src/index.tsx"),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 43173,
    strictPort: true,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), orgUiRoot],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 43173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
