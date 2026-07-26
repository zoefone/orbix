/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#2F6FED', dark: '#5B8DEF' },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        mono: ['SF Mono', 'ui-monospace', 'JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        'pulse-dot': { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        'blink': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
    },
  },
  plugins: [],
};
