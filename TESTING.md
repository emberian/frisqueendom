# FrisQueendom Testing Guide

Complete testing documentation for FrisQueendom - a Three.js + Rust WASM ultimate frisbee game.

## Test Suite Overview

FrisQueendom has a comprehensive three-tier testing strategy:

### 1. Rust Unit Tests (19 tests)
- **Location**: `frisque-physics/src/lib.rs`
- **Focus**: Disc physics engine (WASM core)
- **Run**: `npm run test:rust`
- **Coverage**: Quaternion math, yaw alignment, AoA, distance scaling, spin decay, flight profile, wind

### 2. TypeScript Browser Tests (35 tests)
- **Location**: `src/tests/disc-physics.test.ts`
- **Focus**: Disc physics integration testing
- **Run**: `npm run test:unit` or `window.__tests.discPhysics()` in browser console
- **Coverage**: Physics behavior validation from TS/WASM boundary

### 3. Playwright E2E Tests (38 tests) ⬅️ **NEW**
- **Location**: `e2e/`
- **Focus**: Full application behavior, UI, rendering, input
- **Run**: `npm run test:e2e`
- **Coverage**: App loading, menu navigation, gameplay mechanics, responsive design

---

## Quick Start

### Run All Tests
```bash
npm run test:all
```

This runs:
1. Rust unit tests (19 tests)
2. TypeScript unit tests (35 tests)
3. Playwright E2E tests (38 tests)

**Total: 92 tests across all layers**

### Run Individual Test Suites

```bash
# Rust physics tests only
npm run test:rust

# TypeScript unit tests only
npm run test:unit

# E2E browser tests only
npm run test:e2e
```

---

## E2E Test Details

### Prerequisites
```bash
# 1. Build WASM (required for E2E tests)
npm run build:wasm:dev

# 2. Install Playwright browsers (one-time setup)
npx playwright install chromium
```

### Test Files

#### `e2e/app-loads.spec.ts` - 6 tests
Smoke tests for application bootstrap:
- Canvas rendering
- No console errors
- WASM module loading
- Three.js initialization
- Page title verification
- Canvas sizing

#### `e2e/menu-navigation.spec.ts` - 7 tests
Menu system and navigation:
- Main menu visibility
- Interactive elements
- Keyboard navigation
- ESC key handling
- Settings access
- Mouse interaction
- Game start transition

#### `e2e/gameplay.spec.ts` - 10 tests
Core gameplay mechanics:
- Game initialization
- WASD movement input
- Keyboard hold handling
- Space bar actions
- Pause functionality
- Multi-key combinations
- UI element presence
- 5-second error-free run
- Camera/mouse controls
- Input spam stability

#### `e2e/responsive.spec.ts` - 15 tests
Responsive design:
- 3 viewport sizes (1920x1080, 1280x720, 800x600)
- Canvas resizing
- Aspect ratio maintenance
- Playability at small viewports
- UI visibility
- High-resolution quality
- Rapid resize stability

### Running E2E Tests

```bash
# List all E2E tests
npx playwright test --list

# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test e2e/app-loads.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Interactive UI mode
npx playwright test --ui

# Debug mode
npx playwright test --debug

# Run specific test
npx playwright test --grep "app loads and renders canvas"
```

### E2E Test Reports

```bash
# View last test report
npx playwright show-report
```

Reports include:
- Test results (pass/fail)
- Screenshots on failure
- Execution traces
- Performance metrics

---

## Test Architecture

### Layer 1: Rust Unit Tests
```
frisque-physics/src/
├── lib.rs          # 19 tests for core physics
├── math.rs         # Vec3, Quat utilities
├── disc.rs         # DiscState, forces
└── simulation.rs   # DiscSimulator
```

**Command**: `cargo test` or `npm run test:rust`

**Coverage**:
- ✓ Quaternion operations
- ✓ Vector math
- ✓ Yaw alignment calculations
- ✓ Angle of attack computation
- ✓ Lift/drag coefficient scaling
- ✓ Spin decay physics
- ✓ Wind effects
- ✓ Flight profile validation

### Layer 2: TypeScript Unit Tests
```
src/tests/
└── disc-physics.test.ts  # 35 browser-based tests
```

**Command**: `vitest run` or `npm run test:unit`

**Coverage**:
- ✓ WASM integration
- ✓ Physics step correctness
- ✓ State getters/setters
- ✓ Simulation accuracy
- ✓ Performance benchmarks

### Layer 3: Playwright E2E Tests
```
e2e/
├── app-loads.spec.ts       # 6 smoke tests
├── menu-navigation.spec.ts # 7 menu tests
├── gameplay.spec.ts        # 10 gameplay tests
└── responsive.spec.ts      # 15 responsive tests
```

**Command**: `playwright test` or `npm run test:e2e`

**Coverage**:
- ✓ Application loading
- ✓ WASM initialization
- ✓ Three.js rendering
- ✓ User input (keyboard/mouse)
- ✓ Menu navigation
- ✓ Gameplay mechanics
- ✓ Responsive design
- ✓ Error-free execution

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Install wasm-pack
        run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

      - name: Install Dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - name: Run All Tests
        run: npm run test:all
        env:
          CI: true

      - name: Upload Playwright Report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Test Coverage Summary

### Physics Engine (Rust + TS)
- **19 Rust tests**: Core physics calculations
- **35 TS tests**: WASM integration and behavior
- **Coverage**: ~90% of physics code paths

### Application (E2E)
- **38 Playwright tests**: Full app behavior
- **Coverage**: Critical user flows, input handling, rendering

### Total Test Count: 92 tests

---

## Development Workflow

### Before Committing
```bash
# Run all tests
npm run test:all

# Or individual layers
npm run test:rust     # Fast (< 1s)
npm run test:unit     # Fast (< 2s)
npm run test:e2e      # Slower (60-120s)
```

### During Development

#### Working on Physics
```bash
# Watch Rust tests
npm run test:rust:verbose

# Watch TS unit tests
npm run test:unit:watch
```

#### Working on UI/Gameplay
```bash
# Run E2E in UI mode
npx playwright test --ui

# Or headed mode
npx playwright test --headed --workers=1
```

### Adding New Features

1. **Physics changes**: Add Rust unit tests first
2. **UI changes**: Add E2E tests in appropriate file
3. **Integration**: Update TS unit tests if WASM boundary changes

---

## Troubleshooting

### E2E Tests Fail

**WASM not found**
```bash
npm run build:wasm:dev
```

**Port 5173 in use**
```bash
lsof -ti:5173 | xargs kill -9
```

**Chromium not installed**
```bash
npx playwright install chromium
```

### All Tests Timeout

**Increase timeout**
```bash
npx playwright test --timeout=60000
```

**Run sequentially**
```bash
npx playwright test --workers=1
```

### Tests Pass Locally, Fail in CI

**Check CI environment**
- Ensure WASM is built before tests
- Verify Playwright browsers are installed
- Check for headless-specific issues

**Debug in CI**
```yaml
- name: Run Tests with Trace
  run: npx playwright test --trace on
```

---

## Performance

### Test Execution Times (Approximate)

| Suite | Tests | Time |
|-------|-------|------|
| Rust unit | 19 | 0.5-1s |
| TS unit | 35 | 1-2s |
| E2E | 38 | 60-120s |
| **Total** | **92** | **62-123s** |

### Optimization Tips

- E2E tests run in parallel (default)
- Use `--workers=1` for debugging
- Use `--headed` only when needed
- Cache WASM builds between test runs

---

## Documentation

- **E2E Quick Reference**: `e2e/QUICK-REFERENCE.md`
- **E2E Full Guide**: `e2e/README.md`
- **E2E Coverage Report**: `e2e/TEST-SUMMARY.md`
- **This Guide**: `TESTING.md`

---

## Future Enhancements

### Potential Additions
- [ ] Visual regression tests (screenshot comparison)
- [ ] Performance/benchmark tests
- [ ] Accessibility tests (ARIA, keyboard-only)
- [ ] Mobile/touch input tests
- [ ] Cross-browser tests (Firefox, Safari)
- [ ] Network/multiplayer tests
- [ ] Audio playback tests
- [ ] Load testing (many AI players)

### Test Coverage Gaps
- AI behavior validation (currently manual testing)
- Scoring logic edge cases
- Stall count accuracy
- Network latency handling
- Asset loading optimization

---

## Contributing

When adding tests:

1. **Choose the right layer**:
   - Pure logic → Rust unit tests
   - WASM integration → TS unit tests
   - User interaction → E2E tests

2. **Follow existing patterns**:
   - Use descriptive test names
   - Keep tests focused and atomic
   - Add appropriate timeouts
   - Handle async operations properly

3. **Document coverage**:
   - Update this file with new test counts
   - Add comments for complex test logic
   - Note any known flaky tests

4. **Run before committing**:
   ```bash
   npm run test:all
   ```

---

## Resources

- [Playwright Docs](https://playwright.dev/)
- [Vitest Docs](https://vitest.dev/)
- [wasm-bindgen Testing](https://rustwasm.github.io/wasm-bindgen/reference/testing.html)
- [Three.js Testing](https://threejs.org/docs/#manual/en/introduction/How-to-run-things-locally)
