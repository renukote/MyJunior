import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // optional, but nice to be explicit
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,     // ok because target is http
        // If your backend DIDN'T include '/api' in the route, you would rewrite:
        // rewrite: (path) => path.replace(/^\/api/, '')
        // but your backend *does* use '/api/case', so keep it as-is.
      },
    },
  },
});
