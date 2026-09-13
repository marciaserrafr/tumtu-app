if ('serviceWorker' in navigator) {
  // Sem isso, uma atualização nova instala e assume o controle em segundo
  // plano (skipWaiting + clients.claim em sw.js), mas a tela que já estava
  // aberta continua rodando o JavaScript antigo na memória — ninguém avisa
  // ela pra recarregar. Resultado: "fechar e abrir de novo" não bastava,
  // só um "apagar e salvar de nvo" (que força um registro do zero) pegava
  // a versão nova. Esse listener recarrega a página sozinha, uma vez, assim
  // que o novo service worker assume — a partir de agora, toda atualização
  // futura chega sem precisar de nenhum gesto manual (17/jul/2026, achado
  // depois da Márcia relatar que precisou apagar e recriar o ícone do app).
  let jaRecarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (jaRecarregou) return;
    jaRecarregou = true;
    // Achado real dela, 13/set/2026: esse recarregamento automático é uma
    // ação NOSSA, não da pessoa -- ela via a marca de abertura, a tela
    // "pulava", e a marca aparecia de novo antes de cair na tela de
    // verdade (ela descreveu certo: "um spinner pra entrar no login e
    // outro pra esperar a tela ser montada"). Essa chave avisa a próxima
    // carga da página (login/admin/carteirinha) pra pular a marca de
    // abertura dessa vez -- a pessoa já viu o app abrindo há um instante,
    // isso aqui é só a gente trocando de versão por baixo, invisível.
    sessionStorage.setItem('tumtu:sw-reload', '1');
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('Falha ao registrar o service worker do TumTu:', err);
    });
  });
}
