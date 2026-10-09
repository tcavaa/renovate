'use client';

import { useEffect, useRef } from 'react';

/**
 * Flitt's embedded payment form (docs/payments.md): Flitt's own `checkout.js` and its styles,
 * from pay.flitt.com, mounted into this element with the token the server made the order with —
 * the amount, the currency and the description are the server's, nothing here can change them.
 * The card is typed into Flitt's form and goes to Flitt; 3-D Secure opens in Flitt's own window
 * over the page.
 *
 * The form's "success" is only a hint: the dialogue then asks the server, which asks Flitt for
 * the signed status, before anything counts as paid.
 */

const SCRIPT_URL = 'https://pay.flitt.com/latest/checkout-vue/checkout.js';
const STYLE_URL = 'https://pay.flitt.com/latest/checkout-vue/checkout.css';

interface FlittApp {
  $on(event: 'success' | 'error' | 'ready', handler: (model: unknown) => void): void;
  $destroy(): void;
  $el?: Element;
}

declare global {
  interface Window {
    checkout?: (el: Element | string, config: Record<string, unknown>) => FlittApp;
  }
}

const APPLE_PAY_SDK = 'https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js';

let loading: Promise<void> | null = null;

/**
 * Flitt's SDK always loads Apple's Pay SDK to ask whether Apple Pay is there, and on a page
 * that is not https Apple's answer is an uncaught "Trying to start an Apple Pay session from an
 * insecure document" (a developer's http://….localhost). Flitt skips a wallet script the page
 * already has, and a `text/plain` script is never fetched nor run — so off https an inert
 * placeholder stands in for Apple's, and Flitt finds no Apple Pay. On https nothing changes.
 */
function keepApplePayOffInsecurePages() {
  if (window.location.protocol === 'https:' || document.querySelector(`script[src="${APPLE_PAY_SDK}"]`)) return;
  const placeholder = document.createElement('script');
  placeholder.type = 'text/plain';
  placeholder.src = APPLE_PAY_SDK;
  document.head.appendChild(placeholder);
}

/** Flitt's script and styles, once per page load; a failed load can be tried again. */
function loadFlitt(): Promise<void> {
  if (typeof window.checkout === 'function') return Promise.resolve();
  keepApplePayOffInsecurePages();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      if (!document.querySelector(`link[href="${STYLE_URL}"]`)) {
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = STYLE_URL;
        document.head.appendChild(style);
      }
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (typeof window.checkout === 'function' ? resolve() : reject(new Error('flitt-missing')));
      script.onerror = () => {
        script.remove();
        reject(new Error('flitt-load-failed'));
      };
      document.head.appendChild(script);
    }).catch((e: unknown) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/** The decline's words the form gives, when it gives any. */
function errorMessage(model: unknown): string | null {
  const m = model as { attr?: (path: string) => unknown; error?: { message?: unknown } } | null;
  const text = (typeof m?.attr === 'function' ? m.attr('error.message') : null) ?? m?.error?.message;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

export function FlittCheckout({
  token,
  onReady,
  onSuccess,
  onError,
  onLoadFailed,
}: {
  /** From `POST /api/payments/flitt`: the order Flitt made for this payment. */
  token: string;
  onReady?: () => void;
  onSuccess: () => void;
  onError: (message: string | null) => void;
  onLoadFailed: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The latest handlers, without remounting the form when the parent re-renders.
  const handlers = useRef({ onReady, onSuccess, onError, onLoadFailed });
  useEffect(() => {
    handlers.current = { onReady, onSuccess, onError, onLoadFailed };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let app: FlittApp | null = null;
    let cancelled = false;
    // Flitt's app replaces the element it is given, so it gets one of its own — never React's.
    const mount = document.createElement('div');
    host.appendChild(mount);

    loadFlitt()
      .then(() => {
        if (cancelled || !window.checkout) return;
        app = window.checkout(mount, {
          options: {
            methods: ['card'],
            methods_disabled: [],
            // Apple Pay works on https only (the live site); Google Pay on both.
            wallet_methods_enabled: window.location.protocol === 'https:' ? ['apple', 'google'] : ['google'],
            // "I accept the terms" under the button links to ours.
            offerta_url: `${window.location.origin}/terms`,
            card_icons: ['mastercard', 'visa'],
            active_tab: 'card',
            full_screen: false,
            show_title: false,
            show_link: false,
            // The dialogue's own bill says what is paid; the pay button still carries the amount.
            show_amount: false,
            show_order_desc: false,
            show_lang: false,
            show_email: false,
            show_menu_first: false,
            locales: ['ka', 'en', 'ru'],
            theme: { type: 'light', preset: 'black' },
          },
          // The order is the server's: its amount, currency and language came with the token.
          params: { token },
          css_variable: { border_radius: 10 },
        });
        app.$on('ready', () => handlers.current.onReady?.());
        app.$on('success', () => handlers.current.onSuccess());
        app.$on('error', (model) => handlers.current.onError(errorMessage(model)));
      })
      .catch(() => {
        if (!cancelled) handlers.current.onLoadFailed();
      });

    return () => {
      cancelled = true;
      try {
        app?.$destroy();
        app?.$el?.remove();
      } catch {
        // A form torn down mid-payment has nothing left worth keeping.
      }
      mount.remove();
      host.replaceChildren();
    };
  }, [token]);

  // `data-sentry-block`: Flitt's form is a script in this page, not another origin's iframe, so
  // Sentry's Replay would see its card fields. Blocked, the element is recorded as an empty box.
  return <div ref={hostRef} data-sentry-block className="flitt-checkout min-h-[18rem]" />;
}
