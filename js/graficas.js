// Gráficas en HTML/SVG puro (sin librerías): dona, tendencia mensual y matriz anual.
import { esc, pesos } from './util.js';
import * as K from './compromisos.js';

const R = 46;
const LARGO = 2 * Math.PI * R;

export const compacto = (n) => {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '')}M`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}K`;
  return `${s}${Math.round(a)}`;
};

/* ---------- Dona ---------- */
// segmentos: [{ nombre, valor, color, icono? }]. Muestra hasta 5 y agrupa el resto en "Otras".
export function dona(segmentos, etiqueta, texto) {
  let segs = segmentos.filter((s) => s.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = segs.reduce((t, s) => t + s.valor, 0);
  if (!total) return '';
  if (segs.length > 6) {
    const resto = segs.slice(5);
    segs = [...segs.slice(0, 5), { nombre: 'Otras', valor: resto.reduce((t, s) => t + s.valor, 0), color: '#9aa5b1' }];
  }
  let acum = 0;
  const arcos = segs.map((s) => {
    const largo = (s.valor / total) * LARGO;
    const hueco = segs.length > 1 ? Math.min(2.5, largo * 0.3) : 0;
    const a = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${K.colorSeguro(s.color)}" stroke-width="15" stroke-dasharray="${Math.max(0, largo - hueco).toFixed(2)} ${(LARGO - Math.max(0, largo - hueco)).toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}" transform="rotate(-90 60 60)"></circle>`;
    acum += largo;
    return a;
  }).join('');
  const leyenda = segs.map((s) => `
    <div class="ley-fila"><i style="background:${K.colorSeguro(s.color)}"></i><span class="ley-nom">${s.icono ? esc(s.icono) + ' ' : ''}${esc(s.nombre)}</span><span class="ley-pct">${Math.round((s.valor / total) * 100)}%</span><b>${pesos(s.valor)}</b></div>`).join('');
  return `
    <div class="card dona-caja">
      <div class="dona"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--card-2)" stroke-width="15"></circle>${arcos}</svg>
        <div class="dona-centro"><span class="etiqueta">${esc(etiqueta)}</span><b>${esc(texto)}</b></div></div>
      <div class="leyenda-lista">${leyenda}</div>
    </div>`;
}

/* ---------- Tendencia mensual ---------- */
// meses: [{ i, ing, gas }] de enero a diciembre. Cada barra se toca para abrir ese mes.
export function tendencia(meses, mesActual) {
  const max = Math.max(1, ...meses.map((x) => Math.max(x.ing, x.gas)));
  const inicial = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return `
    <div class="card">
      <div class="etiqueta" style="text-align:center;margin-bottom:12px">Tendencia mensual</div>
      <div class="tendencia">${meses.map((x) => {
        const bal = x.ing - x.gas;
        const vacio = !x.ing && !x.gas;
        return `<button class="tend-col${x.i === mesActual ? ' ahora' : ''}" data-mes="${x.i}" aria-label="Mes ${x.i + 1}">
          <span class="tend-val ${bal < 0 ? 'rosa' : 'menta'}">${vacio ? '' : compacto(bal)}</span>
          <span class="tend-barras"><i class="b-ing" style="height:${Math.round((x.ing / max) * 100)}%"></i><i class="b-gas" style="height:${Math.round((x.gas / max) * 100)}%"></i></span>
          <span class="tend-mes">${inicial[x.i]}</span></button>`;
      }).join('')}</div>
      <div class="leyenda" style="justify-content:center"><span class="ley"><i class="p-menta"></i>Ingresos</span><span class="ley"><i class="p-rosa"></i>Gastos</span></div>
    </div>`;
}

/* ---------- Matriz anual ---------- */
const GRUPOS = [['fijos', 'Fijos'], ['unicos', 'Únicos'], ['deudas', 'Deudas']];
const grupoDe = (c) => (c.esDeuda ? 'deudas' : c.frecuencia === 'unico' ? 'unicos' : 'fijos');
const MES1 = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// Devuelve { html, filas } donde filas[id] = { c, porMes: [[ocurrencias] x 12] }.
export function matriz(estado, ocurrencias, cerrados) {
  const filas = new Map();
  for (const o of ocurrencias) {
    if (!filas.has(o.c.id)) filas.set(o.c.id, { c: o.c, porMes: Array.from({ length: 12 }, () => []) });
    filas.get(o.c.id).porMes[o.fecha.getMonth()].push(o);
  }
  if (!filas.size) return { html: '', filas };
  const celda = (lista, id, m) => {
    if (!lista.length) return '<span class="celda"></span>';
    const k = lista.every((o) => o.pagado) ? 'menta' : lista.some((o) => o.estado === 'vencido') ? 'rosa' : 'morado';
    return `<button class="celda" data-fila="${esc(id)}" data-m="${m}" aria-label="Ver movimientos"><i class="p-${k}"></i></button>`;
  };
  let html = `<div class="card matriz"><div class="mx-cab"><span class="etiqueta">Concepto</span><span class="mx-meses">${MES1.map((x) => `<span>${x}</span>`).join('')}</span></div>`;
  for (const [g, nombre] of GRUPOS) {
    const del = [...filas.values()].filter((f) => grupoDe(f.c) === g).sort((a, b) => a.c.nombre.localeCompare(b.c.nombre));
    if (!del.length) continue;
    const cerrado = cerrados.has(g);
    html += `<button class="mx-grupo" data-grupo="${g}"><span>${cerrado ? '›' : '⌄'}</span><b>${nombre}</b><em>${del.length}</em></button>`;
    if (cerrado) continue;
    for (const f of del) {
      const cat = K.categoriaDe(estado, f.c);
      const col = K.colorSeguro(cat.color);
      const unit = f.porMes.flat()[0];
      html += `<div class="mx-fila"><button class="mx-nom" data-edit="${esc(f.c.id)}" data-deuda="${f.c.esDeuda ? 1 : ''}">
          <span class="mx-ico" style="background:${col}2e">${esc(cat.icono)}</span>
          <span class="mx-txt"><b>${esc(f.c.nombre)}</b><small class="${f.c.tipo === 'ingreso' ? 'menta' : ''}">${f.c.tipo === 'ingreso' ? '+' : '−'}${pesos(unit ? unit.monto : 0)}</small></span></button>
        <span class="mx-celdas">${f.porMes.map((l, m) => celda(l, f.c.id, m)).join('')}</span></div>`;
    }
  }
  return { html: html + '</div>', filas };
}
