// Service worker de Stats Volley : l'app fonctionne sans réseau après la première ouverture.
// À chaque mise à jour de l'app, changer V (ex. '1.1.1'), ainsi que APP_VERSION (js/interface.js) et les ?v= de index.html.
// Le test tests/version.test.js vérifie que les trois concordent.
const V = '1.0.0';
const VERSION = 'sv-' + V;
const FONTS = 'sv-fonts';
// Styles et scripts portent ?v= : une page neuve ne peut pas se retrouver avec les scripts de la version précédente.
const CORE = [
  './',
  './index.html',
  './styles.css?v=' + V,
  './js/moteur.js?v=' + V,
  './js/stats.js?v=' + V,
  './js/interface.js?v=' + V,
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' : on met en cache la version du serveur, pas une copie périmée du cache HTTP du navigateur.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Polices Google : servies depuis le cache, mises à jour en arrière-plan quand le réseau est là.
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Page : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Le reste : cache d'abord.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return r;
    }))
  );
});
