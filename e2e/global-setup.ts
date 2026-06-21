import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://jiprvhotnoobsutdlnrf.supabase.co";
const SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppcHJ2aG90bm9vYnN1dGRsbnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDczNTg3NSwiZXhwIjoyMDk2MzExODc1fQ._zJsWVzB2VVS5hdA95K9sq3RSQBOuLPSw5C2uD9Q-oc";
const TEST_EMAIL = "afifzilani4566@gmail.com";
const BASE_URL = "http://localhost:5173";
const AUTH_FILE = path.join(__dirname, ".auth/state.json");

export default async function globalSetup() {
    // Skip if a fresh auth state already exists (re-use across runs)
    if (fs.existsSync(AUTH_FILE)) {
        const age = Date.now() - fs.statSync(AUTH_FILE).mtimeMs;
        // Session is valid for ~1 hour; regenerate when older than 50 min
        if (age < 50 * 60 * 1000) {
            console.log("[setup] Reusing cached auth state.");
            return;
        }
    }

    console.log("[setup] Generating Supabase magic link for", TEST_EMAIL);

    // Use curl (avoids Node.js sandbox network restrictions)
    const curlCmd = [
        "curl", "-sf", "--max-time", "20",
        "-X", "POST",
        `"${SUPABASE_URL}/auth/v1/admin/generate_link"`,
        `-H`, `"apikey: ${SERVICE_ROLE_KEY}"`,
        `-H`, `"Authorization: Bearer ${SERVICE_ROLE_KEY}"`,
        `-H`, `"Content-Type: application/json"`,
        `-d`, `'{"type":"magiclink","email":"${TEST_EMAIL}","options":{"redirect_to":"${BASE_URL}/dashboard"}}'`,
    ].join(" ");

    const raw = execSync(curlCmd, { encoding: "utf-8" });
    const { action_link } = JSON.parse(raw);
    if (!action_link) throw new Error("[setup] No action_link returned from Supabase");
    console.log("[setup] Magic link generated. Navigating browser to establish session…");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Supabase may redirect to the production URL (zverts.com) rather than localhost
    // if localhost isn't in the allowed redirect URLs. Intercept the Supabase verify
    // response and swap the Location header to point at localhost instead.
    await page.route("**/auth/v1/verify**", async (route) => {
        // maxRedirects: 0 prevents route.fetch() from following the 302 so we
        // can read and patch the Location header before returning it to the browser.
        const response = await route.fetch({ maxRedirects: 0 });
        const location = response.headers()["location"] ?? "";
        if (location && !location.startsWith(BASE_URL)) {
            // Preserve the full URL (including the #access_token=... fragment)
            const patched = location.replace(/^https?:\/\/[^/#?]+/, BASE_URL);
            console.log("[setup] Patching redirect →", patched.slice(0, 80) + "…");
            await route.fulfill({
                status: 302,
                headers: { ...response.headers(), location: patched },
                body: "",
            });
        } else {
            await route.continue();
        }
    });

    await page.goto(action_link, { waitUntil: "domcontentloaded", timeout: 20_000 });

    // Wait for the app to land on localhost after the redirect
    await page.waitForURL(`${BASE_URL}/**`, { timeout: 15_000 });

    // Give the Supabase JS SDK a moment to store the session from the URL hash
    await page.waitForTimeout(2000);

    // Confirm we have a session in localStorage
    const hasSession = await page.evaluate((projectRef) => {
        const key = `sb-${projectRef}-auth-token`;
        return !!localStorage.getItem(key);
    }, "jiprvhotnoobsutdlnrf");

    if (!hasSession) {
        await page.screenshot({ path: "e2e/.auth/debug.png" });
        throw new Error(
            "[setup] Auth failed — no Supabase session in localStorage after magic link.\n" +
            "Screenshot saved to e2e/.auth/debug.png for debugging.",
        );
    }

    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await context.storageState({ path: AUTH_FILE });
    console.log("[setup] Auth state saved to", AUTH_FILE);

    await browser.close();
}
