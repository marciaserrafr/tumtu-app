const CACHE_NAME = 'tumtu-shell-v715';

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
  './checkin',
  './presenca',
  './figurino',
  './redefinir-senha',
  './politica-privacidade',
  './ficha-perfil.js?v=78',
  './ficha-perfil.partial.html?v=35',
  './faceid.js?v=2',
  './admin-logic-1.js?v=70',
  './admin-logic-2.js?v=12',
  './config-escola.js?v=4',
  './config-suporte.js?v=1',
  './manifest.json',
  './styles/tokens.css?v=5',
  './styles/components.css?v=34',
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

  // Abrir uma TELA (navigate: login/admin/carteirinha/etc) volta a usar
  // stale-while-revalidate (13/set/2026) -- mesmo padrão dos arquivos
  // secundários logo abaixo, e o mesmo que qualquer app de verdade já usa
  // (banco, WhatsApp, Instagram: abrem na hora com o que já está salvo,
  // só o CONTEÚDO de dentro busca a rede). Responde na hora com a cópia
  // salva quando existe (nunca mais refém da internet da pessoa naquele
  // instante) e atualiza o cache por trás, sem bloquear nada, pra próxima
  // abertura já vir com a versão nova.
  //
  // Achado real (06/set/2026) que tinha motivado trocar isso pra
  // network-first antes: uma correção publicada demorava aberturas
  // inteiras pra aparecer no aparelho, mesmo desinstalando e reinstalando
  // o app. A causa provável daquilo é diferente do que essa troca aqui
  // mexe -- CACHE_NAME (linha 1) já controla QUANDO existe uma versão
  // nova pra baixar (sobe a cada mudança de conteúdo), e install/activate
  // acima (skipWaiting + clients.claim) já fazem essa versão nova assumir
  // rápido assim que é detectada. O que muda aqui é só: DENTRO da mesma
  // versão já instalada, abrir uma tela não fica mais esperando a rede
  // responder toda vez -- só busca fresco por trás. Testar com cuidado
  // (publicar uma mudança pequena, abrir e fechar o app umas 2x) antes de
  // dar como resolvido -- ver project_lentidao_abrir_app_sw_network_first
  // na memória de longo prazo.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchAtualizado = fetch(request).then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached || caches.match('./login'));
          return cached || fetchAtualizado;
        })
      )
    );
    return;
  }

  // Arquivos secundários (estilo, script, imagem) -- mesmo padrão
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
