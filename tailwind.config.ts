import type { Config } from 'tailwindcss';

/**
 * Design tokens — the ROOMIT palette ("Play. Before we ROOMIT.").
 *
 * A near-white page, white cards, black ink, and three voices on top of it: lime (`lime`) is the
 * highlighter — what is open, what is on, the mark behind a word; black (`ink`) is the main
 * action, a pill; violet (`brand`) is what is picked, a link, a focus ring. Four pops —
 * tangerine, coral, sun and cobalt — are for pictures, numbers and colour blocks, never for
 * controls. Corners are generous (cards 24 px, tiles 16 px) and buttons are pills. Shadows are
 * soft and neutral. All type is one heavy grotesk: the display face is the same family at 800
 * with tight tracking.
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
        /** Violet — what is picked, a link, a focus ring. Reads on white and under white text. */
        brand: {
          DEFAULT: '#6C47FF',
          dark: '#5632E0',
          50: '#F4F1FF',
          100: '#E9E3FF',
          200: '#D3C7FF',
          300: '#B9A6FF',
          400: '#9478FF',
          500: '#6C47FF',
          600: '#5632E0',
          700: '#4324B3',
          800: '#2F1982',
          900: '#1D0F52',
        },
        /** Lime — the highlighter: what is open or on, the mark behind a word. Black text on it. */
        lime: { DEFAULT: '#C8F135', dark: '#B0DB17', soft: '#F0FBCB', deep: '#3F5200' },
        /** The pops: pictures, numbers and colour blocks — never a control. */
        lilac: { DEFAULT: '#B9A6FF', soft: '#EFEAFF' },
        tangerine: { DEFAULT: '#FF6B1A', dark: '#D94F06', light: '#FFB27D' },
        coral: { DEFAULT: '#FF6B6B', soft: '#FFE6E3' },
        sun: { DEFAULT: '#FFC61A', soft: '#FFF3C9' },
        cobalt: { DEFAULT: '#2457FF', soft: '#E3EAFF' },
        /** Neutral greys for hairlines and quiet blocks. */
        stone: { DEFAULT: '#D4D4D8', dark: '#A1A1AA', light: '#E7E7EA' },
        mist: { DEFAULT: '#ECECEF', dark: '#DDDDE2', light: '#F4F4F6' },
        bg: { base: '#FAFAFA', surface: '#FFFFFF', deep: '#0B0B0C' },
        ink: { DEFAULT: '#0B0B0C', muted: '#6B6B73', soft: '#2B2B30', faint: '#A4A4AC' },
        line: '#E8E8EC',
        success: '#17914A',
        warning: '#C77700',
        danger: '#E0352B',
      },
      fontFamily: {
        /** Latin and Cyrillic from Inter Tight; Georgian falls through to Noto Sans Georgian. */
        sans: ['var(--font-latin-sans)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        /** The same family; `.font-display` (globals.css) makes it heavy and tight. */
        display: ['var(--font-latin-sans)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['clamp(3.25rem, 8.6vw, 9rem)', { lineHeight: '0.9', letterSpacing: '-0.055em' }],
        'display-lg': ['clamp(2.5rem, 6vw, 5.5rem)', { lineHeight: '0.94', letterSpacing: '-0.05em' }],
        'display-md': ['clamp(2rem, 4vw, 3.5rem)', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '16px',
        '2xl': '24px',
        '3xl': '32px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 11, 12, 0.04), 0 10px 28px -12px rgba(11, 11, 12, 0.10)',
        cardHover: '0 2px 6px rgba(11, 11, 12, 0.05), 0 24px 48px -16px rgba(11, 11, 12, 0.20)',
        glass: '0 1px 0 rgba(255,255,255,0.7) inset, 0 12px 36px -8px rgba(11, 11, 12, 0.14)',
        float: '0 28px 64px -24px rgba(11, 11, 12, 0.34)',
        /** The hard offset of a sticker: a lime or black block that sits on the page. */
        pop: '4px 4px 0 0 #0B0B0C',
      },
      backgroundImage: {
        'radial-warm': 'radial-gradient(900px 520px at 10% 0%, rgba(200,241,53,0.22), transparent 60%), radial-gradient(820px 520px at 94% 12%, rgba(185,166,255,0.24), transparent 62%)',
        /** The drawing sheet's dots, for empty stages and quiet bands. */
        dots: 'radial-gradient(rgba(11,11,12,0.10) 1px, transparent 1px)',
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
        countdown: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        shake: { '0%, 100%': { transform: 'translateX(0)' }, '20%, 60%': { transform: 'translateX(-6px)' }, '40%, 80%': { transform: 'translateX(6px)' } },
        pop: { '0%': { transform: 'scale(0.6)', opacity: '0' }, '60%': { transform: 'scale(1.12)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
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
        /** A bar filling while a page waits to move on (the checkout's thank-you); set its length with `animation-duration`. */
        countdown: 'countdown 4s linear forwards',
        /** A wrong answer, once (the plan-reading game's room). */
        shake: 'shake 0.4s ease-in-out',
        /** Something just landed, once (a piece placed in the game's room, the points it won). */
        pop: 'pop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
