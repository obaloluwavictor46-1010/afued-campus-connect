// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // SPA MODE - NO SERVER FUNCTION, NO LOOP
  // This stops TanStack from creating a Vercel Server Function
  // that was calling itself and triggering 508.
  // App will be served as static files from dist/ - same UI, same Supabase.
  tanstackStart: {
    spa: {
      enabled: true,
    },
  },
  nitro: {
    preset: "static",
  },
});
