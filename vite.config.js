import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor libs into their own long-cache chunks so
        // editing app code doesn't bust the whole bundle. (xlsx/docx/pptxgenjs are
        // already split out via dynamic import() inside exporters.js.)
        // Routed by file path (function form) because the object form leaks shared
        // deps like react-dom into whichever consumer chunk claims them first.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-|internmap|decimal\.js-light)/.test(id)) return 'vendor-recharts';
        },
      },
    },
  },
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
