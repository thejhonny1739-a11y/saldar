// Importación de las capturas que guardan los Atajos de iOS (Apple Pay, SMS o correo).
// Cada captura empieza con la marca #SALDAR# y puede tener varias líneas:
//   #SALDAR#ap|2026-11-17T10:32:00|52300|Exito Chapinero|Visa Bancolombia 4821
//   #SALDAR#msg|2026-11-17T10:32:00|<texto completo del SMS o correo>
import { leerTexto, numeroDeTexto, adivinarCategoria, normalizar } from './lector.js';

export const MARCA = '#SALDAR#';

// Huella corta y estable de un registro, para no importarlo dos veces.
export function huellaRegistro(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '-' + texto.length.toString(36);
}

export const separar = (archivo) => String(archivo || '').split(MARCA).map((s) => s.trim()).filter(Boolean);

function fechaDe(txt) {
  const m = String(txt || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const hoyISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Convierte un registro en { tipo: 'compra'|'ingreso'|'ilegible', compra?, texto }.
export function interpretar(registro, aprendido = {}, hoy = new Date()) {
  const hash = huellaRegistro(registro);
  const i = registro.indexOf('|');
  const tipo = i > 0 ? registro.slice(0, i).trim().toLowerCase() : '';
  const resto = i > 0 ? registro.slice(i + 1) : registro;

  if (tipo === 'ap') {
    const [fechaTxt = '', montoTxt = '', comercioTxt = '', ...tarj] = resto.split('|');
    const monto = numeroDeTexto(montoTxt);
    const tarjetaNombre = tarj.join('|').trim();
    const m4 = tarjetaNombre.match(/(\d{4})\b/);
    const comercio = comercioTxt.trim();
    if (!monto) return { hash, tipo: 'ilegible', texto: registro };
    return {
      hash, tipo: 'compra',
      compra: {
        comercio: comercio || 'Sin nombre', monto, fecha: fechaDe(fechaTxt) || hoyISO(hoy),
        tarjeta: m4 ? m4[1] : '', tarjetaNombre: m4 ? '' : tarjetaNombre.slice(0, 30),
        categoria: adivinarCategoria(comercio, aprendido), origen: 'atajo-ap', revisar: !comercio
      }
    };
  }

  // 'msg' (o cualquier otra cosa): se lee como un mensaje de banco
  let fechaCaptura = null;
  let texto = resto;
  if (tipo === 'msg') {
    const j = resto.indexOf('|');
    fechaCaptura = fechaDe(j >= 0 ? resto.slice(0, j) : '');
    texto = j >= 0 ? resto.slice(j + 1) : resto;
  }
  const r = leerTexto(texto, aprendido, hoy);
  if (r.tipo === 'ingreso') return { hash, tipo: 'ingreso' };
  if (!r.monto) return { hash, tipo: 'ilegible', texto: texto.trim() };
  return {
    hash, tipo: 'compra',
    compra: {
      comercio: r.comercio || 'Sin nombre', monto: r.monto, fecha: r.fecha || fechaCaptura || hoyISO(hoy),
      tarjeta: r.tarjeta, tarjetaNombre: '', categoria: r.categoria, origen: 'atajo-msg', revisar: !r.comercio
    }
  };
}

function comercioParecido(a, b) {
  const na = normalizar(a), nb = normalizar(b);
  if (!na || !nb || na === 'sin nombre' || nb === 'sin nombre') return true;
  return na.includes(nb) || nb.includes(na) || na.slice(0, 4) === nb.slice(0, 4);
}

// Misma compra vista por dos caminos (por ejemplo Apple Pay y el SMS del banco).
export function esLaMisma(a, b) {
  return a.fecha === b.fecha && a.monto === b.monto
    && (!a.tarjeta || !b.tarjeta || a.tarjeta === b.tarjeta)
    && comercioParecido(a.comercio, b.comercio);
}

// Analiza uno o varios archivos. No modifica nada: devuelve lo que se guardaría.
export function analizar(textosArchivos, estado, hoy = new Date()) {
  const vistas = new Set(estado.capturasVistas || []);
  const registros = textosArchivos.flatMap(separar);
  const items = registros.map((r) => interpretar(r, estado.aprendido?.comercios || {}, hoy));
  // Primero Apple Pay (datos ya separados), después los mensajes: así el SMS repetido se descarta.
  items.sort((a, b) => (a.compra?.origen === 'atajo-ap' ? 0 : 1) - (b.compra?.origen === 'atajo-ap' ? 0 : 1));

  const res = { total: registros.length, nuevas: [], repetidas: 0, ingresos: 0, ilegibles: [], hashes: [] };
  const base = [...estado.compras];
  const dentro = new Set();
  for (const it of items) {
    if (vistas.has(it.hash) || dentro.has(it.hash)) { res.repetidas++; continue; }
    dentro.add(it.hash);
    res.hashes.push(it.hash);
    if (it.tipo === 'ingreso') { res.ingresos++; continue; }
    if (it.tipo === 'ilegible') { res.ilegibles.push(it.texto); continue; }
    if ([...base, ...res.nuevas].some((k) => esLaMisma(k, it.compra))) { res.repetidas++; continue; }
    res.nuevas.push(it.compra);
  }
  return res;
}
