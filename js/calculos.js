// Cálculos puros de deudas (sin pantalla): fechas de pago, abonos del mes y proyección.
const pad = (n) => String(n).padStart(2, '0');
export const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ultimoDia = (y, m) => new Date(y, m + 1, 0).getDate();
const vence = (y, m, dia) => new Date(y, m, Math.min(dia, ultimoDia(y, m)));
export const diasEntre = (a, b) => Math.round((inicioDia(b) - inicioDia(a)) / 86400000);

export function abonadoMes(estado, deudaId, hoy = new Date()) {
  const pref = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}`;
  return estado.pagos
    .filter((p) => p.deudaId === deudaId && p.fecha.startsWith(pref))
    .reduce((s, p) => s + p.monto, 0);
}

// Estado de pago de una deuda respecto al mes actual.
export function situacion(deuda, estado, hoy = new Date()) {
  const pagadoMes = abonadoMes(estado, deuda.id, hoy);
  if (deuda.saldo <= 0) return { liquidada: true, pagadoMes, pendiente: 0, proxima: null, dias: null, vencida: false };
  if (!deuda.dia || !deuda.cuota) return { sinPlan: true, pagadoMes, pendiente: 0, proxima: null, dias: null, vencida: false };

  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const esteMes = vence(y, m, deuda.dia);
  let pendiente = Math.min(Math.max(0, deuda.cuota - pagadoMes), deuda.saldo);
  // Si la deuda (o su día de pago) se creó después de la fecha de este mes, empieza el mes siguiente.
  if (deuda.planDesde && inicioDia(esteMes) < inicioDia(new Date(deuda.planDesde)) && pagadoMes === 0) pendiente = 0;

  const proxima = pendiente > 0 ? esteMes : vence(y, m + 1, deuda.dia);
  const dias = diasEntre(hoy, proxima);
  return { pagadoMes, pendiente, proxima, dias, vencida: dias < 0 };
}

// Cuántos meses faltan pagando la cuota mensual con interés mensual = tasa anual / 12.
export function proyeccion(saldo, tasaAnual, cuota, hoy = new Date()) {
  if (saldo <= 0) return { meses: 0, interes: 0, fecha: hoy };
  if (!cuota || cuota <= 0) return null;
  const r = (tasaAnual || 0) / 100 / 12;
  let s = saldo, meses = 0, interes = 0;
  while (s > 0.5 && meses < 1200) {
    const i = s * r;
    if (cuota <= i) return { imposible: true };
    interes += i;
    s = s + i - cuota;
    meses++;
  }
  if (meses >= 1200) return { imposible: true };
  return { meses, interes: Math.round(interes), fecha: new Date(hoy.getFullYear(), hoy.getMonth() + meses, 1) };
}

export const parseMonto = (txt) => Number(String(txt || '').replace(/\D/g, '')) || 0;
export const parseTasa = (txt) => {
  const n = Number(String(txt || '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
