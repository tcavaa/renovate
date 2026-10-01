import Image from 'next/image';

/**
 * The ways a card payment can be made, as the card schemes and the payment provider expect
 * them on the site (docs/payments.md): Visa, Mastercard, Apple Pay, Google Pay. The marks are
 * Flitt's own artwork (`public/payments/`), each on a white tile so they read on any background.
 */
const TILE = 'flex h-8 items-center justify-center rounded-[6px] border border-line bg-white px-2';

export function PaymentMarks({ className }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-2 ${className ?? ''}`} aria-label="Visa, Mastercard, Apple Pay, Google Pay">
      <li className={TILE}>
        <Image src="/payments/visa.svg" alt="Visa" width={44} height={15} unoptimized className="h-[14px] w-auto" />
      </li>
      <li className={TILE}>
        <Image src="/payments/mastercard.svg" alt="Mastercard" width={32} height={20} unoptimized className="h-5 w-auto" />
      </li>
      <li className={`${TILE} gap-0.5 text-[13px] font-semibold tracking-tight text-black`} aria-label="Apple Pay">
        <Image src="/payments/apple.svg" alt="" width={14} height={16} unoptimized className="h-[15px] w-auto" />
        <span aria-hidden>Pay</span>
      </li>
      <li className="flex h-8 items-center">
        <Image src="/payments/google-pay.svg" alt="Google Pay" width={60} height={32} unoptimized className="h-8 w-auto" />
      </li>
    </ul>
  );
}
