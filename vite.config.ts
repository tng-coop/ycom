import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Ensures relative paths for GitHub Pages / Static Servers
  plugins: [react(), basicSsl()],
  server: {
    open: true,
    host: true,
    https: true
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
