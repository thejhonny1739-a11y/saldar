// Service worker de Saldar: guarda la app en caché para que abra sin internet.
// Al cambiar cualquier archivo, sube el número de VERSION.
const VERSION = 'saldar-v12';
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/crypto.js',
  './js/util.js',
  './js/calculos.js',
  './js/deudas-ui.js',
  './js/calendario-ui.js',
  './js/ics.js',
  './js/lector.js',
  './js/compras-ui.js',
  './js/capturas.js',
  './js/compromisos.js',
  './js/compromisos-ui.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero: si hay internet siempre se descarga la versión más nueva.
// Sin internet (o si tarda más de 4 s) se usa la copia guardada.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const red = fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copia = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copia));
    }
    return res;
  });
  const limite = new Promise((_, no) => setTimeout(() => no(new Error('lento')), 4000));
  e.respondWith(
    Promise.race([red, limite]).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match('./index.html') || red)
    )
  );
});
