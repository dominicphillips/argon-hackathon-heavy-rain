import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const orgUiRoot = resolve(__dirname, "../../packages/organization-ui");
const org3dRoot = resolve(__dirname, "../../packages/organization-3d");

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
        find: "@heavy-rain/organization-ui/themes/augi/theme.css",
        replacement: resolve(orgUiRoot, "src/themes/augi/theme.css"),
      },
      {
        find: "@heavy-rain/organization-ui/themes/augi",
        replacement: resolve(orgUiRoot, "src/themes/augi/index.tsx"),
      },
      {
        find: "@heavy-rain/organization-ui",
        replacement: resolve(orgUiRoot, "src/index.tsx"),
      },
      {
        find: "@heavy-rain/organization-3d",
        replacement: resolve(org3dRoot, "src/index.ts"),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 43171,
    strictPort: true,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), orgUiRoot, org3dRoot],
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 43171,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
