import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        exclude: [
            'src/tests/disc-physics.test.ts', // browser-only WASM tests
            'src/tests/integration.test.ts',   // browser-only legacy tests
            'src/tests/tutorial.spec.ts',      // browser-only custom test runner
        ],
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['src/tests/setup.ts'],
    },
    resolve: {
        alias: {
            three: resolve(__dirname, 'node_modules/three/build/three.module.js'),
        },
    },
});
