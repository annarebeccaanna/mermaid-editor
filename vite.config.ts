import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The security headers of the hosted site live in vercel.json; `vite preview` serves the same ones,
// so the production build can be checked locally before it ships.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const securityHeaders = Object.fromEntries(vercel.headers.flatMap((h) => h.headers).map(({ key, value }) => [key, value]));

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true, headers: securityHeaders },
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
});
