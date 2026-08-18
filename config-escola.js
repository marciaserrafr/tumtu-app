/**
 * Configuração da escola — preenchida pelo Super Admin.
 * Todos os campos vazios = tema genérico TumTu (placeholders).
 * Quando configurada, sobrescreve textos e cores em todas as telas.
 */
const configEscola = {
  nomeEscola:       "",   // ex: "G.R.E.S. Imperatriz Leopoldinense"
  nomeBateria:      "",   // ex: "Swing da Leopoldina"
  logoEscola:       null, // URL da imagem da logo; null = espaço reservado vazio
  instagramBateria: "",   // ex: "@swingdaleopoldina"
  corDestaque:      null, // null = usa dourado padrão do TumTu (#D4AF37)
  corPrimaria:      null, // null = usa escuro padrão do TumTu (#12101a)
  mestreDeBateria:  "",   // ex: "Mestre Augusto"
  temporadaAtual:   "",   // ex: "Carnaval 2027"

  // Tema do painel de gestão (admin.html) -- opcional, ligado por escola no
  // Super Admin (escolas.tema_personalizado_ativo). Ver aplicarConfigEscola()
  // em admin.html. Nunca usado em super-admin.html (visão não presa a uma
  // escola só). logoEscola (acima) é reaproveitado pra esse mesmo fim.
  temaPersonalizadoAtivo: false,
  corPrimariaEscola: null,
  coresEscola:       [], // [primária, secundária, terciária, quaternária], só as cadastradas -- usado por escolherCorBordaLogo() pra escolher a cor do anel da logo
};
