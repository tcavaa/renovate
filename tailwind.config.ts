import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E85D26',
          dark: '#C44D1A',
          50: '#FDF1EC',
          100: '#FBE0D2',
          200: '#F6BFA3',
          300: '#F19E73',
          400: '#ED7E4D',
          500: '#E85D26',
          600: '#C44D1A',
          700: '#9A3C14',
          800: '#702B0F',
          900: '#471B09',
        },
        accent: {
          DEFAULT: '#F5A623',
          dark: '#D48D11',
        },
        slate: {
          deep: '#2C3E50',
        },
        bg: {
          base: '#FAF8F5',
          surface: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          muted: '#6B7280',
        },
        line: '#E5E0D8',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(20, 20, 20, 0.04), 0 4px 16px rgba(20, 20, 20, 0.04)',
        cardHover: '0 4px 8px rgba(232, 93, 38, 0.08), 0 12px 32px rgba(20, 20, 20, 0.08)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
