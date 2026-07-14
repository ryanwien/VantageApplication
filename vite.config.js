import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', // serve on the loopback IP so the Spotify OAuth redirect (http://127.0.0.1:5173/) matches
    port: 5173,
    strictPort: true,  // fail loudly if 5173 is taken instead of hopping to 5174/5175 (no more stale instances)
    proxy: {
      // meetings backend (Zoom/Google Meet) — run it with: node --env-file=.env server/index.js
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
