// Saldar - Paso 1: base de la app, perfiles con PIN, almacenamiento cifrado y estructura.
import * as store from './store.js';
import { esc, fechaLarga } from './util.js';
import * as deudasUI from './deudas-ui.js';

const app = document.getElementById('app');
const VERSION_APP = '0.3';
const LARGO_PIN = 6;
const BLOQUEO_SEGUNDOS = 60; // se bloquea al volver tras estar tanto tiempo en segundo plano

let sesion = null;        // { id, nombre, llave, estado } mientras el perfil está abierto
let pestana = 'inicio';
let sub = null;           // pantalla interna: { vista: 'detalle' | 'form', id }
let ocultoDesde = 0;

const inicial = (nombre) => esc((nombre.trim()[0] || '?').toUpperCase());

function aviso(texto) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ================= Acceso ================= */

async function pantallaPerfiles() {
  sesion = null;
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
const TITULOS = { inicio: 'Inicio', deudas: 'Deudas', calendario: 'Calendario', compras: 'Compras', ajustes: 'Ajustes' };

const ctx = {
  sesion: () => sesion,
  guardar: async () => {
    try { await store.guardar(sesion); } catch { aviso('No se pudo guardar. Intenta de nuevo.'); throw new Error('guardar'); }
  },
  ir(tab, subvista) { pestana = tab; sub = subvista || null; pantallaPrincipal(); },
  aviso
};

function pantallaPrincipal() {
  // Pantallas internas (detalle y formulario de deuda): sin barra inferior.
  if (sub) {
    app.innerHTML = '<div class="contenido" id="contenido"></div>';
    const cont = document.getElementById('contenido');
    if (sub.vista === 'detalle') deudasUI.detalle(ctx, cont, sub.id);
    else deudasUI.formulario(ctx, cont, sub.id);
    cont.scrollTop = 0;
    return;
  }
  app.innerHTML = `
    <div class="contenido" id="contenido"></div>
    <nav>
      ${Object.keys(TITULOS).map((k) => `
        <button data-tab="${k}" class="${k === pestana ? 'activo' : ''}">
          <svg viewBox="0 0 24 24">${ICONOS[k]}</svg>${TITULOS[k]}
        </button>`).join('')}
    </nav>`;
  app.querySelectorAll('nav button').forEach((b) => {
    b.onclick = () => ctx.ir(b.dataset.tab, null);
  });
  const c = document.getElementById('contenido');
  if (pestana === 'inicio') deudasUI.inicio(ctx, c);
  else if (pestana === 'deudas') deudasUI.lista(ctx, c);
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
  calendario: () => proximamente('Calendario', 'Los vencimientos del mes y tus recordatorios.', 'Paso 3'),
  compras: () => proximamente('Compras', 'Pagos con tarjeta capturados por Apple Pay o por el SMS del banco.', 'Paso 4'),
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
      <button class="btn" id="respaldar" style="max-width:none;margin-top:0">Exportar respaldo</button>
      <button class="btn sec" id="restaurar" style="max-width:none">Restaurar desde un archivo</button>
      <div class="seccion">Aplicación</div>
      <button class="btn sec" id="actualizar" style="max-width:none;margin-top:0">Buscar actualización</button>
      <button class="btn" id="bloquear" style="max-width:none">Bloquear ahora</button>
      <button class="btn sec" id="cambiar" style="max-width:none">Cambiar de perfil</button>
      <button class="btn peligro" id="eliminar" style="max-width:none">Eliminar este perfil</button>`;
  }
};

async function exportarRespaldo() {
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

function enlazarAjustes() {
  navigator.storage?.persisted?.().then((p) => { const el = document.getElementById('persist'); if (el) el.textContent = p ? 'Sí' : 'No'; });
  document.getElementById('respaldar').onclick = exportarRespaldo;
  document.getElementById('restaurar').onclick = elegirRespaldo;
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

// Bloqueo automático al dejar la app en segundo plano.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ocultoDesde = Date.now();
  } else if (sesion && ocultoDesde && Date.now() - ocultoDesde > BLOQUEO_SEGUNDOS * 1000) {
    bloquear();
  }
});

/* ================= Inicio ================= */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
pantallaPerfiles();
