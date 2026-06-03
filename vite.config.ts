import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Ensures relative paths for GitHub Pages / Static Servers
  plugins: [react()],
  server: {
    open: true,
    host: true,
    https: false
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom']
        }
      }
    }
  }
})
