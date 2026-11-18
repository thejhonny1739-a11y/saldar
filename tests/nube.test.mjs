import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../nube/worker.js';
import { derivar, sincronizar, conectar, marcarCambio } from '../js/nube.js';
import { estadoInicial } from '../js/store.js';

// KV falso y fetch que habla con el Worker real en memoria.
function montar() {
  const kv = new Map();
  const env = { SALDAR: { get: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null), put: async (k, v) => { kv.set(k, v); } } };
  globalThis.fetch = async (url, init = {}) => worker.fetch(new Request(url, init), env);
  return kv;
}

const nuevaSesion = async (clave, url = 'https://nube.test') => {
  const k = await derivar(clave);
  const estado = estadoInicial();
  estado.ajustes.nube = { url, ...k, rev: 0, sucio: true, ultima: 0 };
  return { estado, guardado: 0 };
};

test('sube, otro dispositivo baja y los datos del servidor van cifrados', async () => {
  const kv = montar();
  const a = await nuevaSesion('una frase larga y secreta 123');
  a.estado.cuentas.push({ id: 'x', nombre: 'Bancolombia', tipo: 'cuenta', saldo: 1234567 });
  let r = await sincronizar(a, async () => { a.guardado++; });
  assert.equal(r.accion, 'subido');
  assert.equal(a.estado.ajustes.nube.rev, 1);
  assert.ok(![...kv.values()].join('').includes('Bancolombia'), 'el servidor no debe ver texto claro');

  const b = await nuevaSesion('una frase larga y secreta 123');
  b.estado.ajustes.nube.sucio = false;
  r = await sincronizar(b, async () => { b.guardado++; });
  assert.equal(r.accion, 'bajado');
  assert.equal(b.estado.cuentas[0].nombre, 'Bancolombia');
  assert.equal(b.estado.ajustes.nube.rev, 1);
  assert.ok(b.estado.ajustes.nube.llave, 'conserva su propia configuración de nube');
});

test('conflicto cuando ambos cambian; se resuelve eligiendo', async () => {
  montar();
  const a = await nuevaSesion('frase larga para el conflicto 1');
  await sincronizar(a, async () => {});
  const b = await nuevaSesion('frase larga para el conflicto 1');
  b.estado.ajustes.nube.sucio = false;
  await sincronizar(b, async () => {});
  a.estado.deudas.push({ id: 'd1', nombre: 'Moto', saldo: 5 });
  a.estado.ajustes.nube.sucio = true; marcarCambio();
  await sincronizar(a, async () => {});
  b.estado.cuentas.push({ id: 'c1', nombre: 'Efectivo', tipo: 'efectivo', saldo: 9 });
  b.estado.ajustes.nube.sucio = true; marcarCambio();
  let r = await sincronizar(b, async () => {});
  assert.equal(r.accion, 'conflicto');
  r = await sincronizar(b, async () => {}, { resolver: 'nube' });
  assert.equal(r.accion, 'bajado');
  assert.equal(b.estado.deudas[0].nombre, 'Moto');
  assert.equal(b.estado.cuentas.length, 0);
});

test('contraseña distinta no entra a datos ajenos y 409 por revisión vieja', async () => {
  montar();
  const a = await nuevaSesion('frase larga numero uno aaa');
  await sincronizar(a, async () => {});
  const k = await derivar('frase larga numero uno aaa');
  const intruso = { url: 'https://nube.test', id: k.id, token: '0'.repeat(32) };
  const r = await fetch(`${intruso.url}/b/${intruso.id}`, { headers: { 'X-Token': intruso.token } });
  assert.equal(r.status, 403);
  const w = await fetch(`${intruso.url}/b/${k.id}`, { method: 'PUT', headers: { 'X-Token': k.token }, body: JSON.stringify({ base: 0, iv: 'a', ct: 'b' }) });
  assert.equal(w.status, 409);
});

test('conectar valida la dirección y el largo de la contraseña', async () => {
  montar();
  await assert.rejects(() => conectar({}, 'http://x.com', 'una contraseña bien larga'), /https/);
  await assert.rejects(() => conectar({}, 'https://nube.test', 'corta'), /al menos/);
  const r = await conectar({}, 'https://nube.test', 'una contraseña bien larga');
  assert.equal(r.existe, false);
});
