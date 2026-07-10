const CACHE_NAME = 'tumtu-shell-v8';

const APP_SHELL = [
  './login.html',
  './index.html',
  './admin.html',
  './super-admin.html',
  './carteirinha.html',
  './qr.html',
  './redefinir-senha.html',
  './ficha-perfil.js',
  './ficha-perfil.partial.html',
  './config-escola.js',
  './manifest.json',
  './styles/tokens.css',
  './styles/components.css',
  './carteirinha-tumtu.css',
  './carteirinha-swing.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // nunca cachear Supabase/CDNs

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match('./login.html')))
    );
    return;
  }

  // Stale-while-revalidate: responde na hora com o que já está em cache
  // (rápido, funciona offline), mas busca uma versão fresca em segundo
  // plano e atualiza o cache pra próxima visita — evita ficar preso numa
  // versão antiga de CSS/JS por muito tempo depois de um deploy.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchAtualizado = fetch(request).then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchAtualizado;
      })
    )
  );
});
