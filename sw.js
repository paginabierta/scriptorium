// Permite abrir Scriptorium sin conexión. Cambia VERSION cada vez que publiques cambios.
const VERSION = 'scriptorium-v0.1.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/drive.js', 'js/sync.js', 'js/liturgia.js', 'js/config.js',
  'vendor/editorjs.umd.js', 'vendor/header.umd.js', 'vendor/editorjs-list.umd.js',
  'vendor/checklist.umd.js', 'vendor/quote.umd.js', 'vendor/delimiter.umd.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Google (inicio de sesión y Drive) siempre va directo a internet
  if (url.hostname.endsWith('googleapis.com') && !url.hostname.startsWith('fonts')) return;
  if (url.hostname === 'accounts.google.com') return;

  // Fuentes: se guardan la primera vez que se descargan
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // Archivos de la app: primero internet (para tener lo último), si no hay, la copia guardada
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
