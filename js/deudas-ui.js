// Pantallas de deudas: inicio, lista, detalle, formulario y abonos.
// `ctx` lo entrega app.js: { sesion(), guardar(), ir(tab, sub), aviso(texto) }.
import { esc, pesos, miles, fechaCorta, mesAnio, desdeISO, modal, enlazarMonto } from './util.js';
import * as C from './calculos.js';

const TIPOS = ['Tarjeta de crédito', 'Préstamo', 'Almacén / Alkosto', 'Persona', 'Servicio', 'Otro'];
const CAMPOS = { nombre: 'Nombre', acreedor: 'Acreedor', tipo: 'Tipo', montoOriginal: 'Monto original', saldo: 'Saldo', tasa: 'Tasa anual', cuota: 'Cuota', dia: 'Día de pago' };
const DINERO = ['montoOriginal', 'saldo', 'cuota'];

const fmtCampo = (campo, v) => {
  if (DINERO.includes(campo)) return pesos(v);
  if (campo === 'tasa') return `${v} %`;
  if (campo === 'dia') return v ? `día ${v}` : 'sin día';
  return v || '—';
};
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const progreso = (d) => (d.montoOriginal > 0 ? Math.min(1, Math.max(0, 1 - d.saldo / d.montoOriginal)) : 0);

function textoEstado(s) {
  if (s.liquidada) return { texto: 'Liquidada', clase: 'menta' };
  if (s.sinPlan) return { texto: 'Sin día de pago', clase: 'suave' };
  if (s.pendiente > 0 && s.vencida) return { texto: `Vencida hace ${plural(-s.dias, 'día', 'días')}`, clase: 'rosa' };
  if (s.pendiente > 0 && s.dias === 0) return { texto: 'Vence hoy', clase: 'ambar' };
  if (s.pendiente > 0) return { texto: `Vence en ${plural(s.dias, 'día', 'días')}`, clase: s.dias <= 3 ? 'ambar' : 'suave' };
  return { texto: `Al día · próximo ${fechaCorta(s.proxima)}`, clase: 'menta' };
}

const barra = (d) => `<div class="barra"><span style="width:${Math.round(progreso(d) * 100)}%"></span></div>`;

/* ================= Inicio ================= */

export function inicio(ctx, c) {
  const s = ctx.sesion();
  const e = s.estado;
  const hoy = new Date();
  const filas = e.deudas.map((d) => ({ d, s: C.situacion(d, e, hoy) }));
  const total = e.deudas.reduce((t, d) => t + (d.saldo || 0), 0);
  const porPagar = filas.reduce((t, f) => t + f.s.pendiente, 0);
  const pref = C.aISO(hoy).slice(0, 7);
  const pagado = e.pagos.filter((p) => p.fecha.startsWith(pref)).reduce((t, p) => t + p.monto, 0);
  const proximos = filas.filter((f) => f.s.proxima).sort((a, b) => a.s.dias - b.s.dias).slice(0, 5);
  const vencidas = filas.filter((f) => f.s.pendiente > 0 && f.s.vencida).length;

  c.innerHTML = `
    <h1>Hola, ${esc(s.nombre)}</h1>
    <p class="saludo">Tu resumen de deudas</p>
    <div class="card">
      <div class="etiqueta">Total adeudado</div>
      <div class="cifra">${pesos(total)}</div>
    </div>
    <div class="fila">
      <div class="card mini"><div class="etiqueta menta">Pagado este mes</div><div class="cifra">${pesos(pagado)}</div></div>
      <div class="card mini"><div class="etiqueta rosa">Por pagar</div><div class="cifra">${pesos(porPagar)}</div></div>
    </div>
    ${vencidas ? `<div class="alerta">Tienes ${plural(vencidas, 'pago vencido', 'pagos vencidos')}.</div>` : ''}
    ${e.deudas.length === 0
      ? `<div class="card vacio"><b>Todavía no registras deudas</b>Agrega la primera para ver tus próximos pagos y alertas.<br><button class="btn" id="primera" style="max-width:none">Agregar deuda</button></div>`
      : `<div class="seccion">Próximos pagos</div>
         ${proximos.length === 0
           ? '<div class="card vacio">No hay pagos programados. Agrega cuota y día de pago a tus deudas.</div>'
           : proximos.map((f) => {
               const t = textoEstado(f.s);
               return `<button class="deuda" data-id="${esc(f.d.id)}">
                 <div class="deuda-top"><span class="deuda-nombre">${esc(f.d.nombre)}</span><span class="deuda-monto">${pesos(f.s.pendiente || f.d.cuota)}</span></div>
                 <div class="deuda-pie ${t.clase}">${t.texto}</div></button>`;
             }).join('')}`}`;
  const primera = c.querySelector('#primera');
  if (primera) primera.onclick = () => ctx.ir('deudas', { vista: 'form' });
  c.querySelectorAll('.deuda[data-id]').forEach((b) => { b.onclick = () => ctx.ir('deudas', { vista: 'detalle', id: b.dataset.id }); });
}

/* ================= Lista ================= */

export function lista(ctx, c) {
  const e = ctx.sesion().estado;
  const activas = e.deudas.filter((d) => d.saldo > 0).map((d) => ({ d, s: C.situacion(d, e) }));
  activas.sort((a, b) => (a.s.dias ?? 9999) - (b.s.dias ?? 9999));
  const liquidadas = e.deudas.filter((d) => d.saldo <= 0);
  const total = activas.reduce((t, f) => t + f.d.saldo, 0);

  const fila = (d, s) => {
    const t = textoEstado(s);
    return `<button class="deuda" data-id="${esc(d.id)}">
      <div class="deuda-top"><span class="deuda-nombre">${esc(d.nombre)}</span><span class="deuda-monto">${pesos(d.saldo)}</span></div>
      <div class="deuda-sub">${esc([d.acreedor, d.tipo].filter(Boolean).join(' · '))}</div>
      ${barra(d)}
      <div class="deuda-pie ${t.clase}">${t.texto}${d.cuota && d.saldo > 0 ? ` · cuota ${pesos(d.cuota)}` : ''}</div>
    </button>`;
  };

  c.innerHTML = `
    <div class="encabezado"><h1>Deudas</h1><button class="btn-chico" id="nueva">+ Nueva</button></div>
    <div class="card"><div class="etiqueta">Total adeudado</div><div class="cifra">${pesos(total)}</div></div>
    ${e.deudas.length === 0 ? '<div class="card vacio"><b>Sin deudas registradas</b>Toca “+ Nueva” para agregar la primera.</div>' : ''}
    ${activas.map((f) => fila(f.d, f.s)).join('')}
    ${liquidadas.length ? `<div class="seccion">Liquidadas</div>${liquidadas.map((d) => fila(d, C.situacion(d, e))).join('')}` : ''}`;
  c.querySelector('#nueva').onclick = () => ctx.ir('deudas', { vista: 'form' });
  c.querySelectorAll('.deuda[data-id]').forEach((b) => { b.onclick = () => ctx.ir('deudas', { vista: 'detalle', id: b.dataset.id }); });
}

/* ================= Detalle ================= */

export function detalle(ctx, c, id) {
  const sesion = ctx.sesion();
  const e = sesion.estado;
  const d = e.deudas.find((x) => x.id === id);
  if (!d) return ctx.ir('deudas', null);
  const s = C.situacion(d, e);
  const t = textoEstado(s);
  const p = C.proyeccion(d.saldo, d.tasa, d.cuota);
  const pct = Math.round(progreso(d) * 100);

  let proy = '';
  if (d.saldo <= 0) proy = '¡Deuda liquidada!';
  else if (!p) proy = 'Agrega una cuota mensual para calcular cuándo terminas.';
  else if (p.imposible) proy = 'Con esta cuota no se alcanza a cubrir los intereses.';
  else proy = `Terminas en ${plural(p.meses, 'mes', 'meses')} (${mesAnio(p.fecha)})${p.interes ? ` · intereses aprox. ${pesos(p.interes)}` : ''}.`;

  const hist = [...(d.historial || [])].sort((a, b) => b.f - a.f);
  const itemHist = (h) => {
    if (h.tipo === 'creada') return `<div class="hist"><div><b>Deuda creada</b></div><span class="hist-f">${fechaCorta(h.f)}</span></div>`;
    if (h.tipo === 'abono') {
      return `<div class="hist"><div><b class="menta">Abono ${pesos(h.monto)}</b>${h.nota ? `<div class="hist-n">${esc(h.nota)}</div>` : ''}
        <button class="enlace" data-deshacer="${esc(h.id)}">Deshacer</button></div><span class="hist-f">${fechaCorta(desdeISO(h.fecha))}</span></div>`;
    }
    return `<div class="hist"><div><b>${esc(CAMPOS[h.campo] || h.campo)}</b><div class="hist-n">${esc(fmtCampo(h.campo, h.antes))} → ${esc(fmtCampo(h.campo, h.despues))}</div></div><span class="hist-f">${fechaCorta(h.f)}</span></div>`;
  };

  c.innerHTML = `
    <div class="encabezado"><button class="atras" id="atras">‹ Deudas</button><button class="btn-chico" id="editar">Editar</button></div>
    <h1>${esc(d.nombre)}</h1>
    <p class="saludo">${esc([d.acreedor, d.tipo].filter(Boolean).join(' · '))}</p>
    <div class="card">
      <div class="etiqueta">Saldo pendiente</div>
      <div class="cifra">${pesos(d.saldo)}</div>
      ${barra(d)}
      <div class="deuda-sub">${pct}% pagado de ${pesos(d.montoOriginal)}</div>
      <div class="deuda-pie ${t.clase}" style="margin-top:10px">${t.texto}</div>
    </div>
    <div class="fila">
      <div class="card mini"><div class="etiqueta">Cuota</div><div class="cifra">${d.cuota ? pesos(d.cuota) : '—'}</div></div>
      <div class="card mini"><div class="etiqueta">Día de pago</div><div class="cifra">${d.dia || '—'}</div></div>
    </div>
    <div class="card"><div class="etiqueta">Proyección</div><div style="margin-top:6px;line-height:1.45">${proy}</div>
      ${d.tasa ? `<div class="deuda-sub" style="margin-top:6px">Tasa anual ${d.tasa}%</div>` : ''}</div>
    ${d.saldo > 0 ? '<button class="btn" id="abonar" style="max-width:none;margin-top:0">Registrar abono</button>' : ''}
    ${d.notas ? `<div class="card" style="margin-top:14px"><div class="etiqueta">Notas</div><div style="margin-top:6px;white-space:pre-wrap">${esc(d.notas)}</div></div>` : ''}
    <div class="seccion">Historial</div>
    <div class="card">${hist.map(itemHist).join('<div class="sep"></div>')}</div>
    <button class="btn peligro" id="eliminar" style="max-width:none">Eliminar deuda</button>`;

  c.querySelector('#atras').onclick = () => ctx.ir('deudas', null);
  c.querySelector('#editar').onclick = () => ctx.ir('deudas', { vista: 'form', id: d.id });
  const ab = c.querySelector('#abonar');
  if (ab) ab.onclick = () => modalAbono(ctx, d);

  c.querySelectorAll('[data-deshacer]').forEach((b) => {
    b.onclick = async () => {
      const h = d.historial.find((x) => x.id === b.dataset.deshacer);
      if (!h || !confirm(`¿Deshacer el abono de ${pesos(h.monto)}? El saldo vuelve a subir.`)) return;
      d.saldo += h.monto;
      d.historial = d.historial.filter((x) => x.id !== h.id);
      e.pagos = e.pagos.filter((x) => x.id !== h.pagoId);
      await ctx.guardar();
      ctx.ir('deudas', { vista: 'detalle', id: d.id });
    };
  });

  c.querySelector('#eliminar').onclick = async () => {
    if (!confirm(`¿Eliminar "${d.nombre}" y todo su historial? Esto no se puede deshacer.`)) return;
    e.deudas = e.deudas.filter((x) => x.id !== d.id);
    e.pagos = e.pagos.filter((x) => x.deudaId !== d.id);
    await ctx.guardar();
    ctx.aviso('Deuda eliminada');
    ctx.ir('deudas', null);
  };
}

function modalAbono(ctx, d) {
  const hoy = C.aISO(new Date());
  const sugerido = Math.min(d.cuota || d.saldo, d.saldo);
  const m = modal(`
    <h2>Registrar abono</h2>
    <form id="fa">
      <label>Monto<input name="monto" data-monto inputmode="numeric" autocomplete="off" value="${miles(sugerido)}" required></label>
      <label>Fecha<input name="fecha" type="date" value="${hoy}" max="${hoy}" required></label>
      <label>Nota (opcional)<input name="nota" maxlength="80" autocomplete="off"></label>
      <div class="error" id="err"></div>
      <button class="btn" type="submit" style="max-width:none">Guardar abono</button>
      <button class="volver" type="button" id="cancel">Cancelar</button>
    </form>`);
  enlazarMonto(m.el);
  m.el.querySelector('#cancel').onclick = m.cerrar;
  m.el.querySelector('#fa').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target.elements;
    const monto = C.parseMonto(f.monto.value);
    const err = m.el.querySelector('#err');
    if (monto <= 0) { err.textContent = 'Escribe un monto mayor a cero.'; return; }
    if (monto > d.saldo) { err.textContent = `El abono supera el saldo (${pesos(d.saldo)}).`; return; }
    const fecha = f.fecha.value || hoy;
    const pagoId = crypto.randomUUID();
    const e = ctx.sesion().estado;
    e.pagos.push({ id: pagoId, deudaId: d.id, monto, fecha, nota: f.nota.value.trim() });
    d.saldo -= monto;
    d.historial.push({ id: crypto.randomUUID(), f: Date.now(), tipo: 'abono', monto, fecha, nota: f.nota.value.trim(), pagoId });
    await ctx.guardar();
    m.cerrar();
    ctx.aviso(d.saldo <= 0 ? '¡Deuda liquidada!' : 'Abono registrado');
    ctx.ir('deudas', { vista: 'detalle', id: d.id });
  };
}

/* ================= Formulario ================= */

export function formulario(ctx, c, id) {
  const e = ctx.sesion().estado;
  const d = id ? e.deudas.find((x) => x.id === id) : null;
  if (id && !d) return ctx.ir('deudas', null);
  const v = d || { nombre: '', acreedor: '', tipo: TIPOS[0], montoOriginal: 0, saldo: 0, tasa: 0, cuota: 0, dia: 0, notas: '' };

  c.innerHTML = `
    <div class="encabezado"><button class="atras" id="atras">‹ ${d ? 'Cancelar' : 'Deudas'}</button></div>
    <h1>${d ? 'Editar deuda' : 'Nueva deuda'}</h1>
    <form id="f" class="formulario">
      <label>Nombre<input name="nombre" maxlength="40" value="${esc(v.nombre)}" placeholder="Ej: Tarjeta Visa" autocomplete="off" required></label>
      <label>Acreedor (opcional)<input name="acreedor" maxlength="40" value="${esc(v.acreedor)}" placeholder="Banco, tienda o persona" autocomplete="off"></label>
      <label>Tipo<select name="tipo">${TIPOS.map((t) => `<option${t === v.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Monto original<input name="montoOriginal" data-monto inputmode="numeric" value="${miles(v.montoOriginal)}" placeholder="0" autocomplete="off" required></label>
      <label>Saldo actual<input name="saldo" data-monto inputmode="numeric" value="${d ? miles(v.saldo) : ''}" placeholder="${d ? '0' : 'Igual al monto original'}" autocomplete="off"></label>
      <div class="dos">
        <label>Cuota mensual<input name="cuota" data-monto inputmode="numeric" value="${miles(v.cuota)}" placeholder="0" autocomplete="off"></label>
        <label>Día de pago<input name="dia" inputmode="numeric" maxlength="2" value="${v.dia || ''}" placeholder="1 a 31" autocomplete="off"></label>
      </div>
      <label>Tasa de interés anual % (opcional)<input name="tasa" inputmode="decimal" value="${v.tasa || ''}" placeholder="Ej: 28,5" autocomplete="off"></label>
      <label>Notas (opcional)<textarea name="notas" rows="3" maxlength="300">${esc(v.notas)}</textarea></label>
      <div class="error" id="err"></div>
      <button class="btn" type="submit" style="max-width:none">${d ? 'Guardar cambios' : 'Crear deuda'}</button>
    </form>`;
  enlazarMonto(c);
  c.querySelector('#atras').onclick = () => (d ? ctx.ir('deudas', { vista: 'detalle', id: d.id }) : ctx.ir('deudas', null));

  c.querySelector('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target.elements;
    const err = c.querySelector('#err');
    const montoOriginal = C.parseMonto(f.montoOriginal.value);
    const saldo = f.saldo.value.trim() === '' ? montoOriginal : C.parseMonto(f.saldo.value);
    const dia = Number(f.dia.value) || 0;
    const nuevo = {
      nombre: f.nombre.value.trim(), acreedor: f.acreedor.value.trim(), tipo: f.tipo.value,
      montoOriginal, saldo, tasa: C.parseTasa(f.tasa.value), cuota: C.parseMonto(f.cuota.value), dia, notas: f.notas.value.trim()
    };
    if (!nuevo.nombre) { err.textContent = 'Escribe un nombre.'; return; }
    if (montoOriginal <= 0) { err.textContent = 'El monto original debe ser mayor a cero.'; return; }
    if (f.dia.value.trim() !== '' && (dia < 1 || dia > 31)) { err.textContent = 'El día de pago debe estar entre 1 y 31.'; return; }
    if (nuevo.tasa > 300) { err.textContent = 'Revisa la tasa: parece demasiado alta.'; return; }

    if (!d) {
      e.deudas.push({ id: crypto.randomUUID(), ...nuevo, creada: Date.now(), planDesde: Date.now(), historial: [{ id: crypto.randomUUID(), f: Date.now(), tipo: 'creada' }] });
    } else {
      for (const campo of Object.keys(CAMPOS)) {
        if (d[campo] !== nuevo[campo]) {
          d.historial.push({ id: crypto.randomUUID(), f: Date.now(), tipo: 'cambio', campo, antes: d[campo], despues: nuevo[campo] });
        }
      }
      if (d.dia !== nuevo.dia) d.planDesde = Date.now();
      Object.assign(d, nuevo);
    }
    await ctx.guardar();
    ctx.aviso(d ? 'Cambios guardados' : 'Deuda creada');
    ctx.ir('deudas', d ? { vista: 'detalle', id: d.id } : null);
  };
}
