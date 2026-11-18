// Almacenamiento local (IndexedDB). Cada perfil guarda un solo bloque cifrado con su PIN.
import { bytesAleatorios, derivarLlave, cifrar, descifrar } from './crypto.js';

const DB_NOMBRE = 'saldar';
const DB_VERSION = 1;

export const estadoInicial = () => ({
  version: 1,
  deudas: [],
  pagos: [],
  compras: [],
  ajustes: { moneda: 'COP' }
});

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
  const estado = await descifrar(llave, { iv: p.iv, ct: p.ct });
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
