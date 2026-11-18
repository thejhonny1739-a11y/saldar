// Archivos de calendario (.ics) para que iOS lance los recordatorios aunque la app esté cerrada.
import { ocurrencia } from './calculos.js';
import { ocurrenciasMes } from './compromisos.js';

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d, h = 9, mi = 0) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(mi)}00`;
const BARRA = String.fromCharCode(92);
// Escapa \ ; , y saltos de línea, como exige el formato iCalendar.
const esc = (t) => String(t ?? '').replace(/[\\;,]|\r?\n/g, (c) => (c === '\n' || c === '\r\n' ? BARRA + 'n' : BARRA + c));
const marcaUTC = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const plata = (n) => '$' + Math.round(n).toLocaleString('es-CO');

// Las líneas largas se parten a 75 caracteres (norma del formato).
function plegar(linea) {
  if (linea.length <= 75) return linea;
  const partes = [linea.slice(0, 75)];
  for (let i = 75; i < linea.length; i += 74) partes.push(' ' + linea.slice(i, i + 74));
  return partes.join('\r\n');
}

const envolver = (eventos) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Saldar//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Saldar',
  ...eventos.flat(), 'END:VCALENDAR'
].map(plegar).join('\r\n') + '\r\n';

function alarma(texto, trigger) {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(texto)}`, `TRIGGER:${trigger}`, 'END:VALARM'];
}

// Pagos pendientes de los próximos `meses` meses, con alarma el día antes (o los días que se elija) y el mismo día.
export function pagosICS(estado, { diasAntes = 1, hora = 9 } = {}, hoy = new Date(), meses = 12) {
  const ahora = marcaUTC();
  const eventos = [];
  for (const d of estado.deudas) {
    if (d.saldo <= 0) continue;
    for (let i = 0; i < meses; i++) {
      const o = ocurrencia(d, estado, hoy.getFullYear(), hoy.getMonth() + i, hoy);
      if (!o || (o.estado !== 'pendiente' && o.estado !== 'programada')) continue;
      const f = o.fecha;
      const ev = [
        'BEGIN:VEVENT',
        `UID:saldar-${d.id}-${f.getFullYear()}${pad(f.getMonth() + 1)}@saldar`,
        `DTSTAMP:${ahora}`,
        `DTSTART:${stamp(f, hora)}`,
        'DURATION:PT30M',
        `SUMMARY:${esc('Pago ' + d.nombre)}`,
        `DESCRIPTION:${esc(`Cuota ${plata(o.monto)} · Saldo ${plata(d.saldo)}${d.acreedor ? ' · ' + d.acreedor : ''}`)}`,
        'TRANSP:TRANSPARENT',
        ...(diasAntes > 0 ? alarma(`Mañana vence: ${d.nombre} (${plata(o.monto)})`.replace('Mañana', diasAntes === 1 ? 'Mañana' : `En ${diasAntes} días`), `-P${diasAntes}D`) : []),
        ...alarma(`Hoy vence: ${d.nombre} (${plata(o.monto)})`, 'PT0S'),
        'END:VEVENT'
      ];
      eventos.push(ev);
    }
  }
  // Compromisos recurrentes (todos los espacios) que tengan aviso. Se omiten los ya marcados como pagados y los pasados.
  const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  for (let i = 0; i < meses; i++) {
    for (const o of ocurrenciasMes(estado, null, hoy.getFullYear(), hoy.getMonth() + i, hoy)) {
      const c = o.c;
      if (o.pagado || o.fecha < h0 || c.avisoDias === null || c.avisoDias === undefined) continue;
      const f = o.fecha;
      const ing = c.tipo === 'ingreso';
      const avisoDias = c.avisoDias;
      eventos.push([
        'BEGIN:VEVENT',
        `UID:saldar-c-${c.id}-${f.getFullYear()}${pad(f.getMonth() + 1)}${pad(f.getDate())}@saldar`,
        `DTSTAMP:${ahora}`,
        `DTSTART:${stamp(f, hora)}`,
        'DURATION:PT30M',
        `SUMMARY:${esc((ing ? 'Ingreso ' : 'Pago ') + c.nombre)}`,
        `DESCRIPTION:${esc(`${ing ? 'Ingreso' : 'Pago'} de ${plata(o.monto)}${c.nota ? ' · ' + c.nota : ''}`)}`,
        'TRANSP:TRANSPARENT',
        ...(avisoDias > 0 ? alarma(`${avisoDias === 1 ? 'Mañana' : `En ${avisoDias} días`}: ${c.nombre} (${plata(o.monto)})`, `-P${avisoDias}D`) : []),
        ...alarma(`Hoy: ${c.nombre} (${plata(o.monto)})`, 'PT0S'),
        'END:VEVENT'
      ]);
    }
  }
  return { texto: envolver(eventos), cantidad: eventos.length };
}

// Evento mensual (el día 1) que recuerda hacer el respaldo.
export function respaldoICS(hoy = new Date(), hora = 10) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const ev = [
    'BEGIN:VEVENT',
    'UID:saldar-recordatorio-respaldo@saldar',
    `DTSTAMP:${marcaUTC()}`,
    `DTSTART:${stamp(inicio, hora)}`,
    'DURATION:PT15M',
    'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
    'SUMMARY:Respaldo de Saldar',
    'DESCRIPTION:Abre Saldar > Ajustes > Exportar respaldo y guárdalo en Archivos o iCloud.',
    'TRANSP:TRANSPARENT',
    ...alarma('Haz el respaldo de tus deudas en Saldar', 'PT0S'),
    'END:VEVENT'
  ];
  return envolver([ev]);
}

