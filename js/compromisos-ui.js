// Pantallas de compromisos recurrentes, categorías y espacios.
import { esc, pesos, fechaCorta, miles, enlazarMonto, modal } from './util.js';
import { parseMonto, aISO } from './calculos.js';
import * as K from './compromisos.js';
import * as deudasUI from './deudas-ui.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MES3 = MESES.map((m) => m.slice(0, 3));

let segmento = 'compromisos'; // 'compromisos' | 'deudas'
let vista = null;             // { y, m }
let modo = 'balance';         // 'balance' | 'gastos' | 'ingresos'
export const reiniciar = () => { vista = null; modo = 'balance'; };
export const mostrar = (seg) => { segmento = seg; };

const ico = (cat, clase = '') => {
  const col = K.colorSeguro(cat.color);
  return `<span class="ico ${clase}" style="background:${col}2e;color:${col}">${esc(cat.icono)}</span>`;
};

/* ================= Pestaña "Pagos": compromisos y deudas ================= */

export function pagos(ctx, c) {
  c.innerHTML = `
    <div class="seg" id="seg">
      <button data-s="compromisos" class="${segmento === 'compromisos' ? 'on' : ''}">Compromisos</button>
      <button data-s="deudas" class="${segmento === 'deudas' ? 'on' : ''}">Deudas</button>
    </div>
    <div id="cuerpo"></div>`;
  c.querySelectorAll('#seg button').forEach((b) => { b.onclick = () => { segmento = b.dataset.s; pagos(ctx, c); }; });
  const cuerpo = c.querySelector('#cuerpo');
  if (segmento === 'deudas') deudasUI.lista(ctx, cuerpo);
  else compromisos(ctx, cuerpo);
}

function compromisos(ctx, c) {
  const e = ctx.sesion().estado;
  const hoy = new Date();
  if (!vista) vista = { y: hoy.getFullYear(), m: hoy.getMonth() };
  const { y, m } = vista;
  const esp = K.espacioActivo(e);
  const todas = K.ocurrenciasMes(e, esp.id, y, m, hoy);
  const r = K.resumenMes(todas);
  const pendientes = todas.filter((o) => !o.pagado).length;

  let grande, izq, der, parte;
  if (modo === 'gastos') {
    grande = r.gastos; izq = ['Completado', r.gastosHechos, 'menta']; der = ['Pendiente', r.gastos - r.gastosHechos, 'rosa']; parte = r.gastos ? r.gastosHechos / r.gastos : 0;
  } else if (modo === 'ingresos') {
    grande = r.ingresos; izq = ['Recibido', r.ingresosHechos, 'menta']; der = ['Por recibir', r.ingresos - r.ingresosHechos, 'ambar']; parte = r.ingresos ? r.ingresosHechos / r.ingresos : 0;
  } else {
    grande = r.ingresos - r.gastos; izq = ['Ingresos', r.ingresos, 'menta']; der = ['Gastos', r.gastos, 'rosa']; parte = r.ingresos + r.gastos ? r.ingresos / (r.ingresos + r.gastos) : 0;
  }
  const lista = todas.filter((o) => modo === 'balance' || (modo === 'gastos' ? o.tipo === 'gasto' : o.tipo === 'ingreso'));

  const mm = (d) => { const f = new Date(y, m + d, 1); return f; };
  const etiqueta = (f) => `${MES3[f.getMonth()]}${f.getFullYear() !== hoy.getFullYear() ? ' ' + String(f.getFullYear()).slice(2) : ''}`;
  const actual = y !== hoy.getFullYear() ? `${MES3[m]} ${y}` : MESES[m];

  let filas = '';
  let semana = 0;
  for (const o of lista) {
    const s = K.semanaDelMes(o.fecha);
    if (s !== semana) {
      semana = s;
      filas += `<div class="semana-t"><b>S.${s}</b><i></i><span>${lista.filter((x) => K.semanaDelMes(x.fecha) === s).length}</span></div>`;
    }
    const cat = K.categoriaDe(e, o.c);
    const colorFecha = o.estado === 'vencido' ? 'rosa' : o.estado === 'pagado' ? 'menta' : '';
    filas += `
      <div class="comp${o.pagado ? ' hecho' : ''}">
        <button class="comp-main" data-id="${esc(o.c.id)}">
          ${ico(cat)}
          <span class="comp-txt"><b>${esc(o.c.nombre)}</b>
            <span class="comp-meta"><i class="chip ${colorFecha}">${esc(fechaCorta(o.fecha))}</i><span>${esc(K.nombreFrecuencia(o.c.frecuencia))}</span></span></span>
          <span class="pill ${o.tipo === 'ingreso' ? 'ing' : ''}">${o.tipo === 'ingreso' ? '+' : '−'} ${pesos(o.monto)}</span>
        </button>
        <button class="check${o.pagado ? ' on' : ''}" data-id="${esc(o.c.id)}" data-iso="${o.iso}" aria-label="${o.tipo === 'ingreso' ? 'Marcar como recibido' : 'Marcar como pagado'}">${o.pagado ? '✓' : ''}</button>
      </div>`;
  }

  c.innerHTML = `
    <div class="encabezado">
      <button class="espacio-chip" id="espacio">${ico(esp, 'peq')}<b>${esc(esp.nombre)}</b><span class="flecha-txt">›</span></button>
      ${pendientes ? `<span class="insignia" style="margin:0">${pendientes} por resolver</span>` : ''}
    </div>
    <div class="meses">
      <button class="flecha" id="ant" aria-label="Mes anterior">‹</button>
      <button class="chip-mes" data-d="-1">${esc(etiqueta(mm(-1)))}</button>
      <button class="chip-mes act" id="hoy">${esc(actual)}</button>
      <button class="chip-mes" data-d="1">${esc(etiqueta(mm(1)))}</button>
      <button class="flecha" id="sig" aria-label="Mes siguiente">›</button>
    </div>
    <div class="modos">${[['balance', 'Balance'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos']].map(([k, t]) => `<button data-modo="${k}" class="${modo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="gran${grande < 0 ? ' neg' : ''}">${pesos(grande)}</div>
    <div class="barra-prop"><span style="width:${Math.round(parte * 100)}%"></span></div>
    <div class="resumen">
      <div><span class="etiqueta">${izq[0]}</span><b class="${izq[2]}">${pesos(izq[1])}</b></div>
      <div><span class="etiqueta">${der[0]}</span><b class="${der[2]}">${pesos(der[1])}</b></div>
    </div>
    <button class="btn" id="nuevo" style="max-width:none;margin:4px 0 6px">Nuevo compromiso</button>
    ${lista.length === 0 ? `<div class="card vacio"><b>Nada por aquí</b>${(e.compromisos || []).length ? 'No hay compromisos en este mes.' : 'Crea tu primer compromiso: la luz, el arriendo, tu salario… Se repite solo cada mes.'}</div>` : filas}`;

  const ir = (d) => { const f = mm(d); vista = { y: f.getFullYear(), m: f.getMonth() }; compromisos(ctx, c); };
  c.querySelector('#ant').onclick = () => ir(-1);
  c.querySelector('#sig').onclick = () => ir(1);
  c.querySelectorAll('.chip-mes[data-d]').forEach((b) => { b.onclick = () => ir(Number(b.dataset.d)); });
  c.querySelector('#hoy').onclick = () => { vista = null; compromisos(ctx, c); };
  c.querySelectorAll('.modos button').forEach((b) => { b.onclick = () => { modo = b.dataset.modo; compromisos(ctx, c); }; });
  c.querySelector('#nuevo').onclick = () => ctx.ir('deudas', { vista: 'compromiso' });
  c.querySelector('#espacio').onclick = () => modalEspacios(ctx, () => compromisos(ctx, c));
  c.querySelectorAll('.comp-main').forEach((b) => { b.onclick = () => ctx.ir('deudas', { vista: 'compromiso', id: b.dataset.id }); });
  c.querySelectorAll('.check').forEach((b) => {
    b.onclick = async () => {
      const comp = e.compromisos.find((x) => x.id === b.dataset.id);
      if (!comp) return;
      comp.cumplidos = comp.cumplidos || {};
      if (comp.cumplidos[b.dataset.iso]) delete comp.cumplidos[b.dataset.iso];
      else comp.cumplidos[b.dataset.iso] = Date.now();
      try { await ctx.guardar(); } catch { return; }
      compromisos(ctx, c);
    };
  });
}

/* ================= Formulario ================= */

export function formulario(ctx, c, id) {
  const e = ctx.sesion().estado;
  const comp = id ? e.compromisos.find((x) => x.id === id) : null;
  if (id && !comp) return ctx.ir('deudas', null);
  const hoyISO = aISO(new Date());
  const s = {
    tipo: comp ? comp.tipo : 'gasto',
    categoriaId: comp ? comp.categoriaId : null,
    frecuencia: comp ? comp.frecuencia : 'mensual'
  };
  const v = comp || { nombre: '', monto: 0, inicio: hoyISO, fin: null, avisoDias: 1, nota: '', espacioId: K.espacioActivo(e).id };
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
  c.querySelector('#atras').onclick = () => ctx.ir('deudas', null);

  if (comp) {
    c.querySelector('#borrar').onclick = async () => {
      if (!confirm(`¿Eliminar “${comp.nombre}” y todo su historial de pagos? Esto no se puede deshacer.`)) return;
      e.compromisos = e.compromisos.filter((x) => x.id !== comp.id);
      try { await ctx.guardar(); } catch { return; }
      ctx.aviso('Compromiso eliminado');
      ctx.ir('deudas', null);
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
    ctx.ir('deudas', null);
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
    e.compromisos = e.compromisos.filter((x) => x.espacioId !== esp.id);
    e.espacios = e.espacios.filter((x) => x.id !== esp.id);
    if (e.ajustes.espacioActivo === esp.id) e.ajustes.espacioActivo = e.espacios[0].id;
    try { await ctx.guardar(); } catch { return; }
    m.cerrar();
    despues(null, true);
  };
}
