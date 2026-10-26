// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnvFile } from "node:process";

// Preserve literal $ in server secrets (e.g. Asaas keys) before Vite's dotenv expansion.
// Existing hosting variables take precedence; production still uses the host's secret settings.
try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

// Vercel defaults functions to iad1 (EUA); gru1 keeps SSR and server functions next to Supabase (sa-east-1).
// Only the Vercel preset reads this; inside Lovable the Cloudflare preset is pinned and ignores it.
// The Lovable typing exposes only a narrow subset of nitro options, so the vercel key needs the cast.
const vercelRegion = { vercel: { functions: { regions: ["gru1"] } } } as NonNullable<
  Parameters<typeof defineConfig>[0]
>["nitro"];

export default defineConfig({
  vite: {
    server: { port: 8081, strictPort: true },
    preview: { port: 8081, strictPort: true },
    optimizeDeps: {
      ignoreOutdatedRequests: true,
      noDiscovery: true,
      include: ["qrcode"],
    },
  },
  nitro: vercelRegion,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
