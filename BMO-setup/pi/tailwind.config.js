/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./templates/**/*.html', './static/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#111827', light: '#1f2937', dark: '#030712' },
        accent: { DEFAULT: '#d97706', light: '#f59e0b', dim: '#92400e' },
        text: { DEFAULT: '#f3f4f6', muted: '#9ca3af', dim: '#6b7280' },
      },
    },
  },
  plugins: [],
}
