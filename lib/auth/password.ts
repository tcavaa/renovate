/**
 * A password admin can read out or paste to a colleague: no look-alike characters (0/O, 1/l/I),
 * drawn with the platform's cryptographic random source (the browser's and Node's alike).
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword(length = 14, random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const size = Math.max(8, Math.floor(length));
  // Rejection sampling keeps every character equally likely (256 is not a multiple of 56).
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < size) {
    for (const byte of random(new Uint8Array(size * 2))) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === size) break;
    }
  }
  return out;
}
