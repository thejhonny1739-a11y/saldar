// Almacenamiento local (IndexedDB). Cada perfil guarda un solo bloque cifrado con su PIN.
import { bytesAleatorios, derivarLlave, cifrar, descifrar } from './crypto.js';
import { categoriasBase, espaciosBase } from './compromisos.js';

const DB_NOMBRE = 'saldar';
const DB_VERSION = 1;

export const estadoInicial = () => ({
  version: 1,
  deudas: [],
  pagos: [],
  compras: [],
  sinEntender: [],
  capturasVistas: [],
  aprendido: { comercios: {} },
  compromisos: [],
  categorias: categoriasBase(),
  espacios: espaciosBase(),
  ajustes: { moneda: 'COP', ultimoRespaldo: null, recordatorio: { diasAntes: 1, hora: 9 }, espacioActivo: 'personal', categoriasV2: true }
});

const NOMBRE_A_ID = { Comida: 'alimentacion', Supermercado: 'alimentacion', Transporte: 'transporte', Servicios: 'servicios', Salud: 'salud', Ropa: 'ropa', Entretenimiento: 'ocio', Hogar: 'hogar', 'Tecnología': 'tecnologia', Otros: 'otros' };

// Completa campos que falten en datos guardados por versiones anteriores.
// Nunca borra nada: solo agrega lo nuevo. Así actualizar la app no pierde información.
export function migrar(estado) {
  const base = estadoInicial();
  const e = { ...base, ...estado };
  e.deudas = Array.isArray(e.deudas) ? e.deudas : [];
  e.pagos = Array.isArray(e.pagos) ? e.pagos : [];
  e.compras = Array.isArray(e.compras) ? e.compras : [];
  e.sinEntender = Array.isArray(e.sinEntender) ? e.sinEntender : [];
  e.capturasVistas = Array.isArray(e.capturasVistas) ? e.capturasVistas : [];
  e.aprendido = { comercios: {}, ...(e.aprendido || {}) };
  e.ajustes = { ...base.ajustes, ...(estado.ajustes || {}) };
  e.ajustes.recordatorio = { ...base.ajustes.recordatorio, ...(e.ajustes.recordatorio || {}) };
  e.compromisos = Array.isArray(e.compromisos) ? e.compromisos : [];
  e.compromisos.forEach((c) => { if (!c.cumplidos || typeof c.cumplidos !== 'object') c.cumplidos = {}; });
  if (!Array.isArray(e.categorias) || e.categorias.length === 0) e.categorias = categoriasBase();
  for (const k of categoriasBase()) if (['otros', 'otros-ing'].includes(k.id) && !e.categorias.some((x) => x.id === k.id)) e.categorias.push(k);
  if (!Array.isArray(e.espacios) || e.espacios.length === 0) e.espacios = espaciosBase();
  if (!e.espacios.some((x) => x.id === e.ajustes.espacioActivo)) e.ajustes.espacioActivo = e.espacios[0].id;
  e.compromisos.forEach((c) => { if (!e.espacios.some((x) => x.id === c.espacioId)) c.espacioId = e.espacios[0].id; });
  // Una sola vez: categorías unificadas entre compras y compromisos.
  if (!(estado.ajustes && estado.ajustes.categoriasV2)) {
    for (const k of categoriasBase()) if (!e.categorias.some((x) => x.id === k.id) && ['ropa', 'hogar', 'tecnologia'].includes(k.id)) e.categorias.push(k);
    const ids = new Set(e.categorias.map((k) => k.id));
    const aId = (v) => (ids.has(v) ? v : NOMBRE_A_ID[v] || 'otros');
    e.compras.forEach((c) => { c.categoria = aId(c.categoria); });
    Object.keys(e.aprendido.comercios).forEach((k) => { e.aprendido.comercios[k] = aId(e.aprendido.comercios[k]); });
  }
  e.ajustes.categoriasV2 = true;
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
  await guardarCopiaDiaria(p);
  return { id: p.id, nombre: p.nombre, llave, estado };
}

/* ================= Copias automáticas ================= */
// Cada día (al abrir con el PIN) se guarda dentro del teléfono una copia cifrada del estado anterior.
// Sirven para deshacer errores; no reemplazan el respaldo en Archivos/iCloud (si pierdes el teléfono, se pierden).
const DIA_MS = 86400000;
const MAX_COPIAS = 7;

async function guardarCopiaDiaria(p) {
  try {
    const copias = Array.isArray(p.copias) ? [...p.copias] : [];
    const ult = copias[copias.length - 1];
    if (ult && Date.now() - ult.f < DIA_MS) return;
    copias.push({ f: Date.now(), iv: p.iv, ct: p.ct });
    while (copias.length > MAX_COPIAS) copias.shift();
    await tx('readwrite', (s) => s.put({ ...p, copias }));
  } catch { /* si falla, no se bloquea el acceso */ }
}

export async function listarCopias(id) {
  const p = await leerPerfil(id);
  return ((p && p.copias) || []).map((c) => ({ f: c.f })).sort((a, b) => b.f - a.f);
}

// Vuelve a una copia. Antes guarda el estado actual como copia, para poder volver atrás.
export async function restaurarCopia(id, f) {
  const p = await leerPerfil(id);
  const c = p && (p.copias || []).find((x) => x.f === f);
  if (!c) throw new Error('Copia no encontrada');
  const copias = [...p.copias, { f: Date.now(), iv: p.iv, ct: p.ct }].slice(-MAX_COPIAS);
  await tx('readwrite', (s) => s.put({ ...p, iv: c.iv, ct: c.ct, copias }));
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
