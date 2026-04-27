import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Telegram theme variables (заполняются на window.Telegram.WebApp.themeParams)
        tg: {
          bg:        'var(--tg-bg, #0f1115)',
          surface:   'var(--tg-surface, #181b22)',
          surface2:  'var(--tg-surface-2, #20242d)',
          text:      'var(--tg-text, #f5f7fb)',
          hint:      'var(--tg-hint, #8a8f9a)',
          link:      'var(--tg-link, #4ea2ff)',
          accent:    'var(--tg-accent, #4ea2ff)',
          danger:    'var(--tg-danger, #ff5b5b)',
          success:   'var(--tg-success, #34c759)',
          warning:   'var(--tg-warning, #ffb020)',
          border:    'var(--tg-border, rgba(255,255,255,0.08))',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        soft: '0 4px 24px -8px rgba(0,0,0,0.35)',
        glow: '0 0 0 1px var(--tg-border, rgba(255,255,255,0.06)), 0 8px 32px -12px rgba(0,0,0,0.5)',
      },
      keyframes: {
        in: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        in: 'in 0.3s ease-out',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
