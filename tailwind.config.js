/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        void: '#05060a',
        panel: '#0c0f16',
        panel2: '#11151f',
        ink: '#e9e4d8',
        'ink-dim': '#9a9484',
        gold: '#e9b949',
        'gold-dim': '#8a6d24',
        amber: '#ffb703',
        blood: '#b3382c',
        evidence: '#5c8a5c',
      },
      fontFamily: {
        type: ['var(--font-typewriter)', 'Courier New', 'monospace'],
        case: ['var(--font-case)', 'Georgia', 'serif'],
      },
      boxShadow: {
        glow: '0 0 12px rgba(233, 185, 73, 0.45), 0 0 2px rgba(233, 185, 73, 0.8)',
        'glow-lg': '0 0 30px rgba(233, 185, 73, 0.35)',
      },
      animation: {
        flicker: 'flicker 4s linear infinite',
        scan: 'scan 6s linear infinite',
        blink: 'blink 1.1s steps(1) infinite',
      },
      keyframes: {
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: 1 },
          '20%, 22%, 24%, 55%': { opacity: 0.72 },
        },
        scan: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 100%' },
        },
        blink: {
          '0%, 50%': { opacity: 1 },
          '51%, 100%': { opacity: 0 },
        },
      },
    },
  },
  plugins: [],
};
