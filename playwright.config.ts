import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 2,
    reporter: 'html',
    timeout: 60_000,
    use: {
        baseURL: 'http://localhost:5180',
        trace: 'on-first-retry',
        actionTimeout: 10_000,
        navigationTimeout: 30_000,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: ['--use-gl=angle', '--use-angle=swiftshader'],
                },
            },
        },
    ],
    webServer: {
        command: 'npx vite --port 5180',
        port: 5180,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
});
