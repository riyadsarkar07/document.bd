import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--bg) / <alpha-value>)',
        'canvas-soft': 'rgb(var(--bg-soft) / <alpha-value>)',
        primary: 'rgb(var(--text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          elevated: 'rgb(var(--surface-elevated) / <alpha-value>)',
          hover: 'rgb(var(--surface-hover) / <alpha-value>)',
        },
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          bright: 'rgb(var(--accent-bright) / <alpha-value>)',
          deep: 'rgb(var(--accent-deep) / <alpha-value>)',
          dim: 'rgb(var(--accent) / 0.14)',
          soft: 'rgb(var(--accent) / 0.08)',
        },
        ink: 'rgb(var(--ink) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        dimm: 'rgb(var(--dimm) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow-color) / 0.05), 0 8px 24px rgb(var(--shadow-color) / 0.18)',
        deep: '0 2px 8px rgb(var(--shadow-color) / 0.14), 0 24px 64px rgb(var(--shadow-color) / 0.38)',
        pop: '0 1px 2px rgb(var(--shadow-color) / 0.08), 0 12px 32px rgb(var(--shadow-color) / 0.3)',
        glow: '0 2px 16px rgb(var(--accent) / 0.4)',
        'glow-lg': '0 4px 28px rgb(var(--accent) / 0.45)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease',
        'scale-in': 'scale-in 0.18s ease',
        'slide-up': 'slide-up 0.26s cubic-bezier(0.34, 1.4, 0.64, 1)',
        'slide-in-right': 'slide-in-right 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-bottom': 'slide-in-bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        spin: 'spin 0.7s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
