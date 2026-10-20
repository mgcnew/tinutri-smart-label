import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/lib/contracting/functions",
        replacement: fileURLToPath(new URL("./contracting-functions.stub.ts", import.meta.url)),
      },
      { find: "@", replacement: root + "src" },
    ],
  },
  server: { host: "127.0.0.1", port: 8083, strictPort: true, fs: { allow: [root] } },
});
