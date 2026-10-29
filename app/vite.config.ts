import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: process.env.VITE_BASE_PATH||'/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:4173' } },
  build: { outDir: process.env.VITE_BASE_PATH?'dist-pages':'dist', emptyOutDir: true },
});
