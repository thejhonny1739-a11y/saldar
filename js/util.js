// Utilidades compartidas de la interfaz.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtPesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const pesos = (n) => fmtPesos.format(Math.round(n || 0));

const fmtMiles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
export const miles = (n) => (n ? fmtMiles.format(n) : '');

export const fechaCorta = (d) => new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
export const fechaLarga = (d) => new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
export const mesAnio = (d) => new Date(d).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

// Convierte "2026-11-12" en fecha local (sin desfase de zona horaria).
export const desdeISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Ventana emergente simple. Devuelve { el, cerrar }.
export function modal(html) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="modal-card">${html}</div>`;
  const cerrar = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) cerrar(); });
  document.body.appendChild(el);
  return { el, cerrar };
}

// Campos de dinero: muestran 1.250.000 mientras se escribe.
export function enlazarMonto(raiz) {
  raiz.querySelectorAll('input[data-monto]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const n = Number(inp.value.replace(/\D/g, '')) || 0;
      inp.value = n ? fmtMiles.format(n) : '';
    });
  });
}

// Entrega un archivo: hoja de compartir del iPhone si existe; si no, descarga.
// Devuelve 'ok' | 'cancelado' | 'descargado'.
export async function compartirArchivo(nombre, contenido, tipo, titulo) {
  const archivo = new File([contenido], nombre, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo });
      return 'ok';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelado';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'descargado';
}

// Explica cómo agregar un .ics al Calendario (iOS no ofrece "Calendario" en la hoja de compartir) y luego lo entrega.
export function entregarICS(nombre, contenido, titulo) {
  return new Promise((resolver) => {
    const m = modal(`
      <h2>Agregar al Calendario</h2>
      <ol class="pasos">
        <li>En la hoja que se abre, toca <b>Guardar en Archivos</b> y elige una carpeta.</li>
        <li>Abre la app <b>Archivos</b> y toca el archivo que guardaste.</li>
        <li>Abajo toca <b>Agregar todo</b> y elige un calendario.</li>
      </ol>
      <p class="nota">También sirve <b>Mail</b>: envíatelo a ti mismo y toca el adjunto.</p>
      <button class="btn" id="seguir" style="max-width:none">Continuar</button>
      <button class="volver" id="no" type="button" style="width:100%">Cancelar</button>`);
    m.el.querySelector('#no').onclick = () => { m.cerrar(); resolver('cancelado'); };
    m.el.querySelector('#seguir').onclick = async () => {
      m.cerrar();
      resolver(await compartirArchivo(nombre, contenido, 'text/calendar', titulo));
    };
  });
}
