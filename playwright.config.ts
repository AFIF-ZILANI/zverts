import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    globalSetup: "./e2e/global-setup.ts",
    fullyParallel: false,
    retries: 1,
    reporter: "list",

    use: {
        baseURL: "http://localhost:5173",
        storageState: "e2e/.auth/state.json",
        trace: "on-first-retry",
        video: "on-first-retry",
    },

    webServer: {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 30_000,
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
