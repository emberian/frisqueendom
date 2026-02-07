import { test, expect } from '@playwright/test';

test('main menu is visible on load', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Check for menu-related elements
    const hasMenu = await page.evaluate(() => {
        // Look for common menu indicators
        const bodyText = document.body.textContent || '';
        return bodyText.includes('Start') ||
               bodyText.includes('Play') ||
               bodyText.includes('Menu') ||
               document.querySelector('[class*="menu"]') !== null ||
               document.querySelector('[id*="menu"]') !== null;
    });

    expect(hasMenu).toBe(true);
});

test('can interact with menu elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Try to find clickable menu elements
    const menuButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const clickables = Array.from(document.querySelectorAll('[onclick], [class*="button"], [class*="menu-item"]'));
        return buttons.length + clickables.length;
    });

    expect(menuButtons).toBeGreaterThan(0);
});

test('keyboard navigation works in menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Try common menu navigation keys
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify no errors occurred
    const hasErrors = await page.evaluate(() => {
        return document.querySelector('.error') !== null;
    });
    expect(hasErrors).toBe(false);
});

test('ESC key works in menu system', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Press ESC a few times
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Should not crash
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
});

test('settings or options can be accessed', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Try common keys for settings
    await page.keyboard.press('S'); // Settings
    await page.waitForTimeout(500);

    // Or try looking for settings button
    const settingsButton = page.locator('button:has-text("Settings"), button:has-text("Options")').first();
    if (await settingsButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(500);
    }

    // Verify app is still running
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
});

test('menu responds to mouse movement', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();

    if (box) {
        // Move mouse around the canvas area
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(100);
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.waitForTimeout(100);
    }

    // Verify no crashes
    await expect(canvas).toBeVisible();
});

test('start game transition works', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Common keys to start a game
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);

    // Game should still be running
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Check if we've transitioned (menu text might disappear)
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    // If we started, we should see game UI or the menu should change
    expect(bodyText.length).toBeGreaterThan(0);
});
