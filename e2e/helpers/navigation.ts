import type { Page } from '@playwright/test';

// WASM + first Vite compile can be slow on cold starts.
export const WASM_LOAD_TIMEOUT = 30_000;
export const MENU_TRANSITION_TIMEOUT = 8_000;
export const GAME_INIT_TIMEOUT = 45_000;
export const ANIMATION_SETTLE = 600;
export const MAIN_CANVAS_SELECTOR = 'canvas[data-engine]';

export async function waitForTitleScreen(page: Page): Promise<void> {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: WASM_LOAD_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
}

export async function goToMainMenu(page: Page): Promise<void> {
    await waitForTitleScreen(page);
    await page.click('#start-btn');
    await page.waitForSelector('.main-menu', { timeout: MENU_TRANSITION_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
}

export async function clickGameStart(page: Page, selector: string): Promise<void> {
    await page.evaluate((sel) => {
        (document.querySelector(sel) as HTMLElement | null)?.click();
    }, selector);
}

export async function startQuickMatch(page: Page): Promise<void> {
    await goToMainMenu(page);
    await page.click('#quick-match');
    await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
    await clickGameStart(page, '#start-match');
    await page.waitForSelector(MAIN_CANVAS_SELECTOR, { timeout: GAME_INIT_TIMEOUT });
    await page.waitForTimeout(1_500);
}
