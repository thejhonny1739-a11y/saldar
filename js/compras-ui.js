// Pantalla Compras: lista, registro manual y lectura de mensajes del banco con confirmación.
import { esc, pesos, miles, fechaCorta, desdeISO, modal, enlazarMonto } from './util.js';
import * as L from './lector.js';
import { aISO, parseMonto } from './calculos.js';

let borrador = null; // datos pre-llenados (por ejemplo desde un mensaje leído)

const huella = (c) => `${c.fecha}|${c.monto}|${L.normalizar(c.comercio)}|${c.tarjeta || ''}`;

/* ================= Lista ================= */

export function lista(ctx, c) {
  const e = ctx.sesion().estado;
  const compras = [...e.compras].sort((a, b) => (b.fecha === a.fecha ? b.creada - a.creada : b.fecha.localeCompare(a.fecha)));
  const pref = aISO(new Date()).slice(0, 7);
  const delMes = compras.filter((x) => x.fecha.startsWith(pref));
  const totalMes = delMes.reduce((t, x) => t + x.monto, 0);

  let grupos = '';
  let ultima = '';
  for (const x of compras.slice(0, 200)) {
    if (x.fecha !== ultima) {
      ultima = x.fecha;
      grupos += `<div class="seccion">${esc(fechaCorta(desdeISO(x.fecha)))}</div>`;
    }
    grupos += `<button class="deuda" data-id="${esc(x.id)}">
      <div class="deuda-top"><span class="deuda-nombre">${esc(x.comercio)}</span><span class="deuda-monto">${pesos(x.monto)}</span></div>
      <div class="deuda-sub">${esc(x.categoria)}${x.tarjeta ? ` · •••• ${esc(x.tarjeta)}` : ''}</div></button>`;
  }

  c.innerHTML = `
    <div class="encabezado"><h1>Compras</h1><button class="btn-chico" id="nueva">+ Nueva</button></div>
    <div class="card"><div class="etiqueta">Gastado este mes</div><div class="cifra">${pesos(totalMes)}</div>
      <div class="deuda-sub">${delMes.length} ${delMes.length === 1 ? 'compra' : 'compras'}</div></div>
    <button class="btn sec" id="pegar" style="max-width:none;margin-top:0">Leer un mensaje del banco</button>
    ${e.compras.length === 0 ? '<div class="card vacio" style="margin-top:14px"><b>Sin compras registradas</b>Agrégalas a mano o pega el SMS o correo del banco y Saldar lo lee por ti.</div>' : grupos}
    ${(e.sinEntender || []).length ? `<button class="enlace" id="sin" style="margin:18px auto">Mensajes que no entendí (${e.sinEntender.length})</button>` : ''}`;

  c.querySelector('#nueva').onclick = () => { borrador = null; ctx.ir('compras', { vista: 'compra' }); };
  c.querySelector('#pegar').onclick = () => modalPegar(ctx);
  c.querySelectorAll('.deuda[data-id]').forEach((b) => { b.onclick = () => ctx.ir('compras', { vista: 'compra', id: b.dataset.id }); });
  const sin = c.querySelector('#sin');
  if (sin) sin.onclick = () => modalSinEntender(ctx);
}

/* ================= Leer un mensaje ================= */

function modalPegar(ctx) {
  const m = modal(`
    <h2>Leer un mensaje del banco</h2>
    <p class="nota" style="margin-top:0">Pega el SMS o correo de la compra. Saldar busca el monto, el comercio y la tarjeta, y te los muestra para que confirmes antes de guardar.</p>
    <textarea id="txt" rows="5" placeholder="Pega aquí el mensaje…" style="width:100%;padding:12px;font-size:16px;color:var(--texto);background:var(--card);border:1px solid var(--borde);border-radius:12px;font-family:inherit"></textarea>
    <button class="btn sec" id="clip" type="button" style="max-width:none">Pegar del portapapeles</button>
    <div class="error" id="err"></div>
    <button class="btn" id="leer" style="max-width:none;margin-top:0">Leer mensaje</button>
    <button class="volver" id="no" type="button" style="width:100%">Cancelar</button>`);
  const txt = m.el.querySelector('#txt');
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#clip').onclick = async () => {
    try { txt.value = await navigator.clipboard.readText(); } catch { m.el.querySelector('#err').textContent = 'No pude leer el portapapeles. Mantén presionado en el cuadro y toca Pegar.'; }
  };
  m.el.querySelector('#leer').onclick = async () => {
    const texto = txt.value.trim();
    if (!texto) { m.el.querySelector('#err').textContent = 'Pega primero el mensaje.'; return; }
    const e = ctx.sesion().estado;
    const r = L.leerTexto(texto, e.aprendido.comercios);
    m.cerrar();
    if (r.tipo === 'ingreso') { ctx.aviso('Ese mensaje parece un ingreso, no una compra.'); return; }
    if (!r.monto) {
      e.sinEntender = [{ id: crypto.randomUUID(), f: Date.now(), texto: texto.slice(0, 600) }, ...(e.sinEntender || [])].slice(0, 30);
      try { await ctx.guardar(); } catch { /* ya avisó */ }
      borrador = { nota: '' };
      ctx.aviso('No entendí el mensaje. Llena los datos; lo guardé para mejorar el lector.');
    } else {
      borrador = { comercio: r.comercio, monto: r.monto, fecha: r.fecha || aISO(new Date()), tarjeta: r.tarjeta, categoria: r.categoria, leido: true, completo: r.confianza === 3 };
    }
    ctx.ir('compras', { vista: 'compra' });
  };
}

function modalSinEntender(ctx) {
  const e = ctx.sesion().estado;
  const m = modal(`
    <h2>Mensajes que no entendí</h2>
    <p class="nota" style="margin-top:0">Si me los pasas para mejorar el lector, <b>tacha antes tu nombre, números de cuenta y cualquier dato personal</b>.</p>
    ${(e.sinEntender || []).map((s) => `<div class="card" style="margin-bottom:10px;font-size:14px;white-space:pre-wrap">${esc(s.texto)}</div>`).join('')}
    <button class="btn sec" id="copiar" style="max-width:none">Copiar todos</button>
    <button class="btn peligro" id="borrar" style="max-width:none">Borrar la lista</button>
    <button class="volver" id="no" type="button" style="width:100%">Cerrar</button>`);
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(e.sinEntender.map((s) => s.texto).join('\n---\n')); ctx.aviso('Copiados'); } catch { ctx.aviso('No pude copiar'); }
  };
  m.el.querySelector('#borrar').onclick = async () => {
    e.sinEntender = [];
    await ctx.guardar();
    m.cerrar();
    ctx.ir('compras', null);
  };
}

/* ================= Formulario ================= */

export function formulario(ctx, c, id) {
  const e = ctx.sesion().estado;
  const x = id ? e.compras.find((k) => k.id === id) : null;
  if (id && !x) return ctx.ir('compras', null);
  const hoy = aISO(new Date());
  const b = x || borrador || {};
  const v = { comercio: b.comercio || '', monto: b.monto || 0, fecha: b.fecha || hoy, tarjeta: b.tarjeta || '', categoria: b.categoria || 'Otros', nota: b.nota || '' };
  const leido = !x && b.leido;

  c.innerHTML = `
    <div class="encabezado"><button class="atras" id="atras">‹ Compras</button></div>
    <h1>${x ? 'Editar compra' : leido ? 'Confirma la compra' : 'Nueva compra'}</h1>
    ${leido ? `<div class="alerta info" style="margin-top:8px">${b.completo ? 'Leí estos datos del mensaje. Revísalos antes de guardar.' : 'Leí lo que pude del mensaje. Completa o corrige lo que falte.'}</div>` : ''}
    <form id="f" class="formulario">
      <label>Comercio<input name="comercio" maxlength="40" value="${esc(v.comercio)}" placeholder="Ej: Éxito" autocomplete="off" required></label>
      <label>Monto<input name="monto" data-monto inputmode="numeric" value="${miles(v.monto)}" placeholder="0" autocomplete="off" required></label>
      <div class="dos">
        <label>Fecha<input name="fecha" type="date" value="${esc(v.fecha)}" max="${hoy}" required></label>
        <label>Tarjeta (4 dígitos)<input name="tarjeta" inputmode="numeric" maxlength="4" value="${esc(v.tarjeta)}" placeholder="Opcional" autocomplete="off"></label>
      </div>
      <label>Categoría<select name="categoria">${L.CATEGORIAS.map((k) => `<option${k === v.categoria ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Nota (opcional)<input name="nota" maxlength="80" value="${esc(v.nota)}" autocomplete="off"></label>
      <div class="error" id="err"></div>
      <button class="btn" type="submit" style="max-width:none">${x ? 'Guardar cambios' : 'Guardar compra'}</button>
      ${x ? '<button class="btn peligro" type="button" id="eliminar" style="max-width:none">Eliminar compra</button>' : ''}
    </form>`;
  enlazarMonto(c);
  c.querySelector('#atras').onclick = () => { borrador = null; ctx.ir('compras', null); };

  c.querySelector('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target.elements;
    const err = c.querySelector('#err');
    const nueva = {
      comercio: f.comercio.value.trim(), monto: parseMonto(f.monto.value), fecha: f.fecha.value || hoy,
      tarjeta: f.tarjeta.value.replace(/\D/g, '').slice(0, 4), categoria: f.categoria.value, nota: f.nota.value.trim()
    };
    if (!nueva.comercio) { err.textContent = 'Escribe el comercio.'; return; }
    if (nueva.monto <= 0) { err.textContent = 'El monto debe ser mayor a cero.'; return; }
    if (!x) {
      const repetida = e.compras.some((k) => huella(k) === huella(nueva));
      if (repetida && !confirm('Ya registraste una compra igual (misma fecha, monto y comercio). ¿Guardarla de todos modos?')) return;
      e.compras.push({ id: crypto.randomUUID(), ...nueva, origen: leido ? 'texto' : 'manual', creada: Date.now() });
    } else {
      Object.assign(x, nueva);
    }
    e.aprendido.comercios[L.normalizar(nueva.comercio)] = nueva.categoria;
    await ctx.guardar();
    borrador = null;
    ctx.aviso(x ? 'Cambios guardados' : 'Compra guardada');
    ctx.ir('compras', null);
  };

  const del = c.querySelector('#eliminar');
  if (del) del.onclick = async () => {
    if (!confirm(`¿Eliminar la compra en "${x.comercio}"? Esto no se puede deshacer.`)) return;
    e.compras = e.compras.filter((k) => k.id !== x.id);
    await ctx.guardar();
    ctx.aviso('Compra eliminada');
    ctx.ir('compras', null);
  };
}
