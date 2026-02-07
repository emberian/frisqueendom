import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        target: 'esnext',
    },
    optimizeDeps: {
        exclude: ['frisque-physics'],
    },
    assetsInclude: ['**/*.wasm'],
    server: {
        fs: {
            allow: ['..'],
        },
    },
});
