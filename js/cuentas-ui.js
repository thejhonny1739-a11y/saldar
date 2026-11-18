// Pantalla "Tu dinero": cuentas, ahorros, CDT, disponible y patrimonio neto.
import { esc, pesos, miles, fechaLarga, enlazarMonto } from './util.js';
import { parseMonto, parseTasa } from './calculos.js';
import * as Q from './cuentas.js';

const COLOR_TIPO = { efectivo: '#00d4a0', cuenta: '#5b8def', ahorro: '#ffb020', cdt: '#8b5cf6', inversion: '#ff2d78' };
const ico = (tipo) => `<span class="ico" style="background:${COLOR_TIPO[tipo] || '#9aa5b1'}2e">${Q.iconoTipo(tipo)}</span>`;

export function lista(ctx, c) {
  const e = ctx.sesion().estado;
  const cuentas = e.cuentas || [];
  const gast = cuentas.filter(Q.esGastable);
  const otras = cuentas.filter((x) => !Q.esGastable(x));
  const pat = Q.patrimonio(e);
  const fila = (x) => {
    const dias = x.tipo === 'cdt' ? Q.diasParaVencer(x) : null;
    const sub = [Q.nombreTipo(x.tipo), x.id === e.ajustes.cuentaPrincipal ? 'Principal' : '', x.tarjeta ? `•••• ${x.tarjeta}` : '',
      x.tipo === 'cdt' && x.tasa ? `${x.tasa}% E.A.` : '',
      dias !== null ? (dias < 0 ? 'Vencido' : dias === 0 ? 'Vence hoy' : `Vence en ${dias} d`) : ''].filter(Boolean).join(' · ');
    return `<button class="cuenta-fila" data-id="${esc(x.id)}">${ico(x.tipo)}
      <span class="comp-txt"><b>${esc(x.nombre)}</b><small class="${dias !== null && dias <= 15 ? 'ambar' : ''}">${esc(sub)}</small></span>
      <span class="cuenta-saldo">${pesos(x.saldo)}</span></button>`;
  };

  c.innerHTML = `
    <div class="encabezado"><button class="atras" id="atras">‹ Hoy</button><button class="btn-chico" id="nueva">+ Nueva</button></div>
    <h1>Tu dinero</h1>
    <p class="saludo">Lo que tienes y lo que debes</p>
    <div class="fila">
      <div class="card mini"><div class="etiqueta menta">Disponible</div><div class="cifra">${pesos(Q.disponible(e))}</div></div>
      <div class="card mini"><div class="etiqueta ${pat < 0 ? 'rosa' : ''}">Patrimonio neto</div><div class="cifra${pat < 0 ? ' neg' : ''}">${pesos(pat)}</div></div>
    </div>
    <p class="nota" style="margin:-4px 2px 8px">Disponible = efectivo, cuentas y ahorros. Patrimonio neto = todo lo que tienes menos tus deudas (${pesos(Q.totalDeudas(e))}).</p>
    ${cuentas.length === 0 ? `<div class="card vacio"><b>Aún no registras lo que tienes</b>Agrega tu efectivo, tu cuenta del banco, tus ahorros o un CDT. Así Saldar descuenta tus pagos y te dice cuánto te queda.<br><button class="btn" id="primera" style="max-width:none">Agregar mi primera cuenta</button></div>` : ''}
    ${gast.length ? `<div class="seccion">Para gastar</div>${gast.map(fila).join('')}` : ''}
    ${otras.length ? `<div class="seccion">Ahorro e inversión</div>${otras.map(fila).join('')}` : ''}
    ${gast.length ? '<p class="nota">Los pagos que marques como hechos y tus abonos descuentan de la cuenta principal, o de la que elijas en cada uno.</p>' : ''}`;

  c.querySelector('#atras').onclick = () => ctx.ir('inicio', null);
  c.querySelector('#nueva').onclick = () => ctx.ir('inicio', { vista: 'cuenta' });
  const p = c.querySelector('#primera');
  if (p) p.onclick = () => ctx.ir('inicio', { vista: 'cuenta' });
  c.querySelectorAll('.cuenta-fila').forEach((b) => { b.onclick = () => ctx.ir('inicio', { vista: 'cuenta', id: b.dataset.id }); });
}

export function formulario(ctx, c, id) {
  const e = ctx.sesion().estado;
  const x = id ? e.cuentas.find((k) => k.id === id) : null;
  if (id && !x) return ctx.ir('inicio', { vista: 'cuentas' });
  const v = x || { nombre: '', tipo: 'cuenta', saldo: 0, tarjeta: '', tasa: '', vence: '', nota: '' };
  const esPrincipal = x ? x.id === e.ajustes.cuentaPrincipal : !Q.principal(e);

  c.innerHTML = `
    <div class="encabezado"><button class="atras" id="atras">‹ ${x ? 'Cancelar' : 'Tu dinero'}</button></div>
    <h1>${x ? 'Editar cuenta' : 'Nueva cuenta'}</h1>
    <form id="f" class="formulario">
      <label>Nombre<input name="nombre" maxlength="30" value="${esc(v.nombre)}" placeholder="Ej: Bancolombia ahorros" autocomplete="off" required></label>
      <label>Tipo<select name="tipo">${Q.TIPOS_CUENTA.map(([k, t]) => `<option value="${k}"${k === v.tipo ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>${x ? 'Saldo actual (si lo cambias, queda como ajuste)' : 'Cuánto tienes hoy'}<input name="saldo" data-monto inputmode="numeric" value="${miles(v.saldo)}" placeholder="0" autocomplete="off"></label>
      <div id="blq-gast">
        <label>¿Es tu cuenta principal?<select name="principal"><option value="1"${esPrincipal ? ' selected' : ''}>Sí: de aquí se descuenta por defecto</option><option value="0"${esPrincipal ? '' : ' selected'}>No</option></select></label>
        <label>Tarjeta débito (4 dígitos, opcional)<input name="tarjeta" inputmode="numeric" maxlength="4" value="${esc(v.tarjeta || '')}" placeholder="Para descontar tus compras con débito" autocomplete="off"></label>
      </div>
      <div id="blq-cdt">
        <div class="dos">
          <label>Tasa E.A. % (opcional)<input name="tasa" inputmode="decimal" value="${esc(v.tasa || '')}" placeholder="Ej: 11,5" autocomplete="off"></label>
          <label>Vence<input type="date" name="vence" value="${esc(v.vence || '')}"></label>
        </div>
      </div>
      <label>Nota (opcional)<input name="nota" maxlength="80" value="${esc(v.nota || '')}" autocomplete="off"></label>
      ${x ? `<p class="nota">Llevas esta cuenta en Saldar desde el ${esc(fechaLarga(x.desde ? x.desde + 'T12:00:00' : Date.now()))}. Solo se descuentan los movimientos desde esa fecha.</p>` : ''}
      <div class="error" id="err"></div>
      <button class="btn" type="submit" style="max-width:none">${x ? 'Guardar cambios' : 'Crear cuenta'}</button>
      ${x ? '<button class="btn peligro" type="button" id="borrar" style="max-width:none">Eliminar cuenta</button>' : ''}
    </form>`;
  enlazarMonto(c);
  const f = c.querySelector('#f').elements;
  const pintar = () => {
    const gast = Q.GASTABLES.includes(f.tipo.value);
    c.querySelector('#blq-gast').style.display = gast ? '' : 'none';
    c.querySelector('#blq-cdt').style.display = f.tipo.value === 'cdt' ? '' : 'none';
  };
  f.tipo.addEventListener('change', pintar);
  pintar();
  c.querySelector('#atras').onclick = () => ctx.ir('inicio', { vista: 'cuentas' });

  c.querySelector('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const err = c.querySelector('#err');
    const tipo = f.tipo.value;
    const gast = Q.GASTABLES.includes(tipo);
    const tarjeta = f.tarjeta.value.replace(/\D/g, '').slice(0, 4);
    const nuevo = {
      nombre: f.nombre.value.trim(), tipo, saldo: parseMonto(f.saldo.value), nota: f.nota.value.trim(),
      tarjeta: gast ? tarjeta : '', tasa: tipo === 'cdt' ? (f.tasa.value.trim() ? parseTasa(f.tasa.value) : '') : '', vence: tipo === 'cdt' ? f.vence.value : ''
    };
    if (!nuevo.nombre) { err.textContent = 'Escribe un nombre.'; return; }
    if (f.tarjeta.value.trim() !== '' && gast && tarjeta.length !== 4) { err.textContent = 'La tarjeta son 4 dígitos.'; return; }
    if (nuevo.tasa !== '' && nuevo.tasa > 100) { err.textContent = 'Revisa la tasa: parece demasiado alta.'; return; }
    let cuenta = x;
    if (!x) {
      cuenta = { id: crypto.randomUUID(), ...nuevo, desde: Q.hoyISO(), creada: Date.now() };
      e.cuentas.push(cuenta);
    } else {
      if (x.saldo !== nuevo.saldo) x.desde = Q.hoyISO(); // un ajuste manual: desde hoy se vuelven a contar los movimientos
      Object.assign(x, nuevo);
    }
    if (gast && f.principal.value === '1') e.ajustes.cuentaPrincipal = cuenta.id;
    else if (e.ajustes.cuentaPrincipal === cuenta.id) e.ajustes.cuentaPrincipal = null;
    try { await ctx.guardar(); } catch { return; }
    ctx.aviso(x ? 'Cambios guardados' : 'Cuenta creada');
    ctx.ir('inicio', { vista: 'cuentas' });
  };

  const del = c.querySelector('#borrar');
  if (del) del.onclick = async () => {
    if (!confirm(`¿Eliminar la cuenta “${x.nombre}”? Los pagos ya descontados no se devuelven.`)) return;
    const copia = { ...x };
    const eraPrincipal = e.ajustes.cuentaPrincipal === x.id;
    e.cuentas = e.cuentas.filter((k) => k.id !== x.id);
    if (eraPrincipal) e.ajustes.cuentaPrincipal = null;
    try { await ctx.guardar(); } catch { return; }
    ctx.aviso('Cuenta eliminada', async () => {
      e.cuentas.push(copia);
      if (eraPrincipal) e.ajustes.cuentaPrincipal = copia.id;
      await ctx.guardar();
      ctx.ir('inicio', { vista: 'cuentas' });
    });
    ctx.ir('inicio', { vista: 'cuentas' });
  };
}

// <option>s para elegir de qué cuenta se descuenta: automática (la principal), cada cuenta gastable o ninguna.
export function opcionesCuenta(e, sel = 'auto') {
  const p = Q.principal(e);
  const cur = sel === undefined || sel === null ? 'auto' : sel;
  return [`<option value="auto"${cur === 'auto' ? ' selected' : ''}>${p ? `Cuenta principal (${esc(p.nombre)})` : 'Cuenta principal'}</option>`,
    ...Q.gastables(e).map((k) => `<option value="${esc(k.id)}"${cur === k.id ? ' selected' : ''}>${esc(k.nombre)} · ${pesos(k.saldo)}</option>`),
    `<option value=""${cur === '' ? ' selected' : ''}>No mover dinero</option>`].join('');
}
