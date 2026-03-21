import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
  plugins: [react()],
  envPrefix: ['VITE_', 'GEMINI_', 'GROQ_'],
  server: {
    proxy: {
      // Supreme Court API - forwards /api/* to lex-t.vercel.app
      '/api': {
        target: 'https://lex-t.vercel.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path, // keep /api/case as-is
      },
      // eCourts India partner REST API — routed through local backend proxy
      // Backend adds the secret Bearer token and caches responses
      '/ecourts-api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        // no rewrite — backend expects /ecourts-api/* and strips it internally
      },
      // eCourts binary PDF proxy — serves order PDFs with correct content-type for <iframe>
      '/ecourts-pdf': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // SC office report + cause list — avoids CORS when fetching from api.sci.gov.in
      '/sci-report': {
        target: 'https://api.sci.gov.in',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sci-report/, ''),
      },
      // SC cause list page
      '/sci-causelist': {
        target: 'https://sci.gov.in',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sci-causelist/, ''),
      },
      // SC website WordPress AJAX — direct Vite proxy to www.sci.gov.in
      // No secret token needed for SC website; direct proxy avoids backend header issues
      '/sci-wp': {
        target: 'https://www.sci.gov.in',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sci-wp/, ''),
      },
      // India Post tracking API
      '/indiapost': {
        target: 'https://www.indiapost.gov.in',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/indiapost/, ''),
      },
    },
  },
  };
});