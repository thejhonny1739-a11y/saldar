// Pantalla Calendario: cuadrícula del mes con los pagos programados y recordatorios para el iPhone.
import { esc, pesos, fechaCorta, entregarICS } from './util.js';
import * as C from './calculos.js';
import { pagosICS } from './ics.js';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ESTADO = {
  pagada: { texto: 'Pagada', clase: 'menta' },
  vencida: { texto: 'Vencida', clase: 'rosa' },
  pendiente: { texto: 'Por pagar', clase: 'ambar' },
  programada: { texto: 'Programada', clase: 'morado' },
  omitida: { texto: 'Sin pago registrado', clase: 'rosa' }
};

let vista = null; // { y, m, dia }
export const reiniciar = () => { vista = null; };

export function calendario(ctx, c) {
  const e = ctx.sesion().estado;
  const hoy = new Date();
  if (!vista) vista = { y: hoy.getFullYear(), m: hoy.getMonth(), dia: null };
  const { y, m } = vista;
  const rec = e.ajustes.recordatorio;

  const pagos = e.deudas
    .map((d) => ({ d, o: C.ocurrencia(d, e, y, m, hoy) }))
    .filter((x) => x.o)
    .sort((a, b) => a.o.fecha - b.o.fecha);
  const porDia = {};
  pagos.forEach((p) => { (porDia[p.o.fecha.getDate()] ||= []).push(p); });

  const primero = new Date(y, m, 1);
  const hueco = (primero.getDay() + 6) % 7; // la semana empieza en lunes
  const total = new Date(y, m + 1, 0).getDate();
  const esHoy = (n) => y === hoy.getFullYear() && m === hoy.getMonth() && n === hoy.getDate();

  let celdas = '';
  for (let i = 0; i < hueco; i++) celdas += '<span class="dia vacio"></span>';
  for (let n = 1; n <= total; n++) {
    const lista = porDia[n] || [];
    const clases = [...new Set(lista.map((p) => ESTADO[p.o.estado].clase))].slice(0, 3);
    celdas += `<button class="dia${esHoy(n) ? ' hoy' : ''}${vista.dia === n ? ' sel' : ''}" data-dia="${n}">
      <span>${n}</span><span class="puntos-dia">${clases.map((k) => `<i class="p-${k}"></i>`).join('')}</span></button>`;
  }

  const visibles = vista.dia ? (porDia[vista.dia] || []) : pagos;
  const porPagar = pagos.filter((p) => p.o.estado === 'pendiente' || p.o.estado === 'vencida').reduce((t, p) => t + p.o.monto, 0);

  c.innerHTML = `
    <div class="encabezado"><h1>Calendario</h1><button class="btn-chico" id="hoy">Hoy</button></div>
    <div class="card">
      <div class="mes-nav">
        <button class="flecha" id="ant" aria-label="Mes anterior">‹</button>
        <b>${MESES[m]} ${y}</b>
        <button class="flecha" id="sig" aria-label="Mes siguiente">›</button>
      </div>
      <div class="semana">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cuadricula">${celdas}</div>
      <div class="leyenda"><span class="ley"><i class="p-menta"></i>Pagada</span><span class="ley"><i class="p-ambar"></i>Por pagar</span><span class="ley"><i class="p-rosa"></i>Vencida</span><span class="ley"><i class="p-morado"></i>Programada</span></div>
    </div>
    <div class="seccion">${vista.dia ? `Pagos del ${vista.dia} de ${MESES[m].toLowerCase()}` : `Pagos de ${MESES[m].toLowerCase()}`}${!vista.dia && porPagar ? ` · por pagar ${pesos(porPagar)}` : ''}</div>
    ${visibles.length === 0
      ? '<div class="card vacio">No hay pagos programados aquí.</div>'
      : visibles.map(({ d, o }) => {
          const t = ESTADO[o.estado];
          return `<button class="deuda" data-id="${esc(d.id)}">
            <div class="deuda-top"><span class="deuda-nombre">${esc(d.nombre)}</span><span class="deuda-monto">${pesos(o.monto)}</span></div>
            <div class="deuda-pie ${t.clase}">${t.texto} · ${fechaCorta(o.fecha)}</div></button>`;
        }).join('')}
    <div class="seccion">Recordatorios en tu iPhone</div>
    <div class="card">
      <div class="ajuste"><span>Avisar</span>
        <select id="antes" class="sel-chico">${[[0, 'El mismo día'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [5, '5 días antes'], [7, '7 días antes']]
          .map(([v, t]) => `<option value="${v}"${v === rec.diasAntes ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="ajuste"><span>A las</span>
        <select id="hora" class="sel-chico">${Array.from({ length: 16 }, (_, i) => i + 6)
          .map((h) => `<option value="${h}"${h === rec.hora ? ' selected' : ''}>${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'p. m.' : 'a. m.'}</option>`).join('')}</select></div>
      <p class="nota">Crea alarmas en el Calendario del iPhone para tus próximos pagos (hasta 12 meses). Las lanza iOS aunque Saldar esté cerrada. Si cambias montos o días, vuelve a tocarlo; normalmente se actualizan sin duplicarse. Si ves repetidos, bórralos desde Calendario.</p>
    </div>
    <button class="btn" id="agregar" style="max-width:none;margin-top:0">Agregar pagos al Calendario</button>`;

  const ir = (dm) => { const f = new Date(y, m + dm, 1); vista = { y: f.getFullYear(), m: f.getMonth(), dia: null }; calendario(ctx, c); };
  c.querySelector('#ant').onclick = () => ir(-1);
  c.querySelector('#sig').onclick = () => ir(1);
  c.querySelector('#hoy').onclick = () => { vista = null; calendario(ctx, c); };
  c.querySelectorAll('.dia[data-dia]').forEach((b) => {
    b.onclick = () => { const n = Number(b.dataset.dia); vista.dia = vista.dia === n ? null : n; calendario(ctx, c); };
  });
  c.querySelectorAll('.deuda[data-id]').forEach((b) => { b.onclick = () => ctx.ir('deudas', { vista: 'detalle', id: b.dataset.id }); });

  const guardarRec = async () => {
    e.ajustes.recordatorio = { diasAntes: Number(c.querySelector('#antes').value), hora: Number(c.querySelector('#hora').value) };
    await ctx.guardar();
  };
  c.querySelector('#antes').onchange = guardarRec;
  c.querySelector('#hora').onchange = guardarRec;

  c.querySelector('#agregar').onclick = async () => {
    const r = pagosICS(e, e.ajustes.recordatorio, new Date());
    if (r.cantidad === 0) return ctx.aviso('No hay pagos pendientes. Agrega cuota y día de pago a tus deudas.');
    const res = await entregarICS('Saldar-pagos.ics', r.texto, 'Pagos de Saldar');
    ctx.aviso(res === 'cancelado' ? 'Cancelado' : `${r.cantidad} pagos listos para el Calendario`);
  };
}
