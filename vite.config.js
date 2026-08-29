import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Vitest's default exclude does not know about vendored agent tooling, and
    // `npx skills add heygen-com/hyperframes` drops 26 skill packages under
    // .agents/ — several of which ship their own .test.mjs files. Left alone,
    // `npm test` collected 142 foreign test files and reported the suite red
    // while all 621 of this project's own tests were passing.
    //
    // Overriding `exclude` REPLACES the defaults rather than extending them, so
    // node_modules and dist are restated here on purpose; dropping them would
    // silently re-admit every dependency's tests.
    // .claude/skills is the same 26 packages again — the installer writes them
    // to .agents/ and symlinks them into .claude/ for Claude Code, so excluding
    // only one of the two leaves the suite just as red.
    exclude: ['**/node_modules/**', '**/dist/**', '.agents/**', '.claude/**', 'video/**'],
  },
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
