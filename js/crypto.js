// Cifrado de los datos de cada perfil.
// El PIN se convierte en una llave AES-256 con PBKDF2; los datos se guardan cifrados con AES-GCM.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const bytesAleatorios = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function derivarLlave(pin, sal) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: 200000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function cifrar(llave, objeto) {
  const iv = bytesAleatorios(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, enc.encode(JSON.stringify(objeto)));
  return { iv, ct };
}

// Lanza error si el PIN (la llave) es incorrecto.
export async function descifrar(llave, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, llave, ct);
  return JSON.parse(dec.decode(pt));
}
