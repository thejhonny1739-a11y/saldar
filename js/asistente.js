// Asistente de texto: entiende frases como "Pagar la luz el 25 de cada mes por 100.000"
// y las convierte en un compromiso. No usa internet ni IA externa: son reglas sencillas y siempre se confirma.
import { aISO } from './calculos.js';
import { normalizar } from './lector.js';

export const EJEMPLOS = [
  'Pagar la luz el 25 de cada mes por 100.000',
  'Arriendo 900 mil el día 1',
  'Salario quincenal 2.500.000 el 15 y 30',
  'Gasolina 30 mil cada semana los viernes',
  'SOAT 420 mil el 12 de junio'
];

const MESES = { enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2, abril: 3, abr: 3, mayo: 4, may: 4, junio: 5, jun: 5, julio: 6, jul: 6, agosto: 7, ago: 7, septiembre: 8, setiembre: 8, sep: 8, sept: 8, octubre: 9, oct: 9, noviembre: 10, nov: 10, diciembre: 11, dic: 11 };
const NOMBRE_MES = Object.keys(MESES).sort((a, b) => b.length - a.length).join('|');
const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const NOMBRE_DIA = 'domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado';

const num = (t) => {
  // "1.250.000" / "1,5" / "25000" -> número
  const s = String(t);
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return Number(s.replace(',', '.')) || 0;
};

// Busca el monto: "100.000", "100 mil", "1,5 millones", "50k". Devuelve { valor, ini, fin } o null.
function buscarMonto(t) {
  const re = /(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millon|mill[oó]n|mil|k|lucas?|palos?)?(?![\p{L}\d])/giu;
  let m;
  const cand = [];
  while ((m = re.exec(t))) {
    const mult = (m[2] || '').toLowerCase();
    let valor = num(m[1]);
    if (/^mill/.test(mult) || /^palo/.test(mult)) valor *= 1e6;
    else if (/^(mil|k|luca)/.test(mult)) valor *= 1e3;
    const conSep = /[.,]\d{3}/.test(m[1]);
    const esAnio = !mult && !conSep && valor >= 1990 && valor <= 2100;
    const antes = t.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
    const pistaMonto = /(por|de|valor|cuesta|\$)\s*$/.test(antes) || m[0].trim().startsWith('$');
    if (valor <= 0 || esAnio) continue;
    cand.push({ valor: Math.round(valor), ini: m.index, fin: m.index + m[0].length, fuerte: !!mult || conSep || valor >= 1000 || pistaMonto });
  }
  return cand.find((c) => c.fuerte && c.valor >= 100) || null;
}

const sumarDias = (f, n) => new Date(f.getFullYear(), f.getMonth(), f.getDate() + n);
const diaMes = (y, m, d) => new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()));

function proximoDia(hoy, d, mes) {
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (mes !== undefined) {
    let f = diaMes(h.getFullYear(), mes, d);
    if (f < h) f = diaMes(h.getFullYear() + 1, mes, d);
    return f;
  }
  const f = diaMes(h.getFullYear(), h.getMonth(), d);
  return f >= h ? f : diaMes(h.getFullYear(), h.getMonth() + 1, d);
}

const FRECUENCIAS = [
  ['quincenal', /quincen\w*|dos veces (?:al|por) mes|cada 15 d[ií]as/i],
  ['bimensual', /bimestr\w*|bimensual\w*|cada (?:dos|2) meses/i],
  ['trimestral', /trimestr\w*|cada (?:tres|3) meses/i],
  ['semestral', /semestr\w*|cada (?:seis|6) meses/i],
  ['anual', /anual\w*|cada a[nñ]o|todos los a[nñ]os/i],
  ['semanal', /semanal\w*|cada semana|todas las semanas|todos los (?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)|cada (?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i],
  ['mensual', /mensual\w*|cada mes|al mes|todos los meses|mes a mes/i],
  ['unico', /una (?:sola )?vez|[uú]nico|solo (?:esta|una)/i]
];

const CATEGORIAS = [
  ['vivienda', /arriendo|alquiler|hipoteca|administraci[oó]n|predial|vivienda|inmobiliari|canon/],
  ['servicios', /\b(luz|energ\w*|agua|gas|internet|tel[eé]fono|celular|plan de datos|acueducto|alcantarillado|aseo|claro|movistar|tigo|etb|epm|vanti)\b/],
  ['alimentacion', /mercado|comida|restaurante|supermercado|rappi|domicilio|almuerzo|alimentaci/],
  ['transporte', /gasolina|soat|uber|didi|transmilenio|parqueadero|peaje|moto|carro|vehiculo|tecnomec|pasaje|taxi|bus\b/],
  ['salud', /\beps\b|medicin|salud|drogueri|prepagada|medic|odontolog|farmacia|terapia/],
  ['educacion', /colegio|universidad|matricula|curso|pension escolar|educaci|jardin|clases/],
  ['ocio', /netflix|spotify|disney|hbo|prime|youtube|cine|gimnasio|gym|streaming|juego|suscripci/],
  ['tarjetas', /tarjeta|credito|prestamo|cuota|visa|mastercard|\bnu\b|rotativo|libranza/],
  ['salario', /salario|sueldo|nomina|quincena|honorarios|pension\b/]
];

const INGRESO = /\b(cobr\w*|recib\w*|salario|sueldo|ingreso|me pagan|me consignan|nomina|honorarios|me llega|me depositan)\b/;
const VERBOS_INICIO = /^(?:agrega(?:r)?|crea(?:r)?|anota(?:r)?|registra(?:r)?|recu[eé]rdame|recordar|tengo que|debo|hay que|necesito|quiero|pagar|pago|paga|cobrar|cobro|recibir|recibo|mi|mis|la|el|los|las|un|una|de|del|para|por|el pago de|pago de)\s+/i;
const COLA = /\s+(?:por|de|del|el|la|los|las|a|al|en|cada|y|con|d[ií]a|desde)$/i;

// Interpreta una frase. Devuelve { ok, datos, avisos }.
export function entender(texto, estado, hoy = new Date()) {
  const original = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!original) return { ok: false, avisos: ['Escribe qué quieres agregar.'] };
  let t = original;
  const avisos = [];
  const borrar = (ini, fin) => { t = t.slice(0, ini) + ' | ' + t.slice(fin); };

  // 1) Monto
  const mo = buscarMonto(t);
  const monto = mo ? mo.valor : 0;
  if (mo) {
    const prev = t.slice(0, mo.ini).match(/(?:por|de|valor de|cuesta|en)\s*$/i);
    borrar(mo.ini - (prev ? prev[0].length : 0), mo.fin);
  } else avisos.push('No encontré el monto. Escríbelo, por ejemplo “100.000” o “100 mil”.');

  // 2) Frecuencia
  let frecuencia = null;
  for (const [k, re] of FRECUENCIAS) {
    const m = t.match(re);
    if (m) { frecuencia = k; borrar(m.index, m.index + m[0].length); break; }
  }

  // 3) Fecha: mañana/hoy, día de la semana, "el 25", "12 de junio", "el 15 y 30"
  let fecha = null;
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let m;
  if ((m = t.match(/\bpasado ma[nñ]ana\b/i))) { fecha = sumarDias(base, 2); borrar(m.index, m.index + m[0].length); }
  else if ((m = t.match(/\bma[nñ]ana\b/i))) { fecha = sumarDias(base, 1); borrar(m.index, m.index + m[0].length); }
  else if ((m = t.match(/\bhoy\b/i))) { fecha = base; borrar(m.index, m.index + m[0].length); }
  else if ((m = t.match(new RegExp(`(?:los\\s+|el\\s+)?(${NOMBRE_DIA})s?\\b`, 'i')))) {
    const d = DIAS[normalizar(m[1]).replace(/ /g, '')];
    const dif = (d - base.getDay() + 7) % 7;
    fecha = sumarDias(base, dif);
    if (!frecuencia) frecuencia = 'semanal';
    borrar(m.index, m.index + m[0].length);
  } else if ((m = t.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${NOMBRE_MES})\\b\\.?(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'i')))) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) {
      fecha = m[3] ? diaMes(Number(m[3]), MESES[m[2].toLowerCase()], d) : proximoDia(hoy, d, MESES[m[2].toLowerCase()]);
      if (!frecuencia) frecuencia = 'unico';
      borrar(m.index, m.index + m[0].length);
    }
  } else if ((m = t.match(/\b(?:el\s+|los\s+)?(?:d[ií]a\s+)?(\d{1,2})\s+y\s+(?:el\s+)?(\d{1,2})\b/i)) && Number(m[1]) <= 31 && Number(m[2]) <= 31) {
    fecha = proximoDia(hoy, Math.min(Number(m[1]), Number(m[2])));
    if (!frecuencia || frecuencia === 'mensual') frecuencia = 'quincenal';
    borrar(m.index, m.index + m[0].length);
  } else if ((m = t.match(/\b(?:(?:el|los)\s+d[ií]a\s+|d[ií]a\s+|el\s+|los\s+)(\d{1,2})\b/i)) && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    fecha = proximoDia(hoy, Number(m[1]));
    borrar(m.index, m.index + m[0].length);
  }
  if (!fecha) { fecha = base; avisos.push('No entendí la fecha; puse hoy. Revísala.'); }
  if (!frecuencia) frecuencia = 'mensual';

  // 4) Nombre: el trozo de texto más largo que queda
  const trozos = t.split('|').map((x) => x.replace(/[,.;:]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  let nombre = trozos.sort((a, b) => b.length - a.length)[0] || '';
  for (let i = 0; i < 6 && VERBOS_INICIO.test(nombre + ' '); i++) nombre = nombre.replace(VERBOS_INICIO, '');
  for (let i = 0; i < 4 && COLA.test(nombre); i++) nombre = nombre.replace(COLA, '');
  nombre = nombre.trim().slice(0, 40);
  if (!nombre) { nombre = 'Compromiso'; avisos.push('No encontré el nombre; pon el que quieras.'); }
  nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);

  // 5) Tipo y categoría
  const norm = normalizar(original);
  const tipo = INGRESO.test(norm) ? 'ingreso' : 'gasto';
  const lista = (estado && estado.categorias) || [];
  let cat = lista.find((k) => k.tipo === tipo && normalizar(k.nombre).length > 2 && norm.includes(normalizar(k.nombre)));
  if (!cat) {
    const hit = CATEGORIAS.find(([id, re]) => re.test(norm) && (lista.find((k) => k.id === id) || {}).tipo === tipo);
    cat = hit && lista.find((k) => k.id === hit[0]);
  }
  const categoriaId = cat ? cat.id : tipo === 'ingreso' ? 'otros-ing' : 'otros';

  return { ok: monto > 0, datos: { nombre, tipo, monto, frecuencia, inicio: aISO(fecha), fin: null, categoriaId, avisoDias: 1, nota: '' }, avisos };
}
