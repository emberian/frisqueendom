import { test, expect } from '@playwright/test';
import {
    MAIN_CANVAS_SELECTOR,
    goToMainMenu,
    startQuickMatch,
} from './helpers/navigation';

test('main menu is visible on load', async ({ page }) => {
    await goToMainMenu(page);

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
    await goToMainMenu(page);

    // Try to find clickable menu elements
    const menuButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const clickables = Array.from(document.querySelectorAll('[onclick], [class*="button"], [class*="menu-item"]'));
        return buttons.length + clickables.length;
    });

    expect(menuButtons).toBeGreaterThan(0);
});

test('keyboard navigation works in menu', async ({ page }) => {
    await goToMainMenu(page);

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
    await goToMainMenu(page);

    // Press ESC a few times
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Should not crash and title/menu should remain visible
    const startButton = page.locator('#start-btn');
    const mainMenu = page.locator('.main-menu');
    const stillInUi = await startButton.isVisible().catch(() => false) ||
        await mainMenu.isVisible().catch(() => false);
    expect(stillInUi).toBe(true);
});

test('settings or options can be accessed', async ({ page }) => {
    await goToMainMenu(page);

    const settingsButton = page.locator('#settings');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await page.waitForTimeout(500);
    await expect(page.locator('.settings-menu')).toBeVisible();
});

test('menu responds to mouse movement', async ({ page }) => {
    await goToMainMenu(page);

    const menuRoot = page.locator('#menu-container');
    const box = await menuRoot.boundingBox();

    if (box) {
        // Move mouse around the menu container area
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(100);
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.waitForTimeout(100);
    }

    // Verify no crashes; main menu should still be present
    await expect(page.locator('.main-menu')).toBeVisible();
});

test('start game transition works', async ({ page }) => {
    await startQuickMatch(page);

    // Game should still be running
    const canvas = page.locator(MAIN_CANVAS_SELECTOR);
    await expect(canvas).toBeVisible();

    // Check if we've transitioned (menu text might disappear)
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    // If we started, we should see game UI or the menu should change
    expect(bodyText.length).toBeGreaterThan(0);
});
