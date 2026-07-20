const CACHE_NAME = 'tumtu-shell-v67';

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
  './politica-privacidade.html',
  './ficha-perfil.js?v=9',
  './ficha-perfil.partial.html?v=9',
  './config-escola.js?v=1',
  './config-suporte.js?v=1',
  './manifest.json',
  './styles/tokens.css?v=4',
  './styles/components.css?v=7',
  './styles/carteirinha-tumtu-novo.css?v=18',
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

  // Stale-while-revalidate pra tudo, inclusive abrir uma tela (navigate).
  // Responde na hora com o que já está em cache (rápido, funciona offline,
  // não depende da rede responder pra desenhar a tela), e busca uma versão
  // fresca em segundo plano pra próxima visita.
  //
  // Antes, abrir uma tela esperava a rede responder ANTES de mostrar
  // qualquer coisa (só caía pro cache se a rede falhasse de vez, tipo
  // offline). Com conexão "fria" (celular parado um tempo, sem uso — não é
  // bem offline, só lento pra reconectar), essa espera virava uma tela
  // preta bem longa antes de aparecer qualquer coisa — reportado pela
  // Márcia em 15/jul/2026 ("se eu ficar 10 minutos sem usar, o preto
  // demorado aparece; se eu abrir de novo na hora, aparece rápido").
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchAtualizado = fetch(request).then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached || (request.mode === 'navigate' ? caches.match('./login.html') : undefined));
        return cached || fetchAtualizado;
      })
    )
  );
});
