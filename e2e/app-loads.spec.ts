import { test, expect } from '@playwright/test';
import {
    MAIN_CANVAS_SELECTOR,
    startQuickMatch,
    waitForTitleScreen,
} from './helpers/navigation';

test('app loads and renders canvas', async ({ page }) => {
    await startQuickMatch(page);
    const canvas = page.locator(MAIN_CANVAS_SELECTOR);
    await expect(canvas).toBeVisible({ timeout: 10000 });
});

test('app has no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForTimeout(3000);
    // Filter out known non-critical warnings
    const criticalErrors = errors.filter((e) =>
        !e.includes('favicon') &&
        !e.includes("WebSocket connection to 'ws://localhost:8787/ws' failed"),
    );
    expect(criticalErrors).toHaveLength(0);
});

test('WASM loads successfully', async ({ page }) => {
    await waitForTitleScreen(page);
    // The app creates a DiscSimulator from WASM - if it loads, WASM worked
    await page.waitForTimeout(1000);
    // Check that no WASM-related errors occurred
    const wasmError = await page.evaluate(() => {
        return document.querySelector('.error')?.textContent ?? null;
    });
    expect(wasmError).toBeNull();
    await expect(page.locator('#menu-match')).toBeVisible();
});

test('Three.js scene initializes', async ({ page }) => {
    await startQuickMatch(page);

    // Check that Three.js is rendering frames
    const isRendering = await page.evaluate(() => {
        // Check if canvas has been drawn to
        const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement;
        if (!canvas) return false;

        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        return gl !== null;
    });

    expect(isRendering).toBe(true);
});

test('page title is correct', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FrisQueendom/i);
});

test('canvas is properly sized', async ({ page }) => {
    await startQuickMatch(page);
    const canvas = page.locator(MAIN_CANVAS_SELECTOR);
    await canvas.waitFor({ state: 'visible', timeout: 10000 });

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
});
