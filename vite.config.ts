import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// base is '/pride-toyota-delivery-dashboard/' for GitHub Pages project-site hosting.
export default defineConfig({
  base: '/pride-toyota-delivery-dashboard/',
  plugins: [react(), tailwindcss()],
})
