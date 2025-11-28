/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'pure-black': '#171717',
        'shadow-grey': '#1F1F1F',
        'card-bg': '#1C1C1C',
        'ink-600': '#222222',
        'ink-500': '#2D2D2D',
        'terminal-border': '#3A3A3A',
        'floral-white': '#EDEDED',
        'muted-text': '#BDBDBD',
        'sage-green': '#14B116',
        'emerald-glow': '#0C4B12',
        'error-red': '#BD0000',
        'warning-amber': '#FFA800',
        'sky-blue': '#0000FF',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'Space Grotesk', 'sans-serif'],
        mono: ['var(--font-plex-mono)', '"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

