// Búsqueda global: compromisos, deudas y compras por nombre, nota, categoría, tarjeta o monto.
import { esc, pesos, modal } from './util.js';
import { normalizar } from './lector.js';
import * as K from './compromisos.js';

const MAX = 8;

export function buscar(ctx) {
  const e = ctx.sesion().estado;
  const m = modal(`
    <h2>Buscar</h2>
    <input id="q" type="search" placeholder="Nombre, comercio, monto o tarjeta…" autocomplete="off" autocapitalize="none">
    <div id="res" style="margin-top:12px"><p class="nota">Escribe para buscar en tus compromisos, deudas y compras.</p></div>
    <button class="volver" id="no" type="button" style="width:100%">Cerrar</button>`);
  const q = m.el.querySelector('#q');
  const res = m.el.querySelector('#res');
  m.el.querySelector('#no').onclick = m.cerrar;
  setTimeout(() => q.focus(), 150);

  const nombreCat = (id) => ((e.categorias || []).find((k) => k.id === id) || {}).nombre || '';
  const espacio = (id) => ((e.espacios || []).find((x) => x.id === id) || {}).nombre || '';

  const coincide = (texto, tokens, dig, monto) => {
    const t = normalizar(texto);
    const montoTxt = String(monto || '');
    return tokens.every((k) => t.includes(k)) || (dig.length >= 3 && montoTxt.includes(dig) && tokens.length === 1);
  };

  const pintar = () => {
    const raw = q.value.trim();
    if (!raw) { res.innerHTML = '<p class="nota">Escribe para buscar en tus compromisos, deudas y compras.</p>'; return; }
    const tokens = normalizar(raw).split(' ').filter(Boolean);
    const dig = raw.replace(/\D/g, '');
    const comp = e.compromisos.filter((c) => coincide(`${c.nombre} ${c.nota || ''} ${nombreCat(c.categoriaId)}`, tokens, dig, c.monto)).slice(0, MAX)
      .map((c) => ({ t: 'c', id: c.id, icono: K.categoriaDe(e, c).icono, nombre: c.nombre, sub: `Compromiso · ${K.nombreFrecuencia(c.frecuencia)} · ${espacio(c.espacioId)}`, monto: (c.tipo === 'ingreso' ? '+' : '−') + ' ' + pesos(c.monto) }));
    const deu = e.deudas.filter((d) => coincide(`${d.nombre} ${d.acreedor || ''} ${d.tarjeta || ''} ${d.notas || ''} ${d.tipo || ''}`, tokens, dig, d.saldo)).slice(0, MAX)
      .map((d) => ({ t: 'd', id: d.id, icono: '💳', nombre: d.nombre, sub: `Deuda · ${[d.acreedor, d.tarjeta ? '•••• ' + d.tarjeta : ''].filter(Boolean).join(' · ') || d.tipo || ''}`, monto: pesos(d.saldo) }));
    const com = [...e.compras].sort((a, b) => b.fecha.localeCompare(a.fecha)).filter((x) => coincide(`${x.comercio} ${x.nota || ''} ${nombreCat(x.categoria)} ${x.tarjeta || ''}`, tokens, dig, x.monto)).slice(0, MAX)
      .map((x) => ({ t: 'p', id: x.id, icono: (K.categoriaDe(e, { categoriaId: x.categoria, tipo: 'gasto' })).icono, nombre: x.comercio, sub: `Compra · ${x.fecha}${x.tarjeta ? ' · •••• ' + x.tarjeta : ''}`, monto: pesos(x.monto) }));
    const todo = [['Compromisos', comp], ['Deudas', deu], ['Compras', com]].filter(([, l]) => l.length);
    res.innerHTML = todo.length
      ? todo.map(([titulo, l]) => `<div class="etiqueta" style="margin:12px 0 4px">${titulo}</div>${l.map((r) => `
          <button class="cat-fila res-fila" data-t="${r.t}" data-id="${esc(r.id)}"><span class="ico peq">${esc(r.icono)}</span>
            <span class="res-txt"><b>${esc(r.nombre)}</b><small>${esc(r.sub)}</small></span><b class="res-monto">${esc(r.monto)}</b></button>`).join('')}`).join('')
      : '<p class="nota">No encontré nada con eso.</p>';
    res.querySelectorAll('.res-fila').forEach((b) => {
      b.onclick = () => {
        m.cerrar();
        const { t, id } = b.dataset;
        if (t === 'c') ctx.ir('inicio', { vista: 'compromiso', id });
        else if (t === 'd') ctx.ir('deudas', { vista: 'detalle', id });
        else ctx.ir('compras', { vista: 'compra', id });
      };
    });
  };
  q.addEventListener('input', pintar);
}
