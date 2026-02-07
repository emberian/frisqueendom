import { test, expect } from '@playwright/test';

// WASM + Vite first-compile can be slow; allow generous timeout for initial load
const WASM_LOAD_TIMEOUT = 30_000;
const MENU_TRANSITION_TIMEOUT = 5_000;
// Game init with software rendering (SwiftShader) is slow
const GAME_INIT_TIMEOUT = 45_000;
// Panel animations take 420ms; wait extra for SwiftShader slowdown
const ANIMATION_SETTLE = 600;

/**
 * Helper: wait for the title screen to fully render (WASM must load first)
 */
async function waitForTitleScreen(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.waitForSelector('#start-btn', { timeout: WASM_LOAD_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
}

/**
 * Helper: navigate from title → main menu
 */
async function goToMainMenu(page: import('@playwright/test').Page) {
    await waitForTitleScreen(page);
    await page.click('#start-btn');
    await page.waitForSelector('.main-menu', { timeout: MENU_TRANSITION_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
}

/**
 * Helper: click a button that triggers heavy game init (uses evaluate to avoid blocking)
 */
async function clickGameStart(page: import('@playwright/test').Page, selector: string) {
    await page.evaluate((sel) => {
        (document.querySelector(sel) as HTMLElement)?.click();
    }, selector);
}

/**
 * Helper: start a quick match from main menu
 */
async function startQuickMatch(page: import('@playwright/test').Page) {
    await goToMainMenu(page);
    await page.click('#quick-match');
    await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
    await page.waitForTimeout(ANIMATION_SETTLE);
    await clickGameStart(page, '#start-match');
    // Wait for Three.js canvas (game init with software rendering can be slow)
    await page.waitForSelector('canvas[data-engine]', { timeout: GAME_INIT_TIMEOUT });
    await page.waitForTimeout(2000); // Let the game loop stabilize
}

test.describe('Menu Navigation Flow', () => {
    test('title screen loads with start button', async ({ page }) => {
        await waitForTitleScreen(page);
        const startBtn = page.locator('#start-btn');
        await expect(startBtn).toBeVisible();
        await expect(page.locator('.game-title')).toContainText('FrisQueendom');
    });

    test('clicking start shows main menu with all options', async ({ page }) => {
        await goToMainMenu(page);

        // Verify key menu buttons exist
        await expect(page.locator('#quick-match')).toBeVisible();
        await expect(page.locator('#practice')).toBeVisible();
        await expect(page.locator('#tutorial')).toBeVisible();
        await expect(page.locator('#settings')).toBeVisible();
        await expect(page.locator('#credits')).toBeVisible();
    });

    test('settings menu shows all sections', async ({ page }) => {
        await goToMainMenu(page);
        await page.click('#settings');
        await page.waitForSelector('.settings-menu', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        // Verify settings section headers
        await expect(page.locator('.settings-section h2:has-text("Audio")')).toBeVisible();
        await expect(page.locator('.settings-section h2:has-text("Graphics")')).toBeVisible();
        await expect(page.locator('.settings-section h2:has-text("Gameplay")')).toBeVisible();
        await expect(page.locator('.settings-section h2:has-text("Accessibility")')).toBeVisible();

        // Verify accessibility controls
        await expect(page.locator('#color-blind-mode')).toBeVisible();
        await expect(page.locator('#high-contrast')).toBeVisible();
        await expect(page.locator('#reduced-motion')).toBeVisible();
    });

    test('settings cancel returns to main menu', async ({ page }) => {
        await goToMainMenu(page);
        await page.click('#settings');
        await page.waitForSelector('.settings-menu', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        // Cancel returns to main menu
        await page.click('#cancel-settings');
        await page.waitForSelector('.main-menu', { timeout: MENU_TRANSITION_TIMEOUT });
    });

    test('match setup shows weather and time-of-day options', async ({ page }) => {
        await goToMainMenu(page);
        await page.click('#quick-match');
        await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        await expect(page.locator('#time-of-day')).toBeVisible();
        await expect(page.locator('#weather')).toBeVisible();
        await expect(page.locator('#difficulty')).toBeVisible();
        await expect(page.locator('#game-to')).toBeVisible();
    });

    test('practice menu shows drill cards', async ({ page }) => {
        await goToMainMenu(page);
        await page.click('#practice');
        await page.waitForSelector('.practice-menu', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        // Should show drill cards
        const drillCards = page.locator('.drill-card');
        const count = await drillCards.count();
        expect(count).toBeGreaterThanOrEqual(3);
    });

    test('credits page shows and has back button', async ({ page }) => {
        await goToMainMenu(page);
        await page.click('#credits');
        await page.waitForSelector('.credits', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);
        await expect(page.locator('.credits h1')).toContainText('Credits');

        await page.click('#back');
        await page.waitForSelector('.main-menu', { timeout: MENU_TRANSITION_TIMEOUT });
    });
});

test.describe('Match Lifecycle', () => {
    test('quick match starts and shows canvas', async ({ page }) => {
        await startQuickMatch(page);
        await expect(page.locator('canvas[data-engine]')).toBeVisible();
    });

    test('match runs 10 seconds without critical errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await startQuickMatch(page);
        await page.waitForTimeout(10_000);

        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') && !e.includes('404') && !e.includes('net::')
        );
        expect(criticalErrors).toHaveLength(0);
    });

    test('pause menu appears on ESC and game resumes', async ({ page }) => {
        await startQuickMatch(page);
        await page.waitForTimeout(3000);

        // Hold ESC so the game loop detects it (may need several frames with SwiftShader)
        await page.keyboard.down('Escape');
        await page.waitForSelector('.pause-menu', { timeout: 15_000 });
        await page.keyboard.up('Escape');

        // Verify pause menu content
        await expect(page.locator('.pause-content h2')).toContainText('Paused');
        await expect(page.locator('#resume')).toBeVisible();
        await expect(page.locator('#quit')).toBeVisible();

        // Click Resume
        await page.click('#resume');
        await page.waitForTimeout(500);

        // Pause menu should be gone, canvas still visible
        await expect(page.locator('.pause-menu')).toHaveCount(0);
        await expect(page.locator('canvas[data-engine]')).toBeVisible();
    });

    test('spectator match starts and shows canvas', async ({ page }) => {
        await goToMainMenu(page);
        await page.click('#quick-match');
        await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        // Click "Watch Sim" via evaluate (triggers heavy game init)
        await clickGameStart(page, '#watch-sim');
        await page.waitForSelector('canvas[data-engine]', { timeout: GAME_INIT_TIMEOUT });
        await page.waitForTimeout(2000);

        await expect(page.locator('canvas[data-engine]')).toBeVisible();
    });

    test('quit match returns to main menu', async ({ page }) => {
        await startQuickMatch(page);
        await page.waitForTimeout(3000);

        // Hold ESC so the game loop detects it
        await page.keyboard.down('Escape');
        await page.waitForSelector('.pause-menu', { timeout: 15_000 });
        await page.keyboard.up('Escape');

        // Handle the confirm dialog BEFORE clicking quit
        page.on('dialog', dialog => dialog.accept());

        // Click Quit Match
        await page.click('#quit');
        await page.waitForSelector('.main-menu', { timeout: MENU_TRANSITION_TIMEOUT });

        // Should be back at main menu
        await expect(page.locator('.main-menu h1')).toContainText('Main Menu');
    });
});

test.describe('Weather & Environment', () => {
    test('sunset time-of-day starts without errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await goToMainMenu(page);
        await page.click('#quick-match');
        await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        // Select sunset
        await page.selectOption('#time-of-day', 'sunset');
        await clickGameStart(page, '#start-match');
        await page.waitForSelector('canvas[data-engine]', { timeout: GAME_INIT_TIMEOUT });
        await page.waitForTimeout(3000);

        await expect(page.locator('canvas[data-engine]')).toBeVisible();
        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') && !e.includes('404') && !e.includes('net::')
        );
        expect(criticalErrors).toHaveLength(0);
    });

    test('rain weather starts without errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await goToMainMenu(page);
        await page.click('#quick-match');
        await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        await page.selectOption('#weather', 'rain');
        await clickGameStart(page, '#start-match');
        await page.waitForSelector('canvas[data-engine]', { timeout: GAME_INIT_TIMEOUT });
        await page.waitForTimeout(5000);

        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') && !e.includes('404') && !e.includes('net::')
        );
        expect(criticalErrors).toHaveLength(0);
    });
});
