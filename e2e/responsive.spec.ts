import { test, expect } from '@playwright/test';
import {
    MAIN_CANVAS_SELECTOR,
    startQuickMatch,
} from './helpers/navigation';

test.describe('Responsive Design Tests', () => {
    const viewports = [
        { name: '1920x1080 (Full HD)', width: 1920, height: 1080 },
        { name: '1280x720 (HD)', width: 1280, height: 720 },
        { name: '800x600 (Small)', width: 800, height: 600 },
    ];

    for (const viewport of viewports) {
        test(`app works at ${viewport.name}`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await startQuickMatch(page);

            // Wait for canvas to render
            const canvas = page.locator(MAIN_CANVAS_SELECTOR);
            await expect(canvas).toBeVisible({ timeout: 10000 });

            // Verify canvas dimensions are appropriate
            const box = await canvas.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.width).toBeGreaterThan(100);
            expect(box!.height).toBeGreaterThan(100);

            // Canvas should fit within viewport
            expect(box!.width).toBeLessThanOrEqual(viewport.width);
            expect(box!.height).toBeLessThanOrEqual(viewport.height);
        });

        test(`Three.js renders correctly at ${viewport.name}`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await startQuickMatch(page);

            const isRendering = await page.evaluate(() => {
                const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement;
                if (!canvas) return false;

                return canvas.width > 0 && canvas.height > 0;
            });

            expect(isRendering).toBe(true);
        });

        test(`no horizontal scroll at ${viewport.name}`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto('/');
            await page.waitForTimeout(1000);

            const hasHorizontalScroll = await page.evaluate(() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            });

            expect(hasHorizontalScroll).toBe(false);
        });
    }

    test('canvas resizes when window resizes', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await startQuickMatch(page);

        const canvas = page.locator(MAIN_CANVAS_SELECTOR);
        await canvas.waitFor({ state: 'visible', timeout: 10000 });

        // Get initial size
        const initialBox = await canvas.boundingBox();
        expect(initialBox).not.toBeNull();

        // Resize viewport
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);

        // Get new size
        const newBox = await canvas.boundingBox();
        expect(newBox).not.toBeNull();

        // Canvas should have changed size
        expect(newBox!.width).not.toBe(initialBox!.width);
    });

    test('aspect ratio is maintained at different sizes', async ({ page }) => {
        const aspectRatios: number[] = [];

        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await startQuickMatch(page);

            const canvas = page.locator(MAIN_CANVAS_SELECTOR);
            await expect(canvas).toBeVisible({ timeout: 15000 });
            const box = await canvas.boundingBox();

            if (box) {
                const ratio = box.width / box.height;
                aspectRatios.push(ratio);
            }
        }

        // All aspect ratios should be reasonable (between 1.0 and 2.5)
        for (const ratio of aspectRatios) {
            expect(ratio).toBeGreaterThan(1.0);
            expect(ratio).toBeLessThan(2.5);
        }
    });

    test('game is playable at minimum viewport', async ({ page }) => {
        await page.setViewportSize({ width: 800, height: 600 });
        await startQuickMatch(page);

        // Try movement
        await page.keyboard.press('W');
        await page.waitForTimeout(100);
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);

        // Should still work
        const canvas = page.locator(MAIN_CANVAS_SELECTOR);
        await expect(canvas).toBeVisible();
    });

    test('UI elements are visible at all sizes', async ({ page }) => {
        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto('/');
            await page.waitForTimeout(1500);

            // Check if any UI text is visible
            const hasVisibleText = await page.evaluate(() => {
                const bodyText = document.body.textContent || '';
                return bodyText.trim().length > 0;
            });

            expect(hasVisibleText).toBe(true);
        }
    });

    test('canvas maintains quality at high resolution', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await startQuickMatch(page);

        const canvasResolution = await page.evaluate(() => {
            const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement;
            if (!canvas) return { width: 0, height: 0 };

            return {
                width: canvas.width,
                height: canvas.height
            };
        });

        // Canvas internal resolution should be substantial
        expect(canvasResolution.width).toBeGreaterThan(800);
        expect(canvasResolution.height).toBeGreaterThan(600);
    });

    test('rapid viewport changes do not crash app', async ({ page }) => {
        await startQuickMatch(page);

        // Rapidly change viewport sizes
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(100);
        await page.setViewportSize({ width: 800, height: 600 });
        await page.waitForTimeout(100);
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(100);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);

        // Should still be running
        const canvas = page.locator(MAIN_CANVAS_SELECTOR);
        await expect(canvas).toBeVisible({ timeout: 15000 });

        // Should still render
        const isRendering = await page.evaluate(() => {
            const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement;
            return canvas && canvas.width > 0 && canvas.height > 0;
        });

        expect(isRendering).toBe(true);
    });
});
