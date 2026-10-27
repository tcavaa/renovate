import type { Config } from 'tailwindcss';

/**
 * Design tokens — the PLAYCE palette ("Play with your place").
 *
 * Sand paper, stone, wood, terracotta, olive and charcoal, taken from the brand board: a warm
 * sand page, charcoal ink, terracotta (`brand`) as the one loud colour, olive for the dark
 * bands and the quiet second action, wood (`accent`) for warmth. Corners are soft — cards,
 * panels and pictures are gently rounded and buttons are pills, like the brand's app icons and
 * arches. Shadows are low and warm. Headings use the serif; display type is the airy,
 * wide-tracked sans of the wordmark.
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
        /** Terracotta — the brand's one loud colour: primary actions, links, what is picked. */
        brand: {
          DEFAULT: '#B5462B',
          dark: '#963820',
          50: '#FAF0EB',
          100: '#F4DED4',
          200: '#E9BBA9',
          300: '#DA937B',
          400: '#C76B51',
          500: '#B5462B',
          600: '#963820',
          700: '#762C19',
          800: '#552013',
          900: '#35140C',
        },
        /** Wood — warmth beside the terracotta. */
        accent: { DEFAULT: '#A8784E', dark: '#8A6039' },
        olive: { DEFAULT: '#34402F', dark: '#252E21', light: '#5D6B52', soft: '#E7E9E1' },
        stone: { DEFAULT: '#CDC5B9', dark: '#A99F92', light: '#E3DDD3' },
        wood: { DEFAULT: '#A8784E', dark: '#7E5734', light: '#CBA680' },
        charcoal: '#1E1F23',
        /** The second solid colour of the buttons (`variant="secondary"`) — olive now. */
        slate: { deep: '#34402F' },
        bg: { base: '#F3EEE6', surface: '#FFFDF9', deep: '#2C3627' },
        sand: { DEFAULT: '#E9E1D5', dark: '#D7CCBC', light: '#F1EBE2' },
        ink: { DEFAULT: '#1E1F23', muted: '#6E675E', soft: '#3B3833', faint: '#A69E93' },
        line: '#E2D9CC',
        success: '#3F7D4E',
        warning: '#C98A2B',
        danger: '#B42318',
      },
      fontFamily: {
        /** Latin and Cyrillic from the brand faces; Georgian falls through to Noto. */
        sans: ['var(--font-latin-sans)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-latin-serif)', 'var(--font-serif)', 'Georgia', 'serif'],
      },
      fontSize: {
        'display-xl': ['clamp(3.25rem, 9.5vw, 10rem)', { lineHeight: '0.92', letterSpacing: '-0.035em' }],
        'display-lg': ['clamp(2.5rem, 6vw, 5.5rem)', { lineHeight: '0.98', letterSpacing: '-0.03em' }],
        'display-md': ['clamp(2rem, 4vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(30, 31, 35, 0.04), 0 8px 24px -8px rgba(60, 45, 30, 0.10)',
        cardHover: '0 2px 6px rgba(30, 31, 35, 0.05), 0 22px 44px -14px rgba(60, 45, 30, 0.22)',
        glass: '0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 40px rgba(60, 45, 30, 0.12)',
        float: '0 28px 60px -22px rgba(40, 30, 20, 0.38)',
      },
      backgroundImage: {
        'radial-warm': 'radial-gradient(1100px 600px at 12% 0%, rgba(181,70,43,0.09), transparent 60%), radial-gradient(900px 520px at 92% 18%, rgba(168,120,78,0.12), transparent 62%)',
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
