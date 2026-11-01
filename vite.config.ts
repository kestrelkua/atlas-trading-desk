import { defineConfig } from 'vite';

// Relative asset and data paths, so the build works at any address (GitHub Pages serves it from /<repo>/).
export default defineConfig({ base: './' });
