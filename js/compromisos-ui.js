// Pantallas de compromisos recurrentes, categorías y espacios.
import { esc, pesos, fechaCorta, miles, enlazarMonto, modal } from './util.js';
import { parseMonto, aISO, situacion } from './calculos.js';
import * as K from './compromisos.js';
import * as G from './graficas.js';
import { entender, EJEMPLOS } from './asistente.js';
import { buscar } from './busqueda.js';
import * as deudasUI from './deudas-ui.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MES3 = MESES.map((m) => m.slice(0, 3));

let periodo = 'mensual'; // 'anual' | 'mensual' | 'semanal'
let ancla = null;        // fecha de referencia del periodo que se está viendo
let modo = 'balance';    // 'balance' | 'gastos' | 'ingresos'
const cerrados = new Set(); // grupos plegados de la matriz anual
export const reiniciar = () => { ancla = null; periodo = 'mensual'; modo = 'balance'; cerrados.clear(); };

const ico = (cat, clase = '') => {
  const col = K.colorSeguro(cat.color);
  return `<span class="ico ${clase}" style="background:${col}2e;color:${col}">${esc(cat.icono)}</span>`;
};
const lunesDe = (f) => new Date(f.getFullYear(), f.getMonth(), f.getDate() - ((f.getDay() + 6) % 7));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function rango(a) {
  if (periodo === 'anual') return [new Date(a.getFullYear(), 0, 1), new Date(a.getFullYear(), 11, 31)];
  if (periodo === 'semanal') { const l = lunesDe(a); return [l, new Date(l.getFullYear(), l.getMonth(), l.getDate() + 6)]; }
  return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 0)];
}
const mover = (a, d) => (periodo === 'anual' ? new Date(a.getFullYear() + d, a.getMonth(), 1)
  : periodo === 'semanal' ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * d)
  : new Date(a.getFullYear(), a.getMonth() + d, 1));

/* ================= Pestaña "Hoy" ================= */

export function hoy(ctx, c) {
  const s = ctx.sesion();
  const e = s.estado;
  const ahora = new Date();
  if (!ancla) ancla = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const esp = K.espacioActivo(e);
  const [desde, hasta] = rango(ancla);
  const todas = K.ocurrenciasRango(e, esp.id, desde, hasta, ahora);
  const r = K.resumenMes(todas);
  const pendientes = todas.filter((o) => !o.pagado && o.fecha <= new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 7)).length;

  let grande, izq, der, parte;
  if (modo === 'gastos') {
    grande = r.gastos; izq = ['Completado', r.gastosHechos, 'menta']; der = ['Pendiente', r.gastos - r.gastosHechos, 'rosa']; parte = r.gastos ? r.gastosHechos / r.gastos : 0;
  } else if (modo === 'ingresos') {
    grande = r.ingresos; izq = ['Recibido', r.ingresosHechos, 'menta']; der = ['Por recibir', r.ingresos - r.ingresosHechos, 'ambar']; parte = r.ingresos ? r.ingresosHechos / r.ingresos : 0;
  } else {
    grande = r.ingresos - r.gastos; izq = ['Ingresos', r.ingresos, 'menta']; der = ['Gastos', r.gastos, 'rosa']; parte = r.ingresos + r.gastos ? r.ingresos / (r.ingresos + r.gastos) : 0;
  }
  const lista = todas.filter((o) => modo === 'balance' || (modo === 'gastos' ? o.tipo === 'gasto' : o.tipo === 'ingreso'));

  /* Navegador del periodo */
  let nav;
  if (periodo === 'mensual') {
    const et = (f) => `${MES3[f.getMonth()]}${f.getFullYear() !== ahora.getFullYear() ? ' ' + String(f.getFullYear()).slice(2) : ''}`;
    const act = ancla.getFullYear() !== ahora.getFullYear() ? `${MES3[ancla.getMonth()]} ${ancla.getFullYear()}` : MESES[ancla.getMonth()];
    nav = `<button class="chip-mes" data-d="-1">${esc(et(mover(ancla, -1)))}</button>
      <button class="chip-mes act" id="hoy">${esc(act)}</button>
      <button class="chip-mes" data-d="1">${esc(et(mover(ancla, 1)))}</button>`;
  } else if (periodo === 'anual') {
    nav = `<button class="chip-mes anio" id="hoy">${esc(String(ancla.getFullYear()).split('').join(' '))}</button>`;
  } else {
    const a = desde, b = hasta;
    const t = a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${MES3[b.getMonth()].toLowerCase()}` : `${a.getDate()} ${MES3[a.getMonth()].toLowerCase()} – ${b.getDate()} ${MES3[b.getMonth()].toLowerCase()}`;
    nav = `<button class="chip-mes act" id="hoy">${esc(t)}</button>`;
  }

  /* Gráficas */
  const grafDona = () => {
    if (!todas.length) return '';
    if (modo === 'balance') return G.dona([{ nombre: 'Ingresos', valor: r.ingresos, color: '#00d4a0' }, { nombre: 'Gastos', valor: r.gastos, color: '#ff2d78' }], 'Balance', pesos(grande));
    const por = new Map();
    for (const o of lista) {
      const cat = K.categoriaDe(e, o.c);
      const x = por.get(cat.id) || { nombre: cat.nombre, icono: cat.icono, color: cat.color, valor: 0 };
      x.valor += o.monto; por.set(cat.id, x);
    }
    return G.dona([...por.values()], modo === 'gastos' ? 'Gastos' : 'Ingresos', pesos(grande));
  };

  /* Filas */
  const fila = (o) => {
    const cat = K.categoriaDe(e, o.c);
    const colorFecha = o.estado === 'vencido' ? 'rosa' : o.estado === 'pagado' ? 'menta' : '';
    const dato = o.c.esDeuda ? `data-deuda="${esc(o.c.id)}"` : `data-id="${esc(o.c.id)}"`;
    return `
      <div class="comp${o.pagado ? ' hecho' : ''}">
        <button class="comp-main" ${dato}>
          ${ico(cat)}
          <span class="comp-txt"><b>${esc(o.c.nombre)}</b>
            <span class="comp-meta"><i class="chip ${colorFecha}">${esc(fechaCorta(o.fecha))}</i><span>${o.c.esDeuda ? 'Deuda' : esc(K.nombreFrecuencia(o.c.frecuencia))}</span></span></span>
          <span class="pill ${o.tipo === 'ingreso' ? 'ing' : ''}">${o.tipo === 'ingreso' ? '+' : '−'} ${pesos(o.monto)}</span>
        </button>
        ${o.c.esDeuda
          ? `<button class="check${o.pagado ? ' on' : ''}" data-abono="${esc(o.c.id)}" data-monto="${o.monto}" data-actual="${o.fecha.getFullYear() === ahora.getFullYear() && o.fecha.getMonth() === ahora.getMonth() ? 1 : ''}" data-pagado="${o.pagado ? 1 : ''}" aria-label="Registrar abono">${o.pagado ? '✓' : ''}</button>`
          : `<button class="check${o.pagado ? ' on' : ''}" data-id="${esc(o.c.id)}" data-iso="${o.iso}" aria-label="${o.tipo === 'ingreso' ? 'Marcar como recibido' : 'Marcar como pagado'}">${o.pagado ? '✓' : ''}</button>`}
      </div>`;
  };

  let cuerpo = '';
  let matrizInfo = null;
  if (periodo === 'anual') {
    const meses = MESES.map((_, i) => { const rm = K.resumenMes(todas.filter((o) => o.fecha.getMonth() === i)); return { i, ing: rm.ingresos, gas: rm.gastos }; });
    matrizInfo = G.matriz(e, todas, cerrados);
    cuerpo = grafDona() + (todas.length ? G.tendencia(meses, ancla.getFullYear() === ahora.getFullYear() ? ahora.getMonth() : -1) : '') + matrizInfo.html
      + (todas.length ? '' : '<div class="card vacio"><b>Nada por aquí</b>No hay movimientos en este año.</div>');
  } else if (lista.length === 0) {
    cuerpo = `<div class="card vacio"><b>Nada por aquí</b>${(e.compromisos || []).length || e.deudas.length ? 'No hay movimientos en este periodo.' : 'Toca el botón + para crear tu primer compromiso: la luz, el arriendo, tu salario… Se repite solo.'}</div>`;
  } else if (periodo === 'semanal') {
    let dia = '';
    for (const o of lista) {
      if (o.iso !== dia) {
        dia = o.iso;
        const esHoy = o.iso === aISO(ahora);
        cuerpo += `<div class="semana-t"><b>${esc(cap(o.fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' })))}</b>${esHoy ? '<span class="insignia" style="margin:0">Hoy</span>' : ''}<i></i></div>`;
      }
      cuerpo += fila(o);
    }
  } else {
    cuerpo = grafDona();
    let sem = 0;
    for (const o of lista) {
      const n = K.semanaDelMes(o.fecha);
      if (n !== sem) { sem = n; cuerpo += `<div class="semana-t"><b>S.${n}</b><i></i><span>${lista.filter((x) => K.semanaDelMes(x.fecha) === n).length}</span></div>`; }
      cuerpo += fila(o);
    }
  }

  /* Avisos y deudas */
  const sit = e.deudas.map((d) => situacion(d, e, ahora));
  const vencidas = sit.filter((x) => x.pendiente > 0 && x.vencida).length;
  const respaldoViejo = e.deudas.length + e.compromisos.length > 0 && (!e.ajustes.ultimoRespaldo || Date.now() - e.ajustes.ultimoRespaldo > 7 * 86400000);
  const totalDeuda = e.deudas.reduce((t, d) => t + (d.saldo || 0), 0);

  c.innerHTML = `
    <div class="encabezado">
      <button class="espacio-chip" id="espacio">${ico(esp, 'peq')}<b>${esc(esp.nombre)}</b><span class="flecha-txt">›</span>${pendientes ? `<em class="punto-aviso" title="Pendientes esta semana"></em>` : ''}</button>
      <span class="enc-acc"><button class="icon-btn" id="buscar" aria-label="Buscar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg></button><button class="avatar-btn" id="perfil" aria-label="Ajustes">${esc((s.nombre.trim()[0] || '?').toUpperCase())}</button></span>
    </div>
    <div class="periodos">${[['anual', 'Anual'], ['mensual', 'Mensual'], ['semanal', 'Semanal']].map(([k, t]) => `<button data-p="${k}" class="${periodo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="meses"><button class="flecha" id="ant" aria-label="Anterior">‹</button>${nav}<button class="flecha" id="sig" aria-label="Siguiente">›</button></div>
    <div class="modos">${[['balance', 'Balance'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos']].map(([k, t]) => `<button data-modo="${k}" class="${modo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="gran${grande < 0 ? ' neg' : ''}">${pesos(grande)}</div>
    <div class="barra-prop"><span style="width:${Math.round(parte * 100)}%"></span></div>
    <div class="resumen">
      <div><span class="etiqueta">${izq[0]}</span><b class="${izq[2]}">${pesos(izq[1])}</b></div>
      <div><span class="etiqueta">${der[0]}</span><b class="${der[2]}">${pesos(der[1])}</b></div>
    </div>
    ${vencidas ? `<div class="alerta">Tienes ${vencidas} ${vencidas === 1 ? 'pago de deuda vencido' : 'pagos de deudas vencidos'}.</div>` : ''}
    ${respaldoViejo ? `<button class="alerta info" id="resp">${e.ajustes.ultimoRespaldo ? `Hace ${Math.floor((Date.now() - e.ajustes.ultimoRespaldo) / 86400000)} días que no haces un respaldo.` : 'Aún no has hecho un respaldo.'} Toca aquí para guardarlo ahora.</button>` : ''}
    ${cuerpo}
    ${e.deudas.length ? `<div class="seccion">Tus deudas</div>
      <button class="deuda" id="verdeudas"><div class="deuda-top"><span class="deuda-nombre">Total adeudado</span><span class="deuda-monto">${pesos(totalDeuda)}</span></div>
      <div class="deuda-sub">${e.deudas.filter((d) => d.saldo > 0).length} activas · ver todas</div></button>` : ''}`;

  const nuevaAncla = (f) => { ancla = f; hoy(ctx, c); };
  c.querySelector('#ant').onclick = () => nuevaAncla(mover(ancla, -1));
  c.querySelector('#sig').onclick = () => nuevaAncla(mover(ancla, 1));
  c.querySelectorAll('.chip-mes[data-d]').forEach((b) => { b.onclick = () => nuevaAncla(mover(ancla, Number(b.dataset.d))); });
  c.querySelector('#hoy').onclick = () => nuevaAncla(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
  c.querySelectorAll('.periodos button').forEach((b) => { b.onclick = () => { periodo = b.dataset.p; hoy(ctx, c); }; });
  c.querySelectorAll('.modos button').forEach((b) => { b.onclick = () => { modo = b.dataset.modo; hoy(ctx, c); }; });
  c.querySelectorAll('.tend-col').forEach((b) => { b.onclick = () => { periodo = 'mensual'; ancla = new Date(ancla.getFullYear(), Number(b.dataset.mes), 1); hoy(ctx, c); }; });
  c.querySelectorAll('.mx-grupo').forEach((b) => { b.onclick = () => { const g = b.dataset.grupo; if (cerrados.has(g)) cerrados.delete(g); else cerrados.add(g); hoy(ctx, c); }; });
  c.querySelectorAll('.mx-nom').forEach((b) => { b.onclick = () => (b.dataset.deuda ? ctx.ir('deudas', { vista: 'detalle', id: b.dataset.edit }) : ctx.ir('inicio', { vista: 'compromiso', id: b.dataset.edit })); });
  c.querySelectorAll('.celda[data-fila]').forEach((b) => {
    b.onclick = () => modalCelda(ctx, matrizInfo.filas.get(b.dataset.fila), Number(b.dataset.m), () => hoy(ctx, c));
  });
  c.querySelector('#espacio').onclick = () => modalEspacios(ctx, () => hoy(ctx, c));
  c.querySelector('#perfil').onclick = () => ctx.ir('ajustes', null);
  c.querySelector('#buscar').onclick = () => buscar(ctx);
  const resp = c.querySelector('#resp');
  if (resp) resp.onclick = () => ctx.respaldar();
  const vd = c.querySelector('#verdeudas');
  if (vd) vd.onclick = () => ctx.ir('deudas', null);
  c.querySelectorAll('.comp-main[data-id]').forEach((b) => { b.onclick = () => ctx.ir('inicio', { vista: 'compromiso', id: b.dataset.id }); });
  c.querySelectorAll('.comp-main[data-deuda]').forEach((b) => { b.onclick = () => ctx.ir('deudas', { vista: 'detalle', id: b.dataset.deuda }); });
  c.querySelectorAll('button.check[data-abono]').forEach((b) => {
    b.onclick = () => {
      const d = e.deudas.find((x) => x.id === b.dataset.abono);
      if (!d) return;
      // Solo se abona desde aquí la cuota del mes actual; lo demás se ve en el detalle de la deuda.
      if (b.dataset.pagado || !b.dataset.actual || d.saldo <= 0) { ctx.ir('deudas', { vista: 'detalle', id: d.id }); return; }
      deudasUI.modalAbono(ctx, d, { sugerido: Number(b.dataset.monto), despues: () => hoy(ctx, c) });
    };
  });
  c.querySelectorAll('button.check[data-id]').forEach((b) => {
    b.onclick = async () => {
      const comp = e.compromisos.find((x) => x.id === b.dataset.id);
      if (!comp) return;
      comp.cumplidos = comp.cumplidos || {};
      if (comp.cumplidos[b.dataset.iso]) delete comp.cumplidos[b.dataset.iso];
      else comp.cumplidos[b.dataset.iso] = Date.now();
      try { await ctx.guardar(); } catch { return; }
      hoy(ctx, c);
    };
  });
}

/* ================= Detalle de una celda de la matriz ================= */

function modalCelda(ctx, fila, mes, refrescar) {
  if (!fila) return;
  const e = ctx.sesion().estado;
  const items = fila.porMes[mes];
  const ESTADO = { pagado: ['Pagado', 'menta'], vencido: ['Vencido', 'rosa'], pendiente: ['Pendiente', 'suave'] };
  const m = modal(`
    <h2>${esc(fila.c.nombre)} · ${MESES[mes]}</h2>
    ${items.map((o, i) => {
      const [t, k] = o.tipo === 'ingreso' && o.pagado ? ['Recibido', 'menta'] : ESTADO[o.estado];
      return `<div class="hist"><div><b>${esc(fechaCorta(o.fecha))}</b><div class="hist-n ${k}">${t}</div></div>
        <div style="display:flex;align-items:center;gap:10px"><b>${o.tipo === 'ingreso' ? '+' : '−'} ${pesos(o.monto)}</b>
        ${fila.c.esDeuda ? '' : `<button class="check${o.pagado ? ' on' : ''}" data-i="${i}" aria-label="Cambiar estado">${o.pagado ? '✓' : ''}</button>`}</div></div>`;
    }).join('<div class="sep"></div>')}
    <button class="btn sec" id="ed" style="max-width:none">${fila.c.esDeuda ? 'Ver deuda' : 'Editar compromiso'}</button>
    <button class="volver" id="no" type="button" style="width:100%">Cerrar</button>`);
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#ed').onclick = () => { m.cerrar(); if (fila.c.esDeuda) ctx.ir('deudas', { vista: 'detalle', id: fila.c.id }); else ctx.ir('inicio', { vista: 'compromiso', id: fila.c.id }); };
  m.el.querySelectorAll('button.check').forEach((b) => {
    b.onclick = async () => {
      const comp = e.compromisos.find((x) => x.id === fila.c.id);
      const o = items[Number(b.dataset.i)];
      if (!comp || !o) return;
      comp.cumplidos = comp.cumplidos || {};
      if (comp.cumplidos[o.iso]) delete comp.cumplidos[o.iso]; else comp.cumplidos[o.iso] = Date.now();
      try { await ctx.guardar(); } catch { return; }
      m.cerrar();
      refrescar();
    };
  });
}

/* ================= Asistente ================= */

export function asistente(ctx) {
  const s = ctx.sesion();
  const e = s.estado;
  const m = modal(`
    <h2 class="asis-titulo">Hola ${esc(s.nombre)},<br>agrega tu próximo compromiso</h2>
    <div class="card" style="padding:14px">
      <div class="etiqueta" style="margin-bottom:8px;color:#8fa3d9">Puedes escribir, por ejemplo:</div>
      <div id="ej">${EJEMPLOS.map((x) => `<button class="ejemplo" type="button">“${esc(x)}”</button>`).join('')}</div>
    </div>
    <textarea id="txt" class="asis-txt" rows="2" maxlength="200" placeholder="Escribe tu compromiso…" autocomplete="off"></textarea>
    <p class="nota" style="margin-top:6px">Para dictar, toca el micrófono del teclado del iPhone.</p>
    <div id="res"></div>
    <button class="btn" id="ent" style="max-width:none">Entender</button>
    <button class="volver" id="no" type="button" style="width:100%">Cancelar</button>`);
  const txt = m.el.querySelector('#txt');
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelectorAll('.ejemplo').forEach((b, i) => { b.onclick = () => { txt.value = EJEMPLOS[i]; hacer(); }; });

  const hacer = () => {
    const r = entender(txt.value, e, new Date());
    const res = m.el.querySelector('#res');
    if (!r.datos) { res.innerHTML = `<div class="alerta">${esc(r.avisos[0])}</div>`; return; }
    const d = r.datos;
    const cat = e.categorias.find((k) => k.id === d.categoriaId) || { nombre: 'Otros', icono: '📦', color: '#9aa5b1' };
    res.innerHTML = `
      <div class="card" style="margin-top:12px">
        <div class="ajuste"><span>${d.tipo === 'ingreso' ? '↙ Ingreso' : '↗ Gasto'}</span><b>${esc(d.nombre)}</b></div>
        <div class="ajuste"><span>Monto</span><b>${d.monto ? pesos(d.monto) : '—'}</b></div>
        <div class="ajuste"><span>Categoría</span><b>${esc(cat.icono)} ${esc(cat.nombre)}</b></div>
        <p class="nota" style="margin:10px 0 0">${esc(K.descripcion(d.frecuencia, d.inicio, null))}</p>
      </div>
      ${r.avisos.map((a) => `<div class="alerta" style="margin-bottom:8px">${esc(a)}</div>`).join('')}
      ${r.ok ? '<button class="btn" id="crear" style="max-width:none;margin-top:4px">Crear compromiso</button>' : ''}
      <button class="btn sec" id="ajustar" style="max-width:none">Ajustar antes de guardar</button>`;
    const ajustar = res.querySelector('#ajustar');
    ajustar.onclick = () => { m.cerrar(); ctx.ir('inicio', { vista: 'compromiso', borrador: d }); };
    const crear = res.querySelector('#crear');
    if (crear) crear.onclick = async () => {
      e.compromisos.push({ id: crypto.randomUUID(), ...d, espacioId: K.espacioActivo(e).id, creada: Date.now(), cumplidos: {} });
      try { await ctx.guardar(); } catch { return; }
      m.cerrar();
      ctx.aviso('Compromiso creado');
      ctx.ir('inicio', null);
    };
    res.scrollIntoView({ block: 'nearest' });
  };
  m.el.querySelector('#ent').onclick = hacer;
}

/* ================= Botón + ================= */

export function menuAgregar(ctx, abrirMensaje) {
  const m = modal(`
    <h2>¿Qué quieres agregar?</h2>
    <button class="opcion-add" data-a="asis"><span class="ico" style="background:#8b5cf62e">✨</span><span><b>Asistente</b><small>Escribe una frase y la convierto en compromiso</small></span></button>
    <button class="opcion-add" data-a="comp"><span class="ico" style="background:#00d4a02e">🔁</span><span><b>Compromiso</b><small>Un gasto o ingreso que se repite</small></span></button>
    <button class="opcion-add" data-a="deuda"><span class="ico" style="background:#ff2d782e">💳</span><span><b>Deuda</b><small>Tarjeta, préstamo o cuenta por pagar</small></span></button>
    <button class="opcion-add" data-a="compra"><span class="ico" style="background:#8b5cf62e">🛒</span><span><b>Compra</b><small>Anotar un gasto que ya hiciste</small></span></button>
    <button class="opcion-add" data-a="msg"><span class="ico" style="background:#ffb0202e">✉️</span><span><b>Mensaje del banco</b><small>Pegar un SMS o correo y leerlo</small></span></button>
    <button class="volver" id="no" type="button" style="width:100%">Cancelar</button>`);
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelectorAll('.opcion-add').forEach((b) => {
    b.onclick = () => {
      m.cerrar();
      const a = b.dataset.a;
      if (a === 'asis') asistente(ctx);
      else if (a === 'comp') ctx.ir('inicio', { vista: 'compromiso' });
      else if (a === 'deuda') ctx.ir('deudas', { vista: 'form' });
      else if (a === 'compra') ctx.ir('compras', { vista: 'compra' });
      else abrirMensaje();
    };
  });
}

/* ================= Formulario ================= */

export function formulario(ctx, c, id, borrador) {
  const e = ctx.sesion().estado;
  const comp = id ? e.compromisos.find((x) => x.id === id) : null;
  if (id && !comp) return ctx.ir('inicio', null);
  const hoyISO = aISO(new Date());
  const b = comp ? null : borrador || null;
  const s = {
    tipo: comp ? comp.tipo : (b && b.tipo) || 'gasto',
    categoriaId: comp ? comp.categoriaId : (b && b.categoriaId) || null,
    frecuencia: comp ? comp.frecuencia : (b && b.frecuencia) || 'mensual'
  };
  const v = comp || { nombre: '', monto: 0, inicio: hoyISO, fin: null, avisoDias: 1, nota: '', espacioId: K.espacioActivo(e).id, ...(b || {}) };
  const aviso = v.avisoDias === null || v.avisoDias === undefined ? 'n' : String(v.avisoDias);

  c.innerHTML = `
    <div class="encabezado"><button class="atras" id="atras">‹ ${comp ? 'Cancelar' : 'Pagos'}</button></div>
    <h1>${comp ? 'Editar compromiso' : 'Nuevo compromiso'}</h1>
    <form id="f" class="formulario">
      <div class="seg" id="tipo">
        <button type="button" data-t="gasto">↗ Gasto</button>
        <button type="button" data-t="ingreso">↙ Ingreso</button>
      </div>
      <div class="card">
        <div class="etiqueta" style="margin-bottom:6px">Información</div>
        <label>Nombre<input name="nombre" maxlength="40" value="${esc(v.nombre)}" placeholder="Ej: Energía" autocomplete="off" required></label>
        <label style="margin-bottom:0">Monto<input name="monto" data-monto inputmode="numeric" value="${miles(v.monto)}" placeholder="0" autocomplete="off" required></label>
      </div>
      <div class="card">
        <div class="titulo-fila"><span class="etiqueta">Categoría</span><button type="button" class="chip-btn" id="gestionar">Gestionar</button></div>
        <div class="carrusel" id="cats"></div>
      </div>
      <div class="card">
        <div class="etiqueta" style="margin-bottom:10px">Periodicidad</div>
        <div class="carrusel" id="frecs">${K.FRECUENCIAS.map(([k, t]) => `<button type="button" class="frec-chip" data-f="${k}">${t}</button>`).join('')}</div>
      </div>
      <div class="card">
        <div class="etiqueta" style="margin-bottom:6px">Duración</div>
        <label>Fecha inicial<input type="date" name="inicio" value="${esc(v.inicio || hoyISO)}" required></label>
        <label id="fin-caja">Termina la serie
          <select name="finModo"><option value="n">Nunca</option><option value="f"${v.fin ? ' selected' : ''}>En una fecha</option></select></label>
        <label id="fin-fecha" style="${v.fin ? '' : 'display:none'}">Fecha final<input type="date" name="fin" value="${esc(v.fin || '')}"></label>
        <p class="nota" id="desc" style="margin-top:0"></p>
      </div>
      <div class="card">
        <label>Aviso anticipado<select name="aviso">${K.AVISOS.map(([k, t]) => `<option value="${k === null ? 'n' : k}"${(k === null ? 'n' : String(k)) === aviso ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <p class="nota" style="margin:-6px 0 14px">Se usa al tocar “Agregar pagos al Calendario” en la pestaña Calendario.</p>
        ${e.espacios.length > 1 ? `<label>Espacio<select name="espacio">${e.espacios.map((x) => `<option value="${esc(x.id)}"${x.id === v.espacioId ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>` : ''}
        <label style="margin-bottom:0">Nota (opcional)<textarea name="nota" rows="2" maxlength="200">${esc(v.nota || '')}</textarea></label>
      </div>
      <div class="error" id="err"></div>
      <button class="btn" type="submit" style="max-width:none">${comp ? 'Guardar cambios' : 'Crear compromiso'}</button>
      ${comp ? '<button class="btn peligro" type="button" id="borrar" style="max-width:none">Eliminar compromiso</button>' : ''}
    </form>`;
  enlazarMonto(c);
  const f = c.querySelector('#f').elements;

  const pintarCats = () => {
    const lista = e.categorias.filter((k) => k.tipo === s.tipo);
    if (!lista.some((k) => k.id === s.categoriaId)) s.categoriaId = (lista.find((k) => !K.CATEGORIAS_FIJAS.includes(k.id)) || lista[0]).id;
    c.querySelector('#cats').innerHTML = lista.map((k) => `
      <button type="button" class="cat-tile${k.id === s.categoriaId ? ' sel' : ''}" data-id="${esc(k.id)}">${ico(k)}<span class="cat-n">${esc(k.nombre)}</span></button>`).join('');
    c.querySelectorAll('#cats .cat-tile').forEach((b) => { b.onclick = () => { s.categoriaId = b.dataset.id; pintarCats(); }; });
    const sel = c.querySelector('#cats .sel');
    if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  };
  const pintarResto = () => {
    c.querySelectorAll('#tipo button').forEach((b) => b.classList.toggle('on', b.dataset.t === s.tipo));
    c.querySelectorAll('#frecs .frec-chip').forEach((b) => b.classList.toggle('sel', b.dataset.f === s.frecuencia));
    c.querySelector('#fin-caja').style.display = s.frecuencia === 'unico' ? 'none' : '';
    c.querySelector('#fin-fecha').style.display = s.frecuencia !== 'unico' && f.finModo.value === 'f' ? '' : 'none';
    c.querySelector('#desc').textContent = K.descripcion(s.frecuencia, f.inicio.value, s.frecuencia !== 'unico' && f.finModo.value === 'f' ? f.fin.value : null);
  };
  c.querySelectorAll('#tipo button').forEach((b) => { b.onclick = () => { s.tipo = b.dataset.t; pintarCats(); pintarResto(); }; });
  c.querySelectorAll('#frecs .frec-chip').forEach((b) => { b.onclick = () => { s.frecuencia = b.dataset.f; pintarResto(); }; });
  ['inicio', 'finModo', 'fin'].forEach((n) => f[n].addEventListener('input', pintarResto));
  f.finModo.addEventListener('change', pintarResto);
  pintarCats();
  pintarResto();
  c.querySelector('#frecs .sel')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  c.querySelector('#gestionar').onclick = () => gestionarCategorias(ctx, () => pintarCats());
  c.querySelector('#atras').onclick = () => ctx.ir('inicio', null);

  if (comp) {
    c.querySelector('#borrar').onclick = async () => {
      if (!confirm(`¿Eliminar “${comp.nombre}” y todo su historial de pagos? Esto no se puede deshacer.`)) return;
      const copia = { ...comp, cumplidos: { ...(comp.cumplidos || {}) } };
      e.compromisos = e.compromisos.filter((x) => x.id !== comp.id);
      try { await ctx.guardar(); } catch { return; }
      ctx.aviso('Compromiso eliminado', async () => { e.compromisos.push(copia); await ctx.guardar(); ctx.ir('inicio', null); });
      ctx.ir('inicio', null);
    };
  }

  c.querySelector('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const err = c.querySelector('#err');
    const nuevo = {
      nombre: f.nombre.value.trim(), tipo: s.tipo, monto: parseMonto(f.monto.value), categoriaId: s.categoriaId,
      frecuencia: s.frecuencia, inicio: f.inicio.value,
      fin: s.frecuencia !== 'unico' && f.finModo.value === 'f' ? (f.fin.value || null) : null,
      avisoDias: f.aviso.value === 'n' ? null : Number(f.aviso.value),
      espacioId: f.espacio ? f.espacio.value : v.espacioId, nota: f.nota.value.trim()
    };
    if (!nuevo.nombre) { err.textContent = 'Escribe un nombre.'; return; }
    if (nuevo.monto <= 0) { err.textContent = 'El monto debe ser mayor a cero.'; return; }
    if (!nuevo.inicio) { err.textContent = 'Elige la fecha inicial.'; return; }
    if (f.finModo.value === 'f' && s.frecuencia !== 'unico' && !nuevo.fin) { err.textContent = 'Elige la fecha final o pon “Nunca”.'; return; }
    if (nuevo.fin && nuevo.fin < nuevo.inicio) { err.textContent = 'La fecha final no puede ser antes de la inicial.'; return; }
    if (comp) Object.assign(comp, nuevo);
    else e.compromisos.push({ id: crypto.randomUUID(), ...nuevo, creada: Date.now(), cumplidos: {} });
    try { await ctx.guardar(); } catch { return; }
    ctx.aviso(comp ? 'Cambios guardados' : 'Compromiso creado');
    ctx.ir('inicio', null);
  };
}

/* ================= Selectores de ícono y color ================= */

function selectores(iconos, icono, color) {
  const est = { icono, color };
  const html = `
    <div class="etiqueta" style="margin:4px 0 8px">Ícono</div>
    <div class="rejilla" data-r="icono">${iconos.map((i) => `<button type="button" class="opc${i === icono ? ' sel' : ''}" data-v="${esc(i)}">${esc(i)}</button>`).join('')}</div>
    <div class="etiqueta" style="margin:14px 0 8px">Color</div>
    <div class="rejilla" data-r="color">${K.COLORES.map((k) => `<button type="button" class="opc col${k === color ? ' sel' : ''}" data-v="${k}" style="background:${k}" aria-label="Color"></button>`).join('')}</div>`;
  const enlazar = (raiz) => raiz.querySelectorAll('.rejilla').forEach((g) => {
    g.querySelectorAll('.opc').forEach((b) => {
      b.onclick = () => { est[g.dataset.r] = b.dataset.v; g.querySelectorAll('.opc').forEach((x) => x.classList.toggle('sel', x === b)); };
    });
  });
  return { est, html, enlazar };
}

/* ================= Categorías ================= */

function gestionarCategorias(ctx, alCambiar) {
  const e = ctx.sesion().estado;
  const m = modal('<div id="cuerpo"></div>');
  const pintar = () => {
    const fila = (k) => `<button class="cat-fila" data-id="${esc(k.id)}">${ico(k)}<b>${esc(k.nombre)}</b><span class="flecha-txt">›</span></button>`;
    m.el.querySelector('#cuerpo').innerHTML = `
      <h2>Categorías</h2>
      <div class="etiqueta" style="margin-bottom:6px">Gastos</div>
      ${e.categorias.filter((k) => k.tipo === 'gasto').map(fila).join('')}
      <div class="etiqueta" style="margin:14px 0 6px">Ingresos</div>
      ${e.categorias.filter((k) => k.tipo === 'ingreso').map(fila).join('')}
      <button class="btn" id="nueva" style="max-width:none">Nueva categoría</button>
      <button class="volver" id="cerrar" type="button" style="width:100%">Listo</button>`;
    m.el.querySelectorAll('.cat-fila').forEach((b) => { b.onclick = () => editarCategoria(ctx, e.categorias.find((k) => k.id === b.dataset.id), despues); });
    m.el.querySelector('#nueva').onclick = () => editarCategoria(ctx, null, despues);
    m.el.querySelector('#cerrar').onclick = () => { m.cerrar(); alCambiar(); };
  };
  const despues = () => { pintar(); };
  pintar();
  m.el.addEventListener('click', (ev) => { if (ev.target === m.el) alCambiar(); });
}

function editarCategoria(ctx, cat, despues) {
  const e = ctx.sesion().estado;
  const sel = selectores(K.ICONOS_CATEGORIA, cat ? cat.icono : '📦', cat ? cat.color : K.COLORES[0]);
  const fija = cat && K.CATEGORIAS_FIJAS.includes(cat.id);
  const m = modal(`
    <h2>${cat ? 'Editar categoría' : 'Nueva categoría'}</h2>
    <label>Nombre<input id="nom" maxlength="24" value="${esc(cat ? cat.nombre : '')}" placeholder="Ej: Mascotas" autocomplete="off"></label>
    ${cat ? '' : '<label>Tipo<select id="tipo" class="sel-chico" style="width:100%;margin-top:6px"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></label>'}
    ${sel.html}
    <div class="error" id="err" style="margin-top:10px"></div>
    <button class="btn" id="ok" style="max-width:none">Guardar</button>
    ${cat && !fija ? '<button class="btn peligro" id="del" style="max-width:none">Eliminar categoría</button>' : ''}
    <button class="volver" id="no" type="button" style="width:100%">Cancelar</button>`);
  sel.enlazar(m.el);
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#ok').onclick = async () => {
    const nombre = m.el.querySelector('#nom').value.trim();
    if (!nombre) { m.el.querySelector('#err').textContent = 'Escribe un nombre.'; return; }
    if (cat) Object.assign(cat, { nombre, icono: sel.est.icono, color: sel.est.color });
    else e.categorias.push({ id: crypto.randomUUID(), nombre, icono: sel.est.icono, color: sel.est.color, tipo: m.el.querySelector('#tipo').value });
    try { await ctx.guardar(); } catch { return; }
    m.cerrar();
    despues();
  };
  const del = m.el.querySelector('#del');
  if (del) del.onclick = async () => {
    const usados = e.compromisos.filter((x) => x.categoriaId === cat.id).length;
    if (!confirm(usados ? `“${cat.nombre}” la usan ${usados} compromiso(s); pasarán a “Otros”. ¿Eliminar?` : `¿Eliminar la categoría “${cat.nombre}”?`)) return;
    const destino = cat.tipo === 'ingreso' ? 'otros-ing' : 'otros';
    e.compromisos.forEach((x) => { if (x.categoriaId === cat.id) x.categoriaId = destino; });
    e.categorias = e.categorias.filter((k) => k.id !== cat.id);
    try { await ctx.guardar(); } catch { return; }
    m.cerrar();
    despues();
  };
}

/* ================= Espacios ================= */

function modalEspacios(ctx, alCambiar) {
  const e = ctx.sesion().estado;
  const hoy = new Date();
  let elegido = K.espacioActivo(e).id;
  const m = modal('<div id="cuerpo"></div>');
  const pendientes = (id) => K.ocurrenciasMes(e, id, hoy.getFullYear(), hoy.getMonth(), hoy).filter((o) => !o.pagado).length;

  const pintar = () => {
    const sel = e.espacios.find((x) => x.id === elegido) || e.espacios[0];
    m.el.querySelector('#cuerpo').innerHTML = `
      <h2 style="text-align:center">Tus espacios</h2>
      <div class="carrusel espacios" id="car">
        ${e.espacios.map((x) => {
          const n = pendientes(x.id);
          const col = K.colorSeguro(x.color);
          return `<button class="esp-tile${x.id === elegido ? ' sel' : ''}" data-id="${esc(x.id)}">
            <span class="esp-ico" style="background:${col}">${esc(x.icono)}${n ? `<em class="badge">${n}</em>` : ''}</span><b>${esc(x.nombre)}</b></button>`;
        }).join('')}
        <button class="esp-tile nuevo" id="nuevo-esp"><span class="esp-ico">+</span><b>Nuevo</b></button>
      </div>
      <button class="btn" id="usar" style="max-width:none;margin-top:6px">Usar “${esc(sel.nombre)}”</button>
      <button class="btn sec" id="pers" style="max-width:none">Personalizar</button>
      <button class="volver" id="cerrar" type="button" style="width:100%">Cerrar</button>`;
    m.el.querySelectorAll('.esp-tile[data-id]').forEach((b) => { b.onclick = () => { elegido = b.dataset.id; pintar(); }; });
    m.el.querySelector('.esp-tile.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    m.el.querySelector("#nuevo-esp").onclick = () => editarEspacio(ctx, null, (id) => { elegido = id || elegido; pintar(); });
    m.el.querySelector('#pers').onclick = () => editarEspacio(ctx, sel, (id, borrado) => { if (borrado) elegido = e.espacios[0].id; pintar(); });
    m.el.querySelector('#usar').onclick = async () => {
      e.ajustes.espacioActivo = elegido;
      try { await ctx.guardar(); } catch { return; }
      m.cerrar();
      alCambiar();
    };
    m.el.querySelector('#cerrar').onclick = () => { m.cerrar(); alCambiar(); };
  };
  pintar();
}

function editarEspacio(ctx, esp, despues) {
  const e = ctx.sesion().estado;
  const sel = selectores(K.ICONOS_ESPACIO, esp ? esp.icono : K.ICONOS_ESPACIO[0], esp ? esp.color : K.COLORES[2]);
  const puedeBorrar = esp && e.espacios.length > 1;
  const m = modal(`
    <h2>${esp ? 'Personalizar espacio' : 'Nuevo espacio'}</h2>
    <label>Nombre<input id="nom" maxlength="24" value="${esc(esp ? esp.nombre : '')}" placeholder="Ej: Casa de mamá" autocomplete="off"></label>
    ${sel.html}
    <div class="error" id="err" style="margin-top:10px"></div>
    <button class="btn" id="ok" style="max-width:none">Guardar</button>
    ${puedeBorrar ? '<button class="btn peligro" id="del" style="max-width:none">Eliminar espacio</button>' : ''}
    <button class="volver" id="no" type="button" style="width:100%">Cancelar</button>`);
  sel.enlazar(m.el);
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#ok').onclick = async () => {
    const nombre = m.el.querySelector('#nom').value.trim();
    if (!nombre) { m.el.querySelector('#err').textContent = 'Escribe un nombre.'; return; }
    let id = esp ? esp.id : crypto.randomUUID();
    if (esp) Object.assign(esp, { nombre, icono: sel.est.icono, color: sel.est.color });
    else e.espacios.push({ id, nombre, icono: sel.est.icono, color: sel.est.color });
    try { await ctx.guardar(); } catch { return; }
    m.cerrar();
    despues(id, false);
  };
  const del = m.el.querySelector('#del');
  if (del) del.onclick = async () => {
    const n = e.compromisos.filter((x) => x.espacioId === esp.id).length;
    if (!confirm(n ? `Se eliminará el espacio “${esp.nombre}” y sus ${n} compromiso(s). No se puede deshacer. ¿Continuar?` : `¿Eliminar el espacio “${esp.nombre}”?`)) return;
    const copiaEsp = { ...esp };
    const compsEsp = e.compromisos.filter((x) => x.espacioId === esp.id);
    const eraActivo = e.ajustes.espacioActivo === esp.id;
    e.compromisos = e.compromisos.filter((x) => x.espacioId !== esp.id);
    e.espacios = e.espacios.filter((x) => x.id !== esp.id);
    if (eraActivo) e.ajustes.espacioActivo = e.espacios[0].id;
    try { await ctx.guardar(); } catch { return; }
    m.cerrar();
    despues(null, true);
    ctx.aviso(`Espacio “${copiaEsp.nombre}” eliminado`, async () => {
      e.espacios.push(copiaEsp);
      e.compromisos.push(...compsEsp);
      if (eraActivo) e.ajustes.espacioActivo = copiaEsp.id;
      await ctx.guardar();
      despues(copiaEsp.id, false);
    });
  };
}
