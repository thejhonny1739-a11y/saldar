// Saldar Nube: Cloudflare Worker que guarda UN bloque cifrado por usuario. No puede leer tus datos.
// Se crea un "Worker" en Cloudflare, se pega este archivo y se enlaza un KV con el nombre SALDAR.
// Identidad: la app deriva de tu contraseña larga un `id` y un `token` (nadie puede adivinarlos).
// El Worker solo guarda el hash del token. Si el token no coincide, rechaza.

const MAX_BYTES = 3 * 1024 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Token'
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function sha256(texto) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/b\/([0-9a-f]{32})$/);
    if (url.pathname === '/' || url.pathname === '/ping') return json({ ok: true, servicio: 'saldar-nube' });
    if (!m) return json({ error: 'No encontrado' }, 404);
    const id = m[1];
    const token = req.headers.get('X-Token') || '';
    if (!/^[0-9a-f]{32}$/.test(token)) return json({ error: 'Token inválido' }, 401);
    const th = await sha256(token);
    const actual = await env.SALDAR.get(id, 'json');

    if (req.method === 'GET') {
      if (!actual) return json({ error: 'No hay datos' }, 404);
      if (actual.th !== th) return json({ error: 'Token incorrecto' }, 403);
      return json({ rev: actual.rev, ts: actual.ts, iv: actual.iv, ct: actual.ct });
    }

    if (req.method === 'PUT') {
      const texto = await req.text();
      if (texto.length > MAX_BYTES) return json({ error: 'Demasiado grande' }, 413);
      let b;
      try { b = JSON.parse(texto); } catch { return json({ error: 'JSON inválido' }, 400); }
      if (typeof b.iv !== 'string' || typeof b.ct !== 'string' || !Number.isInteger(b.base)) return json({ error: 'Datos incompletos' }, 400);
      if (actual && actual.th !== th) return json({ error: 'Token incorrecto' }, 403);
      const revActual = actual ? actual.rev : 0;
      if (b.base !== revActual) return json({ error: 'Conflicto', rev: revActual }, 409);
      const nuevo = { th, rev: revActual + 1, ts: Date.now(), iv: b.iv, ct: b.ct };
      await env.SALDAR.put(id, JSON.stringify(nuevo));
      return json({ rev: nuevo.rev, ts: nuevo.ts });
    }
    return json({ error: 'Método no permitido' }, 405);
  }
};
