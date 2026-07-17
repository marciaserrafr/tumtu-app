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
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('Falha ao registrar o service worker do TumTu:', err);
    });
  });
}
