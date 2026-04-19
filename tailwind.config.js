/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    borderWidth: {
      'glass-border': '1px',
    },
    colors: {
      'glass-bg': 'rgba(1, 42, 46, 0.8)',
      'glass-border': 'rgba(6, 120, 132, 0.2)',
      'neon-cyan': '#00f2ff',
      'neon-teal': '#00d4ff',
      'teal-bg': '#012a2e',
      'teal-dark': '#011a1d',
      background: '#07090E',
      foreground: '#EEE9E2',
      gold: '#C8A96E',
    },
    boxShadow: {
      'neon-glow': '0 0 1rem #00f2ff, 0 0 3rem #00f2ff',
    },
    backdropBlur: {
      xl: '32px',
    },
  },
  plugins: [],
}
