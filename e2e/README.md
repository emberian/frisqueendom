# FrisQueendom E2E Tests

Playwright-based browser tests for FrisQueendom.

## Prerequisites

1. **Build WASM first** (required for dev server):
   ```bash
   cd frisque-physics
   wasm-pack build --target web --dev
   cd ..
   ```

2. **Install Playwright** (if not already installed):
   ```bash
   npx playwright install chromium
   ```

## Running Tests

### List all tests
```bash
npx playwright test --list
```

### Run all tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test e2e/app-loads.spec.ts
npx playwright test e2e/menu-navigation.spec.ts
npx playwright test e2e/gameplay.spec.ts
npx playwright test e2e/responsive.spec.ts
```

### Run in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run in UI mode (interactive)
```bash
npx playwright test --ui
```

### Debug a specific test
```bash
npx playwright test --debug e2e/app-loads.spec.ts
```

## Test Coverage

### 1. `app-loads.spec.ts` (6 tests)
Basic smoke tests to verify the app loads correctly:
- Canvas renders
- No console errors
- WASM loads successfully
- Three.js scene initializes
- Page title is correct
- Canvas is properly sized

### 2. `menu-navigation.spec.ts` (7 tests)
Menu system functionality:
- Main menu visibility on load
- Menu elements are interactive
- Keyboard navigation works
- ESC key functionality
- Settings/options access
- Mouse movement handling
- Start game transition

### 3. `gameplay.spec.ts` (10 tests)
Core gameplay mechanics:
- Game starts and creates field
- WASD keyboard input
- Keyboard holds (continuous movement)
- Space bar action
- ESC pause functionality
- Multiple key combinations
- Game UI elements
- No errors during 5-second run
- Camera/mouse controls
- Rapid key press stability

### 4. `responsive.spec.ts` (15 tests)
Responsive design and viewport handling:
- Works at 1920x1080, 1280x720, 800x600
- Three.js renders at all sizes
- No horizontal scroll
- Canvas resizes with window
- Aspect ratio maintenance
- Playable at minimum viewport
- UI elements visible at all sizes
- Quality at high resolution
- Rapid viewport change stability

**Total: 38 tests**

## Test Architecture

- **Vite dev server** auto-starts via `webServer` config in `playwright.config.ts`
- **baseURL**: `http://localhost:5173`
- **testDir**: `e2e/`
- Tests run on **Chromium** only (matches main browser target)
- Screenshots on failure saved to `test-results/`
- HTML report generated in `playwright-report/`

## Notes

- Tests are designed to be resilient to timing issues with appropriate `waitForTimeout` calls
- Canvas rendering is verified using bounding boxes and WebGL context checks
- Keyboard input tests use both `press()` and `down()`/`up()` for different scenarios
- Console errors are captured and filtered for known non-critical warnings
- Tests avoid making assumptions about exact menu structure (different builds may vary)

## CI/CD

The tests are configured for CI environments:
- `retries: 2` in CI
- `workers: 1` in CI (sequential execution)
- `forbidOnly` prevents `.only()` from reaching CI

## Troubleshooting

### "WASM module not found" error
Build WASM first: `cd frisque-physics && wasm-pack build --target web --dev`

### Tests timing out
Increase timeout in individual test: `test('name', async ({ page }) => { ... }, 60000)`

### Canvas not visible
Check if Vite dev server started correctly. Look for port conflicts on 5173.

### All tests fail
Run in headed mode to see what's happening: `npx playwright test --headed --workers=1`
