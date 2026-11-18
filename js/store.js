// Almacenamiento local (IndexedDB). Cada perfil guarda un solo bloque cifrado con su PIN.
import { bytesAleatorios, derivarLlave, cifrar, descifrar } from './crypto.js';

const DB_NOMBRE = 'saldar';
const DB_VERSION = 1;

export const estadoInicial = () => ({
  version: 1,
  deudas: [],
  pagos: [],
  compras: [],
  sinEntender: [],
  aprendido: { comercios: {} },
  ajustes: { moneda: 'COP', ultimoRespaldo: null, recordatorio: { diasAntes: 1, hora: 9 } }
});

// Completa campos que falten en datos guardados por versiones anteriores.
// Nunca borra nada: solo agrega lo nuevo. Así actualizar la app no pierde información.
export function migrar(estado) {
  const base = estadoInicial();
  const e = { ...base, ...estado };
  e.deudas = Array.isArray(e.deudas) ? e.deudas : [];
  e.pagos = Array.isArray(e.pagos) ? e.pagos : [];
  e.compras = Array.isArray(e.compras) ? e.compras : [];
  e.sinEntender = Array.isArray(e.sinEntender) ? e.sinEntender : [];
  e.aprendido = { comercios: {}, ...(e.aprendido || {}) };
  e.ajustes = { ...base.ajustes, ...(estado.ajustes || {}) };
  e.ajustes.recordatorio = { ...base.ajustes.recordatorio, ...(e.ajustes.recordatorio || {}) };
  e.deudas.forEach((d) => { if (!Array.isArray(d.historial)) d.historial = []; });
  return e;
}

function abrirDB() {
  return new Promise((ok, fallo) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('perfiles')) db.createObjectStore('perfiles', { keyPath: 'id' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fallo(req.error);
  });
}

async function tx(modo, fn) {
  const db = await abrirDB();
  return new Promise((ok, fallo) => {
    const t = db.transaction('perfiles', modo);
    const store = t.objectStore('perfiles');
    const res = fn(store);
    t.oncomplete = () => { db.close(); ok(res && 'result' in res ? res.result : undefined); };
    t.onerror = () => { db.close(); fallo(t.error); };
    t.onabort = () => { db.close(); fallo(t.error); };
  });
}

// Lista solo nombre e id; nunca expone datos.
export async function listarPerfiles() {
  const todos = await tx('readonly', (s) => s.getAll());
  return (todos || [])
    .map(({ id, nombre, creado }) => ({ id, nombre, creado }))
    .sort((a, b) => a.creado - b.creado);
}

async function leerPerfil(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function crearPerfil(nombre, pin) {
  const id = crypto.randomUUID();
  const sal = bytesAleatorios(16);
  const llave = await derivarLlave(pin, sal);
  const estado = estadoInicial();
  const { iv, ct } = await cifrar(llave, estado);
  await tx('readwrite', (s) => s.put({ id, nombre, creado: Date.now(), sal, iv, ct }));
  return { sesion: { id, nombre, llave, estado } };
}

// Devuelve la sesión si el PIN es correcto; lanza error si no.
export async function desbloquear(id, pin) {
  const p = await leerPerfil(id);
  if (!p) throw new Error('Perfil no encontrado');
  const llave = await derivarLlave(pin, p.sal);
  const estado = migrar(await descifrar(llave, { iv: p.iv, ct: p.ct }));
  return { id: p.id, nombre: p.nombre, llave, estado };
}

export async function guardar(sesion) {
  const p = await leerPerfil(sesion.id);
  if (!p) throw new Error('Perfil no encontrado');
  const { iv, ct } = await cifrar(sesion.llave, sesion.estado);
  await tx('readwrite', (s) => s.put({ ...p, iv, ct }));
}

export async function eliminarPerfil(id) {
  await tx('readwrite', (s) => s.delete(id));
}

// Pide al navegador que no borre los datos si hay poco espacio.
export async function pedirPersistencia() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

/* ================= Respaldo ================= */
// El respaldo es el bloque YA CIFRADO con el PIN del perfil: quien tenga el archivo no puede leerlo sin el PIN.

const aB64 = (u8) => {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
};
const deB64 = (txt) => Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));

export async function exportarPerfil(id) {
  const p = await leerPerfil(id);
  if (!p) throw new Error('Perfil no encontrado');
  return {
    formato: 'saldar-respaldo',
    version: 1,
    exportado: Date.now(),
    perfil: { id: p.id, nombre: p.nombre, creado: p.creado, sal: aB64(p.sal), iv: aB64(new Uint8Array(p.iv)), ct: aB64(new Uint8Array(p.ct)) }
  };
}

// Valida el archivo y lo guarda. Devuelve { id, nombre, existia }.
export async function importarPerfil(obj, reemplazar = false) {
  const pr = obj && obj.formato === 'saldar-respaldo' && obj.perfil;
  if (!pr || !pr.id || !pr.nombre || !pr.sal || !pr.iv || !pr.ct) throw new Error('Este archivo no es un respaldo de Saldar.');
  const sal = deB64(pr.sal);
  const iv = deB64(pr.iv);
  const ct = deB64(pr.ct);
  if (sal.length !== 16 || iv.length !== 12 || ct.length < 17) throw new Error('El respaldo está dañado.');
  const existe = await leerPerfil(pr.id);
  if (existe && !reemplazar) return { id: pr.id, nombre: pr.nombre, existia: true, pendiente: true };
  await tx('readwrite', (st) => st.put({ id: pr.id, nombre: pr.nombre, creado: pr.creado || Date.now(), sal, iv, ct }));
  return { id: pr.id, nombre: pr.nombre, existia: !!existe };
}
