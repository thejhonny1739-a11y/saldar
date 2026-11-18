// Compromisos recurrentes (gastos e ingresos que se repiten), categorías y espacios. Lógica pura, sin pantalla.
import { aISO, inicioDia } from './calculos.js';

export const FRECUENCIAS = [
  ['unico', 'Una vez'], ['semanal', 'Semanal'], ['quincenal', 'Quincenal'], ['mensual', 'Mensual'],
  ['bimensual', 'Bimensual'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual']
];
export const nombreFrecuencia = (f) => (FRECUENCIAS.find((x) => x[0] === f) || FRECUENCIAS[3])[1];
const PASO_MESES = { mensual: 1, bimensual: 2, trimestral: 3, semestral: 6, anual: 12 };

export const AVISOS = [[null, 'Sin aviso'], [0, 'El mismo día'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [7, '7 días antes']];

export const COLORES = ['#00d4a0', '#ff2d78', '#8b5cf6', '#ffb020', '#3cc3d8', '#5b8def', '#ff5a5f', '#9aa5b1'];
export const ICONOS_CATEGORIA = ['🏠', '⚡', '🍽️', '🚗', '🩺', '🎓', '🎮', '💳', '👕', '🛒', '📱', '🎁', '💵', '💼', '🐾', '✈️', '🔧', '📦', '🏦', '☕'];
export const ICONOS_ESPACIO = ['🏠', '👨‍👩‍👧', '❤️', '💼', '🎓', '✈️', '🐾', '🚗', '🛒', '🎮', '💡', '⭐'];

export const categoriasBase = () => [
  { id: 'vivienda', nombre: 'Vivienda', icono: '🏠', color: '#5b8def', tipo: 'gasto' },
  { id: 'servicios', nombre: 'Servicios públicos', icono: '⚡', color: '#ffb020', tipo: 'gasto' },
  { id: 'alimentacion', nombre: 'Alimentación', icono: '🍽️', color: '#00d4a0', tipo: 'gasto' },
  { id: 'transporte', nombre: 'Transporte', icono: '🚗', color: '#3cc3d8', tipo: 'gasto' },
  { id: 'salud', nombre: 'Salud', icono: '🩺', color: '#ff5a5f', tipo: 'gasto' },
  { id: 'educacion', nombre: 'Educación', icono: '🎓', color: '#8b5cf6', tipo: 'gasto' },
  { id: 'ocio', nombre: 'Entretenimiento', icono: '🎮', color: '#ff2d78', tipo: 'gasto' },
  { id: 'tarjetas', nombre: 'Tarjetas y créditos', icono: '💳', color: '#ffb020', tipo: 'gasto' },
  { id: 'otros', nombre: 'Otros gastos', icono: '📦', color: '#9aa5b1', tipo: 'gasto' },
  { id: 'salario', nombre: 'Salario', icono: '💵', color: '#00d4a0', tipo: 'ingreso' },
  { id: 'otros-ing', nombre: 'Otros ingresos', icono: '🎁', color: '#3cc3d8', tipo: 'ingreso' }
];
export const CATEGORIAS_FIJAS = ['otros', 'otros-ing']; // no se pueden borrar: reciben lo que quede sin categoría

export const espaciosBase = () => [{ id: 'personal', nombre: 'Personal', icono: '⭐', color: '#8b5cf6' }];

export const colorSeguro = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#9aa5b1');

export function categoriaDe(estado, c) {
  const lista = estado.categorias || [];
  return lista.find((k) => k.id === c.categoriaId)
    || lista.find((k) => k.id === (c.tipo === 'ingreso' ? 'otros-ing' : 'otros'))
    || { id: 'otros', nombre: 'Otros', icono: '📦', color: '#9aa5b1', tipo: c.tipo };
}

export function espacioActivo(estado) {
  const lista = estado.espacios || [];
  return lista.find((x) => x.id === estado.ajustes.espacioActivo) || lista[0];
}

/* ---------- Fechas ---------- */

const ultimoDia = (y, m) => new Date(y, m + 1, 0).getDate();
const enMes = (y, m, dia) => new Date(y, m, Math.min(dia, ultimoDia(y, m)));
export const desdeISO = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };

// Fechas (Date) en que ocurre un compromiso dentro de un mes (m = 0 a 11).
export function fechasDelMes(c, y, m) {
  if (!c.inicio) return [];
  const ini = desdeISO(c.inicio);
  const fin = c.fin ? desdeISO(c.fin) : null;
  const d0 = ini.getDate();
  let lista = [];
  const f = c.frecuencia;
  if (f === 'unico') {
    if (ini.getFullYear() === y && ini.getMonth() === m) lista = [ini];
  } else if (f === 'semanal') {
    const primero = new Date(y, m, 1);
    const dif = Math.round((primero - ini) / 86400000);
    const ultimo = new Date(y, m + 1, 0);
    let k = dif > 0 ? Math.ceil(dif / 7) : 0;
    for (;;) {
      const x = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 7 * k++);
      if (x > ultimo) break;
      if (x >= primero) lista.push(x);
    }
  } else if (f === 'quincenal') {
    const otro = d0 <= 15 ? d0 + 15 : d0 - 15;
    const dias = [...new Set([enMes(y, m, d0).getDate(), enMes(y, m, otro).getDate()])].sort((a, b) => a - b);
    lista = dias.map((d) => new Date(y, m, d));
  } else if (PASO_MESES[f]) {
    const dif = (y - ini.getFullYear()) * 12 + (m - ini.getMonth());
    if (dif >= 0 && dif % PASO_MESES[f] === 0) lista = [enMes(y, m, d0)];
  }
  return lista.filter((x) => x >= ini && (!fin || x <= fin));
}

/* ---------- Ocurrencias ---------- */

// Todas las ocurrencias de un mes (de un espacio o de todos si espacioId es null), ordenadas por fecha.
export function ocurrenciasMes(estado, espacioId, y, m, hoy = new Date()) {
  const h = inicioDia(hoy);
  const res = [];
  for (const c of estado.compromisos || []) {
    if (espacioId && c.espacioId !== espacioId) continue;
    for (const fecha of fechasDelMes(c, y, m)) {
      const iso = aISO(fecha);
      const pagado = !!(c.cumplidos && c.cumplidos[iso]);
      res.push({ c, fecha, iso, monto: c.monto, tipo: c.tipo, pagado, estado: pagado ? 'pagado' : fecha < h ? 'vencido' : 'pendiente' });
    }
  }
  return res.sort((a, b) => a.fecha - b.fecha || a.c.nombre.localeCompare(b.c.nombre));
}

export function resumenMes(lista) {
  const r = { ingresos: 0, gastos: 0, ingresosHechos: 0, gastosHechos: 0 };
  for (const o of lista) {
    if (o.tipo === 'ingreso') { r.ingresos += o.monto; if (o.pagado) r.ingresosHechos += o.monto; }
    else { r.gastos += o.monto; if (o.pagado) r.gastosHechos += o.monto; }
  }
  return r;
}

// Semana del mes (S.1, S.2…) con la semana empezando en lunes.
export function semanaDelMes(fecha) {
  const hueco = (new Date(fecha.getFullYear(), fecha.getMonth(), 1).getDay() + 6) % 7;
  return Math.floor((fecha.getDate() - 1 + hueco) / 7) + 1;
}

const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Frase que explica cómo se repite, para el formulario.
export function descripcion(frecuencia, inicioISO, finISO) {
  if (!inicioISO) return '';
  const ini = desdeISO(inicioISO);
  const d = ini.getDate();
  const largo = `${d} de ${MESES_LARGO[ini.getMonth()]}`;
  let t;
  if (frecuencia === 'unico') t = `Ocurrirá una sola vez el ${largo}.`;
  else if (frecuencia === 'semanal') t = `Se repetirá cada semana, los ${DIAS_SEM[ini.getDay()]}s, desde el ${largo}.`;
  else if (frecuencia === 'quincenal') t = `Se repetirá dos veces al mes (días ${Math.min(d, d <= 15 ? d + 15 : d - 15)} y ${Math.max(d, d <= 15 ? d + 15 : d - 15)}), desde el ${largo}.`;
  else {
    const p = PASO_MESES[frecuencia] || 1;
    const cada = p === 1 ? 'cada mes' : p === 12 ? 'cada año' : `cada ${p} meses`;
    t = `Se repetirá el ${d} ${cada}, desde el ${largo}.`;
  }
  if (frecuencia !== 'unico' && finISO) { const f = desdeISO(finISO); t += ` Termina el ${f.getDate()} de ${MESES_LARGO[f.getMonth()]} de ${f.getFullYear()}.`; }
  return t;
}
