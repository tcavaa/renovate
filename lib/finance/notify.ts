import { env } from '@/lib/env';
import { sendMail } from '@/lib/email';
import { log } from '@/lib/log';
import { formatGEL } from '@/lib/utils';
import { ka } from '@/lib/i18n/ka';
import type { OrderLineDraft } from './money';

/**
 * The mails the marketplace sends. Plain text, Georgian, and never fatal: an order that was
 * written but not announced is a logged problem, an order lost because SMTP was down would
 * be a much worse one. With `MAIL_DRIVER=log` (development) the text lands in the app log.
 */
export interface CustomerContact {
  name: string;
  phone: string;
  email: string | null;
  note: string | null;
}

function linesText(lines: Array<Pick<OrderLineDraft, 'nameKa' | 'qty' | 'unit' | 'total' | 'roomName'>>): string {
  return lines
    .map((l) => `  • ${l.nameKa}${l.roomName ? ` (${l.roomName})` : ''} — ${l.qty} ${l.unit} — ${formatGEL(l.total)}`)
    .join('\n');
}

export async function notifyPartnerNewOrder(args: {
  email: string | null | undefined;
  partnerName: string;
  orderId: number;
  customer: CustomerContact;
  lines: Array<Pick<OrderLineDraft, 'nameKa' | 'qty' | 'unit' | 'total' | 'roomName'>>;
  subtotal: number;
  deliveryFee: number;
  kind: 'store' | 'worker';
}): Promise<void> {
  const url = `${env.NEXT_PUBLIC_APP_URL}/partner/orders/${args.orderId}`;
  if (!args.email) {
    log.info('order created for a partner without e-mail', { orderId: args.orderId, partner: args.partnerName });
    return;
  }
  const subject = args.kind === 'store' ? `ახალი შეკვეთა #${args.orderId} — რემონტი.ge` : `ახალი დაკვეთა #${args.orderId} — რემონტი.ge`;
  const text = [
    `${args.partnerName}, თქვენ ახალი ${args.kind === 'store' ? 'შეკვეთა' : 'დაკვეთა'} გაქვთ რემონტი.ge-დან.`,
    '',
    `მომხმარებელი: ${args.customer.name}`,
    `ტელეფონი: ${args.customer.phone}`,
    args.customer.email ? `ელ-ფოსტა: ${args.customer.email}` : null,
    args.customer.note ? `შენიშვნა: ${args.customer.note}` : null,
    '',
    args.lines.length ? 'პოზიციები:' : 'პოზიციები დასაზუსტებელია.',
    args.lines.length ? linesText(args.lines) : null,
    '',
    `სულ: ${formatGEL(args.subtotal)}${args.deliveryFee > 0 ? ` + მიწოდება ${formatGEL(args.deliveryFee)}` : ''}`,
    '',
    `შეკვეთის ნახვა, დადასტურება და პოზიციების შესწორება: ${url}`,
  ]
    .filter((line): line is string => line != null)
    .join('\n');
  try {
    await sendMail({ to: args.email, subject, text });
  } catch (e) {
    log.error('partner notification failed', { orderId: args.orderId, err: e });
  }
}

export async function notifyCustomerCheckout(args: {
  customer: CustomerContact;
  checkoutId: number;
  platformFee: number;
  orders: Array<{ id: number; partnerName: string; subtotal: number; deliveryFee: number }>;
}): Promise<void> {
  if (!args.customer.email) return;
  const text = [
    `${args.customer.name}, თქვენი შეკვეთა #${args.checkoutId} მიღებულია.`,
    '',
    ...args.orders.map((o) => `  • ${o.partnerName} — ${formatGEL(o.subtotal)}${o.deliveryFee > 0 ? ` (+ მიწოდება ${formatGEL(o.deliveryFee)})` : ''} — შეკვეთა #${o.id}`),
    '',
    `პლატფორმის მომსახურება: ${formatGEL(args.platformFee)}`,
    '',
    'თითოეული მაღაზია თავად დაგიკავშირდებათ დეტალების დასაზუსტებლად.',
    `შეკვეთების სტატუსი: ${env.NEXT_PUBLIC_APP_URL}/profile`,
  ].join('\n');
  try {
    await sendMail({ to: args.customer.email, subject: `შეკვეთა #${args.checkoutId} მიღებულია — რემონტი.ge`, text });
  } catch (e) {
    log.error('customer notification failed', { checkoutId: args.checkoutId, err: e });
  }
}

export async function notifyCustomerOrderUpdate(args: {
  email: string | null;
  customerName: string;
  orderId: number;
  partnerName: string;
  status: string;
  partnerMessage: string | null;
}): Promise<void> {
  if (!args.email) return;
  const text = [
    `${args.customerName}, ${args.partnerName}-მ განაახლა თქვენი შეკვეთა #${args.orderId}.`,
    '',
    `სტატუსი: ${(ka.orderStatus as Record<string, string>)[args.status] ?? args.status}`,
    args.partnerMessage ? `შეტყობინება: ${args.partnerMessage}` : null,
    '',
    `დეტალები: ${env.NEXT_PUBLIC_APP_URL}/profile`,
  ]
    .filter((line): line is string => line != null)
    .join('\n');
  try {
    await sendMail({ to: args.email, subject: `შეკვეთა #${args.orderId} განახლდა — რემონტი.ge`, text });
  } catch (e) {
    log.error('customer order update notification failed', { orderId: args.orderId, err: e });
  }
}
