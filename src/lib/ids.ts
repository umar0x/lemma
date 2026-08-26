const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function createId(prefix: string, rng: () => number = Math.random): string {
  let body = "";
  for (let i = 0; i < 10; i += 1) {
    body += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return `${prefix}_${body}`;
}
