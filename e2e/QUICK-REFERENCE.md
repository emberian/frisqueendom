# Playwright E2E Tests - Quick Reference

## Prerequisites
```bash
# 1. Build WASM (required before tests)
cd frisque-physics && wasm-pack build --target web --dev && cd ..

# 2. Install Playwright browsers (one-time)
npx playwright install chromium
```

## Common Commands

### Running Tests
```bash
# Run all tests
npx playwright test

# Run specific file
npx playwright test e2e/app-loads.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run single test in headed mode
npx playwright test --headed --grep "app loads and renders canvas"

# Run with interactive UI
npx playwright test --ui
```

### Debugging
```bash
# Debug mode (step through test)
npx playwright test --debug

# Debug specific test
npx playwright test --debug e2e/gameplay.spec.ts

# Show browser console
npx playwright test --headed --workers=1

# Verbose output
npx playwright test --reporter=line
```

### Reports
```bash
# View last test report
npx playwright show-report

# Generate report without running tests
npx playwright show-report playwright-report
```

### Development
```bash
# List all tests (without running)
npx playwright test --list

# Run tests matching pattern
npx playwright test --grep "menu"

# Run only failed tests
npx playwright test --last-failed

# Update snapshots (if using visual regression)
npx playwright test --update-snapshots
```

## Test File Breakdown

| File | Tests | Focus |
|------|-------|-------|
| `app-loads.spec.ts` | 6 | Bootstrap, WASM, Three.js init |
| `menu-navigation.spec.ts` | 7 | Menu system, navigation |
| `gameplay.spec.ts` | 10 | Input, controls, stability |
| `responsive.spec.ts` | 15 | Viewports, resize handling |
| **Total** | **38** | |

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| WASM not found | `cd frisque-physics && wasm-pack build --target web --dev` |
| Port 5173 in use | Kill process: `lsof -ti:5173 \| xargs kill -9` |
| Tests timeout | Run headed to see: `npx playwright test --headed --workers=1` |
| Chromium not installed | `npx playwright install chromium` |
| All tests fail | Check Vite builds: `npx vite build` |

## Environment Variables

```bash
# CI mode (2 retries, sequential)
CI=1 npx playwright test

# Disable parallelization
npx playwright test --workers=1

# Custom timeout (milliseconds)
npx playwright test --timeout=60000
```

## File Locations

```
e2e/
├── app-loads.spec.ts       # 6 smoke tests
├── gameplay.spec.ts        # 10 gameplay tests
├── menu-navigation.spec.ts # 7 menu tests
├── responsive.spec.ts      # 15 responsive tests
├── README.md               # Full documentation
├── TEST-SUMMARY.md         # Detailed coverage report
└── QUICK-REFERENCE.md      # This file

playwright.config.ts        # Test configuration
playwright-report/          # HTML reports (generated)
test-results/              # Screenshots, traces (generated)
```

## Playwright Config Highlights

- **testDir**: `e2e/`
- **baseURL**: `http://localhost:5173`
- **browser**: Chromium (Desktop Chrome)
- **retries**: 2 in CI, 0 locally
- **parallel**: Yes (except in CI)
- **timeout**: 30s default per test
- **webServer**: Auto-starts Vite dev server

## Adding New Tests

1. Create `e2e/your-test.spec.ts`
2. Import from `@playwright/test`
3. Write tests using patterns from existing files
4. Verify: `npx playwright test --list`
5. Run: `npx playwright test e2e/your-test.spec.ts`

## Example Test Structure

```typescript
import { test, expect } from '@playwright/test';

test('describe what it does', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    await page.keyboard.press('Space');
    // assertions...
});
```

## Performance

- Full suite: ~60-120 seconds
- Parallel execution: Up to CPU cores
- Per-test timeout: 30 seconds
- Dev server startup: ~5 seconds

## CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Build WASM
  run: cd frisque-physics && wasm-pack build --target web --dev

- name: Install Dependencies
  run: npm ci

- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: Run Tests
  run: npx playwright test
  env:
    CI: true

- name: Upload Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```
