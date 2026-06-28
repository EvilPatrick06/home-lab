/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Mirror the desktop/web semantic color tokens (globals.css) so the native
      // UI matches the embedded WebView visually.
      colors: {
        base: '#030712',
        surface: '#111827',
        'surface-2': '#1f2937',
        border: '#374151',
        fg: '#f3f4f6',
        muted: '#9ca3af',
        accent: '#fbbf24',
        'accent-strong': '#f59e0b',
        danger: '#ef4444',
        success: '#22c55e',
        warning: '#eab308'
      }
    }
  },
  plugins: []
}
