import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: change `base` to '/<your-repo-name>/' for GitHub Pages.
// If your repo is github.com/gavin/dungeon-scholar, base should be '/dungeon-scholar/'.
// Leading and trailing slashes both required.
export default defineConfig({
  plugins: [react()],
  base: '/home-lab/',
})
