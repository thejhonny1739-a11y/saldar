// Lector flexible de mensajes del banco (SMS o correo). No depende del formato de un banco en particular:
// busca monto, comercio, tarjeta y fecha con patrones comunes. Siempre se confirma con el usuario antes de guardar.

// Las categorías de las compras son las mismas que las de los compromisos (ver compromisos.js).
const PALABRAS_CATEGORIA = {
  alimentacion: ['restaur', 'rappi', 'domicilios', 'mcdonald', 'kfc', 'burger', 'pizza', 'cafe', 'café', 'juan valdez', 'starbucks', 'crepes', 'sushi', 'panader', 'frisby', 'subway', 'dunkin',
    'exito', 'éxito', 'jumbo', 'carulla', 'olimpica', 'olímpica', 'tienda d1', 'd1 ', 'ara ', 'surtimax', 'makro', 'pricesmart', 'metro ', 'supermerc', 'justo y bueno'],
  transporte: ['uber', 'didi', 'cabify', 'beat', 'terpel', 'primax', 'gasolin', 'esso', 'texaco', 'peaje', 'transmilenio', 'metro de', 'parqueader', 'indrive'],
  servicios: ['claro', 'movistar', 'tigo', 'wom', 'etb', 'epm', 'codensa', 'enel', 'vanti', 'acueducto', 'internet'],
  ocio: ['netflix', 'spotify', 'disney', 'amazon prime', 'hbo', 'youtube', 'cine', 'cinemark', 'procinal', 'royal films', 'steam', 'playstation', 'xbox', 'nintendo', 'tuboleta', 'teatro', 'bar '],
  salud: ['farmacia', 'drogueria', 'droguería', 'cruz verde', 'farmatodo', 'la rebaja', 'clinica', 'clínica', 'eps', 'laboratorio', 'medic', 'odontol'],
  ropa: ['zara', 'h&m', 'arturo calle', 'studio f', 'koaj', 'adidas', 'nike', 'falabella', 'offcorss', 'tennis', 'bershka'],
  hogar: ['homecenter', 'easy', 'ikea', 'ferreter', 'muebles', 'sodimac'],
  tecnologia: ['alkosto', 'ktronix', 'k-tronix', 'mercadolibre', 'mercado libre', 'apple', 'samsung', 'tecnolog', 'office depot', 'panamericana', 'google', 'microsoft']
};

export const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function adivinarCategoria(comercio, aprendido = {}) {
  const n = normalizar(comercio);
  if (!n) return 'otros';
  if (aprendido[n]) return aprendido[n];
  for (const [cat, claves] of Object.entries(PALABRAS_CATEGORIA)) {
    if (claves.some((k) => n.includes(normalizar(k).trim()) )) return cat;
  }
  return 'otros';
}

// "1.234.567,89" / "1,234,567.89" / "50.000" / "52300" -> número en pesos
export function numeroDeTexto(txt) {
  let s = String(txt).replace(/[^\d.,]/g, '');
  if (!s) return 0;
  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;
  let dec = null;
  if (puntos && comas) {
    dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  } else if (puntos || comas) {
    const sep = puntos ? '.' : ',';
    const veces = puntos || comas;
    const resto = s.slice(s.lastIndexOf(sep) + 1);
    if (veces === 1 && resto.length !== 3) dec = sep; // un solo separador seguido de 1-2 dígitos: decimal
  }
  if (dec) {
    const miles = dec === '.' ? ',' : '.';
    s = s.split(miles).join('').replace(dec, '.');
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

const MESES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 10 + 1 };
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function buscarFecha(texto, hoy = new Date()) {
  let m = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = texto.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const d = +m[1], mo = +m[2] - 1;
    if (mo >= 0 && mo < 12 && d >= 1 && d <= 31) return iso(y, mo, d);
  }
  m = texto.match(/\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?/i);
  if (m) return iso(m[3] ? +m[3] : hoy.getFullYear(), MESES[m[2].toLowerCase()], +m[1]);
  return null;
}

// Devuelve el primer monto que NO sea un saldo, cupo o disponible.
function buscarMonto(texto) {
  const re = /(?:COP|COL\$|\$)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(?:COP|pesos)\b/gi;
  let m;
  const candidatos = [];
  while ((m = re.exec(texto))) {
    const antes = texto.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    const esSaldo = /(saldo|disponible|cupo|l[ií]mite|total a pagar|pago m[ií]nimo)[^.]{0,25}$/.test(antes);
    const valor = numeroDeTexto(m[1] || m[2]);
    if (valor > 0) candidatos.push({ valor, esSaldo });
  }
  const bueno = candidatos.find((c) => !c.esSaldo);
  return bueno ? bueno.valor : 0;
}

function buscarTarjeta(texto) {
  let m = texto.match(/(?:\*+|[xX]{2,}|terminad[ao]\s+en|termina\s+en|finalizad[ao]\s+en|[uú]ltimos\s+4(?:\s+d[ií]gitos)?(?:\s+de)?|final(?:iza)?(?:\s+en)?)\s*[-:]?\s*(\d{4})\b/i);
  if (m) return m[1];
  m = texto.match(/tarjeta[^\d\n]{0,18}(\d{4})\b/i);
  if (m) return m[1];
  m = texto.match(/\bT\.?\s?(?:cr[eé]d|d[eé]b)[a-z]*\.?\s*\*?(\d{4})\b/i);
  return m ? m[1] : '';
}

const CORTE = '(?=\\s+(?:con|el|la|a las|a la|por|usando|desde|mediante|tarjeta|tdc|tdd|tc|td|t\\.|cuenta|valor|monto|fecha|\\d{1,2}[\\/\\-.]\\d{1,2})\\b|\\.(?=\\s|$)|[,;:\\n(]|$)';

function limpiarComercio(t) {
  let c = t.replace(/\s+/g, ' ').trim().replace(/[\s\-*#]+$/g, '');
  c = c.replace(/\s+(COL|CO|COLOMBIA|BOGOTA|BOGOT[ÁA]|MEDELLIN|CALI)$/i, '').trim();
  if (c.length > 3 && c === c.toUpperCase()) {
    c = c.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
  }
  c = c.charAt(0).toUpperCase() + c.slice(1);
  return c.slice(0, 40);
}

function buscarComercio(texto) {
  const intentos = [
    new RegExp('(?:comercio|establecimiento|negocio|empresa)\\s*[:\\-]?\\s*([^\\n,;]{2,40}?)' + CORTE, 'i'),
    new RegExp('(?:compra(?:ste)?|pag[oó]|pagaste|transacci[oó]n|consumo|cargo|retiro|avance|d[eé]bito)[^\\n$]{0,30}?\\ben\\s+([^\\n,;]{2,40}?)' + CORTE, 'i'),
    new RegExp('\\ben\\s+([^\\n,;]{3,40}?)' + CORTE, 'i')
  ];
  for (const re of intentos) {
    const m = texto.match(re);
    if (m) {
      const c = limpiarComercio(m[1]);
      if (c && !/^(tu|su|la|el|una?)\s/i.test(c) && !/^\d+$/.test(c)) return c;
    }
  }
  return '';
}

export function leerTexto(texto, aprendido = {}, hoy = new Date()) {
  const t = String(texto || '').replace(/\r/g, '\n');
  const monto = buscarMonto(t);
  const comercio = buscarComercio(t);
  const tarjeta = buscarTarjeta(t);
  const fecha = buscarFecha(t, hoy);
  const ingreso = /\b(recibiste|abono|consignaci[oó]n|dep[oó]sito|transferencia recibida|te enviaron|te lleg[oó])\b/i.test(t) && !/\b(compra|pago|retiro)\b/i.test(t);
  return {
    monto, comercio, tarjeta, fecha,
    tipo: ingreso ? 'ingreso' : 'compra',
    categoria: adivinarCategoria(comercio, aprendido),
    confianza: (monto ? 1 : 0) + (comercio ? 1 : 0) + (tarjeta ? 1 : 0)
  };
}
