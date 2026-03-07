import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Any request to /api/* will be forwarded to lex-t.vercel.app
      // This bypasses CORS issues when accessing via devtunnels.ms
      '/api': {
        target: 'https://lex-t.vercel.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path, // keep /api/case as-is
      },
    },
  },
});