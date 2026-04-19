/** @type {import('tailwindcss').Config} */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        'teal-bg': 'var(--teal-bg)',
        'teal-dark': 'var(--teal-dark)',
        'neon-cyan': 'var(--neon-cyan)',
        'neon-teal': 'var(--neon-teal)',
        'glass-bg': 'var(--glass-bg)',
        'glass-border': 'var(--glass-border)',
        gold: '#C8A96E',
      },
      boxShadow: {
        'neon-glow': '0 0 1rem var(--neon-cyan, #00f2ff), 0 0 3rem var(--neon-cyan, #00f2ff)',
      },
      backdropBlur: {
        xl: '32px',
      },
      borderColor: {
        'glass-border': 'var(--glass-border)',
      },
      backgroundColor: {
        'glass-bg': 'var(--glass-bg)',
      },
    },
  },
  plugins: [],
};

