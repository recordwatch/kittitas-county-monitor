import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the built site works from the GitHub Pages subpath.
export default defineConfig({
  base: './',
  plugins: [react()]
})
