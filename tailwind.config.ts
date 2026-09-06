import type { Config } from 'tailwindcss';

/**
 * Design tokens.
 *
 * Warm paper background, near-black ink, one terracotta accent used sparingly, and a sand
 * neutral for surfaces that sit between the two. Radii are generous (cards 16–32 px), shadows
 * are soft and layered, and `glass` is the translucent panel used over imagery and the 3D
 * canvas. Headings use the serif; display type uses the sans at heavy weight.
 */
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
      padding: { DEFAULT: '1.25rem', md: '2rem', xl: '2.5rem' },
      screens: { '2xl': '1440px' },
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
        accent: { DEFAULT: '#F5A623', dark: '#D48D11' },
        slate: { deep: '#2C3E50' },
        bg: { base: '#F5F2ED', surface: '#FFFFFF', deep: '#141311' },
        sand: { DEFAULT: '#E9E2D8', dark: '#D6CCBE', light: '#F3EEE7' },
        ink: { DEFAULT: '#161513', muted: '#6F6A63', soft: '#3A3733', faint: '#A39D94' },
        line: '#E3DCD2',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      fontSize: {
        'display-xl': ['clamp(3.25rem, 9.5vw, 10rem)', { lineHeight: '0.92', letterSpacing: '-0.035em' }],
        'display-lg': ['clamp(2.5rem, 6vw, 5.5rem)', { lineHeight: '0.98', letterSpacing: '-0.03em' }],
        'display-md': ['clamp(2rem, 4vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        lg: '14px',
        md: '10px',
        sm: '6px',
        xl: '20px',
        '2xl': '28px',
        '3xl': '36px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 21, 19, 0.04), 0 6px 20px rgba(22, 21, 19, 0.05)',
        cardHover: '0 2px 6px rgba(22, 21, 19, 0.06), 0 18px 40px rgba(22, 21, 19, 0.10)',
        glass: '0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 40px rgba(22, 21, 19, 0.12)',
        float: '0 24px 60px -20px rgba(22, 21, 19, 0.35)',
      },
      backgroundImage: {
        'radial-warm': 'radial-gradient(1200px 600px at 20% 0%, rgba(232,93,38,0.10), transparent 60%), radial-gradient(900px 500px at 90% 20%, rgba(245,166,35,0.10), transparent 60%)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(28px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'rise-in': 'rise-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 1.1s cubic-bezier(0.22, 1, 0.36, 1) both',
        marquee: 'marquee 40s linear infinite',
        'spin-slow': 'spin 24s linear infinite',
        float: 'float 7s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
