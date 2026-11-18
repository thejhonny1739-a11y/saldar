// Sincronización en la nube (opcional), cifrada de punta a punta.
// De la contraseña larga se derivan: un id, un token (para entrar al servidor) y la llave AES.
// El servidor (Cloudflare Worker) solo ve bytes cifrados. La contraseña no se guarda: se guardan los valores derivados.
import { migrar } from './store.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const SAL = enc.encode('saldar-nube-v1');
export const MIN_CLAVE = 12;

const aHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const aB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

export const urlValida = (u) => /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(String(u || '').trim());
const baseUrl = (u) => String(u).trim().replace(/\/+$/, '');

// Contraseña -> { id, token, llave } (hex). 400 000 vueltas de PBKDF2: tarda un par de segundos a propósito.
export async function derivar(clave) {
  const base = await crypto.subtle.importKey('raw', enc.encode(clave.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: SAL, iterations: 400000, hash: 'SHA-256' }, base, 512));
  return { id: aHex(bits.slice(0, 16)), token: aHex(bits.slice(16, 32)), llave: aHex(bits.slice(32, 64)) };
}

const importarLlave = (hex) => crypto.subtle.importKey('raw', deHex(hex), 'AES-GCM', false, ['encrypt', 'decrypt']);

// Lo que sube: el estado SIN la configuración de la nube de este dispositivo.
function paraSubir(estado) {
  const c = JSON.parse(JSON.stringify(estado));
  if (c.ajustes) delete c.ajustes.nube;
  return c;
}

async function cifrarNube(llaveHex, estado) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importarLlave(llaveHex), enc.encode(JSON.stringify(paraSubir(estado))));
  return { iv: aB64(iv), ct: aB64(new Uint8Array(ct)) };
}

async function descifrarNube(llaveHex, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await importarLlave(llaveHex), deB64(ct));
  return JSON.parse(dec.decode(pt));
}

async function llamar(n, metodo, cuerpo) {
  let r;
  try {
    r = await fetch(`${baseUrl(n.url)}/b/${n.id}`, {
      method: metodo, headers: { 'X-Token': n.token, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
  } catch { throw new Error('sin-conexion'); }
  let datos = null;
  try { datos = await r.json(); } catch { /* sin cuerpo */ }
  return { estado: r.status, datos };
}

export const configurada = (estado) => !!(estado.ajustes && estado.ajustes.nube && estado.ajustes.nube.id);

// Conecta este dispositivo. Si en la nube ya hay datos, devuelve { remoto: true } y NO sobrescribe nada todavía.
export async function conectar(sesion, url, clave) {
  if (!urlValida(url)) throw new Error('La dirección debe empezar con https://');
  if (clave.length < MIN_CLAVE) throw new Error(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`);
  const k = await derivar(clave);
  const n = { url: baseUrl(url), ...k, rev: 0, sucio: true, ultima: 0 };
  const r = await llamar(n, 'GET');
  if (r.estado === 403) throw new Error('Esa contraseña no corresponde a los datos de la nube (o el token no coincide).');
  if (r.estado !== 404 && r.estado !== 200) throw new Error('El servidor no respondió como se esperaba. Revisa la dirección.');
  return { nube: n, existe: r.estado === 200 };
}

export function desconectar(estado) { delete estado.ajustes.nube; }

// Sincroniza. `sesion.estado.ajustes.nube` debe existir. Devuelve:
//  { accion: 'nada'|'subido'|'bajado'|'conflicto'|'error', mensaje? }
// `guardarLocal()` persiste el estado en el teléfono.
let contador = 0;
export const marcarCambio = () => { contador++; };

export async function sincronizar(sesion, guardarLocal, { resolver = null } = {}) {
  const e = sesion.estado;
  const n = e.ajustes.nube;
  if (!n) return { accion: 'nada' };
  try {
    const r = await llamar(n, 'GET');
    if (r.estado === 403) return { accion: 'error', mensaje: 'La nube rechazó la contraseña.' };
    if (r.estado !== 200 && r.estado !== 404) return { accion: 'error', mensaje: 'El servidor no respondió bien.' };
    const remotoRev = r.estado === 200 ? r.datos.rev : 0;

    const bajar = async () => {
      const remoto = migrar(await descifrarNube(n.llave, r.datos));
      remoto.ajustes.nube = { ...n, rev: remotoRev, sucio: false, ultima: Date.now() };
      sesion.estado = remoto;
      await guardarLocal();
      return { accion: 'bajado' };
    };
    const subir = async (base) => {
      const mio = contador;
      const cuerpo = { base, ...(await cifrarNube(n.llave, e)) };
      const w = await llamar(n, 'PUT', cuerpo);
      if (w.estado === 409) return { accion: 'conflicto' };
      if (w.estado !== 200) return { accion: 'error', mensaje: 'No se pudo subir a la nube.' };
      n.rev = w.datos.rev; n.ultima = Date.now(); n.sucio = contador !== mio;
      await guardarLocal();
      return { accion: 'subido' };
    };

    if (r.estado === 404) return n.sucio || n.rev ? await subir(0) : { accion: 'nada' };
    if (remotoRev === n.rev) return n.sucio ? await subir(remotoRev) : { accion: 'nada' };
    if (remotoRev > n.rev) {
      if (!n.sucio) return await bajar();
      if (resolver === 'nube') return await bajar();
      if (resolver === 'local') return await subir(remotoRev);
      return { accion: 'conflicto' };
    }
    // remotoRev < n.rev: la nube se reinició; se vuelve a subir lo de este dispositivo.
    return await subir(remotoRev);
  } catch (err) {
    if (err.message === 'sin-conexion') return { accion: 'error', mensaje: 'Sin conexión. Se sincroniza cuando vuelva.' };
    return { accion: 'error', mensaje: 'No se pudo sincronizar.' };
  }
}
