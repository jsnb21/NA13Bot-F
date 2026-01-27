import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/super-admin': 'http://localhost:5000',
      '/resto-admin': 'http://localhost:5000',
      '/client-api': 'http://localhost:5000'
    }
  }
});
