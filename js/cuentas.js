// Cuentas (lo que tienes): efectivo, cuentas, ahorros, CDT e inversiones. Lógica pura, sin pantalla.
// Los movimientos descuentan o suman a una cuenta. Solo se mueve dinero de lo que ocurre desde que la
// cuenta empezó a llevarse en Saldar (`desde`): lo anterior ya está reflejado en el saldo que escribió el usuario.

export const TIPOS_CUENTA = [
  ['efectivo', 'Efectivo', '💵'], ['cuenta', 'Cuenta bancaria', '🏦'], ['ahorro', 'Ahorros', '🐖'],
  ['cdt', 'CDT', '📈'], ['inversion', 'Otra inversión', '💹']
];
export const GASTABLES = ['efectivo', 'cuenta', 'ahorro'];
export const esGastable = (c) => !!c && GASTABLES.includes(c.tipo);
export const nombreTipo = (t) => (TIPOS_CUENTA.find((x) => x[0] === t) || TIPOS_CUENTA[1])[1];
export const iconoTipo = (t) => (TIPOS_CUENTA.find((x) => x[0] === t) || TIPOS_CUENTA[1])[2];

const pad = (n) => String(n).padStart(2, '0');
export const hoyISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const gastables = (e) => (e.cuentas || []).filter(esGastable);
export const principal = (e) => gastables(e).find((c) => c.id === e.ajustes.cuentaPrincipal) || null;

// 'auto' (o sin dato) -> cuenta principal; '' -> no mover dinero; otro valor -> esa cuenta si existe.
export function resolver(e, id) {
  if (id === '') return null;
  if (id === undefined || id === null || id === 'auto') return principal(e);
  return gastables(e).find((c) => c.id === id) || null;
}

export const disponible = (e) => gastables(e).reduce((t, c) => t + (c.saldo || 0), 0);
export const totalCuentas = (e) => (e.cuentas || []).reduce((t, c) => t + (c.saldo || 0), 0);
export const totalDeudas = (e) => (e.deudas || []).reduce((t, d) => t + Math.max(0, d.saldo || 0), 0);
export const patrimonio = (e) => totalCuentas(e) - totalDeudas(e);

// ¿Este movimiento (en la fecha ISO) debe mover dinero de la cuenta?
export const cuentaAplica = (cuenta, fechaISO) => !!cuenta && String(fechaISO) >= (cuenta.desde || '0000-00-00');

// Marca o desmarca una ocurrencia de un compromiso y mueve el dinero. Devuelve true si quedó marcada.
export function alternarCumplido(e, comp, iso) {
  comp.cumplidos = comp.cumplidos || {};
  comp.descuentos = comp.descuentos || {};
  if (comp.cumplidos[iso]) {
    delete comp.cumplidos[iso];
    const d = comp.descuentos[iso];
    if (d) {
      const cu = (e.cuentas || []).find((c) => c.id === d.cuentaId);
      if (cu) cu.saldo += comp.tipo === 'ingreso' ? -d.monto : d.monto;
      delete comp.descuentos[iso];
    }
    return false;
  }
  comp.cumplidos[iso] = Date.now();
  const cu = resolver(e, comp.cuentaId);
  if (cu && cuentaAplica(cu, iso)) {
    cu.saldo += comp.tipo === 'ingreso' ? comp.monto : -comp.monto;
    comp.descuentos[iso] = { cuentaId: cu.id, monto: comp.monto };
  }
  return true;
}

// Cuenta de la que se paga un abono o una compra (null si no se debe mover dinero).
export function cuentaDePago(e, id, fechaISO) {
  const cu = resolver(e, id);
  return cuentaAplica(cu, fechaISO) ? cu : null;
}

export function diasParaVencer(c, hoy = new Date()) {
  if (!c.vence) return null;
  const [y, m, d] = c.vence.split('-').map(Number);
  const a = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((new Date(y, m - 1, d) - a) / 86400000);
}

// CDT por vencer (o vencidos) en los próximos `dias` días.
export const cdtPorVencer = (e, dias = 15, hoy = new Date()) =>
  (e.cuentas || []).filter((c) => c.tipo === 'cdt' && c.vence && diasParaVencer(c, hoy) <= dias);
