import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "contracting.spec.ts",
  fullyParallel: false,
  outputDir: "../../.output/contracting-browser",
  use: {
    baseURL: "http://127.0.0.1:8083",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
  },
  webServer: {
    command: "npx vite --config contracting.vite.config.ts",
    url: "http://127.0.0.1:8083",
    reuseExistingServer: false,
  },
});
