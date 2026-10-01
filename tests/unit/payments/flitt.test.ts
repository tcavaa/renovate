import { describe, expect, it } from 'vitest';
import {
  cardLast4,
  flittFacts,
  flittOutcome,
  flittResponseOf,
  flittSignature,
  isFinalStatus,
  signatureString,
  storedPayload,
  verifyFlittSignature,
} from '@/lib/payments/flitt';

/**
 * Flitt's protocol as docs.flitt.com documents it (`api/building-signature.md`,
 * `api/callbacks.md`). The documentation's sample hashes do not match its own sample strings,
 * so the strings are what is pinned here; that the hashes are right was proved against Flitt's
 * sandbox, which refuses a wrong one (error 1014) and whose answers verify (docs/payments.md).
 */

/** Flitt's documented callback, with `test` (the sandbox key) where its hint masks it. */
const CALLBACK = {
  rrn: '111111111111',
  masked_card: '444455XXXXXX1111',
  sender_cell_phone: '',
  sender_account: '',
  currency: 'GEL',
  fee: '',
  reversal_amount: '0',
  settlement_amount: '0',
  actual_amount: '200',
  response_description: '',
  sender_email: 'test@test.com',
  order_status: 'approved',
  response_status: 'success',
  order_time: '13.07.2024 01:23:59',
  actual_currency: 'GEL',
  order_id: 'test33694502191',
  tran_type: 'purchase',
  eci: '5',
  settlement_date: '',
  payment_system: 'card',
  approval_code: '123456',
  merchant_id: 1549901,
  settlement_currency: '',
  payment_id: 805243692,
  card_bin: 444455,
  response_code: '',
  card_type: 'VISA',
  amount: '200',
  product_id: '',
  merchant_data: 'Test merchant data',
  rectoken: '',
  rectoken_lifetime: '',
  verification_status: '',
  parent_order_id: '',
  fee_oplata: '0',
  additional_info:
    '{"capture_status": null, "capture_amount": null, "reservation_data": "{}", "transaction_id": 1994930931, "bank_response_code": null, "bank_response_description": null, "client_fee": 0.0, "settlement_fee": 0.0, "bank_name": null, "bank_country": null, "card_type": "VISA", "card_product": "empty_visa", "card_category": null, "timeend": "13.07.2024 01:24:08", "ipaddress_v4": "178.54.60.26", "payment_method": "card", "version_3ds": 1, "is_test": true}',
};

const signed = (params: Record<string, unknown>, secret = 'test') => ({ ...params, signature: flittSignature(secret, params) });

describe('the signature', () => {
  it('signs the documented request in the documented order', () => {
    const request = { server_callback_url: 'http://myshop/callback/', order_id: 'TestOrder2', currency: 'GEL', merchant_id: 1549901, order_desc: 'Test payment', amount: 1000 };
    expect(signatureString('test', request)).toBe('test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/');
  });

  it("builds the documented callback's string: empty values out, zeros in, the signature and its hint never", () => {
    const hint = { ...CALLBACK, signature: 'x'.repeat(40), response_signature_string: '**********|…' };
    const expected =
      `test|200|GEL|${CALLBACK.additional_info}|200|123456|444455|VISA|GEL|5|0|444455XXXXXX1111|Test merchant data|1549901|test33694502191|approved|13.07.2024 01:23:59|805243692|card|success|0|111111111111|test@test.com|0|purchase`;
    expect(signatureString('test', hint)).toBe(expected);
  });

  it('is lower-case SHA-1 hex', () => {
    expect(flittSignature('test', { amount: 100 })).toMatch(/^[0-9a-f]{40}$/);
  });

  it('signs Georgian text as UTF-8', () => {
    const a = flittSignature('test', { order_desc: 'რემონტი.ge — 3D დიზაინი' });
    const b = flittSignature('test', { order_desc: 'რემონტი.ge — 3D დიზაინი ' });
    expect(a).not.toBe(b);
  });

  it('verifies an answer signed with our key, whatever the case of the hex', () => {
    const answer = signed(CALLBACK);
    expect(verifyFlittSignature('test', answer)).toBe(true);
    expect(verifyFlittSignature('test', { ...answer, signature: answer.signature.toUpperCase() })).toBe(true);
  });

  it('refuses a changed amount, another key, and no signature at all', () => {
    const answer = signed(CALLBACK);
    expect(verifyFlittSignature('test', { ...answer, amount: '20000' })).toBe(false);
    expect(verifyFlittSignature('other-key', answer)).toBe(false);
    expect(verifyFlittSignature('test', CALLBACK)).toBe(false);
    expect(verifyFlittSignature('test', { ...CALLBACK, signature: 'not-a-hash' })).toBe(false);
  });
});

describe('reading an answer', () => {
  it('unwraps the API\'s `response` and takes a callback as it comes', () => {
    expect(flittResponseOf({ response: { order_id: 'a' } })).toEqual({ order_id: 'a' });
    expect(flittResponseOf({ order_id: 'b' })).toEqual({ order_id: 'b' });
    expect(flittResponseOf(null)).toBeNull();
    expect(flittResponseOf([1, 2])).toBeNull();
    expect(flittResponseOf('order_id=c')).toBeNull();
  });

  it('keeps the card, the money and the bank references, money in GEL', () => {
    expect(flittFacts(CALLBACK)).toEqual({
      paymentId: '805243692',
      maskedCard: '444455XXXXXX1111',
      cardType: 'VISA',
      cardBin: '444455',
      paymentSystem: 'card',
      actualAmount: 2,
      actualCurrency: 'GEL',
      reversalAmount: 0,
      rrn: '111111111111',
      approvalCode: '123456',
      orderTime: '13.07.2024 01:23:59',
      responseCode: null,
      responseDescription: null,
    });
  });

  it('names a wallet by additional_info and counts a refund', () => {
    const wallet = flittFacts({ ...CALLBACK, additional_info: '{"payment_method": "googlepay"}', reversal_amount: '150' });
    expect(wallet.paymentSystem).toBe('googlepay');
    expect(wallet.reversalAmount).toBe(1.5);
    expect(flittFacts({ ...CALLBACK, additional_info: 'not json', actual_amount: '' }).actualAmount).toBeNull();
  });

  it('keeps everything but the signing hint', () => {
    const kept = storedPayload({ ...CALLBACK, signature: 'abc', response_signature_string: 'hint' });
    expect(kept.signature).toBe('abc');
    expect('response_signature_string' in kept).toBe(false);
    expect(kept.order_id).toBe(CALLBACK.order_id);
  });

  it('reads the last four digits off a masked card', () => {
    expect(cardLast4('444455XXXXXX1111')).toBe('1111');
    expect(cardLast4(null)).toBeNull();
    expect(cardLast4('XXXX')).toBeNull();
  });
});

describe('an answer against the payment it is about', () => {
  const expected = { orderId: 'test33694502191', merchantId: 1549901, amount: 200, currency: 'GEL' };

  it('approves the order asked for, at the amount asked for', () => {
    const outcome = flittOutcome(CALLBACK, expected);
    expect(outcome.ok && outcome.status).toBe('approved');
  });

  it('refuses another order, another merchant, an unknown status', () => {
    expect(flittOutcome(CALLBACK, { ...expected, orderId: 'other' })).toEqual({ ok: false, reason: 'order' });
    expect(flittOutcome(CALLBACK, { ...expected, merchantId: 1 })).toEqual({ ok: false, reason: 'merchant' });
    expect(flittOutcome({ ...CALLBACK, order_status: 'paid' }, expected)).toEqual({ ok: false, reason: 'status' });
  });

  it('is no approval for less money, or in another currency', () => {
    expect(flittOutcome(CALLBACK, { ...expected, amount: 20000 })).toEqual({ ok: false, reason: 'amount' });
    expect(flittOutcome({ ...CALLBACK, currency: 'USD' }, expected)).toEqual({ ok: false, reason: 'currency' });
  });

  it('takes a decline whatever its amount, with the bank\'s words', () => {
    const outcome = flittOutcome({ ...CALLBACK, order_status: 'declined', amount: '1', response_code: 1000, response_description: 'General decline' }, expected);
    expect(outcome).toMatchObject({ ok: true, status: 'declined', responseCode: '1000', responseDescription: 'General decline' });
  });

  it('knows which statuses are settled', () => {
    expect(isFinalStatus('created')).toBe(false);
    expect(isFinalStatus('processing')).toBe(false);
    expect(isFinalStatus('approved')).toBe(true);
    expect(isFinalStatus('declined')).toBe(true);
  });
});
