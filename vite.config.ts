// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "use-sync-external-store/shim/with-selector": fileURLToPath(
          new URL("./src/lib/useSyncExternalStoreShim.ts", import.meta.url),
        ),
        "use-sync-external-store/shim/with-selector.js": fileURLToPath(
          new URL("./src/lib/useSyncExternalStoreShim.ts", import.meta.url),
        ),
        "use-sync-external-store/shim": fileURLToPath(
          new URL("./src/lib/useSyncExternalStoreShim.ts", import.meta.url),
        ),
        "use-sync-external-store/shim/index.js": fileURLToPath(
          new URL("./src/lib/useSyncExternalStoreShim.ts", import.meta.url),
        ),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:4000",
          changeOrigin: true,
        },
      },
    },
  },
});
