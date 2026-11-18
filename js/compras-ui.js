// Pantalla Compras: lista, registro manual y lectura de mensajes del banco con confirmación.
import { esc, pesos, miles, fechaCorta, desdeISO, modal, enlazarMonto } from './util.js';
import * as L from './lector.js';
import { aISO, parseMonto } from './calculos.js';
import { analizar } from './capturas.js';

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
      <div class="deuda-sub">${esc(x.categoria)}${x.tarjeta ? ` · •••• ${esc(x.tarjeta)}` : x.tarjetaNombre ? ` · ${esc(x.tarjetaNombre)}` : ''}${x.revisar ? ' · <b class="ambar">Revisar</b>' : ''}</div></button>`;
  }

  c.innerHTML = `
    <div class="encabezado"><h1>Compras</h1><button class="btn-chico" id="nueva">+ Nueva</button></div>
    <div class="card"><div class="etiqueta">Gastado este mes</div><div class="cifra">${pesos(totalMes)}</div>
      <div class="deuda-sub">${delMes.length} ${delMes.length === 1 ? 'compra' : 'compras'}</div></div>
    <button class="btn sec" id="pegar" style="max-width:none;margin-top:0">Leer un mensaje del banco</button>
    <button class="btn sec" id="importar" style="max-width:none">Importar del atajo</button>
    <button class="enlace" id="guia" style="margin:0 auto 6px">Cómo configurar la captura automática</button>
    ${e.compras.length === 0 ? '<div class="card vacio" style="margin-top:14px"><b>Sin compras registradas</b>Agrégalas a mano o pega el SMS o correo del banco y Saldar lo lee por ti.</div>' : grupos}
    ${(e.sinEntender || []).length ? `<button class="enlace" id="sin" style="margin:18px auto">Mensajes que no entendí (${e.sinEntender.length})</button>` : ''}`;

  c.querySelector('#nueva').onclick = () => { borrador = null; ctx.ir('compras', { vista: 'compra' }); };
  c.querySelector('#pegar').onclick = () => modalPegar(ctx);
  c.querySelector('#importar').onclick = () => importarArchivos(ctx);
  c.querySelector('#guia').onclick = () => ctx.ir('compras', { vista: 'guia' });
  c.querySelectorAll('.deuda[data-id]').forEach((b) => { b.onclick = () => ctx.ir('compras', { vista: 'compra', id: b.dataset.id }); });
  const sin = c.querySelector('#sin');
  if (sin) sin.onclick = () => modalSinEntender(ctx);
}

/* ================= Leer un mensaje ================= */

export function modalPegar(ctx) {
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
    ${x && x.revisar ? '<div class="alerta" style="margin-top:8px">Falta revisar esta compra (no se pudo leer el comercio). Corrígelo y guarda.</div>' : ''}
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
      Object.assign(x, nueva, { revisar: false });
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

/* ================= Importar capturas de los Atajos ================= */

function importarArchivos(ctx) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.multiple = true;
  inp.accept = '.txt,text/plain';
  inp.onchange = async () => {
    const archivos = [...inp.files];
    if (!archivos.length) return;
    try {
      const textos = await Promise.all(archivos.map((f) => f.text()));
      modalResumen(ctx, analizar(textos, ctx.sesion().estado));
    } catch {
      ctx.aviso('No pude leer los archivos.');
    }
  };
  inp.click();
}

function modalResumen(ctx, r) {
  const e = ctx.sesion().estado;
  const hay = r.nuevas.length > 0;
  const m = modal(`
    <h2>${r.total === 0 ? 'No encontré capturas' : 'Capturas encontradas'}</h2>
    ${r.total === 0 ? '<p class="nota" style="margin-top:0">El archivo no tiene capturas de Saldar. Revisa que elegiste los archivos que crea el atajo.</p>' : `
    <div class="card" style="font-size:15px;line-height:1.7">
      <div class="ajuste"><span>Compras nuevas</span><b>${r.nuevas.length}</b></div>
      <div class="ajuste"><span>Ya registradas</span><b>${r.repetidas}</b></div>
      <div class="ajuste"><span>Ingresos (se ignoran)</span><b>${r.ingresos}</b></div>
      <div class="ajuste"><span>No entendidas</span><b>${r.ilegibles.length}</b></div>
    </div>
    ${hay ? `<div style="max-height:32vh;overflow-y:auto;margin-bottom:12px">${r.nuevas.map((c) => `
      <div class="hist"><div><b>${esc(c.comercio)}</b>${c.revisar ? ' <span class="ambar">· Revisar</span>' : ''}<div class="hist-n">${esc(c.categoria)}${c.tarjeta ? ` · •••• ${esc(c.tarjeta)}` : ''}</div></div>
      <div style="text-align:right"><b>${pesos(c.monto)}</b><div class="hist-n">${esc(fechaCorta(desdeISO(c.fecha)))}</div></div></div>`).join('<div class="sep"></div>')}</div>` : ''}`}
    ${r.total > 0 && (hay || r.ilegibles.length || r.ingresos) ? `<button class="btn" id="ok" style="max-width:none">${hay ? `Guardar ${r.nuevas.length} ${r.nuevas.length === 1 ? 'compra' : 'compras'}` : 'Listo'}</button>` : ''}
    <button class="volver" id="no" type="button" style="width:100%">${r.total === 0 ? 'Cerrar' : 'Cancelar'}</button>`);
  m.el.querySelector('#no').onclick = m.cerrar;
  const ok = m.el.querySelector('#ok');
  if (ok) ok.onclick = async () => {
    const ahora = Date.now();
    r.nuevas.forEach((c, i) => e.compras.push({ id: crypto.randomUUID(), ...c, nota: '', creada: ahora + i }));
    r.ilegibles.forEach((t) => { e.sinEntender = [{ id: crypto.randomUUID(), f: ahora, texto: t.slice(0, 600) }, ...(e.sinEntender || [])].slice(0, 30); });
    e.capturasVistas = [...(e.capturasVistas || []), ...r.hashes].slice(-3000);
    await ctx.guardar();
    m.cerrar();
    ctx.aviso(hay ? `${r.nuevas.length} compras guardadas` : 'Listo');
    ctx.ir('compras', null);
  };
}

/* ================= Guía de atajos ================= */

export function guia(ctx, c) {
  c.innerHTML = `
    <div class="encabezado"><button class="atras" id="atras">‹ Compras</button></div>
    <h1>Captura automática</h1>
    <p class="saludo">Dos atajos de iPhone anotan tus compras en un archivo. Luego las importas en Saldar con un toque. Los nombres de los botones pueden variar un poco según tu versión de iOS.</p>

    <div class="seccion">Antes de empezar</div>
    <div class="card"><ol class="pasos">
      <li>Abre la app <b>Archivos</b> y crea una carpeta llamada <b>Saldar</b> en <b>iCloud Drive</b>.</li>
      <li>Cada atajo guardará un archivo de texto ahí por cada compra.</li>
    </ol></div>

    <div class="seccion">Atajo 1 · Pagos con Apple Pay</div>
    <div class="card"><ol class="pasos">
      <li>Abre <b>Atajos</b> &gt; pestaña <b>Automatización</b> &gt; <b>+</b> &gt; <b>Transacción</b>.</li>
      <li>Elige las tarjetas de Wallet que quieras vigilar. Marca <b>Ejecutar inmediatamente</b> y toca <b>Siguiente</b>.</li>
      <li>Agrega la acción <b>Texto</b> y escribe, en una sola línea, estas partes separadas por la barra <b>|</b>:<br>
        <code>#SALDAR#ap|</code> <b>Fecha actual</b> <code>|</code> <b>Importe</b> <code>|</code> <b>Comerciante</b> <code>|</code> <b>Tarjeta o pase</b><br>
        Las partes en negrita son variables: tócalas en la barra de variables y elige las de la transacción. En <b>Fecha actual</b> usa el formato <b>ISO 8601</b>.</li>
      <li>Agrega la acción <b>Guardar archivo</b>: carpeta <b>Saldar</b>, desactiva <b>Preguntar dónde guardar</b> y nombra el archivo con la <b>Fecha actual</b> formateada <code>yyyyMMdd-HHmmss</code> más <code>.txt</code>.</li>
      <li>Toca <b>Listo</b>. En el próximo pago con Apple Pay, el archivo aparece solo.</li>
    </ol></div>

    <div class="seccion">Atajo 2 · SMS del banco</div>
    <div class="card"><ol class="pasos">
      <li><b>Automatización</b> &gt; <b>+</b> &gt; <b>Mensaje</b>.</li>
      <li>En <b>Remitente</b> elige el número del banco, o en <b>Mensaje contiene</b> escribe <b>compra</b>. Así solo se copian mensajes de compras y no tus chats. Marca <b>Ejecutar inmediatamente</b>.</li>
      <li>Acción <b>Texto</b>: <code>#SALDAR#msg|</code> <b>Fecha actual</b> (ISO 8601) <code>|</code> <b>Entrada del atajo</b> (el contenido del mensaje).</li>
      <li>Acción <b>Guardar archivo</b>, igual que en el atajo 1.</li>
      <li>Para correos del banco, haz lo mismo con la automatización <b>Correo</b>, eligiendo el remitente.</li>
    </ol></div>

    <div class="seccion">Importar en Saldar</div>
    <div class="card"><ol class="pasos">
      <li>En <b>Compras</b> toca <b>Importar del atajo</b>.</li>
      <li>Abre la carpeta <b>Saldar</b>, toca <b>Seleccionar</b> y elige todos los archivos.</li>
      <li>Saldar te muestra cuántas compras nuevas encontró. Toca <b>Guardar</b>.</li>
    </ol>
    <p class="nota">Si una compra llega por Apple Pay y por SMS, Saldar la cuenta una sola vez. Las compras sin comercio quedan marcadas <b class="ambar">Revisar</b>. Importar dos veces el mismo archivo no duplica nada.</p></div>

    <p class="nota">Los archivos contienen el texto de tus mensajes del banco y quedan en tu iCloud Drive. Después de importar puedes borrarlos de la carpeta.</p>`;
  c.querySelector('#atras').onclick = () => ctx.ir('compras', null);
}
