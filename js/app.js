// Saldar - Paso 1: base de la app, perfiles con PIN, almacenamiento cifrado y estructura.
import * as store from './store.js';
import { esc, fechaLarga, entregarICS, modal } from './util.js';
import * as comprasUI from './compras-ui.js';
import * as calendarioUI from './calendario-ui.js';
import { respaldoICS } from './ics.js';
import * as deudasUI from './deudas-ui.js';
import * as compromisosUI from './compromisos-ui.js';
import * as cuentasUI from './cuentas-ui.js';
import * as nube from './nube.js';

const app = document.getElementById('app');
const VERSION_APP = '1.6.0';
const LARGO_PIN = 6;
const BLOQUEO_SEGUNDOS = 60; // se bloquea al volver tras estar tanto tiempo en segundo plano

let sesion = null;        // { id, nombre, llave, estado } mientras el perfil está abierto
let pestana = 'inicio';
let sub = null;           // pantalla interna: { vista: 'detalle' | 'form', id }
let ocultoDesde = 0;

const inicial = (nombre) => esc((nombre.trim()[0] || '?').toUpperCase());

// Aviso breve. Con `deshacer` (una función) muestra el botón "Deshacer" durante unos segundos.
function aviso(texto, deshacer) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texto;
  if (deshacer) {
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = 'Deshacer';
    b.onclick = async () => { t.remove(); try { await deshacer(); } catch { /* sesión cerrada u otro fallo */ } };
    t.appendChild(b);
  }
  document.body.appendChild(t);
  setTimeout(() => t.remove(), deshacer ? 8000 : 2600);
}

/* ================= Acceso ================= */

async function pantallaPerfiles() {
  sesion = null;
  calendarioUI.reiniciar();
  compromisosUI.reiniciar();
  const perfiles = await store.listarPerfiles();
  if (perfiles.length === 0) return nuevoPerfil();

  app.innerHTML = `
    <div class="acceso">
      <div class="logo">S</div>
      <h1>Saldar</h1>
      <p class="sub">¿Quién eres?</p>
      <div class="lista-perfiles">
        ${perfiles.map((p) => `
          <button class="perfil" data-id="${esc(p.id)}">
            <span class="avatar">${inicial(p.nombre)}</span>
            <span class="nombre">${esc(p.nombre)}</span>
          </button>`).join('')}
        <button class="perfil nuevo" id="nuevo">
          <span class="avatar">+</span><span class="nombre">Nuevo perfil</span>
        </button>
      </div>
      <button class="volver" id="restaurar">Restaurar desde un respaldo</button>
    </div>`;
  app.querySelectorAll('.perfil[data-id]').forEach((b) => {
    b.onclick = () => pedirPin(perfiles.find((p) => p.id === b.dataset.id));
  });
  document.getElementById('nuevo').onclick = nuevoPerfil;
  document.getElementById('restaurar').onclick = elegirRespaldo;
}

// Teclado numérico propio: no abre el teclado del iPhone y oculta lo que se escribe.
function teclado({ titulo, subtitulo, alCompletar, alVolver }) {
  let pin = '';
  app.innerHTML = `
    <div class="acceso">
      <div class="logo">S</div>
      <h1>${esc(titulo)}</h1>
      <p class="sub" id="sub">${esc(subtitulo || '')}</p>
      <div class="puntos" id="puntos">${'<span class="punto"></span>'.repeat(LARGO_PIN)}</div>
      <div class="teclado">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="tecla" data-n="${n}">${n}</button>`).join('')}
        <button class="tecla vacia"></button>
        <button class="tecla" data-n="0">0</button>
        <button class="tecla borrar" id="borrar" aria-label="Borrar">⌫</button>
      </div>
      ${alVolver ? '<button class="volver" id="volver">Cancelar</button>' : ''}
    </div>`;
  const puntos = document.getElementById('puntos');
  const sub = document.getElementById('sub');
  let ocupado = false;

  const pintar = () => puntos.querySelectorAll('.punto').forEach((p, i) => p.classList.toggle('on', i < pin.length));

  async function enviar() {
    ocupado = true;
    const r = await alCompletar(pin);
    if (r && r.error) {
      puntos.classList.add('error');
      sub.textContent = r.error;
      setTimeout(() => { puntos.classList.remove('error'); pin = ''; pintar(); ocupado = false; }, 450);
    }
  }

  app.querySelectorAll('.tecla[data-n]').forEach((b) => {
    b.onclick = () => {
      if (ocupado || pin.length >= LARGO_PIN) return;
      pin += b.dataset.n;
      pintar();
      if (pin.length === LARGO_PIN) enviar();
    };
  });
  document.getElementById('borrar').onclick = () => { if (!ocupado) { pin = pin.slice(0, -1); pintar(); } };
  if (alVolver) document.getElementById('volver').onclick = alVolver;
}

function pedirPin(perfil) {
  teclado({
    titulo: perfil.nombre,
    subtitulo: 'Escribe tu PIN',
    alVolver: pantallaPerfiles,
    alCompletar: async (pin) => {
      try {
        sesion = await store.desbloquear(perfil.id, pin);
      } catch {
        return { error: 'PIN incorrecto' };
      }
      pestana = 'inicio';
      sub = null;
      pantallaPrincipal();
      sincronizarNube(false);
    }
  });
}

async function nuevoPerfil() {
  const hayPerfiles = (await store.listarPerfiles()).length > 0;
  app.innerHTML = `
    <div class="acceso">
      <div class="logo">S</div>
      <h1>${hayPerfiles ? 'Nuevo perfil' : 'Bienvenido a Saldar'}</h1>
      <p class="sub">${hayPerfiles ? 'Cada perfil tiene su propio PIN y sus propios datos.' : 'Crea tu perfil para empezar. Tus datos se quedan en este teléfono, cifrados con tu PIN.'}</p>
      <form class="campo" id="form">
        <input id="nombre" type="text" placeholder="Tu nombre" maxlength="24" autocomplete="off" autocapitalize="words" required>
        <button class="btn" type="submit">Continuar</button>
      </form>
      ${hayPerfiles ? '<button class="volver" id="volver">Cancelar</button>' : '<button class="volver" id="restaurar">Ya tengo un respaldo</button>'}
    </div>`;
  if (hayPerfiles) document.getElementById('volver').onclick = pantallaPerfiles;
  else document.getElementById('restaurar').onclick = elegirRespaldo;
  document.getElementById('form').onsubmit = (e) => {
    e.preventDefault();
    const nombre = document.getElementById('nombre').value.trim();
    if (nombre) elegirPin(nombre);
  };
}

function elegirPin(nombre) {
  teclado({
    titulo: 'Crea tu PIN',
    subtitulo: `${LARGO_PIN} dígitos. Si lo olvidas no se puede recuperar.`,
    alVolver: nuevoPerfil,
    alCompletar: async (pin1) => {
      confirmarPin(nombre, pin1);
    }
  });
}

function confirmarPin(nombre, pin1) {
  teclado({
    titulo: 'Confirma tu PIN',
    subtitulo: 'Escríbelo otra vez',
    alVolver: () => elegirPin(nombre),
    alCompletar: async (pin2) => {
      if (pin2 !== pin1) return { error: 'No coincide, intenta de nuevo' };
      const r = await store.crearPerfil(nombre, pin1);
      sesion = r.sesion;
      store.pedirPersistencia();
      pestana = 'inicio';
      sub = null;
      pantallaPrincipal();
    }
  });
}

/* ================= App principal ================= */

const ICONOS = {
  inicio: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  deudas: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  compras: '<path d="M6 6h15l-2 9H8L6 6zM6 6L5 3H2"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'
};
const TITULOS = { inicio: 'Hoy', deudas: 'Deudas', calendario: 'Calendario', compras: 'Compras', ajustes: 'Ajustes' };

const ctx = {
  sesion: () => sesion,
  guardar: async () => {
    const n = sesion.estado.ajustes.nube;
    if (n) { n.sucio = true; nube.marcarCambio(); }
    try { await store.guardar(sesion); } catch { aviso('No se pudo guardar. Intenta de nuevo.'); throw new Error('guardar'); }
    programarNube();
  },
  respaldar: () => exportarRespaldo(),
  ir(tab, subvista) {
    pestana = tab; sub = subvista || null; pantallaPrincipal(); },
  aviso
};

function pantallaPrincipal() {
  // Pantallas internas (detalle y formulario de deuda): sin barra inferior.
  if (sub) {
    app.innerHTML = '<div class="contenido" id="contenido"></div>';
    const cont = document.getElementById('contenido');
    if (sub.vista === 'detalle') deudasUI.detalle(ctx, cont, sub.id);
    else if (sub.vista === 'compra') comprasUI.formulario(ctx, cont, sub.id);
    else if (sub.vista === 'guia') comprasUI.guia(ctx, cont);
    else if (sub.vista === 'compromiso') compromisosUI.formulario(ctx, cont, sub.id, sub.borrador);
    else if (sub.vista === 'cuentas') cuentasUI.lista(ctx, cont);
    else if (sub.vista === 'cuenta') cuentasUI.formulario(ctx, cont, sub.id);
    else deudasUI.formulario(ctx, cont, sub.id);
    cont.scrollTop = 0;
    return;
  }
  app.innerHTML = `
    <div class="contenido" id="contenido"></div>
    <nav>
      ${['inicio', 'deudas', 'fab', 'calendario', 'compras'].map((k) => k === 'fab'
        ? '<button class="fab" id="fab" aria-label="Agregar"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>'
        : `<button data-tab="${k}" class="${k === pestana ? 'activo' : ''}">
          <svg viewBox="0 0 24 24">${ICONOS[k]}</svg>${TITULOS[k]}
        </button>`).join('')}
    </nav>`;
  app.querySelectorAll('nav button[data-tab]').forEach((b) => {
    b.onclick = () => ctx.ir(b.dataset.tab, null);
  });
  document.getElementById('fab').onclick = () => compromisosUI.menuAgregar(ctx, () => comprasUI.modalPegar(ctx));
  const c = document.getElementById('contenido');
  if (pestana === 'inicio') compromisosUI.hoy(ctx, c);
  else if (pestana === 'deudas') deudasUI.lista(ctx, c);
  else if (pestana === 'calendario') calendarioUI.calendario(ctx, c);
  else if (pestana === 'compras') comprasUI.lista(ctx, c);
  else {
    c.innerHTML = VISTAS[pestana]();
    if (pestana === 'ajustes') enlazarAjustes();
  }
}

function proximamente(titulo, texto, paso) {
  return `
    <h1>${titulo}</h1>
    <div class="card vacio"><b>Aún no hay nada aquí</b>${texto}<br><span class="insignia">${paso}</span></div>`;
}

const VISTAS = {
  ajustes() {
    const ult = sesion.estado.ajustes.ultimoRespaldo;
    return `
      <h1>Ajustes</h1>
      <div class="card">
        <div class="ajuste"><span>Perfil</span><b>${esc(sesion.nombre)}</b></div>
        <div class="ajuste"><span>Moneda</span><b>${esc(sesion.estado.ajustes.moneda)}</b></div>
        <div class="ajuste"><span>Versión</span><b>Saldar ${VERSION_APP}</b></div>
      </div>
      <div class="seccion">Tus datos</div>
      <div class="card">
        <div class="ajuste"><span>Último respaldo</span><b>${ult ? esc(fechaLarga(ult)) : 'Nunca'}</b></div>
        <div class="ajuste"><span>Almacenamiento protegido</span><b id="persist">…</b></div>
        <p class="nota">Tus deudas viven solo en este teléfono. Si borras la app o cambias de teléfono, se pierden. Guarda un respaldo en Archivos o iCloud: va cifrado con tu PIN y nadie lo puede leer sin él.</p>
      </div>
      <div class="seccion">Nube (ver tus datos en el computador)</div>
      <div class="card" id="nube"></div>
      <div class="seccion">Copias automáticas</div>
      <div class="card" id="copias"><div class="nota" style="margin:0">Cargando…</div></div>
      <button class="btn" id="respaldar" style="max-width:none;margin-top:0">Exportar respaldo</button>
      <button class="btn sec" id="restaurar" style="max-width:none">Restaurar desde un archivo</button>
      <button class="btn sec" id="recordar" style="max-width:none">Recordarme el respaldo cada mes</button>
      <div class="seccion">Aplicación</div>
      <button class="btn sec" id="actualizar" style="max-width:none;margin-top:0">Buscar actualización</button>
      <button class="btn" id="bloquear" style="max-width:none">Bloquear ahora</button>
      <button class="btn sec" id="cambiar" style="max-width:none">Cambiar de perfil</button>
      <button class="btn peligro" id="eliminar" style="max-width:none">Eliminar este perfil</button>`;
  }
};

// Explica cómo guardar el respaldo y luego abre la hoja de compartir.
function exportarRespaldo() {
  const m = modal(`
    <h2>Exportar respaldo</h2>
    <ol class="pasos">
      <li>Se abre la hoja de compartir. Toca <b>Guardar en Archivos</b>.</li>
      <li>Elige <b>iCloud Drive</b> (así sobrevive aunque cambies o pierdas el teléfono) y toca <b>Guardar</b>.</li>
      <li>Para recuperarlo: <b>Ajustes &gt; Restaurar desde un archivo</b> y elige ese archivo.</li>
    </ol>
    <p class="nota">El archivo va cifrado con tu PIN: sin el PIN nadie puede abrirlo, ni tú.</p>
    <button class="btn" id="seguir" style="max-width:none">Continuar</button>
    <button class="volver" id="no" type="button" style="width:100%">Cancelar</button>`);
  m.el.querySelector('#no').onclick = m.cerrar;
  m.el.querySelector('#seguir').onclick = () => { m.cerrar(); hacerRespaldo(); };
}

async function hacerRespaldo() {
  try {
    const datos = await store.exportarPerfil(sesion.id);
    const nombreArchivo = `Saldar-respaldo-${sesion.nombre.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    const archivo = new File([JSON.stringify(datos)], nombreArchivo, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Respaldo de Saldar' });
      } catch (e) {
        if (e.name === 'AbortError') return aviso('Respaldo cancelado');
        throw e;
      }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(archivo);
      a.download = nombreArchivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    sesion.estado.ajustes.ultimoRespaldo = Date.now();
    await ctx.guardar();
    aviso('Respaldo exportado');
    pantallaPrincipal();
  } catch {
    aviso('No se pudo crear el respaldo');
  }
}

function elegirRespaldo() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      let r = await store.importarPerfil(obj, false);
      if (r.pendiente) {
        if (!confirm(`Ya existe el perfil "${r.nombre}" en este teléfono. ¿Reemplazarlo con el respaldo? Se perderán los cambios hechos después de ese respaldo.`)) return;
        r = await store.importarPerfil(obj, true);
      }
      aviso(`Perfil "${r.nombre}" restaurado. Entra con tu PIN.`);
      pantallaPerfiles();
    } catch (e) {
      aviso(e instanceof SyntaxError ? 'El archivo no es un respaldo de Saldar.' : (e.message || 'No se pudo leer el archivo.'));
    }
  };
  inp.click();
}

// Descarga la versión más nueva sin tocar los datos (solo borra la caché de archivos).
async function buscarActualizacion() {
  aviso('Buscando actualización…');
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.update().catch(() => {})));
    for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* sin internet: se recarga con lo que haya */ }
  location.reload();
}

async function pintarCopias() {
  const caja = document.getElementById('copias');
  if (!caja) return;
  const lista = await store.listarCopias(sesion.id);
  caja.innerHTML = `
    <p class="nota" style="margin:0 0 10px">Cada día Saldar guarda en este teléfono una copia cifrada de tus datos (las últimas 7). Sirven para deshacer un error. <b>No reemplazan el respaldo en Archivos o iCloud</b>: si pierdes el teléfono, se pierden.</p>
    ${lista.length ? lista.map((c) => `<div class="ajuste"><span>${esc(fechaLarga(c.f))}</span><button class="chip-btn" data-f="${c.f}">Restaurar</button></div>`).join('') : '<div class="nota" style="margin:0">Todavía no hay copias. Se crea la primera la próxima vez que abras Saldar con tu PIN.</div>'}`;
  caja.querySelectorAll('[data-f]').forEach((b) => {
    b.onclick = async () => {
      const f = Number(b.dataset.f);
      if (!confirm(`¿Volver a la copia del ${fechaLarga(f)}? Los cambios hechos después se perderán, aunque tu estado actual queda guardado como otra copia. Tendrás que entrar de nuevo con tu PIN.`)) return;
      try { await store.restaurarCopia(sesion.id, f); } catch { aviso('No se pudo restaurar la copia.'); return; }
      aviso('Copia restaurada. Entra con tu PIN.');
      bloquear();
    };
  });
}

/* ================= Nube ================= */
let nubeOcupada = false;
let nubeTimer = null;

function programarNube() {
  if (!sesion || !sesion.estado.ajustes.nube) return;
  clearTimeout(nubeTimer);
  nubeTimer = setTimeout(() => sincronizarNube(false), 3000);
}

// `manual`: el usuario tocó el botón (muestra avisos de error y repinta). Sin manual, solo avisa si bajó datos.
async function sincronizarNube(manual, resolver = null) {
  if (!sesion || !sesion.estado.ajustes.nube || nubeOcupada) return;
  nubeOcupada = true;
  const miSesion = sesion;
  let r;
  try { r = await nube.sincronizar(sesion, () => store.guardar(sesion), { resolver }); } finally { nubeOcupada = false; }
  if (sesion !== miSesion) return;
  if (r.accion === 'bajado') {
    aviso('Datos actualizados desde la nube');
    if (!sub) pantallaPrincipal();
  } else if (r.accion === 'conflicto') {
    preguntarConflicto();
  } else if (r.accion === 'error' && manual) {
    aviso(r.mensaje);
  } else if (r.accion === 'subido' && manual) {
    aviso('Nube al día');
  } else if (r.accion === 'nada' && manual) {
    aviso('Nube al día');
  }
  pintarNube();
}

function preguntarConflicto() {
  const m = modal(`
    <h2>Cambios en dos lados</h2>
    <p class="nota">Hay datos más nuevos en la nube y también cambios sin enviar en este dispositivo. Elige cuál conservar. Lo otro se pierde.</p>
    <button class="btn" id="c-nube" style="max-width:none">Usar lo de la nube</button>
    <button class="btn sec" id="c-aqui" style="max-width:none">Usar lo de este dispositivo</button>
    <button class="volver" id="c-no" type="button" style="width:100%">Decidir después</button>`);
  m.el.querySelector('#c-no').onclick = m.cerrar;
  m.el.querySelector('#c-nube').onclick = () => { m.cerrar(); sincronizarNube(true, 'nube'); };
  m.el.querySelector('#c-aqui').onclick = () => { m.cerrar(); sincronizarNube(true, 'local'); };
}

function pintarNube() {
  const caja = document.getElementById('nube');
  if (!caja || !sesion) return;
  const n = sesion.estado.ajustes.nube;
  if (!n) {
    caja.innerHTML = `
      <p class="nota" style="margin:0 0 10px">Guarda una copia cifrada en internet para abrir Saldar en el computador con los mismos datos. Solo tú puedes leerla: se cifra aquí con una contraseña larga que el servidor nunca recibe.</p>
      <button class="btn" id="n-conectar" style="max-width:none;margin-top:0">Conectar la nube</button>`;
    caja.querySelector('#n-conectar').onclick = abrirConectarNube;
    return;
  }
  caja.innerHTML = `
    <div class="ajuste"><span>Estado</span><b>${n.sucio ? 'Cambios sin enviar' : 'Al día'}</b></div>
    <div class="ajuste"><span>Última sincronización</span><b>${n.ultima ? esc(fechaLarga(n.ultima)) : 'Nunca'}</b></div>
    <button class="btn" id="n-sync" style="max-width:none">Sincronizar ahora</button>
    <button class="btn sec" id="n-fuera" style="max-width:none">Desconectar este dispositivo</button>
    <p class="nota">Desconectar no borra lo que ya está en la nube. En otro dispositivo: crea un perfil, abre Ajustes y conecta con la misma dirección y contraseña.</p>`;
  caja.querySelector('#n-sync').onclick = () => sincronizarNube(true);
  caja.querySelector('#n-fuera').onclick = async () => {
    if (!confirm('¿Desconectar la nube en este dispositivo? Tus datos locales y los de la nube se quedan como están.')) return;
    nube.desconectar(sesion.estado);
    try { await store.guardar(sesion); } catch { aviso('No se pudo guardar.'); return; }
    pintarNube();
  };
}

function abrirConectarNube() {
  const m = modal(`
    <h2>Conectar la nube</h2>
    <form id="n-form" class="formulario">
      <label>Dirección del servicio<input name="url" inputmode="url" placeholder="https://saldar-nube.tu-usuario.workers.dev" autocomplete="off" autocapitalize="off" required></label>
      <label>Contraseña larga (mínimo ${nube.MIN_CLAVE} caracteres)<input name="clave" type="password" autocomplete="off" required></label>
      <p class="nota">Usa una frase que solo tú sepas, distinta de tu PIN. <b>Si la olvidas, los datos de la nube no se pueden recuperar</b> (los de tu teléfono siguen ahí). En el computador debes escribir exactamente la misma.</p>
      <div class="error" id="n-err"></div>
      <button class="btn" type="submit" id="n-ok" style="max-width:none">Conectar</button>
      <button class="volver" id="n-no" type="button" style="width:100%">Cancelar</button>
    </form>`);
  m.el.querySelector('#n-no').onclick = m.cerrar;
  m.el.querySelector('#n-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target.elements;
    const err = m.el.querySelector('#n-err');
    const ok = m.el.querySelector('#n-ok');
    err.textContent = '';
    ok.disabled = true; ok.textContent = 'Conectando…';
    try {
      const r = await nube.conectar(sesion, f.url.value, f.clave.value);
      if (r.existe && !confirm('En la nube ya hay datos de Saldar. ¿Descargarlos y reemplazar lo que hay en este dispositivo?')) {
        ok.disabled = false; ok.textContent = 'Conectar';
        return;
      }
      sesion.estado.ajustes.nube = r.nube;
      await store.guardar(sesion);
      m.cerrar();
      await sincronizarNube(true, r.existe ? 'nube' : null);
      pintarNube();
    } catch (e) {
      err.textContent = e.message || 'No se pudo conectar.';
      ok.disabled = false; ok.textContent = 'Conectar';
    }
  };
}

function enlazarAjustes() {
  pintarNube();
  pintarCopias();
  navigator.storage?.persisted?.().then((p) => { const el = document.getElementById('persist'); if (el) el.textContent = p ? 'Sí' : 'No'; });
  document.getElementById('respaldar').onclick = exportarRespaldo;
  document.getElementById('restaurar').onclick = elegirRespaldo;
  document.getElementById('recordar').onclick = async () => {
    const r = await entregarICS('Saldar-recordatorio-respaldo.ics', respaldoICS(), 'Recordatorio de respaldo');
    aviso(r === 'cancelado' ? 'Cancelado' : 'Recordatorio listo para el Calendario');
  };
  document.getElementById('actualizar').onclick = buscarActualizacion;
  document.getElementById('bloquear').onclick = bloquear;
  document.getElementById('cambiar').onclick = bloquear;
  document.getElementById('eliminar').onclick = async () => {
    if (!confirm(`¿Eliminar el perfil "${sesion.nombre}" y todos sus datos? Esto no se puede deshacer.`)) return;
    await store.eliminarPerfil(sesion.id);
    sesion = null;
    aviso('Perfil eliminado');
    pantallaPerfiles();
  };
}

function bloquear() {
  sesion = null; // al soltar la sesión se pierde la llave de la memoria
  pantallaPerfiles();
}

// En el iPhone instalado, la ventana de la app mide menos que la pantalla (le faltan ~47 px abajo).
// Esa franja no se puede dibujar: se pinta del color de la barra y se descuenta del relleno inferior.
function ajustarFalta() {
  const falta = screen.height - innerHeight;
  const hay = navigator.standalone && innerHeight > innerWidth && falta > 0 && falta <= 70;
  document.documentElement.style.setProperty('--falta', hay ? `${falta}px` : '0px');
}
ajustarFalta();
addEventListener('resize', ajustarFalta);
addEventListener('orientationchange', () => setTimeout(ajustarFalta, 300));

// Bloqueo automático al dejar la app en segundo plano.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ocultoDesde = Date.now();
  } else if (sesion && ocultoDesde && Date.now() - ocultoDesde > BLOQUEO_SEGUNDOS * 1000) {
    bloquear();
  } else if (sesion && !sub) {
    sincronizarNube(false);
  }
});

/* ================= Inicio ================= */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
pantallaPerfiles();
