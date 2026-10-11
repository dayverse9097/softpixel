import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 50: '#eaf0ff', 700: '#1a2250', 800: '#10173a', 900: '#0b1030', 950: '#060a18' },
        neon: { violet: '#9d5cff', cyan: '#29e1ff', pink: '#ff7ad9', gold: '#ffe66d', mint: '#6ee7a8' },
      },
      fontFamily: {
        display: ['"Unbounded Variable"', 'Unbounded', '"Trebuchet MS"', 'system-ui', 'sans-serif'],
        body: ['"Manrope Variable"', 'Manrope', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: { panel: '28px', card: '20px', inner: '14px' },
      boxShadow: {
        glass: '0 18px 50px rgba(2,4,16,.55), inset 0 1px 0 rgba(255,255,255,.22)',
        glow: '0 8px 24px rgba(157,92,255,.35)',
      },
      keyframes: {
        drift1: { to: { transform: 'translate3d(8vmax,6vmax,0) scale(1.08)' } },
        drift2: { to: { transform: 'translate3d(-10vmax,8vmax,0) scale(.94)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        shimmer: { '0%': { opacity: '.5' }, '50%': { opacity: '.9' }, '100%': { opacity: '.5' } },
      },
      animation: {
        drift1: 'drift1 30s ease-in-out infinite alternate',
        drift2: 'drift2 36s ease-in-out infinite alternate',
        drift3: 'drift1 42s ease-in-out infinite alternate-reverse',
        spin: 'spin .9s linear infinite',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
