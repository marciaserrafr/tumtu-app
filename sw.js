const CACHE_NAME = 'tumtu-shell-v25';

// Arquivos com "?v=N" têm o número subido a cada mudança de conteúdo —
// isso muda a URL inteira, então nem o cache do navegador nem caches de
// operadora/proxy no meio do caminho conseguem reaproveitar uma cópia
// antiga: pra eles, é literalmente um arquivo novo, nunca visto.
const APP_SHELL = [
  './login.html',
  './index.html',
  './cadastro.html',
  './admin.html',
  './super-admin.html',
  './carteirinha.html',
  './qr.html',
  './redefinir-senha.html',
  './ficha-perfil.js?v=5',
  './ficha-perfil.partial.html?v=3',
  './config-escola.js?v=1',
  './manifest.json',
  './styles/tokens.css?v=1',
  './styles/components.css?v=1',
  './styles/carteirinha-tumtu-novo.css?v=3',
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
