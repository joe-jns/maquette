const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 6

/** Identifiant court, aléatoire, absent de `taken`. */
export function newId(taken?: ReadonlySet<string>): string {
  for (;;) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(LENGTH))
    let id = ''
    for (const b of bytes) id += ALPHABET[b % ALPHABET.length]
    if (!taken?.has(id)) return id
  }
}
