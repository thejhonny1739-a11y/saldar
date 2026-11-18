// Pruebas automáticas de la lógica de Saldar. Ejecutar con:  node --test tests
import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../js/compromisos.js';
import { entender } from '../js/asistente.js';
import { leerTexto, adivinarCategoria } from '../js/lector.js';
import { analizar } from '../js/capturas.js';
import * as V from '../js/vinculos.js';
import { migrar, estadoInicial } from '../js/store.js';

const dias = (c, y, m) => K.fechasDelMes(c, y, m).map((d) => d.getDate());
const estado = () => migrar({});

test('fechas: mensual ajusta el día 31 en meses cortos', () => {
  assert.deepEqual(dias({ inicio: '2026-01-31', frecuencia: 'mensual' }, 2026, 1), [28]);
});
test('fechas: semanal, quincenal, bimensual, anual, único y fin', () => {
  assert.deepEqual(dias({ inicio: '2026-07-03', frecuencia: 'semanal' }, 2026, 7), [7, 14, 21, 28]);
  assert.deepEqual(dias({ inicio: '2026-11-15', frecuencia: 'quincenal' }, 2026, 10), [15, 30]);
  assert.deepEqual(dias({ inicio: '2026-01-10', frecuencia: 'bimensual' }, 2026, 2), [10]);
  assert.deepEqual(dias({ inicio: '2026-01-10', frecuencia: 'bimensual' }, 2026, 3), []);
  assert.deepEqual(dias({ inicio: '2025-11-18', frecuencia: 'anual' }, 2026, 10), [18]);
  assert.deepEqual(dias({ inicio: '2026-11-20', frecuencia: 'unico' }, 2026, 11), []);
  assert.deepEqual(dias({ inicio: '2026-01-05', fin: '2026-03-10', frecuencia: 'mensual' }, 2026, 3), []);
  assert.deepEqual(dias({ inicio: '2026-11-20', frecuencia: 'semanal' }, 2026, 10), [20, 27]);
});
test('ocurrencias: estado pagado / vencido / pendiente', () => {
  const e = estado();
  e.compromisos.push({ id: '1', nombre: 'Luz', tipo: 'gasto', monto: 100, frecuencia: 'mensual', inicio: '2026-10-05', espacioId: 'personal', cumplidos: { '2026-11-05': 1 } });
  e.compromisos.push({ id: '2', nombre: 'Agua', tipo: 'gasto', monto: 50, frecuencia: 'mensual', inicio: '2026-10-10', espacioId: 'personal', cumplidos: {} });
  e.compromisos.push({ id: '3', nombre: 'Gas', tipo: 'gasto', monto: 50, frecuencia: 'mensual', inicio: '2026-10-25', espacioId: 'personal', cumplidos: {} });
  const o = K.ocurrenciasMes(e, 'personal', 2026, 10, new Date(2026, 10, 18));
  assert.deepEqual(o.map((x) => x.estado), ['pagado', 'vencido', 'pendiente']);
});

test('asistente: frases comunes', () => {
  const e = estado();
  const hoy = new Date(2026, 10, 18);
  let d = entender('Pagar la luz el 25 de cada mes por 100.000', e, hoy).datos;
  assert.deepEqual([d.nombre, d.monto, d.frecuencia, d.inicio, d.categoriaId], ['Luz', 100000, 'mensual', '2026-11-25', 'servicios']);
  d = entender('Salario quincenal 2.500.000 el 15 y 30', e, hoy).datos;
  assert.deepEqual([d.tipo, d.monto, d.frecuencia], ['ingreso', 2500000, 'quincenal']);
  d = entender('SOAT 420 mil el 12 de junio', e, hoy).datos;
  assert.deepEqual([d.monto, d.frecuencia, d.inicio], [420000, 'unico', '2027-06-12']);
  d = entender('Cobro 1,5 millones de honorarios el 5', e, hoy).datos;
  assert.equal(d.monto, 1500000);
});
test('asistente: sin monto no se puede crear', () => {
  assert.equal(entender('pagar algo', estado(), new Date(2026, 10, 18)).ok, false);
});

test('lector: monto, tarjeta y comercio de un SMS', () => {
  const r = leerTexto('Bancolombia: compra por $52.300 en EXITO CHAPINERO con tarjeta *4821 el 17/11/2026. Saldo disponible $1.200.000', {}, new Date(2026, 10, 18));
  assert.equal(r.monto, 52300);
  assert.equal(r.tarjeta, '4821');
  assert.match(r.comercio, /Exito/i);
  assert.equal(r.fecha, '2026-11-17');
  assert.equal(r.categoria, 'alimentacion');
});
test('lector: categoría por id y aprendida', () => {
  assert.equal(adivinarCategoria('Uber Trip'), 'transporte');
  assert.equal(adivinarCategoria('Tienda rara', { 'tienda rara': 'hogar' }), 'hogar');
  assert.equal(adivinarCategoria('zzz'), 'otros');
});

test('capturas: Apple Pay + SMS de la misma compra cuentan una vez; reimportar no duplica', () => {
  const e = estado();
  const archivo = '#SALDAR#ap|2026-11-17T10:32:00|52300|Exito Chapinero|Visa 4821\n#SALDAR#msg|2026-11-17T10:32:30|Compra por $52.300 en EXITO CHAPINERO tarjeta *4821';
  const r = analizar([archivo], e, new Date(2026, 10, 18));
  assert.equal(r.nuevas.length, 1);
  assert.equal(r.repetidas, 1);
  e.compras.push({ id: 'x', ...r.nuevas[0], creada: 1 });
  e.capturasVistas = r.hashes;
  assert.equal(analizar([archivo], e, new Date(2026, 10, 18)).nuevas.length, 0);
});

test('vínculos: la compra suma al saldo, se ajusta al editar y se resta al borrar', () => {
  const e = estado();
  const d = { id: 'd1', nombre: 'Visa', saldo: 1000, tarjeta: '4821', tarjetaDesde: 10, historial: [] };
  e.deudas.push(d);
  const c = { id: 'c1', monto: 100, tarjeta: '4821', fecha: '2026-11-18', comercio: 'X', creada: 20 };
  e.compras.push(c);
  assert.ok(V.aplicar(e, c));
  assert.equal(d.saldo, 1100);
  c.monto = 150; V.sincronizar(e, c);
  assert.equal(d.saldo, 1150);
  V.revertir(e, c);
  assert.equal(d.saldo, 1000);
  assert.equal(d.historial.length, 0);
});
test('vínculos: una compra anterior a la vinculación no se suma sola', () => {
  const e = estado();
  const d = { id: 'd1', nombre: 'Visa', saldo: 1000, tarjeta: '4821', tarjetaDesde: 100, historial: [] };
  e.deudas.push(d);
  const vieja = { id: 'c1', monto: 100, tarjeta: '4821', creada: 50 };
  assert.equal(V.aplicar(e, vieja), null);
  assert.equal(V.sinSumar(e, '4821').length, 0); // aún no está en e.compras
  e.compras.push(vieja);
  assert.equal(V.sinSumar(e, '4821').length, 1);
  assert.ok(V.aplicar(e, vieja, true));
  assert.equal(d.saldo, 1100);
});

test('migración: no borra datos y unifica las categorías', () => {
  const viejo = {
    deudas: [{ id: 'a', nombre: 'Visa' }],
    compras: [{ id: 'c', categoria: 'Comida', monto: 5, fecha: '2026-01-01', comercio: 'x' }, { id: 'd', categoria: 'Rara', monto: 1, fecha: '2026-01-01', comercio: 'y' }],
    aprendido: { comercios: { rappi: 'Comida' } },
    ajustes: { moneda: 'COP' }
  };
  const e = migrar(viejo);
  assert.equal(e.deudas.length, 1);
  assert.deepEqual(e.deudas[0].historial, []);
  assert.deepEqual(e.compras.map((c) => c.categoria), ['alimentacion', 'otros']);
  assert.equal(e.aprendido.comercios.rappi, 'alimentacion');
  assert.ok(e.categorias.some((k) => k.id === 'ropa'));
  assert.ok(e.espacios.length >= 1);
  // migrar dos veces da lo mismo
  assert.deepEqual(migrar(JSON.parse(JSON.stringify(e))).compras.map((c) => c.categoria), ['alimentacion', 'otros']);
});
test('estado inicial: categorías base incluyen las fijas', () => {
  const ids = estadoInicial().categorias.map((k) => k.id);
  assert.ok(ids.includes('otros') && ids.includes('otros-ing'));
});

/* ---------- Cuentas ---------- */
import * as Q from '../js/cuentas.js';

const conCuenta = (desde = '2026-11-01') => {
  const e = estado();
  const c = { id: 'k1', nombre: 'Banco', tipo: 'cuenta', saldo: 1000, desde };
  e.cuentas.push(c);
  e.ajustes.cuentaPrincipal = 'k1';
  return { e, c };
};

test('cuentas: disponible y patrimonio (CDT cuenta como patrimonio, no como disponible)', () => {
  const { e } = conCuenta();
  e.cuentas.push({ id: 'k2', nombre: 'CDT', tipo: 'cdt', saldo: 5000, desde: '2026-01-01' });
  e.deudas.push({ id: 'd', nombre: 'Visa', saldo: 800 });
  assert.equal(Q.disponible(e), 1000);
  assert.equal(Q.patrimonio(e), 1000 + 5000 - 800);
});
test('cuentas: marcar un gasto descuenta y desmarcar devuelve', () => {
  const { e, c } = conCuenta();
  const comp = { id: 'x', tipo: 'gasto', monto: 300, cumplidos: {} };
  assert.equal(Q.alternarCumplido(e, comp, '2026-11-20'), true);
  assert.equal(c.saldo, 700);
  assert.equal(Q.alternarCumplido(e, comp, '2026-11-20'), false);
  assert.equal(c.saldo, 1000);
});
test('cuentas: un ingreso recibido suma', () => {
  const { e, c } = conCuenta();
  Q.alternarCumplido(e, { id: 'x', tipo: 'ingreso', monto: 500, cumplidos: {} }, '2026-11-20');
  assert.equal(c.saldo, 1500);
});
test('cuentas: no se mueve dinero de fechas anteriores al saldo inicial ni con "No mover dinero"', () => {
  const { e, c } = conCuenta('2026-11-10');
  Q.alternarCumplido(e, { id: 'a', tipo: 'gasto', monto: 300, cumplidos: {} }, '2026-11-05');
  assert.equal(c.saldo, 1000);
  Q.alternarCumplido(e, { id: 'b', tipo: 'gasto', monto: 300, cumplidos: {}, cuentaId: '' }, '2026-11-20');
  assert.equal(c.saldo, 1000);
});
test('cuentas: se puede elegir otra cuenta distinta de la principal', () => {
  const { e, c } = conCuenta();
  const otra = { id: 'k3', nombre: 'Efectivo', tipo: 'efectivo', saldo: 200, desde: '2026-11-01' };
  e.cuentas.push(otra);
  Q.alternarCumplido(e, { id: 'x', tipo: 'gasto', monto: 50, cumplidos: {}, cuentaId: 'k3' }, '2026-11-20');
  assert.equal(otra.saldo, 150);
  assert.equal(c.saldo, 1000);
});
test('cuentas: CDT por vencer', () => {
  const e = estado();
  e.cuentas.push({ id: 'k', nombre: 'CDT', tipo: 'cdt', saldo: 1, vence: '2026-12-01' });
  assert.equal(Q.cdtPorVencer(e, 15, new Date(2026, 10, 20)).length, 1);
  assert.equal(Q.cdtPorVencer(e, 5, new Date(2026, 10, 20)).length, 0);
});
