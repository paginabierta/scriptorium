// Cifrado del espacio Privado: AES-GCM de 256 bits con una clave derivada de tu contraseña (PBKDF2).
// La contraseña nunca se guarda ni viaja a Drive: solo viaja el texto cifrado.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 310000;

export function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function newSalt() { return toB64(crypto.getRandomValues(new Uint8Array(16))); }

export async function deriveKey(password, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), data: toB64(data) };
}

export async function decryptJSON(key, { iv, data }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(data));
  return JSON.parse(dec.decode(plain));
}
