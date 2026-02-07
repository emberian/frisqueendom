import type { Page } from '@playwright/test';

// WASM + first Vite compile can be slow on cold starts.
export const WASM_LOAD_TIMEOUT = 30_000;
export const MENU_TRANSITION_TIMEOUT = 8_000;
export const GAME_INIT_TIMEOUT = 45_000;
export const ANIMATION_SETTLE = 600;
export const MAIN_CANVAS_SELECTOR = 'canvas[data-engine]';

export async function waitForTitleScreen(page: Page): Promise<void> {
    await page.goto('/');
    await page.waitForSelector('.title-screen', { timeout: WASM_LOAD_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
}

export async function goToMainMenu(page: Page): Promise<void> {
    await waitForTitleScreen(page);
    await page.waitForSelector('#menu-match', { timeout: MENU_TRANSITION_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
}

export async function clickGameStart(page: Page, selector: string): Promise<void> {
    await page.evaluate((sel) => {
        (document.querySelector(sel) as HTMLElement | null)?.click();
    }, selector);
}

export async function startQuickMatch(page: Page): Promise<void> {
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await goToMainMenu(page);
        await page.click('#menu-match');
        await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);
        await clickGameStart(page, '#start-match');
        await page.waitForSelector(MAIN_CANVAS_SELECTOR, { timeout: GAME_INIT_TIMEOUT });

        const inMatch = await page.evaluate((selector) => {
            const canvas = document.querySelector(selector);
            const titleScreen = document.querySelector('.title-screen');
            const setupScreen = document.querySelector('.match-setup');
            return !!canvas && !titleScreen && !setupScreen;
        }, MAIN_CANVAS_SELECTOR);

        if (inMatch) {
            await page.waitForTimeout(1_500);
            return;
        }
    }

    throw new Error('Failed to start quick match after retrying navigation flow.');
}
