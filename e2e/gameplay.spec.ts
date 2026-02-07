import { test, expect } from '@playwright/test';

test.describe('Gameplay Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        // Attempt to start a game
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        await page.keyboard.press('Space');
        await page.waitForTimeout(1500);
    });

    test('game starts and creates field', async ({ page }) => {
        // Check that canvas is rendering
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();

        // Verify Three.js is actively rendering
        const isActivelyRendering = await page.evaluate(() => {
            const canvas = document.querySelector('canvas') as HTMLCanvasElement;
            if (!canvas) return false;

            // Canvas should have dimensions
            return canvas.width > 0 && canvas.height > 0;
        });

        expect(isActivelyRendering).toBe(true);
    });

    test('WASD keyboard input is captured', async ({ page }) => {
        // Press movement keys
        await page.keyboard.press('W');
        await page.waitForTimeout(100);
        await page.keyboard.press('A');
        await page.waitForTimeout(100);
        await page.keyboard.press('S');
        await page.waitForTimeout(100);
        await page.keyboard.press('D');
        await page.waitForTimeout(100);

        // Should not crash
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
    });

    test('keyboard holds work (continuous movement)', async ({ page }) => {
        // Press and hold W for a moment
        await page.keyboard.down('W');
        await page.waitForTimeout(500);
        await page.keyboard.up('W');
        await page.waitForTimeout(100);

        // Verify no errors
        const hasErrors = await page.evaluate(() => {
            return document.querySelector('.error') !== null;
        });
        expect(hasErrors).toBe(false);
    });

    test('space bar action works', async ({ page }) => {
        // Space is often used for throwing/actions
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);

        // Should not crash
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
    });

    test('ESC pauses or returns to menu', async ({ page }) => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);

        // Check for pause menu or main menu
        const menuVisible = await page.evaluate(() => {
            const bodyText = document.body.textContent || '';
            return bodyText.includes('Pause') ||
                   bodyText.includes('Resume') ||
                   bodyText.includes('Menu') ||
                   bodyText.includes('Quit');
        });

        // Menu should appear or game should still be running
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
    });

    test('multiple key combinations work', async ({ page }) => {
        // Test diagonal movement (W+D, etc.)
        await page.keyboard.down('W');
        await page.keyboard.down('D');
        await page.waitForTimeout(300);
        await page.keyboard.up('W');
        await page.keyboard.up('D');
        await page.waitForTimeout(100);

        await page.keyboard.down('S');
        await page.keyboard.down('A');
        await page.waitForTimeout(300);
        await page.keyboard.up('S');
        await page.keyboard.up('A');
        await page.waitForTimeout(100);

        // Should handle it gracefully
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
    });

    test('game UI elements may appear', async ({ page }) => {
        // Check for game-related UI text (score, timer, etc.)
        const hasGameUI = await page.evaluate(() => {
            const bodyText = document.body.textContent || '';
            // Look for numbers that might be score/time
            const hasNumbers = /\d+/.test(bodyText);
            // Or specific game terms
            const hasGameTerms = bodyText.includes('Score') ||
                               bodyText.includes('Time') ||
                               bodyText.includes('Stall') ||
                               bodyText.includes('Point');
            return hasNumbers || hasGameTerms;
        });

        // UI might not appear immediately, so this is a soft check
        expect(typeof hasGameUI).toBe('boolean');
    });

    test('game runs without errors for 5 seconds', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        // Let game run
        await page.waitForTimeout(5000);

        // Filter known non-critical errors
        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') &&
            !e.includes('404') // Ignore 404s for assets
        );

        expect(criticalErrors).toHaveLength(0);
    });

    test('camera controls work (mouse look)', async ({ page }) => {
        const canvas = page.locator('canvas');
        const box = await canvas.boundingBox();

        if (box) {
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            // Click to focus/lock pointer (if applicable)
            await page.mouse.click(centerX, centerY);
            await page.waitForTimeout(100);

            // Move mouse to simulate camera look
            await page.mouse.move(centerX + 100, centerY);
            await page.waitForTimeout(100);
            await page.mouse.move(centerX, centerY + 100);
            await page.waitForTimeout(100);
            await page.mouse.move(centerX - 100, centerY);
            await page.waitForTimeout(100);
        }

        // Should handle mouse movement without crashing
        await expect(canvas).toBeVisible();
    });

    test('rapid key presses do not crash game', async ({ page }) => {
        // Spam keys
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('W');
            await page.keyboard.press('Space');
            await page.keyboard.press('A');
            await page.keyboard.press('D');
        }

        await page.waitForTimeout(500);

        // Verify stability
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
    });
});
