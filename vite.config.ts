import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        target: 'esnext',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                controller: resolve(__dirname, 'controller.html'),
            },
        },
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
