import { test, expect, type Page } from "@playwright/test";

/**
 * Module used for testing: "Large Language Models explained briefly" (position 1).
 * Position-1 modules are always unlocked so no prior progress is needed.
 */
const MODULE_ID = "2ce988bb-a3ea-4901-b616-eed112995e96";
const LEARN_URL = `/learn/${MODULE_ID}`;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Navigate to the module player and wait for the core UI to settle. */
async function goToLearnPage(page: Page) {
    await page.goto(LEARN_URL);
    // Wait for either the video player or the "locked" card — either way the
    // AITutorPanel trigger is already in the DOM at this point.
    await page.waitForSelector('[aria-label*="Vert AI"]', { timeout: 15_000 });
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

test.describe("Vert AI panel — /learn/:id", () => {
    test("floating Vert AI button is visible on the page", async ({ page }) => {
        await goToLearnPage(page);

        const vertButton = page.locator('[aria-label*="Vert AI"]');
        await expect(vertButton).toBeVisible();
        await expect(vertButton).toBeInViewport();
    });

    test("button is fixed at the bottom-right corner", async ({ page }) => {
        await goToLearnPage(page);

        const vertButton = page.locator('[aria-label*="Vert AI"]');
        const box = await vertButton.boundingBox();
        expect(box).not.toBeNull();

        const viewport = page.viewportSize()!;
        // Button must sit in the right half of the screen and near the bottom
        expect(box!.x + box!.width / 2).toBeGreaterThan(viewport.width / 2);
        expect(box!.y + box!.height / 2).toBeGreaterThan(viewport.height / 2);
    });

    test("clicking the button opens the Vert AI panel", async ({ page }) => {
        await goToLearnPage(page);

        const vertButton = page.locator('[aria-label*="Vert AI"]');
        await vertButton.click();

        // The panel is the fixed z-50 container — check its visible heading "Vert"
        const panelHeading = page.getByText("Vert", { exact: true }).first();
        await expect(panelHeading).toBeVisible({ timeout: 5_000 });

        // Trigger button hides once the panel is open
        await expect(vertButton).toBeHidden();
    });

    test("locked panel shows upgrade CTA when ai_enabled is false", async ({ page }) => {
        await goToLearnPage(page);

        const vertButton = page.locator('[aria-label="Vert AI — upgrade to unlock"]');
        const isLocked = await vertButton.count() > 0;

        if (!isLocked) {
            test.info().annotations.push({
                type: "skip-reason",
                description: "User has ai_enabled=true — locked panel test not applicable.",
            });
            return;
        }

        await vertButton.click();
        await expect(page.getByText("Vert AI is locked")).toBeVisible({ timeout: 5_000 });
        await expect(page.getByRole("button", { name: /unlock vert ai/i })).toBeVisible();
    });

    test("unlocked panel shows chat input when ai_enabled is true", async ({ page }) => {
        await goToLearnPage(page);

        const openButton = page.locator('[aria-label="Open Vert AI"]');
        const isUnlocked = await openButton.count() > 0;

        if (!isUnlocked) {
            test.info().annotations.push({
                type: "skip-reason",
                description: "User has ai_enabled=false — chat input test not applicable.",
            });
            return;
        }

        await openButton.click();
        const textarea = page.getByPlaceholder(/ask vert/i);
        await expect(textarea).toBeVisible({ timeout: 5_000 });
        await expect(textarea).toBeEnabled();
    });

    test("panel can be closed", async ({ page }) => {
        await goToLearnPage(page);

        const vertButton = page.locator('[aria-label*="Vert AI"]');
        await vertButton.click();

        // Close via the X button inside the panel
        const closeBtn = page.getByRole("button", { name: /close|minimize/i }).last();
        await closeBtn.click();

        // Trigger button reappears
        await expect(vertButton).toBeVisible({ timeout: 3_000 });
    });
});
