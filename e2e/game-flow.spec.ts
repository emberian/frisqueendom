import { test, expect } from '@playwright/test';
import {
    ANIMATION_SETTLE,
    GAME_INIT_TIMEOUT,
    MAIN_CANVAS_SELECTOR,
    MENU_TRANSITION_TIMEOUT,
    clickGameStart,
    goToMainMenu,
    startQuickMatch,
    waitForTitleScreen,
} from './helpers/navigation';

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
        await expect(page.locator(MAIN_CANVAS_SELECTOR)).toBeVisible();
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
        await expect(page.locator(MAIN_CANVAS_SELECTOR)).toBeVisible();
    });

    test('spectator match starts and shows canvas', async ({ page }) => {
        await goToMainMenu(page);
        await page.click('#quick-match');
        await page.waitForSelector('.match-setup', { timeout: MENU_TRANSITION_TIMEOUT });
        await page.waitForTimeout(ANIMATION_SETTLE);

        // Click "Watch Sim" via evaluate (triggers heavy game init)
        await clickGameStart(page, '#watch-sim');
        await page.waitForSelector(MAIN_CANVAS_SELECTOR, { timeout: GAME_INIT_TIMEOUT });
        await page.waitForTimeout(2000);

        await expect(page.locator(MAIN_CANVAS_SELECTOR)).toBeVisible();
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
        await page.waitForSelector(MAIN_CANVAS_SELECTOR, { timeout: GAME_INIT_TIMEOUT });
        await page.waitForTimeout(3000);

        await expect(page.locator(MAIN_CANVAS_SELECTOR)).toBeVisible();
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
        await page.waitForSelector(MAIN_CANVAS_SELECTOR, { timeout: GAME_INIT_TIMEOUT });
        await page.waitForTimeout(5000);

        const criticalErrors = errors.filter(e =>
            !e.includes('favicon') && !e.includes('404') && !e.includes('net::')
        );
        expect(criticalErrors).toHaveLength(0);
    });
});
