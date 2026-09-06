const CACHE_NAME = 'tumtu-shell-v599';

// Arquivos com "?v=N" têm o número subido a cada mudança de conteúdo —
// isso muda a URL inteira, então nem o cache do navegador nem caches de
// operadora/proxy no meio do caminho conseguem reaproveitar uma cópia
// antiga: pra eles, é literalmente um arquivo novo, nunca visto.
const APP_SHELL = [
  './login',
  './index.html',
  './cadastro',
  './admin',
  './carteirinha',
  './qr',
  './presenca',
  './figurino',
  './redefinir-senha',
  './politica-privacidade',
  './ficha-perfil.js?v=66',
  './ficha-perfil.partial.html?v=34',
  './faceid.js?v=2',
  './admin-logic-1.js?v=2',
  './admin-logic-2.js?v=1',
  './config-escola.js?v=4',
  './config-suporte.js?v=1',
  './manifest.json',
  './styles/tokens.css?v=4',
  './styles/components.css?v=29',
  './styles/carteirinha-tumtu-novo.css?v=36',
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

  // Abrir uma TELA (navigate: login/admin/carteirinha/etc) busca a rede
  // PRIMEIRO agora (06/set/2026) -- achado real dela: uma correção
  // publicada podia demorar aberturas inteiras pra aparecer no aparelho
  // (mesmo excluindo e reinstalando o app -- isso não limpa esse cache),
  // porque a versão salva sempre respondia antes da rede. Só cai pro que
  // está salvo se a rede falhar de verdade (sem conexão) -- mantém a
  // correção antiga de 15/jul/2026 (não ficar tela preta esperando uma
  // conexão "fria" reconectar) só para esse caso real de falha.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() =>
        caches.open(CACHE_NAME).then((cache) =>
          cache.match(request).then((cached) => cached || caches.match('./login'))
        )
      )
    );
    return;
  }

  // Arquivos secundários (estilo, script, imagem) continuam com
  // stale-while-revalidate: responde na hora com o que já está em cache
  // (rápido, funciona offline), busca uma versão fresca em segundo plano
  // pra próxima visita. Staleness aqui importa menos -- os arquivos que
  // realmente mudam de conteúdo usam "?v=N" na URL (vira outro arquivo,
  // nunca fica preso em cache antigo).
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
