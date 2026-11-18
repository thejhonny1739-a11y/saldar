// Vincula las compras con las deudas tipo tarjeta por los últimos 4 dígitos:
// una compra con la tarjeta de una deuda se suma al saldo de esa deuda, y se resta si se borra o cambia.

export const soloDigitos = (t) => String(t || '').replace(/\D/g, '').slice(0, 4);

// La deuda que tiene esa tarjeta (prefiere la que aún tiene saldo).
export function deudaDeTarjeta(estado, t4) {
  if (!/^\d{4}$/.test(t4 || '')) return null;
  const l = (estado.deudas || []).filter((d) => d.tarjeta === t4);
  return l.find((d) => d.saldo > 0) || l[0] || null;
}

// Suma la compra al saldo de su deuda. Solo si la compra se registró después de vincular la tarjeta,
// salvo que se fuerce (cuando el usuario pide sumar las compras anteriores).
export function aplicar(estado, compra, forzar = false) {
  if (compra.aplicado) return null;
  const d = deudaDeTarjeta(estado, compra.tarjeta);
  if (!d || !(compra.monto > 0)) return null;
  if (!forzar && (compra.creada || 0) < (d.tarjetaDesde || 0)) return null;
  d.saldo += compra.monto;
  compra.deudaId = d.id;
  compra.aplicado = compra.monto;
  if (!Array.isArray(d.historial)) d.historial = [];
  d.historial.push({ id: crypto.randomUUID(), f: Date.now(), tipo: 'compra', monto: compra.monto, fecha: compra.fecha, comercio: compra.comercio, compraId: compra.id });
  return d;
}

// Deshace lo que aplicar() sumó.
export function revertir(estado, compra) {
  if (!compra.aplicado) return;
  const d = (estado.deudas || []).find((x) => x.id === compra.deudaId);
  if (d) {
    d.saldo = Math.max(0, d.saldo - compra.aplicado);
    d.historial = (d.historial || []).filter((h) => h.compraId !== compra.id);
  }
  compra.aplicado = 0;
  delete compra.deudaId;
}

// Tras editar una compra: la deja coherente con su monto y su tarjeta.
export function sincronizar(estado, compra) {
  if (compra.aplicado) {
    const d = deudaDeTarjeta(estado, compra.tarjeta);
    if (d && d.id === compra.deudaId && compra.aplicado === compra.monto) return;
    revertir(estado, compra);
    aplicar(estado, compra, true); // ya estaba vinculada: se mantiene vinculada con los datos nuevos
    return;
  }
  aplicar(estado, compra);
}

// Compras con esa tarjeta que todavía no se sumaron al saldo.
export const sinSumar = (estado, t4) => (estado.compras || []).filter((c) => c.tarjeta === t4 && !c.aplicado);
