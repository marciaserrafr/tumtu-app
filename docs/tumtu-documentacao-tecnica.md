# TumTu — Documentação Técnica
## Referência de arquitetura, banco de dados e segurança

> Documento vivo. Complementa `tumtu-visao-geral.md` (visão de produto/negócio) e `tumtu-mvp.md` (escopo funcional) — este aqui é o "como funciona por dentro". Atualizar sempre que a arquitetura mudar.
> Última atualização: 18/ago/2026 (seção 40) — **⚠️ ver seção 22 antes de confiar na seção 2**: o modelo de dados descrito na seção 2 (tabela única `ritmistas`) foi substituído em 12-13/jul/2026 por duas tabelas (`pessoas` + `vinculos`). A seção 2 foi mantida como está por descrever a tabela antiga, que ainda existe no banco como rede de segurança (será apagada só depois de testes finais) — mas o código de produção já usa o modelo novo, documentado na seção 22.

---

## 1. Stack e infraestrutura

- **Frontend:** HTML + CSS + JavaScript puro, sem framework, sem bundler. Cada tela é um arquivo `.html` autocontido.
- **Backend:** Supabase (Postgres + Auth + Edge Functions), sem servidor próprio.
- **Hospedagem/deploy:** GitHub → Vercel, deploy automático a cada `git push` na branch `main`.
- **Fonte:** Plus Jakarta Sans (Google Fonts).
- **Bibliotecas de terceiros via CDN:** `@supabase/supabase-js@2` (cliente oficial do Supabase). `bcryptjs` foi usado entre 03/jul e 05/jul/2026 e foi removido — não existe mais no código.

**Projeto Supabase:** URL `https://pkvzsgrkylrkyzligeim.supabase.co`, project ref `pkvzsgrkylrkyzligeim`.

**Pasta local do projeto:** `C:\Users\Márcia Serra\Projetos\Tumtu` (movida de dentro do OneDrive em 09/jul/2026 — a pasta antiga não existe mais). Estrutura, desde essa mudança: os arquivos de código (`.html`/`.css`/`.js`) continuam soltos na raiz; documentação `.md` mora em `docs/`; a planilha de dados fake em `dados/`; e uma pasta `imagens/` (fotos de referência de outras carteirinhas, logos antigos) fica **fora do controle de versão** (listada no `.gitignore`, junto com o `.zip` do handoff de design) por não ser código do app.

---

## 2. Modelo de dados

### Tabela `ritmistas`
Guarda **todos os perfis** (Ritmista, Mestre, Diretor, Super Admin), diferenciados pela coluna `perfil`. Não existe UUID nas chaves — `id` é `bigint` autoincremento.

Colunas principais:
- **Identidade/autenticação:** `id`, `auth_user_id` (uuid, liga com `auth.users.id` do Supabase Auth), `senha` (obsoleta, sempre `null` — ver seção 3).
- **Dados pessoais:** `nome`, `apelido`, `cpf`, `nascimento`, `celular`, `email`, `nacionalidade`, `estrangeiro`, `tipo_documento`, `numero_documento` (documento alternativo quando não há CPF).
- **Perfil/acesso:** `perfil` (`ritmista` | `mestre` | `diretor` | `super_admin`), `nivel_acesso` (hoje só `"total"`, campo separado de `cargo` pensando em perfis granulares futuros), `status` (`pendente` | `aprovado` | `rejeitado` | `suspenso` | `desligado` | `inativo`), `motivo_status`, `aprovado_por` (id de quem aprovou), `consentimento_confirmado` (boolean — ver seção 6), `cadastro_completo`.
- **Bateria:** `bateria_id` (liga com `baterias.id`).
- **Endereço:** `endereco`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `pais`.
- **Medidas:** `tamanho_camisa`, `tamanho_fantasia`, `tamanho_calca`, `tamanho_sapato`.
- **Emergência/saúde:** `emergencia_nome`, `emergencia_parentesco`, `emergencia_celular`, `tipo_sanguineo`, `declaracao_responsavel` (boolean, para menores de idade).
- **Outros:** `instrumento`, `membro_desde` (só o ano), `motivo_instrumento`, `foto_url`, `created_at`.

**Idade/menor de idade não é uma coluna** — é sempre calculada em JS a partir de `nascimento` (função `calcularIdade()` em `admin.html`).

**Achado não corrigido:** não existe constraint de CPF único — duas pessoas podem ter o mesmo CPF cadastrado. Baixa prioridade.

### Tabela `escolas`
`id`, `nome`, `sigla`, `logo_url`, `cor_primaria`, `cor_destaque`, `temporada_atual`, `ativa`, `motivo_inativacao`.

### Tabela `baterias`
`id`, `nome`, `escola_id` (liga com `escolas.id`), `logo_url`, `instagram`, `mestre_de_bateria` (texto livre — **obsoleto para exibição na carteirinha desde 05/jul/2026**, ver seção 10; coluna mantida no schema, mas não é mais lida por `carteirinha.html`), `ativa`.

### Tabela `convites`
**Não existe mais** — foi dropada em 05/jul/2026. Fazia parte do modelo antigo de "convite por token de uso único", abandonado em 03/jul/2026 em favor do link fixo por bateria+cargo.

### Views públicas (sem RLS, leitura liberada para `anon`)
- **`ritmistas_emergencia`**: `id, nome, tipo_sanguineo, emergencia_nome, emergencia_parentesco, emergencia_celular` — usada por `qr.html` (QR code escaneado por qualquer pessoa, sem login, em caso de emergência).
- **`baterias_publicas`**: `id, nome, ativa` — usada por `index.html` para validar o parâmetro `?bateria=` de um link de cadastro **antes** da pessoa se autenticar, sem expor `mestre_de_bateria`, `instagram` etc. a quem só está se cadastrando.
- **`mestres_publicos`** (criada 05/jul/2026): `id, bateria_id, nome` — só admins com `perfil = 'mestre' AND status = 'aprovado'`. Usada por `carteirinha.html` para mostrar o(s) Mestre(s) de verdade da bateria do ritmista (ver seção 10), sem expor CPF/celular/e-mail desses Admins a quem só está vendo a própria carteirinha.

Essas views existem justamente para não precisar dar acesso público à tabela inteira — elas usam as permissões de quem as criou (não do usuário que consulta), então funcionam mesmo com RLS ligado nas tabelas de origem.

---

## 3. Autenticação (Supabase Auth)

**Migrado em 05/jul/2026.** Antes disso, o login comparava CPF/e-mail + senha manualmente contra a tabela `ritmistas` (com hash bcrypt desde 03/jul). Hoje:

- Toda conta tem um registro real em `auth.users`, ligado via `ritmistas.auth_user_id`.
- **Cadastro** (`index.html`, modos público e link fixo): chama `supabase.auth.signUp({ email, password })`. Como o Supabase Auth exige e-mail, e o cadastro do TumTu agora sempre exige e-mail (ver seção 5), não há necessidade de e-mail sintético para essas duas modalidades.
- **Cadastro manual** (Super Admin ou Mestre/Diretor cadastrando por outra pessoa): a criação da conta de autenticação acontece dentro da Edge Function `admin-create-user` (ver seção 4), porque criar uma conta **em nome de outra pessoa** exige privilégio de administrador (`service_role`), que nunca deve ficar exposto no navegador.
- **Login** (`login.html`): se o identificador digitado não tem `@`, é tratado como CPF e traduzido para o e-mail correspondente via a função SQL `resolve_login_email(identificador)` (ver seção 5), chamada via RPC. Depois disso, sempre `supabase.auth.signInWithPassword({ email, password })`.
- **Logout:** todas as telas (`admin.html`, `super-admin.html`, `carteirinha.html`) chamam `supabase.auth.signOut()` além de limpar o `localStorage` — antes só limpavam o `localStorage`, deixando a sessão do Supabase válida por trás (achado e corrigido em 05/jul/2026).
- **Confirmação de e-mail:** desligada nas configurações do Supabase (Authentication → Sign In/Providers → "Confirm email"), porque a validação de identidade do TumTu é a aprovação por Mestre/Diretor/Super Admin, não confirmação de e-mail — e muita gente se cadastra com e-mail que talvez não confira com frequência.
- **`ritmistas.senha`:** coluna antiga, tornada opcional (`nullable`) e não é mais lida nem escrita por lugar nenhum do código. Mantida só para não quebrar o schema de quem eventualmente consultar dados históricos.

### Contas de teste (fake, 05/jul/2026)
Senha padrão de todas as 25 contas fake (Admins + Ritmistas): `Teste123`. Conta da Márcia (Super Admin): `tutti2027`.

---

## 4. Edge Function: `admin-create-user`

Única Edge Function do projeto até agora. Roda no ambiente do Supabase (Deno), usa a `service_role key` (nunca exposta ao navegador — vem de uma variável de ambiente interna do Supabase).

**Chamada por:** `index.html`, no modo `?modo=manual` (Super Admin cadastrando qualquer cargo, ou Mestre/Diretor cadastrando um Ritmista da própria bateria).

**O que faz, em ordem:**
1. Identifica quem está chamando através do token de sessão enviado no cabeçalho `Authorization`.
2. Busca o perfil de quem está chamando na tabela `ritmistas` (usando `service_role`, que ignora RLS) para saber `perfil`, `bateria_id` e `status`.
3. Confere se quem chamou está com `status = 'aprovado'`.
4. **Autoriza ou rejeita** com base na regra de negócio: Super Admin pode cadastrar qualquer cargo em qualquer bateria; Mestre/Diretor só pode cadastrar `ritmista` da própria bateria. Essa checagem acontece **no servidor**, não só na tela — testado explicitamente com uma tentativa de burlar a tela chamando a função direto, e foi bloqueado (403).
5. **Confere o consentimento** (`dados.consentimento_confirmado === true`) — rejeita com 400 se não vier marcado. Ver seção 6.
6. Cria a conta em `auth.users` via `admin.auth.admin.createUser({ email, password, email_confirm: true })`.
7. Insere a linha em `ritmistas` já com `status = 'aprovado'`, `aprovado_por` = quem cadastrou, `auth_user_id` preenchido.
8. Se a inserção falhar depois de já ter criado a conta de auth, desfaz a conta de auth criada (evita conta "fantasma" sem perfil correspondente).

---

## 5. Regras de cadastro e login

| | CPF | E-mail |
|---|---|---|
| **Cadastro** (`index.html`) | Obrigatório, exceto se marcar "Não tenho CPF" (aí exige tipo+número de documento no lugar) | **Sempre obrigatório**, mesmo sem CPF |
| **Login** (`login.html`) | Um dos dois, à escolha da pessoa | Um dos dois, à escolha da pessoa |

Essa distinção foi confirmada explicitamente com a Márcia em 05/jul/2026 — a regra flexível de "CPF ou e-mail" vale só para login, nunca para cadastro. (Havia uma inconsistência visual antiga, com asteriscos de "obrigatório" que não refletiam a regra real — corrigida na mesma sessão.)

Instrumentos válidos hoje (8, atualizado em 03-05/jul/2026 para bater com os dados fake de teste): Agogô, Caixa, Chocalho, Cuíca, Reco-reco, Repique, Surdo (genérico, sem 1ª/2ª/3ª), Tamborim.

**Bug corrigido em 06/jul/2026:** a máscara de CPF do campo "CPF ou e-mail" (`mascaraIdentificador()`) apagava qualquer letra digitada antes do "@" — ela só percebia que era um e-mail depois do "@" já estar digitado, então o começo de um e-mail (ex: `joao`) era removido letra por letra achando que era CPF. Login por e-mail via digitação direta estava, na prática, impossível (só funcionava colando o e-mail pronto). Corrigido trocando a checagem `v.includes('@')` por `/[a-zA-Z@]/.test(v)` — agora qualquer letra (não só o "@") já faz a máscara dar um passo pro lado.

---

## 6. LGPD — confirmação de consentimento no cadastro manual

Decisão de 05/jul/2026, depois de uma discussão sobre o risco de o Super Admin (ou Mestre/Diretor) cadastrar alguém manualmente sem essa pessoa ter digitado nada.

**O que existe:** todo cadastro no modo manual exige marcar um checkbox — *"Confirmo que a pessoa cadastrada está ciente deste cadastro e autorizou seus dados serem inseridos no Tutti"* — antes de enviar. Validado nos dois lados:
- **Front-end** (`index.html`): bloqueia o envio e mostra erro se não estiver marcado.
- **Backend** (Edge Function `admin-create-user`): rejeita com 400 se `consentimento_confirmado !== true` — funciona mesmo que alguém tente burlar a tela.

Campo `ritmistas.consentimento_confirmado` (boolean, default `false`) só fica `true` em cadastro manual. Autocadastro (a própria pessoa preenchendo, público ou via link) não passa por essa tela — o consentimento ali é implícito, a própria pessoa digitou os dados dela.

**Isto é uma mitigação proporcional ao estágio atual do projeto, não uma validação jurídica.** Ver seção Jurídico/LGPD em `tumtu-visao-geral.md` para o raciocínio completo e o gatilho definido para revisitar com advogado.

---

## 7. RLS (Row Level Security)

Ligado em `ritmistas`, `escolas` e `baterias` em 05/jul/2026. Antes disso, a chave pública (`anon key`) usada pelo app tinha acesso irrestrito de leitura/escrita a todas as tabelas — qualquer pessoa que abrisse o código-fonte do site (público, como todo front-end) conseguiria ler ou alterar qualquer registro diretamente pela API do Supabase, sem precisar logar. As regras de "quem pode ver/editar o quê" existiam só no front-end.

### Funções auxiliares (todas `SECURITY DEFINER`, para evitar recursão de política dentro da própria tabela `ritmistas`)
Lêem `auth.uid()` (o usuário autenticado da requisição atual) e retornam dados do seu próprio perfil:
- `is_super_admin()` — true se o perfil do usuário logado é `super_admin`.
- `meu_id()`, `meu_perfil()`, `meu_status()`, `meu_bateria_id()` — dados do próprio perfil.
- `resolve_login_email(identificador)` — dado um CPF ou e-mail, devolve o e-mail correspondente (usada só no login, antes de autenticar — chamável por `anon`).

### Políticas por tabela

**`ritmistas`:**
| Ação | Quem pode |
|---|---|
| Ver/editar o próprio perfil | **Todo mundo, inclusive Ritmista** (`auth_user_id = auth.uid()`). **Revertido em 06/jul/2026:** em 05/jul a policy `proprio_perfil_update` excluía `perfil = 'ritmista'` ("Ritmista não edita nada"); a Márcia mudou de ideia — Ritmista agora edita alguns dados próprios (foto, apelido, celular, endereço, emergência) direto pela carteirinha, sem precisar pedir pro Diretor/Mestre. **Quais colunas** cada perfil pode alterar de si mesmo é decidido por uma trigger, não pela policy — ver adiante nesta seção |
| Ver/editar qualquer linha | Super Admin |
| Ver ritmistas/admins da própria bateria | Mestre ou Diretor aprovado, só onde `bateria_id` bate com o dele |
| Editar campos específicos (Instrumento + Medidas) de um Ritmista da própria bateria | Mestre ou Diretor aprovado (`admin_update_ritmistas_propria_bateria` continua existindo; a trigger é quem agora restringe a colunas específicas) |
| Editar dados de um Diretor/Mestre que não seja ele mesmo | **Ninguém.** **Revertido em 06/jul/2026:** a policy `mestre_update_diretor_propria_bateria` (Mestre editando qualquer dado de um Diretor) foi **derrubada** — Mestre continua podendo aprovar/rejeitar/desligar um Diretor (isso é mudança de `status`, ação separada), mas não edita mais os dados cadastrais dele. Cada Diretor/Mestre edita só a própria ficha |
| Criar cadastro (INSERT) | Só a própria pessoa recém-autenticada (`auth_user_id = auth.uid()`) — cobre autocadastro público/link fixo. Cadastro manual passa pela Edge Function, que usa `service_role` e ignora RLS |
| Apagar (DELETE) | Ninguém, exceto acesso administrativo direto ao banco (não existe essa ação no app) |

**Restrição por coluna (trigger `BEFORE UPDATE`):** RLS não distingue coluna por coluna dentro de uma policy — só decide se a linha inteira pode ou não ser alterada. Como a regra de "quais campos" varia por combinação (quem está editando × é autoedição ou não), isso é resolvido por uma trigger `aplicar_matriz_edicao_ritmistas()` que reverte pro valor antigo (`old.coluna`) qualquer coluna fora da lista permitida para aquele caso, antes de gravar. Ver seção 11 para a matriz completa.

**✅ Executado e validado em 06/jul/2026.** Testado com tentativas reais de bypass via API direta (sem passar pela tela), com contas fake reais: autoedição bloqueando campo travado enquanto salva campo liberado (Mestre e Ritmista); Diretor/Mestre editando Ritmista de outra pessoa, mesmo padrão; Mestre tentando editar qualquer dado de uma Diretora — bloqueado por completo pela RLS (0 linhas afetadas, a trigger nem chega a rodar). Todos os 4 cenários se comportaram exatamente como a matriz da seção 11 define.

**`escolas` e `baterias`:** só Super Admin lê/escreve. Exceção: qualquer Mestre/Diretor aprovado pode **ver** (não editar) a própria bateria.

**Visitante anônimo (`anon`, sem login):** não enxerga nada nas 3 tabelas diretamente — só as duas views públicas da seção 2.

---

## 8. Fluxos principais (resumo)

**Cadastro público/link fixo:** `index.html?bateria=<id>[&cargo=mestre|diretor]` → valida a bateria via `baterias_publicas` → preenche formulário → `signUp()` → grava perfil com `status='pendente'` (exceto Ritmista sempre pendente; Mestre/Diretor também nascem pendentes) → aguarda aprovação.

**Cadastro manual:** Super Admin ("Cadastrar Usuário") ou Mestre/Diretor ("+ Cadastrar Ritmista") preenche em nome da pessoa → marca consentimento → Edge Function cria conta + perfil já `status='aprovado'`.

**Aprovação:** Super Admin aprova/rejeita qualquer Mestre ou Diretor. Mestre aprova/rejeita Diretor da própria bateria. Qualquer Admin aprovado aprova/rejeita Ritmista da própria bateria.

**Login:** CPF ou e-mail + senha → Supabase Auth → busca o perfil correspondente → bloqueia se `status` for `pendente` ou `rejeitado` (mensagem própria para cada caso) → redireciona por `perfil` (`super-admin.html` / `admin.html` / `carteirinha.html`).

---

## 9. Débitos técnicos e pendências conhecidas

- **✅ RESOLVIDO (15/jul/2026, commit `40a14ac`): não era possível mudar cor da escola nem colocar logo pela interface.** Causa raiz confirmada: o formulário de escola em `super-admin.html` só tinha campo pra 1 cor (`cor_primaria`) e um "Cor Destaque", mas a carteirinha lê 4 (`escolas.cor_primaria/secundaria/terciaria/quaternaria`, colunas que já existiam no banco) — faltavam 3 campos na tela. E "URL do Logo" era só um campo de texto exigindo link já hospedado, sem upload de arquivo. Corrigido: os 3 campos de cor que faltavam foram adicionados (nos dois formulários — Nova Escola e Editar Escola), e o logo virou upload de verdade (mesmo padrão já usado pra foto do ritmista em `ficha-perfil.js` — lê o arquivo, converte pra base64 no navegador, salva direto na coluna, sem precisar de storage externo). Testado de ponta a ponta com Playwright: upload + 4 cores salvos no super-admin, depois confirmados aparecendo certinho na carteirinha de um ritmista real daquela escola. **Descoberta lateral:** "Cor Destaque" (`escolas.cor_destaque`) era um campo órfão — existia no formulário e salvava no banco, mas nada na carteirinha lia esse valor de volta (provável sobra de uma versão anterior ao redesign de N cores, 14/jul/2026). Removido do formulário a pedido da Márcia, para não confundir com o sistema de 4 cores real.
- **🔴 URGENTE (pedido da Márcia em 14/jul/2026): configuração de medidas (tamanho de camisa/fantasia/calça/sapato), com a mesma lógica dos instrumentos.** Hoje as 4 medidas (`tamanho_camisa`, `tamanho_fantasia`, `tamanho_calca`, `tamanho_sapato`) são campo livre/fixo no cadastro, sem nomenclatura configurável por escola (retoma uma pendência antiga: "sistema de nomenclatura de tamanho de roupa por escola, XXG vs XGG", que tinha sido adiada a pedido dela). Ela pediu explicitamente pra espelhar o modelo que já existe pros instrumentos (`instrumento_categorias` + `instrumento_nomenclaturas` + `bateria_instrumentos`, seção 22 do MVP/técnica): biblioteca mestre controlada pelo Super Admin, cada bateria ativa/escolhe as opções que valem pra ela. Nada desenhado nem implementado ainda — só registrado.

- **Reset de senha pelo Super Admin removido em 05/jul/2026** (a tela de Acessos tinha um campo "Nova senha (opcional)" sem função real depois da migração para Supabase Auth) e **não foi reconstruído** — decisão explícita da Márcia em 06/jul/2026 de não devolver ao Super Admin a capacidade de ver/definir a senha de outra pessoa. Resolvido de outra forma: ver seção 15 ("Esqueci minha senha" nativo do Supabase Auth, sem nenhum admin no meio).
- **Excluir usuário (LGPD):** ainda não existe nenhuma forma de apagar um cadastro, nem o Super Admin. Discutido em 06/jul/2026 e adiado de propósito — será construído só quando a primeira solicitação real de exclusão acontecer (Super Admin apenas, para pedidos sérios de exclusão de dados, não uma ação de rotina).
- **CPF não é único** na tabela `ritmistas` — sem constraint, baixa prioridade.
- **Aba "Bateria" do Super Admin tem um campo confuso** (reportado pela Márcia em 16/jul/2026): o campo "Mestre de Bateria" ali é texto livre antigo (`baterias.mestre_de_bateria`, já documentado como obsoleto na seção 10), desconectado do sistema real de vínculos — só mostra 1 nome, nunca foi feito pra ter mais de um. O lugar de verdade é a aba "Acessos" (vínculos reais de mestre/diretor). Ela pediu pra ajustar "daqui a pouco" — decidir com ela se tira o campo antigo da tela, vira somente-leitura, ou outra solução, antes de mexer.
- **Domínio `tumtu.com.br` já está no ar** (DNS + certificado SSL configurados em 12/jul/2026) — esta linha ficou desatualizada por um tempo depois de já resolvida; corrigida em 16/jul/2026 pra não contradizer a seção "Estado atual" do `CLAUDE.md`.
- **"Leaked Password Protection"** do Supabase Auth está desligada (checagem de senha vazada contra HaveIBeenPwned). **Descoberto em 09/jul/2026: só existe no plano Pro do Supabase (pago), não aparece no plano Free.** Rebaixado para o final da lista de propósito — a Márcia avalia que o projeto não deve precisar disso tão cedo e não quer gastar no Supabase agora; revisitar só se/quando houver receita real.
- **✅ Botões da carteirinha — parte do ritmista RESOLVIDA e publicada (16/jul/2026, ver seção 25).** Fluxo desenhado em 14/jul, construído em 16/jul: "Salvar (em breve)"/"Compartilhar" removidos, "Meu Perfil" saiu do topo e foi pro rodapé do cartão, "Trocar de Bateria" funcionando de ponta a ponta (reaproveita sessão, sem pedir senha de novo). **Ainda não construído, de propósito — decisão explícita da Márcia em 16/jul ("o piloto é o piloto"):** a parte do Admin (cair direto em `admin.html` pós-piloto, botão "Ver minha carteirinha", ajuste do "Ver carteirinha ↗" da aba Diretoria). Fica pra quando o piloto estiver redondo — não é esquecimento, é sequência combinada com ela.
  - **🆕 Visual "quem está assistindo?" da Netflix pra tela de escolher bateria** continua só como referência guardada, não implementado — hoje `login.html` mostra lista simples de botões de texto, funcional mas sem esse tratamento visual. Ela reforçou essa referência de novo em 16/jul (print da tela de perfis do Netflix), mesma ideia de 14/jul.
- **🚧 Redesenho visual de `login.html`, `cadastro.html`, "Meu Perfil" e tela de carregando — descoberta feita em 16/jul/2026, desenho ainda não começado.** Ver seção 26 pro registro completo da entrevista de UX (referências, paleta, decisões de campo de formulário). Resumo: tirar o padrão "modal/dialog" (`.auth-container`, caixa branca flutuando em fundo escuro) das 4 telas, virar tela cheia de verdade no estilo Spotify/Netflix/Disney+ (referências dela). Admin/Super Admin ficam pra uma fase futura, a pedido dela — não expandir escopo sem ela pedir de novo. Carteirinha em si **continua** parecendo cartão, isso não muda.

---

## 10. Carteirinha — Mestre(s) de Bateria dinâmico

Implementado em 05/jul/2026. Antes disso, `carteirinha.html` **não buscava nada do Supabase** para o campo "Mestre de Bateria" — usava só a string fixa `configEscola.mestreDeBateria` (`config-escola.js`), digitada manualmente e igual para o site inteiro, mesmo já existindo suporte a múltiplas escolas/baterias em outras partes do sistema.

**Como funciona agora:**
- `carteirinha.html` já buscava a própria linha do ritmista no Supabase (para nome, foto, CPF etc.) — essa busca já trazia `bateria_id`, mas ele era ignorado. Agora, depois de renderizar a carteirinha, uma nova função `renderMestres(bateriaId)` busca na view `mestres_publicos` (seção 2) todos os Mestres aprovados daquela bateria.
- **Mostra todos os Mestres aprovados, não só um** — se a bateria tiver 2 ou mais, os nomes aparecem empilhados e o rótulo muda para "Mestres de Bateria" (plural). Se não houver nenhum Mestre aprovado ainda, o bloco continua escondido (mesmo comportamento de antes, quando o campo estava vazio).
- `baterias.mestre_de_bateria` (texto livre) fica **obsoleto para esse fim** — não foi apagado do banco, só parou de ser lido nesse fluxo. Mesma coisa para `configEscola.mestreDeBateria` em `config-escola.js`.
- Testado em 05/jul/2026 com dados reais: bateria com 1 Mestre aprovado mostra o nome corretamente; bateria sem nenhum Mestre aprovado mantém o bloco escondido.

---

## 11. Matriz de edição de dados por perfil (motor único `ficha-perfil.js`)

**Substituída em 06/jul/2026.** A hierarquia da versão anterior (Mestre podia editar dados de um Diretor; Ritmista não editava nada, nem a si mesmo) foi revista pela Márcia depois de mapear caso a caso quem edita o quê. Duas mudanças de regra, ambas propositais:
- **Ritmista agora edita alguns dados próprios** direto pela carteirinha (não precisa mais pedir pro Diretor/Mestre pra corrigir celular ou trocar foto).
- **Mestre não edita mais dados de um Diretor** — só aprova/rejeita/desliga (ação de status, não de dado). Cada Diretor/Mestre edita só a própria ficha.

### Tabela A — cada perfil editando a própria ficha ("Meu Perfil")

| Campo | Ritmista | Diretor | Mestre | Super Admin |
|---|---|---|---|---|
| Foto, apelido, celular, endereço (todos os campos), contato de emergência (todos) | ✅ | ✅ | ✅ | ✅ |
| Medidas (camisa/fantasia/calça/sapato) | 🔒 | ✅ | ✅ | ✅ |
| Nome, nacionalidade, CPF/documento, nascimento, e-mail, membro desde, tipo sanguíneo | 🔒 | 🔒 | 🔒 | ✅ |
| Instrumento | não se aplica (só existe pra Ritmista, que não edita) | — | — | — |

### Tabela B — Diretor/Mestre/Super Admin editando a ficha de um Ritmista

| Campo | Diretor/Mestre | Super Admin |
|---|---|---|
| Instrumento, Medidas (todos) | ✅ | ✅ |
| Todo o resto (foto, dados pessoais, endereço, saúde, emergência) | 🔒 | ✅ |

Diretor/Mestre editando um **Diretor/Mestre que não seja ele mesmo**: nenhum campo — o botão "Editar" nem aparece.

### Arquitetura: motor único, uma matriz, três telas

Antes de 06/jul/2026 existiam **dois mecanismos separados e quase idênticos**: a ficha de `admin.html` (Admin editando Ritmista/Diretor) e o "Meu Perfil" (copiado e colado entre `admin.html` e `super-admin.html`, cada cópia com suas próprias funções `mpPreviewFoto`/`salvarMeuPerfil`). Como a regra de "quais campos ficam abertos" é sempre a mesma função de (quem edita, é autoedição ou não, de quem é a ficha), os dois mecanismos foram unificados num motor único, evitando manter a mesma matriz escrita em mais de um lugar (risco real — as duas cópias já quase haviam divergido antes dessa unificação):

- **`ficha-perfil.js`**: `fpCamposEditaveis(atorPerfil, autoedicao, alvoPerfil)` é a **única** função que decide campos editáveis, implementando as Tabelas A e B acima. `fpMontar(containerEl)` injeta o HTML compartilhado; `fpIniciar(alvo, meuPerfil, meuId, opcoes)` preenche os dados e calcula o que fica editável; `fpAtivarEdicao`/`fpCancelarEdicao`/`fpSalvar` cuidam da edição; `fpAlterarSenha` é a troca de senha (seção 15).
- **`ficha-perfil.partial.html`**: HTML único com todos os campos possíveis — o motor decide campo a campo (e seção a seção, ex: "Instrumento" só aparece se o alvo for Ritmista) o que mostrar como texto ou como campo editável.
- **Usado em:** `admin.html` (aba "Meu Perfil" + ficha de Ritmista na aba "Ritmistas" + ficha de Mestre/Diretor na aba "Diretoria"), `super-admin.html` (aba "Meu Perfil"), `carteirinha.html` (ícone de perfil no card — ver seção 16).
- **Cuidado de implementação:** como mais de um container pode ter a partial injetada ao mesmo tempo na mesma página (ex: `admin.html` tem três — Meu Perfil, ficha de Ritmista, ficha de Admin — todos com os mesmos `id`s internos), toda busca de elemento dentro do motor é escopada ao container que acabou de ser montado (`fpEl(id)` em vez de `document.getElementById(id)` puro), senão `getElementById` pega o primeiro elemento com aquele `id` no documento, que pode ser de outro container. Bug real, encontrado e corrigido durante o teste desta unificação.

O botão "Editar" só aparece quando a matriz permite (`fp-btn-editar`) — isso é só cosmético, a segurança real é a RLS + trigger da seção 7 (SQL ainda pendente de execução em 06/jul/2026).

---

## 12. "Meu Perfil" do Super Admin

Implementado em 05/jul/2026 (com HTML/funções copiadas de `admin.html`), **migrado para o motor único em 06/jul/2026** (seção 11) — hoje `super-admin.html` só tem `<div id="fp-container-meuperfil"></div>` e uma função `iniciarMeuPerfilAba()` de poucas linhas que chama `fpMontar`+`fpIniciar`, sem nenhuma cópia de HTML ou função de salvar própria.

**Onde mora:** aba principal "Meu Perfil" em `super-admin.html`, ao lado de "Dashboard" e "Escolas" — não como sub-aba de uma escola, já que o Super Admin não pertence a nenhuma bateria específica.

Continua existindo o aviso "não se aplica" em `admin.html` quando o Super Admin acessa via "Acessar como Admin" (`?superadmin=true`) — nesse caso o container do motor único fica escondido e o aviso aparece no lugar, porque ali é a visão de outra pessoa, não a própria.

---

## 13. PWA (Progressive Web App)

Implementado em 05/jul/2026. Deixa o TumTu instalável direto do navegador (ícone na tela do celular, abertura em tela cheia), sem loja e sem custo.

**Arquivos novos:**
- `manifest.json` — nome, ícones, cor de tema (`#12101a`) e `start_url` apontando para `login.html` (entrada comum a todos os perfis).
- `sw.js` — service worker. Faz cache do "app shell" na instalação (telas HTML, CSS, `config-escola.js`, o motor único `ficha-perfil.js`/`ficha-perfil.partial.html` e os ícones), para o app abrir mesmo sem internet. Chamadas para o Supabase (ou qualquer origem externa) **nunca são cacheadas** — passam direto pra rede, sempre com dado atual. Em navegação (troca de tela), tenta a rede primeiro e só cai no cache se estiver offline.
- `pwa-register.js` — registra o service worker; incluído (`<script defer>`) nas 6 páginas.
- `icons/` — `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (ícone com margem de segurança para Android), `apple-touch-icon.png` (iOS) e `favicon-32.png`. Inicialmente um placeholder gerado por script (texto "TumTu" completo); **substituídos pela arte final em 05/jul/2026** (ver seção 14) — monograma "T" dourado com risco terracota, mesmos nomes de arquivo e tamanhos.

**Cada uma das 6 páginas** (`login.html`, `index.html`, `admin.html`, `super-admin.html`, `carteirinha.html`, `qr.html`) ganhou no `<head>`: link para o manifest, `theme-color`, ícones (`favicon` e `apple-touch-icon`), meta tags de iOS (`apple-mobile-web-app-*`) e a inclusão do `pwa-register.js`.

**Testado (05/jul/2026):** manifest carrega e valida, service worker registra e ativa, os 14 arquivos do app shell ficam em cache, e nenhum ícone retorna erro.

**⚠️ Importante para toda mudança futura em arquivo do app shell (qualquer `.html`, `.css` ou `.js` listado em `APP_SHELL` dentro de `sw.js`):** o service worker serve esses arquivos **do cache**, não da rede, para quem já visitou o site antes. Se um arquivo mudar (ex: `admin.html`, `components.css`) e o `CACHE_NAME` em `sw.js` não for atualizado (ex: `tumtu-shell-v2` → `v3`), quem já tinha aberto o site continua vendo a versão antiga até limpar o cache manualmente. **Toda vez que alterar um arquivo do app shell, subir a versão do `CACHE_NAME`.** Isso já causou confusão numa sessão de teste em 05/jul/2026 (CSS novo não aparecia até subir a versão e limpar o cache do navegador).

---

## 14. Rename da marca no código (Tutti → TumTu)

Implementado em 05/jul/2026. Antes disso, o rename só existia na documentação (`.md`) — o código (`.html`/`.css`/`.js`) ainda mostrava "Tutti"/"TuTTi" em toda tela. Levantamento prévio (agente de exploração) encontrou 15 ocorrências em código, nenhuma delas em lógica condicional de JS — só texto visível, atributo `data-tema` e um nome de arquivo, então o risco técnico era baixo.

**O que mudou:**
- **Logotipo único e reutilizável:** antes cada tela escrevia o logo na mão, de formas ligeiramente diferentes. Criada a classe `.marca-tumtu` (com `.mt-t` para os T's dourados e `.mt-m` para o risco terracota sob o "m") em `styles/components.css`, usada em todas as 6 telas + no CSS arquivado do tema Swing. Isso também exigiu remover uma regra CSS antiga (`.header-marca span { color: #D4AF37 }`) que, sem a remoção, teria pintado a palavra inteira de dourado em vez de só os T's.
- **`data-tema="tutti"` → `data-tema="tumtu"`** em `index.html`, `login.html`, `admin.html`, `super-admin.html`, `carteirinha.html`, e no seletor CSS correspondente.
- **Arquivo renomeado:** `carteirinha-tutti.css` → `carteirinha-tumtu.css` (e as 2 referências que apontavam pra ele: `carteirinha.html` e a lista `APP_SHELL` do `sw.js`).
- **Textos simples:** títulos de página, texto do checkbox de consentimento (fecha uma pendência que já estava registrada aqui), fallback de nome da bateria na carteirinha, título de compartilhamento, comentários em `admin.html` e `config-escola.js`.
- **`carteirinha-swing.css`** (tema da Swing da Leopoldina — hoje arquivado, nenhuma tela carrega esse arquivo) também foi atualizado por consistência, incluindo o exemplo de HTML dentro do comentário no fim do arquivo.

**⚠️ Como o `sw.js` mudou (nome de arquivo na lista `APP_SHELL`), o `CACHE_NAME` subiu de novo:** `tumtu-shell-v2` → `v3` (mesma regra da seção 13).

**Testado (05/jul/2026):** as 6 telas conferidas visualmente (logo com T's dourados e risco terracota renderizando certo), sem erro 404 nem de console, tema da carteirinha aplicando as cores certas com o novo valor de `data-tema`, cache do service worker migrando pra v3 com o nome de arquivo novo, e uma busca final confirmando que não sobrou nenhuma menção a "tutti" em código.

### Handoff de design (mesmo dia, mais tarde) — alinhamento e ícones finais

A Márcia trouxe um handoff formal de um Design Assistant do Claude (`design_handoff_tumtu_rebrand`, entregue como `.zip` dentro da própria pasta do projeto), com auditoria independente da marca. Achados relevantes:

- A auditoria confirmou a mesma decisão de logo já usada acima (opção **"1a — Wordmark clássico"**: T's dourados na 1ª/4ª letra, risco terracota só sob o "m") — nenhuma mudança de conceito, só de nomenclatura de classe CSS.
- **Nomenclatura de classe alinhada ao handoff:** `.marca-tumtu`/`.mt-t`/`.mt-m` (nomes que eu tinha inventado) viraram `.tt-logo`/`.tt-t`/`.tt-m` (nomes do handoff), com a técnica do risco trocada de `::after` posicionado para `border-bottom` direto no `.tt-m` — mais simples, mesmo resultado visual.
- **Gap real encontrado pelo handoff que minha varredura anterior não pegou:** `qr.html` tinha um logo (`<div class="marca">Tu<span>TT</span>i</div>`) que minha busca por texto "tutti" não reconheceu, porque as tags HTML quebram a palavra no meio (`Tu` + `TT` + `i`, nunca a string contígua "tutti"). Corrigido: `qr.html` ganhou `styles/tokens.css` e `styles/components.css` no `<head>` (não tinha nenhum dos dois) e o mesmo tratamento `.tt-logo`.
- **Ícones finais do PWA:** o handoff descartou a ideia de um símbolo de "dois surdos" (círculos) por não comunicar bem sozinho, e entregou um monograma — só o "T" dourado com o risco terracota, fundo `#12101a` — como arte final para `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` e `favicon-32.png`. Substituíram os placeholders (mesmos nomes de arquivo, `manifest.json` não precisou mudar).

**⚠️ `CACHE_NAME` subiu de novo:** `tumtu-shell-v3` → `v4` — o conteúdo dos ícones mudou mesmo mantendo os mesmos nomes de arquivo, e o service worker cacheia por nome, não por conteúdo.

**Fora deste rename:** domínio `tumtu.com.br` ainda não conectado na Vercel, e os nomes dos arquivos de documentação `.md` continuam com "tutti".

---

## 15. "Esqueci minha senha" e troca de senha logado

Implementado em 06/jul/2026, usando só recursos nativos do Supabase Auth (sem Edge Function nova) — fecha o débito técnico da seção 9 sobre reset de senha, sem devolver ao Super Admin a capacidade de ver/definir a senha de outra pessoa (decisão explícita da Márcia: "muito ruim... meio sem ética").

**Esqueci minha senha (usuário deslogado), em `login.html`:** link "Esqueci minha senha" abre um segundo formulário na mesma página (`#containerRecuperacao`, alternado com `mostrarRecuperacao()`) pedindo CPF ou e-mail — reaproveita a RPC `resolve_login_email` já existente pra traduzir CPF em e-mail. Chama `sb.auth.resetPasswordForEmail(email, { redirectTo: origin + '/redefinir-senha.html' })`. **A mensagem de sucesso é sempre a mesma**, exista ou não o cadastro, pra não revelar quais CPFs/e-mails estão na base.

**`redefinir-senha.html`** (novo): página que o link do e-mail abre. Escuta o evento `PASSWORD_RECOVERY` do Supabase Auth, pede só a nova senha + confirmação (sem pedir a senha antiga — decisão da Márcia, "mais simples possível", a própria sessão de recuperação criada pelo Supabase já prova a identidade), chama `sb.auth.updateUser({ password })`, desloga e redireciona pro login.

**Trocar senha estando logado:** mesma chamada (`sb.auth.updateUser({ password })`), sem pedir senha atual, mas dentro do motor único (`ficha-perfil.js`) — seção "Alterar senha" (`fp-secao-senha`) na própria ficha, visível só quando é autoedição (`fpEstado.autoedicao`), com botão próprio (`fpAlterarSenha()`) separado do botão "Salvar" dos dados de cadastro. Presente automaticamente em `admin.html`, `super-admin.html` e `carteirinha.html`, por ser parte do motor compartilhado.

**Passo manual concluído em 06/jul/2026:** URL de produção (`https://ritmistas-app.vercel.app/redefinir-senha.html`) adicionada em Supabase → Authentication → URL Configuration, tanto em "Site URL" quanto em "Redirect URLs" (esse último também já com a entrada pra `tumtu.com.br`, pronta pra quando o domínio conectar). **Fluxo testado de ponta a ponta em produção com e-mail real** — pedir recuperação, receber e-mail, abrir o link, trocar a senha, logar com a senha nova: tudo validado.

**Achado no teste:** a conta de Super Admin (`admin@tutti.internal`) tinha um e-mail placeholder que não existia de verdade, então nunca receberia e-mail de recuperação. Corrigido direto em `auth.users` via SQL Editor do Supabase (`update auth.users set email = '...' where email = 'admin@tutti.internal';`) — mudar o e-mail pela tela "Meu Perfil" **não** teria resolvido, porque aquele campo grava só na tabela `ritmistas`, não no `auth.users` que o Supabase usa de fato pra autenticação/e-mails. Vale checar se as contas fake de teste (`@teste.tutti`) têm o mesmo problema, caso alguém precise testar recuperação de senha com elas.

**Confirmado por teste real (não documentado, mas relevante saber):** o link de recuperação é de uso único — expira ao ser aberto pela primeira vez, mesmo que a pessoa não chegue a trocar a senha, e também expira por tempo (padrão do Supabase, configurável). Clicar duas vezes no mesmo link do e-mail cai na tela de erro "o link pode ter expirado" já na segunda tentativa.

**UI — 09/jul/2026:** o botão de mostrar/esconder senha (ícone de olho) trocou de emoji (👁, inconsistente entre sistemas operacionais) para um SVG de linha simples, com estado "riscado" quando a senha está visível — em `login.html` e, pela primeira vez, também nos dois campos de `redefinir-senha.html` (antes não tinha esse botão lá).

---

## 16. Tela do Ritmista — acesso ao próprio perfil pela carteirinha

Implementado em 06/jul/2026. Antes, o Ritmista não tinha nenhuma tela além da carteirinha — não conseguia corrigir o próprio celular, trocar a foto ou ver o próprio cadastro sem pedir pro Diretor/Mestre.

**Decisão de UX (Opção B, aprovada pela Márcia depois de comparar 2 mockups):** a carteirinha continua sendo a primeira e principal tela do Ritmista — não vira uma tela "atrás" de um perfil. Em vez disso, um pequeno ícone de perfil aparece no canto do próprio card (`#btnAbrirPerfil`, ao lado do badge "Ativo"), que abre os dados de cadastro **por cima**, num modal.

**Em `carteirinha.html`:** o ícone só aparece no "modo normal" (pessoa logada vendo a própria carteirinha, via `localStorage`) — fica escondido no "modo admin" (`carteirinha.html?id=`, usado pelo botão "Ver carteirinha ↗" de `admin.html`/`super-admin.html`, onde quem está olhando não é necessariamente o dono da carteirinha). Clique abre `#modalPerfilOverlay` (usa as classes `.ficha-modal-*` de `styles/components.css`) com `fpMontar`+`fpIniciar` do motor único (seção 11), mostrando pro Ritmista exatamente os campos da Tabela A que ele pode ver/editar.

**Sincronização com o card da carteirinha:** como apelido e foto aparecem na frente do cartão, o callback `aoSalvar` do motor único atualiza esses dois elementos diretamente após salvar — **sem** chamar `renderCarteirinha()` de novo inteira, porque isso re-executaria a geração do QR code (biblioteca `qrcodejs`) uma segunda vez em cima da primeira.

---

## 17. Exportação de ritmistas para Excel

Implementado em 10/jul/2026, em `admin.html` (aba Ritmistas) — funciona tanto para Mestre/Diretor quanto para Super Admin, já que este último usa a mesma tela via "Acessar como Admin" (sem duplicação em `super-admin.html`).

**Como funciona:** botão "Exportar Excel" abre um modal com checkbox de cada campo (`Dados pessoais`, `Contato de emergência`, `Endereço`, `Medidas`) — sem atalhos/presets prontos, decisão explícita da Márcia de deixar a seleção sempre manual. A exportação usa `listaFiltradaAtual` (populada dentro de `aplicarFiltros()`), então **respeita os filtros já aplicados na tela** (status, instrumento, busca) — não existe filtro separado dentro do modal de exportação.

**Geração do `.xlsx`:** biblioteca SheetJS (`xlsx.full.min.js`, via CDN oficial `cdn.sheetjs.com`), carregada sob demanda só quando o botão é clicado pela primeira vez (`carregarSheetJS()`) — não entra no carregamento inicial da página, pra não pesar o app no celular à toa. Arquivo gerado inteiramente no navegador, sem servidor.

**Fora de escopo por decisão explícita (fase 2 do projeto):** marcar dentro do sistema quem já recebeu a camisa/fantasia encomendada (ideia da Márcia, adiada de propósito — hoje existe só um placeholder "Em breve: controle de entrega de camisas" na Visão Geral).

Como a mudança altera `admin.html` (arquivo do app shell do PWA), o `CACHE_NAME` do `sw.js` subiu de `v5` para `v6` (mesma regra da seção 13).

---

## 18. Domínio próprio `tumtu.com.br` (em andamento — iniciado 10/jul/2026)

**Repositório GitHub renomeado** de `ritmistas-app` para `tumtu-app` (`marciaserrafr/tumtu-app`) em 09/jul/2026, via GitHub CLI (`gh`). O nome do **projeto na Vercel continua `ritmistas-app`** — renomear lá mudaria a URL padrão (`ritmistas-app.vercel.app`) e quebraria o link de recuperação de senha já cadastrado no Supabase Auth; decisão de 09/jul/2026 foi não renomear o projeto Vercel, já que o domínio próprio resolve o problema do link feio sem precisar disso.

**Ferramentas instaladas na máquina da Márcia:** GitHub CLI (`gh`, autenticado) e Vercel CLI (`vercel`, autenticado, pasta do projeto linkada ao projeto `ritmistas-app` do time `marcia-ritmistas` — gera um `.env.local` com token OIDC, ignorado pelo Git via `.gitignore`). Preferir usar essas CLIs em vez de pedir pra Márcia navegar em painéis desconhecidos, quando a tarefa permitir.

**Domínio comprado no Registro.br.** Passos já feitos via `vercel domains add tumtu.com.br` / `vercel domains add www.tumtu.com.br` (ambos anexados ao projeto `ritmistas-app`). Registro DNS necessário (via `vercel domains inspect`): `A tumtu.com.br 76.76.21.21` e `A www.tumtu.com.br 76.76.21.21` — **ou**, alternativa mais simples de manter a longo prazo (recomendada por já facilitar a futura configuração de e-mail no domínio), trocar os servidores DNS do domínio inteiro para `ns1.vercel-dns.com` / `ns2.vercel-dns.com`.

**Achado no Registro.br:** o menu "Configurar endereçamento" (modo simples) é um serviço de **redirecionamento** (exige uma URL já existente, não aceita IP puro) — não serve pra isso. O caminho certo é "Configurar endereçamento" → **Modo Avançado** (ou "Alterar servidores DNS" diretamente). Ativar o Modo Avançado impõe uma **janela de transição de ~2h** no Registro.br antes de liberar a troca de servidores DNS externos — normal, não é erro.

**Status ao pausar esta sessão:** domínio adicionado nos dois lados (Vercel sabe do domínio, projeto sabe do domínio), mas o DNS do lado do Registro.br ainda não aponta pra Vercel — `vercel domains inspect tumtu.com.br` continua reportando "not configured properly" até isso ser concluído. Retomar depois da janela de transição do Registro.br.

---

## 19. Auditoria de UX das 7 telas + correções (10/jul/2026)

**Origem:** a Márcia pediu uma análise completa de UX (hierarquia, espaçamento, botões, estados de erro/vazio, fluxos, acessibilidade) das 7 telas, com foco no público-alvo (Mestres/Diretores/Ritmistas de bateria de samba, majoritariamente mobile, nem todos tecnicamente experientes). Análise apresentada antes de qualquer execução, num artefato separado (não versionado no repo), com achados classificados por severidade (0 críticos, 3 importantes, 5 médios, 3 cosméticos). Depois de aprovada, todos os itens foram implementados de uma vez.

### O que mudou

**Cadastro (`index.html`) virou formulário de 5 etapas** — Dados Pessoais, Endereço, Medidas e Saúde, Contato de Emergência, Acesso — com barra de progresso ("Passo X de 5"), navegação Voltar/Continuar e validação escopada por etapa (`validarCamposEtapa()`), mantendo `validarCampos()` original como checagem final antes do envio. Dados preenchidos persistem ao voltar uma etapa. A área de foto (antes fixa acima do formulário inteiro, repetindo em toda etapa) passou a fazer parte só da Etapa 1. Decisão explícita da Márcia: **sem atalhos/presets** — cada etapa mostra só os campos dela, sem pular nada.

**Estado de carregamento** no login e na recuperação de senha (`login.html`) — botão desabilita e mostra "Entrando..."/"Enviando..." enquanto aguarda o Supabase, mesmo padrão que o cadastro já tinha.

**Diálogos nativos do navegador substituídos por UI própria:** `super-admin.html` ganhou um modal (`modal-motivo-overlay`) pro motivo de desativação de escola, no lugar do `prompt()`; `carteirinha.html` ganhou um toast próprio (`mostrarToast()`) pros erros do modo admin e pro aviso de compartilhamento indisponível, no lugar de `alert()`; o botão "Salvar" (função de salvar imagem, nunca implementada) virou `disabled` com texto "Salvar (em breve)" em vez de abrir um alerta.

**Ícone de mostrar/ocultar senha:** `index.html` ainda usava o emoji 👁 (o resto do site já tinha trocado pra SVG em 09/jul/2026) — unificado. Área de toque do ícone aumentada nas 3 telas de senha (login, cadastro, redefinir-senha) via padding, sem mudar o tamanho visual.

**Acessibilidade:** abas principais e sub-abas de `super-admin.html` eram `<div onclick>` (não focáveis por teclado, diferente de `admin.html`, que já usava `<button>`) — convertidas pra `<button>` de verdade, mesmo visual.

**Contraste:** `--cor-texto-muted` escurecido de `#8b88a0` para `#706c87` em `tokens.css` — melhora leitura de textos secundários em todo o produto de uma vez.

**Estado vazio unificado:** `admin.html` usava só texto plano (`.vazio`) pra "nenhum resultado"; passou a usar o mesmo padrão ícone+texto (`.estado-vazio`) que `super-admin.html` já tinha.

**Cores de erro/sucesso/aviso consolidadas:** novos tokens `--cor-erro`, `--cor-erro-fundo`, `--cor-sucesso`, `--cor-sucesso-fundo`, `--cor-aviso`, `--cor-aviso-fundo` em `tokens.css` (existiam 3 tons de vermelho e 2 de verde diferentes espalhados pelo código). `components.css` ganhou uma classe `.mensagem`/`.auth-container`/`.auth-form-group` compartilhada, reaproveitada por `login.html`, `index.html` e `redefinir-senha.html`, eliminando CSS quase-idêntico duplicado em cada uma (essas telas tinham cada uma sua própria cópia de `.container`, `.mensagem`, `input`, `label`).

**Página 404** (`404.html`, novo arquivo) com a identidade visual do TumTu, link de volta pro login — Vercel serve automaticamente pra sites estáticos sem configuração extra.

### Bugs reais encontrados ao vivo durante a revisão (fora da auditoria original, reportados pela Márcia com print de tela)

- **Logo sobrepondo o badge do header** (`admin.html`, `super-admin.html`): o traço terracota embaixo do "m" da logo (`.tt-logo .tt-m`, `border-bottom` + `padding-bottom`) quase encostava no texto do badge abaixo (`.header-badge`, que tinha só 1-2px de `margin-top`). Corrigido subindo pra 7px.
- **Campo de data de nascimento estourando a coluna no celular** (`index.html`): `<input type="date">` dentro de um grid de 2 colunas (`.form-row`) ultrapassava a largura da coluna em navegador mobile, por causa da largura mínima intrínseca do seletor nativo de data combinada com o comportamento padrão de grid items (`min-width: auto`). Corrigido com `min-width: 0` em `.auth-form-group` (`components.css`) — afeta todos os grids de formulário do site, não só esse campo.
- **Checkbox do modal de Exportar Excel esticado para ~288px de largura** (`admin.html`): a regra genérica `.modal select, .modal textarea, .modal input { width: 100% }` (pensada pra campos de texto de outros modais do arquivo) também capturava o checkbox por ele estar dentro de `.modal`. Corrigido com `.modal input.export-campo-check { width: auto }`, mais específico.
- **"Pulo" de layout ao trocar de aba** (relatado como incômodo recorrente): alternar entre uma aba com barra de rolagem (ex: Ritmistas, lista longa) e uma sem (ex: Vagas) fazia o conteúdo inteiro deslocar horizontalmente, porque o navegador recupera o espaço da barra quando ela some. Corrigido globalmente com `scrollbar-gutter: stable` no `html` (`tokens.css`) — reserva sempre esse espaço, tenha ou não rolagem.
- **Falta de fluidez ao navegar entre páginas** (reclamação repetida da Márcia): como o TumTu é várias páginas `.html` separadas (não um app de tela única), cada navegação recarrega a página inteira, com corte seco. Resolvido com `@view-transition { navigation: auto; }` em `tokens.css` — CSS puro, sem JavaScript, dá um efeito de esmaecer suave entre páginas do mesmo site. Funciona em Chrome 126+ e Safari 18.2+ (cobre a maioria dos celulares do público-alvo); em navegadores sem suporte, a navegação simplesmente continua normal, sem erro nem downgrade visual perceptível.

### Testes realizados

Sessão testada com Playwright (`playwright-core` + Chrome instalado localmente, sem baixar navegador extra) contra um servidor estático local, login real com conta fake (`cadu.ferreira@teste.tutti`): fluxo completo das 5 etapas do cadastro (bloqueio de avanço com campo vazio, dados preservados ao voltar, chegada na etapa final), modal de exportar Excel em viewport mobile (390px), captura de tela de login/recuperação/redefinir-senha/404 pra checagem visual, e confirmação de que a navegação continua funcionando com `@view-transition` ativo. `CACHE_NAME` do `sw.js` subiu de `v6` para `v7` por alterar múltiplos arquivos do app shell.

### Bug adicional encontrado num segundo round de teste ao vivo

Depois do deploy, a Márcia testou de verdade e reportou mais um: trocar de aba principal (`admin.html`) ou selecionar/voltar de uma escola (`super-admin.html`) não resetava a posição de rolagem — se a pessoa estivesse rolada pra baixo numa lista longa, o conteúdo novo aparecia num ponto arbitrário da tela, dando outro tipo de "pulo" (diferente do da seção anterior, que era sobre a barra de rolagem em si). Corrigido com `window.scrollTo(0, 0)` no início de `trocarAba` (`admin.html`) e de `trocarAbaPrincipal`, `selecionarEscola`, `voltarParaEscolas`, `abrirNovaEscola` (`super-admin.html`).

---

## 20. Incidente de cache pós-deploy e cache-busting por versão (10/jul/2026)

Depois do deploy da auditoria de UX (seção 19), a Márcia via as telas sem estilo nenhum (sem cartão branco, sem cor) — mesmo comportamento relatado em dois dispositivos diferentes (computador e iPhone), mesmo depois de limpar dados do navegador em ambos. Investigação em camadas, cada uma descartada com evidência real (não suposição):

1. Hipótese inicial: Service Worker do PWA servindo `components.css` antigo (de antes das classes `auth-container`/`auth-form-group` existirem) — **descartada**: confirmado com Playwright direto na URL de produção que o CSS publicado estava correto.
2. Limpar dados do navegador (cookies + cache, período "todo o tempo") — não resolveu.
3. Aba anônima — **funcionou** (evidência de que era algo específico do perfil/navegador dela, não do site).
4. Outro navegador (mesmo computador) — também errado (descartou "só um navegador específico").
5. iPhone (um favorito do Safari salvo na tela, não um app "instalado" de verdade) — também errado, mesmo depois de limpar dados de site do Safari (Ajustes → Safari → Avançado → Dados de Sites).
6. **Teste decisivo:** iPhone com Wi-Fi desligado (só dados móveis) → mostrou uma versão **ainda mais antiga** (o cadastro de página única, de antes da auditoria de UX) — prova de que era **cache numa camada de rede** (provavelmente da operadora/provedor, uma camada que nem o navegador dela nem o código do TumTu alcançam).

**Correções aplicadas, em ordem de força:**
- `sw.js`: estratégia de cache trocada de "serve só do cache" para **stale-while-revalidate** — responde do cache na hora (rápido, funciona offline) mas já busca uma versão fresca em segundo plano pra próxima visita. Ajuda com cache de navegador/Service Worker, mas **não** resolve cache de rede.
- **A correção que resolveu de verdade:** todos os arquivos CSS/JS compartilhados (`styles/tokens.css`, `styles/components.css`, `carteirinha-tumtu.css`, `ficha-perfil.js`, `ficha-perfil.partial.html`, `config-escola.js`) passaram a ser referenciados com `?v=1` em toda tag `<link>`/`<script>` e no `fetch()` dentro de `ficha-perfil.js`. Isso muda a URL inteira a cada versão — nenhuma camada de cache no caminho (navegador, PWA, proxy de operadora) consegue reaproveitar uma cópia antiga, porque pra ela é literalmente um arquivo nunca visto antes. **Regra permanente:** toda vez que um desses arquivos mudar, subir o número em TODO lugar que o referencia (busca por `?v=N` no projeto) — documentado em `CLAUDE.md`.

**Decisão de produto sobre como avisar o usuário:** cheguei a propor uma faixa "Nova versão disponível — Atualizar" (com botão) como camada extra de segurança. A Márcia rejeitou explicitamente: quer solução **automática e invisível**, sem exigir nenhuma ação da pessoa usando o app. A combinação stale-while-revalidate + versionamento por URL já entrega isso sem UI nenhuma, então nada foi adicionado além do que está documentado acima.

`CACHE_NAME` subiu de `v7` para `v9` ao longo desse incidente (v8 na troca pra stale-while-revalidate, v9 ao atualizar a lista `APP_SHELL` pros nomes com `?v=1`).

---

## 21. Histórico de decisões de arquitetura (linha do tempo resumida)

- **02/jul/2026** — decisão de separar `cargo` de `nivel_acesso`; decisão de usar hash de senha (bcrypt) em vez de texto plano.
- **03/jul/2026** — abandona modelo de "convite por token de uso único", adota link fixo permanente por bateria+cargo. Implementa Fases 1-5 do prompt de cadastro (schema, links fixos, aprovação, cadastro manual, hash bcrypt). Reset completo do banco a pedido da Márcia (produção passa a rodar só com dado fake, populado a partir de `tumtu-dados-fake-reset.xlsx`).
- **05/jul/2026** — sessão de migração para autenticação real do Supabase + RLS (7 fases, plano em `C:\Users\Márcia Serra\.claude\plans\replicated-stirring-rossum.md`): coluna `auth_user_id`, funções auxiliares, views públicas, cadastro/login/logout migrados para Supabase Auth, Edge Function `admin-create-user`, RLS ligado com políticas por perfil/bateria, remoção do bcrypt. Além disso: correção da regra de CPF+e-mail no cadastro, confirmação de consentimento no cadastro manual (LGPD), correção do bug de isolamento entre baterias no painel do Admin (achado ao popular dados fake de 2 escolas), implementação do PWA (manifest, service worker, ícones — seção 13), view `mestres_publicos` pra carteirinha mostrar Mestre(s) reais (seção 10), hierarquia de edição por perfil (versão original da seção 11), "Meu Perfil" do Super Admin (seção 12), e — mais adiante no mesmo dia — o rename de marca de fato no código (seção 14).
- **06/jul/2026** — sessão de "esqueci minha senha" + unificação do motor de edição de perfil (plano em `C:\Users\Márcia Serra\.claude\plans\validated-orbiting-thompson.md`): "Esqueci minha senha" e troca de senha logado via Supabase Auth nativo, testado de ponta a ponta em produção com e-mail real (seção 15); revisão completa da matriz de edição com a Márcia — Ritmista passa a editar alguns dados próprios, Mestre deixa de editar dados de Diretor (seção 11, substitui a versão de 05/jul); motor único `ficha-perfil.js`/`ficha-perfil.partial.html` compartilhado por `admin.html`, `super-admin.html` e `carteirinha.html`, eliminando duas cópias quase-divergentes do "Meu Perfil"; ícone de perfil na carteirinha do Ritmista (seção 16); SQL da trigger de restrição por coluna escrito, revisado e **executado com sucesso**, validado com tentativas reais de bypass (seção 7); bug corrigido na máscara do campo de login que impedia digitar e-mail letra por letra (seção 5); decisão explícita de adiar "excluir usuário" (LGPD) até a primeira solicitação real (seção 9).
- **09/jul/2026** — Márcia moveu a pasta do projeto de dentro do OneDrive para `C:\Users\Márcia Serra\Projetos\Tumtu`, reorganizando documentação (`docs/`), dados fake (`dados/`) e material de referência visual (`imagens/`, fora do controle de versão) — nada foi perdido, o `sw.js` (que tinha ficado pra trás na mudança) foi restaurado do histórico do Git (seção 1). Ícone de mostrar/esconder senha trocado de emoji para SVG, e adicionado também em `redefinir-senha.html` (seção 15). Mais tarde no mesmo dia: criado `CLAUDE.md` na raiz do projeto (regras fixas de comportamento/produto lidas automaticamente pelo Claude Code); `docs/README.md` removido por estar desatualizado; repositório GitHub renomeado de `ritmistas-app` para `tumtu-app`, com correção de um token de acesso que estava exposto em texto puro na configuração local do Git (GitHub CLI instalado e configurado como método de autenticação); todos os arquivos de documentação e a planilha de dados fake renomeados de `tutti-*` para `tumtu-*`, fechando a última pendência do rename de marca no código.
- **10/jul/2026** — exportação de ritmistas para Excel implementada e testada de ponta a ponta em `admin.html` (seção 17), com seleção manual de campos (sem atalhos prontos) e respeitando os filtros já aplicados na tela. Conexão do domínio `tumtu.com.br` iniciada (seção 18, GitHub CLI e Vercel CLI instaladas e autenticadas na máquina da Márcia) — em andamento, pausada aguardando janela de transição de DNS do Registro.br. Roadmap combinado com a Márcia pra depois do domínio: revisão de todas as telas → revisão de layout com visão de UX expert → inclusão de instrumentos (urgente) → lógica de temporada → controle de camisas por temporada (múltiplas entregas) → fase de marketing (e-mail com domínio próprio). Nenhum desses itens está detalhado ainda. Mais tarde no mesmo dia: auditoria completa de UX das 7 telas apresentada e aprovada, 12 achados corrigidos de uma vez (cadastro em etapas, estado de carregamento, fim dos diálogos nativos, ícone de senha unificado, acessibilidade de teclado, contraste, estado vazio, cores/CSS consolidados, página 404) mais 5 bugs reais reportados ao vivo durante a revisão (sobreposição de logo, campo de data no celular, checkbox esticado, pulo de layout entre abas, falta de fluidez entre páginas) — detalhes completos na seção 19. Num segundo round de teste, mais um bug de rolagem não resetando ao trocar de painel/escola (fim da seção 19), e um incidente de cache pós-deploy que exigiu investigação extensa (Service Worker descartado como causa, cache de rede da operadora confirmado como causa real) — resolvido com cache-busting por versão em todos os arquivos compartilhados, decisão de manter a atualização 100% automática e invisível pro usuário (sem banner, a pedido explícito da Márcia) — detalhes completos na seção 20.
- **11/jul/2026** — feature de Instrumentos configuráveis (biblioteca mestre de categorias/nomenclaturas + ativação por bateria) implementada, testada e enviada em produção (commit `506b4d3`). Domínio `tumtu.com.br` no ar (DNS + certificado SSL emitido manualmente via `vercel certs issue`, ver seção 18).
- **12/jul/2026** — `index.html` (cadastro) renomeado para `cadastro.html`; raiz do domínio virou landing "Em breve" estática, sem links, por decisão da Márcia (não tinha mais sentido expor o modo de cadastro público agora que o domínio é público). Ajustes finos na taxonomia de instrumentos (Centrador, Repique Mor, ordenação alfabética automática, formulário de edição movido pro topo). **Descoberto um problema crítico de arquitetura** (uma pessoa não conseguia se cadastrar em uma segunda bateria — Supabase Auth recusa e-mail duplicado) — planejamento formal iniciado no mesmo dia.
- **12-13/jul/2026** — migração arquitetural grande: tabela única `ritmistas` dividida em `pessoas` + `vinculos`, resolvendo o problema acima. Ver seção 22 para o detalhe técnico completo (schema, RLS/triggers, views, Edge Function, mudanças em cada tela, testes). Bug de bônus corrigido no mesmo pacote: Mestre não conseguia aprovar Diretor a nível de banco. Testado ao vivo pela própria Márcia (link local + conta fake), que reportou dois ajustes finos de UX no cadastro: troca de "tamanhos" por "medidas" no aviso de pessoa já existente, e correção de rolagem automática — tanto a mensagem final de sucesso/erro quanto o aviso "Que bom te ver de novo" (mostrado ao detectar CPF já existente) ficavam fora da área visível em telas de computador, sem nenhum indício de que precisava rolar pra ver. Ambos corrigidos com `scrollIntoView` e testados via Playwright antes do envio. **Tudo commitado e enviado ao GitHub** (commits `487ff17`, `86564c6`, `9a85130`) — nada pendente de push no momento desta atualização.
- **13/jul/2026 (continuação)** — sessão longa de redesign visual da carteirinha (ainda só em teste local, não commitado — ver `docs/design-guide-atualizacao-carteirinha.md`). No meio dela, dois recursos novos de dado nasceram e **esses sim foram implementados e enviados**: campo de gênero (pra decidir Mestre/Mestra, Diretor/Diretora no cartão) e liberação de edição do próprio nome — ver seção 23 para o detalhe completo.
- **14-16/jul/2026** — sessão maratona de redesign visual: cor/logo dinâmicos por escola (seção 24), botões novos da carteirinha + Trocar de Bateria (seção 25), descoberta de UX pro tema visual escuro em login/cadastro/Meu Perfil (seção 26).
- **17/jul/2026** — dia mais longo de todos, várias frentes: (1) interruptor de Modo Piloto adicionado à tela do Super Admin (antes só existia no banco). (2) Configuração de Medidas por bateria, espelhando Instrumentos — `medida_tamanhos` + `bateria_medidas`, dado semente pesquisado (padrão brasileiro de tamanhos). No caminho, achada e corrigida uma falha de permissão pré-existente em Instrumentos/baterias (funções de RLS antigas, seção 27). (3) Tema visual escuro (fundo + campos) implementado de fato em login/cadastro/Meu Perfil/carregando — a parte de "arte" ilustrada foi tentada e pausada por decisão da Márcia (seção 26.5). (4) Tela de carregando: 3 iterações no mesmo dia até chegar no formato final (spinner dourado sozinho, com brilho, sem logo/texto — seções 24.9-24.10). (5) "Sair" adicionado à tela de escolher bateria (antes só dava pra sair entrando numa bateria primeiro). (6) Círculos decorativos fantasmas removidos do rodapé mobile. (7) Correção de nomenclatura de cor na paleta (dois terracotas, um só tinha nome oficial). **Decisões de roadmap:** itens 4 e 5 do roadmap de 10/jul (temporada, controle de camisas) confirmados como pós-piloto; Face ID e "ritmista editar próprias medidas" também pós-piloto. Ainda não cadastrada nenhuma escola/bateria real no banco (só as 2 de teste) — próximo grande marco do piloto.

---

## 22. Migração grande: separar "pessoa" de "vínculo com bateria" (12-13/jul/2026)

**Resolve o bloqueador crítico** descoberto em 12/jul/2026 (seção 21): uma pessoa cadastrada numa bateria não conseguia se cadastrar numa segunda bateria, porque o Supabase Auth recusa e-mail duplicado (`user_already_exists`, 422) e o desenho antigo assumia "1 pessoa = 1 linha = 1 bateria". Plano formal aprovado antes da implementação: `C:\Users\Márcia Serra\.claude\plans\replicated-waddling-otter.md` (contexto completo, desenho de schema, 8 fases de execução).

### 22.1 Schema novo

**Tabela `pessoas`** — identidade da pessoa, não muda entre baterias: `id` (bigint, preservado do antigo `ritmistas.id`), `auth_user_id`, `super_admin` (boolean — substitui `perfil = 'super_admin'`), `nome`, `cpf`, `tipo_documento`, `numero_documento`, `nascimento`, `nacionalidade`, `estrangeiro`, `email`, `celular`, `foto_url`, `apelido`, `endereco`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `pais`, `emergencia_nome`, `emergencia_parentesco`, `emergencia_celular`, `tipo_sanguineo`, `created_at`.

**Tabela `vinculos`** — vínculo da pessoa com UMA bateria; uma pessoa pode ter várias linhas, uma por bateria (`UNIQUE (pessoa_id, bateria_id)` — trava nova, não existia antes): `id` (bigint, também preservado do antigo `ritmistas.id`), `pessoa_id` (→ `pessoas`), `bateria_id` (→ `baterias`, **agora com FK de verdade** — achado durante o desenho: não existia trava nenhuma nesse campo antes), `perfil` (`ritmista`/`mestre`/`diretor`), `status`, `aprovado_por` (→ `pessoas`), `nivel_acesso`, `bateria_instrumento_id`, `membro_desde`, `motivo_status`, `motivo_instrumento`, `declaracao_responsavel`, `consentimento_confirmado`, `cadastro_completo`, `tamanho_camisa`, `tamanho_fantasia`, `tamanho_calca`, `tamanho_sapato` (ver 22.5 sobre por que as medidas moraram aqui e não em `pessoas`), `created_at`.

**Por que Super Admin virou um boolean em `pessoas`, não um vínculo:** só existe uma (a Márcia), e ela não pertence a nenhuma bateria — forçar isso a ser "um vínculo com bateria vazia" enfraqueceria a trava nova de que todo vínculo precisa de uma bateria real.

**Migração dos dados:** como antes era sempre 1 pessoa = 1 vínculo, os IDs foram copiados direto — o `id` de `ritmistas` virou tanto `pessoas.id` quanto `vinculos.id` da mesma pessoa, sem tabela de conversão. Uma linha órfã ("Teste da Márcia", CPF `999.999.999-99`, sem bateria) ficou só em `pessoas`, sem vínculo correspondente. A coluna antiga `instrumento` (texto livre) não foi migrada — já não era lida por nenhuma tela desde a feature de Instrumentos configuráveis (11/jul/2026).

**Tabela antiga `ritmistas` continua existindo**, sem receber mais escrita desde a Fase 4 — mantida de propósito como rede de segurança. **Não apagar sem confirmar com a Márcia primeiro** (Fase 8 do plano, deliberadamente não executada): combinado que ela mesma testa o site publicado antes disso acontecer.

### 22.2 A view de compatibilidade

`ritmistas_com_instrumento` foi recriada (drop + create, não `CREATE OR REPLACE`, porque mudar ordem de coluna exige isso) juntando `vinculos v join pessoas p` e devolvendo o mesmo formato de sempre + `v.id` (também como `vinculo_id`) e `p.id as pessoa_id`. `perfil` retorna `'super_admin'` quando `p.super_admin = true`, senão `v.perfil`. Medidas (`tamanho_*`) agora vêm de `v.`, não de `p.`. Views `mestres_publicos` e `ritmistas_emergencia` foram recriadas com `CREATE OR REPLACE` (não precisaram reordenar coluna). Nova policy em `baterias` (`proprio_vinculo_select`) deixa a pessoa ver baterias onde tem qualquer vínculo, pro seletor de login (22.4).

**Convenção nova de `.id`:** de agora em diante, todo `.id` usado em card/lista/`carteirinha.html?id=` significa **vínculo** (pessoa + bateria específica). Só duas coisas usam `pessoa_id` de verdade: autoedição (`fpIniciar(alvo, perfil, alvo.pessoa_id, ...)`) e `aprovado_por`.

### 22.3 RLS e triggers

Duas funções de trigger substituem a antiga `aplicar_matriz_edicao_ritmistas`:
- **`aplicar_matriz_edicao_pessoas`** (`BEFORE UPDATE` em `pessoas`) — autoedição libera `apelido`/`celular`/`endereco`/.../`emergencia_*`, congela identidade (nome/CPF/nascimento/e-mail/tipo sanguíneo); edição por admin congela tudo (Super Admin edita via `pessoas` direto, não por essa trigger). Medidas **não** aparecem mais aqui — moraram pra `vinculos` (22.5).
- **`aplicar_matriz_edicao_vinculos`** (`BEFORE UPDATE` em `vinculos`) — autoedição congela cargo/status/instrumento sempre; medidas na autoedição só liberam se a pessoa for Admin (mestre/diretor aprovado) **em qualquer bateria**, não só na que está editando (regra confirmada com a Márcia: "sempre liberado se for Admin em algum lugar", situação rara, aceitável por enquanto). Edição por admin: `pode_gerenciar := (vínculo é de ritmista) ou (quem edita é mestre nesta bateria)` — Diretor não aprova Diretor/Mestre, corrigindo o **bug de bônus** (Mestre não conseguia aprovar Diretor a nível de banco, só nunca tinha aparecido porque no piloto só a Márcia aprova). `perfil`/`bateria_id`/`nivel_acesso`/`membro_desde` ficam sempre travados nessa trigger — reatribuir isso é coisa de Super Admin via tela própria.

Funções auxiliares novas/atualizadas (`SECURITY DEFINER`): `meu_pessoa_id()`, `is_super_admin()` (agora lê `pessoas.super_admin`), `minhas_baterias_admin()`, `resolve_login_email()` (repontada pra `pessoas`), `verificar_pessoa_existente(email, cpf)`, `buscar_pessoa_por_cpf(cpf, bateria_id)` (retorna `pessoa_id, nome, email, ja_tem_vinculo_nesta_bateria`; concedida a `anon`+`authenticated`, usada no cadastro antes do login).

### 22.4 Login (`login.html`)

Depois de `signInWithPassword`: se `pessoas.super_admin` é `true`, monta objeto mínimo e vai direto (sem precisar de vínculo). Senão, busca **todos** os vínculos da pessoa em `ritmistas_com_instrumento` (sem `.limit(1)` como antes). Zero vínculos → mensagem amigável de "sem vínculo". Um vínculo → segue direto pra carteirinha/painel, igual sempre foi. Mais de um → mostra uma lista simples "Qual bateria você quer ver?", escolhe e continua. `localStorage.ritmista` guarda sempre o objeto plano fundido pessoa+vínculo (com `pessoa_id`, `vinculo_id`, e `id` = `vinculo_id` por compatibilidade) — não precisou mudar nenhuma das ~20 telas que já liam esse formato do `localStorage`.

### 22.5 Cadastro (`cadastro.html`) — pessoa nova vs. pessoa que já existe

Ao inserir, o formulário chama `verificar_pessoa_existente` (RPC). Se nem CPF nem e-mail batem com ninguém → cria pessoa + vínculo do zero, como sempre foi. Se o CPF já existe com e-mail **diferente** → bloqueia com mensagem clara (evita duas "pessoas" pro mesmo CPF; CPF é a âncora de identidade). Se a pessoa já existe (mesmo CPF/e-mail) → em vez de tentar `signUp` (que quebrava antes), faz `signInWithPassword` com a senha digitada; se bater, insere só o vínculo novo; se não bater, orienta usar "Esqueci minha senha". Modo "público" totalmente aberto (sem bateria vinculada) passou a ser bloqueado explicitamente — coerente com a decisão de 12/jul de nunca mais expor esse modo (seção 21).

**Detecção antecipada (pedido dela depois de ver o erro genérico no primeiro teste):** assim que a pessoa sai do campo CPF (`onblur`), `verificarCpfExistente()` chama `buscar_pessoa_por_cpf` — se encontrar a pessoa, mostra um aviso "Que bom te ver de novo, [Nome]!", aplica a classe `body.pessoa-existente` (CSS `display:none!important` em tudo com `.oculto-pessoa-existente`) escondendo etapas/seções inteiras já conhecidas (Dados Pessoais, Endereço completo, Saúde, Emergência), e a navegação de etapas (`mostrarEtapa(n, direcao)`) pula automaticamente qualquer etapa escondida. Só continuam pedidas: Instrumento, os 4 tamanhos (por bateria, ver abaixo) e a senha — **sem confirmação de senha** (campo escondido + desobrigado), com o label mudando pra "Sua senha do TumTu" e placeholder "A senha que você já usa pra entrar", porque pedir confirmação não faz sentido pra quem só está provando que já tem conta (ela: "corre o risco dele querer colocar outra"). Um guard foi adicionado no submit (`if (!pessoaExistente && senha !== confirmar)`) pra não bloquear o envio quando `confirmar_senha` fica vazio de propósito.

**Medidas (tamanho_camisa/fantasia/calca/sapato) viraram campo de `vinculos`, não de `pessoas`** — decisão dela: escolas têm padrões de tamanho bem diferentes (uma "fecha certinho", outra é "loucura"), e ela mesma pede tamanho maior em certas escolas de propósito. Cogitado deixar só fantasia assim (as outras 3 pareciam "medida do corpo, não muda entre baterias"), mas ela preferiu os 4 por bateria. **Pendência anotada por ela, não implementar sem ela pedir de novo:** o *nome* do tamanho também pode variar por escola (uma chama XXG, outra XGG) — ela quer um sistema de nomenclatura parecido com o de instrumentos (categoria interna + nome escolhido pela escola) "depois".

Cadastro manual (Mestre/Diretor/Super Admin cadastrando por outra pessoa) segue a mesma lógica no servidor: a Edge Function `admin-create-user` foi reescrita pra primeiro checar se a pessoa já existe (por CPF, com bloqueio se o e-mail não bater; senão por e-mail, com bloqueio se o CPF não bater) antes de criar do zero — sempre insere uma linha em `vinculos` (agora incluindo os 4 tamanhos); em caso de falha depois de já ter criado a conta de auth, só desfaz essa conta se foi **esta mesma chamada** que a criou (não desfaz uma conta que já existia antes).

### 22.6 `ficha-perfil.js` e as telas que o usam

Mapa `FP_CAMPO_TABELA` decide, por campo, se o PATCH vai pra `pessoas` ou `vinculos` (`membro_desde`, `bateria_instrumento_id` e os 4 tamanhos → `vinculos`; todo o resto → `pessoas`). `fpIniciar(alvo, meuPerfil, minhaPessoaId, opcoes)` — terceiro parâmetro renomeado, agora é sempre `pessoa_id`, não `id` de vínculo. `fpSalvar()` monta dois payloads (`payloadPessoa`/`payloadVinculo`) e faz dois PATCHes independentes (`pessoas?id=eq.<pessoa_id>` e `vinculos?id=eq.<vinculo_id>`). Super Admin (sem vínculo) tem caminho especial de re-fetch direto em `pessoas`.

Telas ajustadas (todos os call-sites de `fpIniciar` passaram a passar `.pessoa_id`): `admin.html` (Meu Perfil, ficha de Ritmista, ficha de Diretoria — aprovação/rejeição de Diretor agora grava `pessoa_id` como `aprovado_por` e faz PATCH em `vinculos`), `super-admin.html` (Meu Perfil, aba Acessos — aprovar/rejeitar/ativar-desativar e `editarAcesso`/`salvarAcesso` fazem PATCH em `vinculos` pra cargo/bateria e em `pessoas` pra nome/apelido/CPF, dois PATCHes sequenciais), `carteirinha.html` (um call-site; a busca `?id=` continua funcionando sem mudança porque `id` já significa `vinculo_id` na view nova).

### 22.7 Testes

Tudo testado de ponta a ponta com Playwright (`playwright-core`, Chrome já instalado na máquina, servidor estático local `python -m http.server 8765`, contra o Supabase de produção real — nunca mockado) antes de cada envio ao GitHub: cadastro numa segunda bateria com conta fake real (Bruno), seletor de bateria no login com 2+ vínculos, regressão de login de conta única (Mestre/Ritmista/Super Admin/CPF), aprovação de Diretor por Mestre pela tela de verdade, autoedição de perfil pela carteirinha, detecção antecipada por CPF (com o cuidado de usar `.click()+.fill()+.focus()` no próximo campo em vez de `.blur()` direto, que não dispara em elemento nunca focado), pulo de etapas escondidas, e o fluxo de senha única (sem confirmação) com regressão confirmando que pessoa **nova** com senhas diferentes ainda bloqueia certo. Dados de teste sempre limpos do banco depois.

---

## 23. Campo de gênero + nome liberado pra autoedição (13/jul/2026)

Surgiu durante a sessão de redesign da carteirinha (ver `docs/design-guide-atualizacao-carteirinha.md`): pra escrever "Mestre"/"Mestra" e "Diretor"/"Diretora" certo no cartão, o sistema precisava saber o gênero da pessoa — dado que não existia em lugar nenhum.

### 23.1 Decisão de produto

Pesquisei boas práticas modernas de campo de gênero antes de desenhar (nunca só binário, nunca "Outro" sozinho — sempre com texto livre, sempre com opção de pular, sempre explicando o motivo de perguntar). A Márcia decidiu a ordem das opções: **Masculino, Feminino, "Prefiro me identificar como..." (texto livre), Prefiro não informar** — opcional em 100% dos casos, sem exceção.

Cogitei também um campo separado "nome de exibição" pra gente resolver nome muito comprido cortando na carteirinha (o CSS novo já trava em 2 linhas com "..." como proteção). A Márcia teve uma ideia melhor: **como o nome nunca teve verificação nenhuma (não tem confronto com CPF, não tem documento), não faz sentido ter "nome legal" separado de "nome de exibição" — é só liberar edição do nome de verdade.** Adotado: sem campo novo, `pessoas.nome` sai da lista de campos travados (Super Admin only) e vira autoeditável, igual apelido/celular.

### 23.2 Schema

`pessoas.genero` (text, `CHECK IN ('masculino','feminino','personalizado','nao_informado')`, nullable) + `pessoas.genero_personalizado` (text livre, só usado quando `genero = 'personalizado'`). Comentado no banco que o único uso é decidir o rótulo do cartão — não afeta mais nada no sistema.

Trigger `aplicar_matriz_edicao_pessoas` atualizada: `nome` saiu do bloqueio de autoedição (pessoa passa a editar o próprio nome). `genero`/`genero_personalizado` entraram no bloqueio de "admin editando outra pessoa" (Mestre/Diretor não pode mudar o gênero de um Ritmista, só a própria pessoa) — CPF, nascimento, e-mail e tipo sanguíneo continuam travados pra autoedição, sem mudança.

Views `ritmistas_com_instrumento` e `mestres_publicos` recriadas incluindo `genero` (Postgres não deixa inserir coluna no meio de uma view existente sem quebrar — as colunas novas foram acrescentadas no fim do `SELECT`, não na posição "lógica").

### 23.3 Onde o gênero aparece

- **Cadastro** (`cadastro.html`): campo novo, sempre opcional, pra todos os perfis (não só Mestre/Diretor) — bate com a regra do projeto de manter os mesmos campos entre perfis. Pergunta na hora porque a pessoa já sabe a resposta, diferente do nome (que só faz sentido ajustar depois de ver o resultado no cartão).
- **Edição de perfil** (`ficha-perfil.js`/`ficha-perfil.partial.html`): gênero e nome editáveis pela própria pessoa a qualquer momento. Rótulo de cargo no cabeçalho da ficha (`fpCargoLabel`) já sai correto.
- **Rótulo Mestre/Mestra, Diretor/Diretora aplicado em 4 lugares:** `carteirinha.html` (frente do cartão + bloco "Mestre(s) de Bateria" no verso, este último usando a view pública `mestres_publicos`), `admin.html` (cabeçalho do painel), `login.html` (tela de escolher bateria quando a pessoa tem mais de um vínculo).
- **Regra de fallback:** perfil `personalizado`, `nao_informado` ou sem resposta cai no masculino como padrão neutro (a Márcia rejeitou explicitamente a forma "Mestre(a)" com parênteses). Ritmista nunca varia — a palavra já é neutra em português.

### 23.4 Testes

Testado com sessão real via REST (login de verdade com conta fake Mestre, `cadu.ferreira@teste.tutti`): confirmado que a view devolve `genero` corretamente pro dono da sessão, que a própria pessoa consegue editar `nome`/`genero` de verdade via PATCH autenticado, e que CPF continua bloqueado mesmo em autoedição (regressão). Alteração de teste feita direto no banco via SQL precisou desligar a trigger temporariamente pra não ser revertida — mesmo comportamento já documentado na seção 21 (correção do e-mail do Super Admin em 06/jul), a trigger trata SQL direto sem sessão como "nem autoedição, nem Super Admin". Dado de teste sempre limpo depois (`genero` voltado pra `NULL`).

**Cache-busting:** `ficha-perfil.js` subiu de `v4` para `v5`, `ficha-perfil.partial.html` de `v2` para `v3`, `CACHE_NAME` do `sw.js` de `v20` para `v21` — atualizado em todo lugar que referencia (`admin.html`, `carteirinha.html`, `super-admin.html`, `sw.js`).

**Não incluído nesta leva:** a aplicação visual do rótulo Mestre/Mestra no CSS novo da carteirinha (ainda em teste local, não commitado — ver `docs/design-guide-atualizacao-carteirinha.md`) recebe essa mesma lógica quando o redesign for migrado pra produção.

**Limitação de ambiente conhecida (não é bug do app):** screenshot do Playwright trava indefinidamente nesta máquina Windows em headless, mesmo via CDP direto — contornado testando por inspeção de DOM (`innerHTML`, `getBoundingClientRect`, `element.click()`) em vez de prints visuais.

---

## 24. Cor/logo da escola: da correção do formulário até a arquitetura final de cache (15-16/jul/2026)

Sessão longa, várias causas raiz empilhadas — cada correção revelava a próxima. Registrado em ordem cronológica porque a ordem importa pra entender por que a solução final é a que é.

### 24.1 Causa raiz #1 — faltavam campos no formulário (resolvida, ver seção 9)

Já documentado na seção 9: `super-admin.html` só tinha campo pra 1 cor e "URL do Logo" era texto puro. Corrigido com upload de arquivo (base64) e os 4 campos de cor.

### 24.2 Causa raiz #2 — logo pesado atrasava a cor aparecer

Depois do upload virar arquivo de verdade, o logo passou a pesar 150-200KB+ (antes era um link de texto, quase zero). Como `carteirinha.html` buscava cor E logo na mesma consulta, a cor certa só aparecia depois do logo pesado terminar de baixar — nesse meio-tempo, a carteirinha mostrava o visual de fallback (ver 24.3). **Corrigido:** `carregarConfigEscola()` busca só cor/nome/temporada (leve, rápido); `carregarLogosEscola()` busca os logos à parte, aplicados quando chegarem — como qualquer imagem de site carregando aos poucos, sem atrasar o resto.

### 24.3 Causa raiz #3 — fallback de "sem cor" caía na marca TumTu

Antes de qualquer cor real chegar (ou se a escola genuinamente não tivesse cor cadastrada), o CSS caía de propósito no visual escuro+dourado do próprio TumTu (`styles/carteirinha-tumtu-novo.css`, decisão original de 14/jul: "sem nenhuma cor, cai no TumTu — a marca É a escola base"). Combinado com a causa #2, isso criava um "flash": a carteirinha parecia por um instante ser do TumTu e só depois "virava" a cor da escola de verdade.

**Decisão da Márcia (16/jul/2026): tirar esse fallback de vez.** Ela cadastra a cor de toda escola pessoalmente no Super Admin antes do piloto começar ("eu não vou deixar uma escola ter carteirinha sem definição das cores") — então o estado "sem cor real" só existe durante o carregamento, nunca de verdade em produção. Trocado por um **cinza neutro** (`#706c87`/`#c0bdd0`) na cadeia de fallback de `--cor-1`/`--cor-2` — nunca mais mostra a marca TumTu como disfarce.

### 24.4 Causa raiz #4 — scripts bloqueantes atrasavam a primeira pintura da tela

`carteirinha.html` e `login.html` carregavam o script do Supabase (CDN externo) e outros arquivos locais sem `defer` no `<head>` — isso trava o navegador de desenhar qualquer coisa até baixar tudo, especialmente lento em rede ruim/fria. **Corrigido:** scripts externos com `defer`; como `defer` em `<script>` inline não tem efeito (só funciona com `src`), a criação do cliente Supabase e a lógica de inicialização foram movidas pra dentro de um listener de `DOMContentLoaded`.

### 24.5 Causa raiz #5 — transição nativa entre páginas brigando com o carregamento

`styles/tokens.css` liga `@view-transition { navigation: auto; }` globalmente (transição suave entre telas). Depois da correção #2/#3, a tentativa do navegador de fazer cross-fade entre a tela de login antiga e a carteirinha nova (que começava com pouco conteúdo visível) criava um "fantasma" da tela de login por cima do fundo escuro. **Corrigido:** `@view-transition { navigation: none; }` só em `carteirinha.html`, desligando a transição nessa tela específica (continua ligada normalmente nas outras).

### 24.6 Causa raiz #6 (a de verdade, achada por sugestão da Márcia) — buscar antes de trocar de tela

Mesmo depois de tudo acima, ainda sobrava um "flash" perceptível — porque a carteirinha só começava a buscar a cor DEPOIS de já estar na tela errada. A Márcia propôs a solução certa: **buscar tudo ainda na tela de login, com um spinner honesto, e só trocar de tela quando a carteirinha já estiver pronta de verdade.**

**Arquitetura implementada:**
- `login.html` ganhou `prefetchConfigEscola(bateriaId, token)` — busca cor/nome/logos da escola/bateria e grava em `localStorage` na chave `tumtu_cfg_<bateriaId>` (mesmo formato que `carteirinha.html` já lê via `lerConfigCache()`).
- Chamado nos dois pontos que levam pra `carteirinha.html`: sessão já existente (reabrir o app) e login manual/escolha de vínculo — sempre ANTES de trocar de tela, com um container de spinner (`#containerCarregando`, visível por padrão) cobrindo essa espera.
- `carteirinha.html` lê esse cache no carregamento e aplica na hora, de forma síncrona — a busca de rede continua rodando por trás só pra manter o cache atualizado pra próxima vez (`salvarConfigCache`, com guard: nunca grava um resultado vazio/falho, pra não travar o cache num estado errado).
- **Rejeitado explicitamente pela Márcia:** qualquer versão de "esconder o cartão com opacity até ficar pronto" — ela não quer nenhum tipo de fade/transparência, só spinner honesto ou cartão 100% pronto, nunca um meio-termo visual.

### 24.7 Causa raiz #7 (a última, e a mais funda) — o Service Worker escondia tudo isso

Mesmo com a arquitetura de cache pronta, a Márcia ainda via "tela preta muito tempo" — mas só depois de ficar um tempo sem usar o app; se reabria na hora, era rápido. Essa pista (rede "fria" vs "quente") levou à causa raiz de verdade: o `sw.js` tratava **navegação** (abrir uma tela) como "network-first" — esperava a REDE responder antes de mostrar qualquer coisa, só caindo pro cache local se a rede falhasse por completo (offline de verdade). Com conexão fria (não offline, só lenta pra reconectar), isso virava uma espera longa antes de desenhar qualquer coisa, mesmo com a tela inteira já salva localmente.

**Corrigido:** navegação passou a usar o mesmo "stale-while-revalidate" que o resto dos arquivos já usava — responde na hora com o cache local (instantâneo, não depende de rede pra pintar a tela), atualiza por trás em segundo plano. Testado com rede simulada extremamente ruim (3s de latência, 20KB/s): conteúdo aparece em ~70ms puxando do cache.

### 24.8 Estado final e lição geral

Depois dessas 7 causas corrigidas: a carteirinha nasce sempre pronta (cor, texto, logo — quando o cache já existe, o que é o caso normal depois da primeira visita), sem nenhuma fase intermediária visível, mesmo sob rede ruim.

**Lição maior da sessão:** quando um sintoma parecido persiste depois de um fix bem confirmado e testado, é bem provável que seja uma causa DIFERENTE com sintoma parecido, não o mesmo bug "meio corrigido" — vale reproduzir de novo com o cenário real relatado (inclusive pedindo vídeo/print) antes de assumir que já era. E quando a pessoa dona do produto propõe a própria solução (mesmo insegura, "não sei se resolve"), vale considerar com seriedade real — nesse caso a arquitetura que resolveu de vez (24.6) foi ideia dela, não minha.

### 24.9 Causa raiz #8 (17/jul/2026) — a foto do próprio ritmista, e decisão revertida sobre esconder o cartão

Reportado no desktop especificamente: mesmo com tudo acima resolvido, a carteirinha ainda "se formava" visivelmente — o cartão aparecia e a FOTO do ritmista "estalava" um instante depois. Causa: `renderCarteirinha()` fazia `img.src = ritmista.foto_url` e seguia em frente sem esperar o navegador terminar de decodificar a imagem (um base64 grande) — no celular isso quase não aparecia (foto pequena), no desktop ficou perceptível.

**Decisão revertida de propósito, com autorização explícita da Márcia:** o item 24.6 registrava "rejeitado explicitamente pela Márcia: qualquer versão de esconder o cartão com opacity até ficar pronto" (15/jul/2026). Em 17/jul/2026, depois de eu explicar em linguagem simples o que eu estava propondo ("toda vez que tiver espera, mostra a animação de carregando; eu só não quero nada aparecendo incompleto"), ela confirmou que era exatamente isso que queria — não uma rejeição de esconder-até-pronto em si, mas da versão com fade/transição lenta que foi testada em 15/jul.

**Implementado:** `#carregandoCarteirinha` — camada cobrindo a tela inteira (`position:fixed;inset:0`), visível por padrão. `renderCarteirinha()` virou `async` e agora dá `await img.decode()` na foto antes de considerar o render terminado (com `try/catch` — nunca trava pra sempre se a foto falhar). A camada só esconde (`esconderCarregandoCarteirinha()`, troca instantânea de `display`, sem fade) depois que TUDO estiver pronto: nome/cargo/foto decodificada (via `renderCarteirinha` awaited) **e** cor da escola aplicada (do cache, se existir; senão espera a busca de rede de verdade, mesma regra de 24.6). O logo continua de fora dessa espera de propósito (mesma decisão de 24.4 — entra como qualquer imagem normal, "estalar" o logo é aceitável, a foto/cor não). O visual de dentro dessa camada (o que ela mostra enquanto espera) mudou depois no mesmo dia — ver 24.10.

### 24.10 O visual de dentro do "carregando" — 3 iterações na mesma tarde (17/jul/2026)

Depois de resolver a *mecânica* de esconder até estar pronto (24.9), sobrou decidir o *visual* de dentro dessa camada — tanto em `login.html` quanto em `carteirinha.html` (mesmo padrão nas duas telas, sempre).

1. **Animação "Tum-Tu"** — dois círculos do símbolo da marca (bolinha dourada + aro terracota) "batendo" num ritmo de pancada de tambor, com rótulos de texto testados e descartados no caminho. Testada em preview real (Vercel + link com bypass de autenticação via `_vercel_share`, gerado pela ferramenta `get_access_to_vercel_url`, já que os previews da Vercel exigem login por padrão). **Revertida no mesmo dia:** no celular, a espera de verdade (principalmente com cache já pronto) era curta demais pro movimento comunicar o ritmo antes de sumir — a Márcia ficou triste em abandonar a ideia, mas concordou que não estava cumprindo o objetivo.
2. **Spinner clássico de volta** (logo + anel giratório + "Carregando..." escrito) — como era antes, só que a Márcia reparou que esse padrão não estava em 100% das telas de carregando do app (inconsistência pré-existente, não investigada a fundo).
3. **Decisão final:** spinner sozinho, sem logo, sem texto — maior (56px) e dourado, com brilho/glow ao redor (`filter: drop-shadow()` em duas camadas, a primeira tentativa de brilho foi sutil demais e imperceptível, teve que aumentar bem o raio e a opacidade). Referência dela: Netflix (vermelho) e Disney+ (azul) — o TumTu ganha a versão dourada do mesmo padrão. Resolve de quebra a inconsistência do item 2, porque não tem mais "logo em algumas telas, sem logo em outras" — é sempre só o spinner.

**Lição pequena, mas real:** pedir uma "última avaliação" antes de subir (como aconteceu aqui) é uma boa prática — foi numa dessas perguntas de fechamento que ela notou a inconsistência do logo, que não tinha sido reportada antes.

---

## 25. Botões da carteirinha e "Trocar de Bateria" — construído (16/jul/2026)

Fecha a parte do ritmista do fluxo desenhado em 14/jul (seção 9) — a parte do Admin pós-piloto continua só desenhada, não construída, por decisão dela.

### 25.1 O que mudou

- **Removidos** "Salvar (em breve)" e "Compartilhar" (não faziam nada real) e a função `compartilhar()`.
- **Topo do cartão:** voltou a ter só "Sair" — "Meu Perfil" saiu de lá (ela testou várias posições antes de decidir: "eu odeio o Meu Perfil lá em cima, por isso eu quero tirar").
- **Rodapé do cartão** (`.c-botoes`, onde antes ficavam os botões mortos): "Meu Perfil" (`.c-btn-meuperfil`, dourado sólido — ação principal, universal) e "Trocar de Bateria" (`.c-btn-trocar`, só borda — secundário, só aparece com 2+ vínculos). Quando só "Meu Perfil" aparece (a maioria das pessoas, 1 vínculo só), ele não estica de ponta a ponta — classe `.botoes-solo` centraliza um botão de tamanho normal.

### 25.2 "Trocar de Bateria" — como funciona

- Botão manda pra `login.html?trocar=1`.
- `login.html` ganhou `buscarEEscolherVinculos(pessoaId, forcarEscolha)` — função compartilhada entre o login manual e essa troca (busca todos os vínculos aprovados da pessoa, monta a telinha de escolha se houver 2+, ou entra direto se só 1).
- Reaproveita a sessão do Supabase Auth já aberta — não pede senha de novo.
- **Sem spinner duplicado:** enquanto a pessoa está decidindo na telinha de escolha, `buscarEEscolherVinculos` já dispara `prefetchConfigEscola` em segundo plano pra CADA bateria listada (não só a escolhida). Quando ela clica, `continuarComVinculo` confere se o cache daquela bateria já chegou — se sim, troca de tela na hora, sem spinner novo; só cai no spinner (caso raro) se o prefetch não tiver terminado a tempo.
- **`ritmista.totalVinculos`:** calculado toda vez que `buscarEEscolherVinculos` roda, decide se "Trocar de Bateria" aparece. Sessões salvas de ANTES desse campo existir se autocorrigem sozinhas — `tentarSessaoExistente()` detecta `totalVinculos === undefined` e busca de novo, em vez de confiar cegamente no cache antigo.

### 25.3 Login com espera única

Bug de UX relacionado, corrigido na mesma leva: o formulário de login mostrava "Entrando..." no botão (com o formulário ainda visível) e DEPOIS o spinner de tela cheia — duas sensações de carregamento em sequência. Corrigido: o formulário troca pro spinner assim que é enviado, uma espera só, do clique até a carteirinha aparecer. Em caso de erro (senha errada etc.), volta pro formulário com a mensagem (`erroLogin()`).

### 25.4 Dados de teste criados

Pra testar 2 mestres numa bateria e um ritmista em 2 escolas ao mesmo tempo (banco fake, pode reverter): vínculo `id=94` (Vinícius/Vini, ritmista, "Trovão da Vila") e vínculo `id=54` (Fábio "Fabinho", mestre, "Trovão da Vila") mudados de `pendente` pra `aprovado`. Isabela/Bela não foi tocada, continua só em 1 escola. **Nota técnica:** editar `status` de vínculo `mestre`/`diretor` direto via SQL (fora do fluxo normal) é bloqueado pelo trigger `trg_matriz_edicao_vinculos` (só deixa Mestre da própria bateria aprovar outro Mestre/Diretor) — contornado com `ALTER TABLE ... DISABLE TRIGGER` + UPDATE + `ENABLE TRIGGER` de novo. Só usar esse contorno em dado de teste, nunca em dado real.

### 25.5 Testes

Testado ponta a ponta com Playwright: Vinícius (2 vínculos) vê os dois botões, troca de bateria sem repetir senha, sem spinner duplicado; Isabela (1 vínculo) só vê "Meu Perfil" centralizado, tamanho normal. Verso confirmado com 2 mestres reais (Beto + Fabinho) mostrando "MESTRES DE BATERIA" no plural.

---

## 26. Redesign visual "cara de app moderno" — descoberta de UX (16/jul/2026)

Pedido elevado a urgente em 14/jul (seção 9), descoberta feita em 16/jul — desenho/implementação ainda não começou.

### 26.1 Escopo

**Piloto agora:** `login.html`, `cadastro.html`, "Meu Perfil" (`ficha-perfil.js`/`ficha-perfil.partial.html`) e a tela de carregando (`#containerCarregando`, ver seção 24.6) — tirar o padrão "modal/dialog" (`.auth-container`: fundo escuro + caixa branca centralizada, `styles/components.css:197`) e virar tela cheia de verdade.

**Fora do escopo agora, de propósito:** `admin.html` e `super-admin.html`. A Márcia deixou claro que quer estender esse padrão pra lá também no futuro ("acho que tudo tem que ter esse padrão"), mas confirmou explicitamente "o piloto é o piloto" — não expandir escopo sem ela pedir de novo.

**Não muda:** a carteirinha em si continua parecendo um cartão — distinção que ela mesma validou em 14/jul e reafirmou em 16/jul.

### 26.2 Paleta (corrigida por ela — são 3 cores, não 2)

Documentada em `docs/tumtu-visao-geral.md`: escuro `#12101a`, dourado `#D4AF37` (+ hover `#B8922A`), terracota `#7c2d12` (risco sob o "m" do logotipo, referência ao M dela) — mais os neutros de apoio (`--cor-fundo-claro: #f7f6fb`, `--cor-texto-secundario: #5a5770`, `--cor-borda: #e8e6f0`).

### 26.3 Referências de app (entrevista de UX, resposta dela)

Instagram, Disney+, Netflix, Spotify, Nubank, Google/Gmail, Uber. Prints de 3 anexados na sessão:
- **Spotify** — barra de navegação fixa embaixo (bottom tab bar: ícone + texto). Ela apontou isso explicitamente como algo que gosta muito — bom candidato pro FUTURO `admin.html` (que já tem abas no topo — Dashboard/Ritmistas/Diretoria/Configurações), não pro piloto agora.
- **Netflix "Escolha seu perfil"** — grade de avatares circulares + nome. Confirma a mesma referência "estilo Netflix" que ela já tinha pedido pra guardar em 14/jul pra tela de escolher vínculo/bateria (seção 9).
- **Netflix home** — par de botões "Assistir" (sólido/branco, ação principal) + "Minha Lista" (contornado, secundário) — mesmo princípio de hierarquia já usado na carteirinha (Meu Perfil dourado sólido / Trocar de Bateria só borda, seção 25).

### 26.4 Decisões de design já fechadas

- **Fundo escuro de ponta a ponta**, não caixa clara boiando no meio — estilo Spotify/Netflix/Disney+.
- **Campos de formulário também escuros**, não brancos: usar o token que já existe `--cor-fundo-medio: #1e1b2e` (mais claro que o fundo `#12101a`) com borda clara bem visível, texto branco ao digitar. Raciocínio: é o padrão que as referências dela (Spotify/Netflix/Disney+) já usam, e evita o "flash" de luz numa tela escura — a Márcia confirmou que o cenário de leitura em sol forte não se aplica (carteirinha é usada entrando numa escola de samba, ambiente coberto/noturno).
- **Validação estratégica** (ela pediu explicitamente, não só visual): perguntou se o público (mestres, diretores, ritmistas, todas as idades) comporta tela escura. Resposta fundamentada: sim — a marca já é escura, o contexto de uso (samba/carnaval, eventos à noite) combina tematicamente, e modo escuro hoje é mainstream em todas as idades, não é mais nicho jovem/tech como era há uns anos.

### 26.5 Próximo passo

Começar o mockup/rascunho de `login.html` primeiro (ela concordou em ser o "piloto" desse novo padrão visual) — campos escuros com borda, sem caixa branca, botão de ação principal dourado sólido. Depois de aprovado, estender pro cadastro, Meu Perfil e tela de carregando, um de cada vez.

**Atualização 17/jul/2026 — pausado por decisão dela, sem inspiração certa ainda.** O fundo escuro + campos escuros já foram implementados nessa mesma sessão maratona (14-17/jul) — o que ficou faltando dessa seção era só a parte de "arte"/identidade visual mais ousada que ela mencionou depois (referência ao app Jaé). Tentei 2 direções (ilustração tipo corte-de-papel de bateria, e um composição gráfica abstrata com ondas de som) — ela não gostou de nenhuma das duas ("não entendi nenhuma das duas"). Perguntei se queria uma conversa de descoberta de verdade sobre isso (tipo a que gerou essa seção 26); ela respondeu "eu gosto do jeito que está. não vou mudar agora, pelo menos não tenho uma inspiração certa." **Não retomar essa frente sem ela trazer o assunto de novo** — o visual atual (fundo escuro + campos escuros, sem arte adicional) é considerado bom o suficiente por enquanto.

---

## 27. Correção de RLS: funções antigas causando permissão silenciosamente quebrada (17/jul/2026)

Descoberto durante a construção de Medidas configuráveis (mesmo padrão de Instrumentos — biblioteca mestre + ativação por bateria, `instrumento_categorias`/`instrumento_nomenclaturas`/`bateria_instrumentos`, implementado em 11/jul/2026, ver linha do tempo na seção 21).

**O problema:** as policies de RLS de `bateria_instrumentos` (INSERT/UPDATE/SELECT, exceto Super Admin) e de `baterias` (SELECT do Mestre/Diretor pra própria bateria) usavam 3 funções antigas — `meu_perfil()`, `meu_bateria_id()`, `meu_status()` — que ainda liam da tabela `ritmistas`, congelada desde a migração pessoa/vínculo de 13/jul/2026 (seção 22). Qualquer conta criada DEPOIS dessa data não tem linha nessa tabela antiga — pra essas contas, as 3 funções retornam vazio, e a permissão de admin (ligar/desligar instrumento da própria bateria, ver dados da própria bateria) falha silenciosamente, sem erro visível óbvio.

**Por que não tinha sido notado antes:** todas as contas de teste existentes foram criadas ANTES da migração de 13/jul, então ainda têm a linha antiga por coincidência — o problema só apareceria com uma conta de Mestre/Diretor 100% nova, cadastrada depois de 13/jul, o que ainda não tinha acontecido (nenhuma bateria real foi cadastrada até 17/jul).

**Onde isso doeria de verdade:** só depois que uma bateria tiver `modo_piloto = false` (Mestre/Diretor caindo direto no painel próprio, não mais impersonado pelo Super Admin) — durante o piloto (`modo_piloto = true`), quem configura tudo é a Márcia via "Acessar como Admin", que usa `is_super_admin()` (função correta, não afetada).

**Corrigido:** as 3 policies afetadas passaram a usar `meu_pessoa_id()` e `minhas_baterias_admin()` — as mesmas funções já usadas corretamente pelas policies de `pessoas`/`vinculos` desde a migração. `bateria_medidas` (a tabela nova de Medidas) já nasceu usando as funções certas — não repetiu o erro. As 3 funções antigas continuam existindo no banco (ainda usadas por 2 policies da própria tabela `ritmistas`, que é deprecated e não é lida por nenhum código do app hoje — inofensivo, não apagadas de propósito).

**Lição pra reaproveitar em qualquer feature nova "por bateria":** nunca copiar `meu_perfil()`/`meu_bateria_id()`/`meu_status()` como referência — usar sempre `meu_pessoa_id()`/`minhas_baterias_admin()`.

## 28. Bugs de aprovação de Admin (Mestre/Diretor) + log de auditoria de status (17/jul/2026)

Descoberto pela Márcia durante teste manual: um Mestre se cadastrou, ficou pendente, e três coisas deram errado ao tentar resolver isso.

**Bug 1 — spinner travado no login de quem está pendente/rejeitado.** Em `login.html`, `continuarComVinculo()` escrevia o aviso ("seu cadastro está em análise"/"foi recusado") direto na `<div id="mensagem">`, que mora dentro de `#containerLogin` — só que essa função nunca chamava `mostrarFormularioLogin()` antes, então `#containerLogin` continuava com `display:none` e `#containerCarregando` (o spinner) continuava visível pra sempre. A pessoa via só o spinner girando, sem nunca ler o aviso. **Corrigido:** as duas branches (pendente/rejeitado) agora chamam `mostrarFormularioLogin()` primeiro. `mostrarFormularioLogin()` também passou a esconder `#containerEscolherBateria` (não só o spinner), pra cobrir o caso de alguém pendente ser escolhido na telinha de "qual bateria" (múltiplos vínculos).

**Bug 2 — Dashboard do Super Admin escondia pendências de Mestre/Diretor.** `carregarDashboard()` em `super-admin.html` buscava vínculos com `perfil=eq.ritmista` — Mestre e Diretor pendentes nunca entravam na contagem "X pendentes" por bateria. Existia desde a criação do Dashboard (não é uma regra documentada, foi descuido). **Corrigido:** removido o filtro de perfil — a contagem agora reflete todo mundo.

**Não era bug (regra já existente, só mal descoberta):** admin.html só mostra botão "Aprovar" pra um Diretor pendente, e só se quem está logado é Mestre (`souMestre && a.perfil === 'diretor'`, linha ~1585) — reflete a regra documentada na seção "Quem aprova quem" do `tumtu-mvp.md` (Super Admin aprova Mestre; Mestre aprova Diretor da própria bateria; Super Admin também aprova Diretor como rede de segurança). Um Mestre pendente **só** pode ser aprovado pelo Super Admin, em nenhuma outra tela — e a única tela que cobre isso é Super Admin → Escolas → [escola] → aba **Acessos** (`carregarAcessos`/`cardAcessoHTML`/`aprovarAcesso` em `super-admin.html`), que mostra Mestre e Diretor juntos, agrupados por cargo.

**Atalho novo:** como a aba Acessos ficava "escondida" atrás de Cadastro/Bateria (a sub-aba que abre por padrão ao entrar numa escola é Cadastro), a Márcia pediu um atalho: clicar na linha "X pendente(s)" de uma bateria no Dashboard agora chama `irParaAcessosDaBateria(escolaId)`, que troca pra aba Escolas, chama `selecionarEscola()`, e já abre direto na sub-aba Acessos — sem precisar navegar manualmente.

**Log de auditoria (`vinculos_historico_status`) — pedido com urgência pro piloto.** Investigando os bugs acima, ficou claro que não existia nenhum jeito de saber quem aprovou/rejeitou um Ritmista (a função `atualizarStatus()` em `admin.html` nunca gravava `aprovado_por`) — e mesmo pra Mestre/Diretor, `vinculos.aprovado_por` guarda só a última decisão, sem data/hora e sem histórico (se o status mudar de mão de novo, a informação anterior é sobrescrita e perdida).

Solução: tabela nova `vinculos_historico_status` (`vinculo_id`, `pessoa_id` afetada, `bateria_id`, `perfil`, `status_anterior`, `status_novo`, `decidido_por`, `motivo`, `criado_em`) + trigger `trg_historico_status_vinculos` (`AFTER UPDATE ON vinculos`, dispara sempre que `status` muda de valor). O trigger grava `decidido_por` lendo `meu_pessoa_id()` (via `auth.uid()` de quem fez a chamada autenticada) — não depende de nenhuma tela lembrar de preencher um campo, então fecha a lacuna do Ritmista de graça e cobre **qualquer** status (aprovado, rejeitado, suspenso, desligado, e futuros) sem precisar listar valores um por um. Função `registrar_historico_status_vinculo()` é `security definer`, mesmo padrão dos triggers de matriz de edição — garante que o insert do log aconteça independente da policy de leitura da tabela.

RLS: só Super Admin lê (`is_super_admin()`) por decisão da Márcia — "por enquanto", pensado pra ampliar depois pra Mestre/Diretor verem o histórico da própria bateria (o `bateria_id` já fica salvo em cada linha, então isso não vai exigir mudança de schema, só uma tela nova filtrando por ele).

**Testado de ponta a ponta** (Playwright headless, contra o banco real de dados fake): mestre pendente tentando logar → confirma que sai do spinner e mostra o aviso; Super Admin aprovando pela aba Acessos → confirma que o mestre depois consegue logar normalmente; aprovação gerando uma linha em `vinculos_historico_status` com `decidido_por` certo. Dado de teste devolvido ao estado original depois (`vinculo_id 95` de volta pra `pendente`, linha de log de teste apagada) — nada do ambiente de testes da Márcia ficou alterado por causa da verificação.

**Tela de visualização — construída na mesma sessão (17/jul/2026), a pedido da Márcia logo depois de ver o log funcionando.** Aba nova "Histórico" em `super-admin.html` (entre Configurações e Meu Perfil), lista simples reaproveitando o componente `.item-card` já usado em Escolas/Acessos — sem badge colorido nem filtro, de propósito (telinha simples, sem inventar elemento visual novo). Cada linha mostra: nome da pessoa afetada · cargo, status anterior → status novo, quem decidiu, bateria, data/hora, e o motivo se houver. Busca via `vinculos_historico_status?select=...,pessoa:pessoa_id(nome),decisor:decidido_por(nome),bateria:bateria_id(nome)` (embed do PostgREST resolvendo os 2 FKs distintos pra `pessoas` pelo nome da coluna de origem, sem ambiguidade), ordenado do mais recente pro mais antigo, limitado a 200 linhas. Testado de ponta a ponta (Playwright) com um evento real de aprovação — conferido que aparece exatamente "Pendente → Aprovado · por Márcia Serra · TumTu · [data/hora]".

**Pendente de decisão futura, registrada mas não iniciada:** Márcia sinalizou que quer, no futuro, diferenciar permissões entre Mestre e Diretor (hoje os dois são tratados como um "Admin" genérico, mesmo `nivel_acesso`). O campo `nivel_acesso` já existe separado de `cargo` desde o desenho original do MVP, exatamente pra permitir isso sem migração de dados quando chegar a hora.

**Dashboard virou a aba inicial do Super Admin** (era "Escolas") — pedido da Márcia depois dos ajustes acima, já que o Dashboard agora mostra pendências de cara e o atalho pra Acessos funciona a partir dele. `carregarDashboard()` passou a rodar direto em `init()` (antes só rodava ao clicar na aba), pra já chegar com dado pronto.

## 29. Bug de atualização do PWA: precisar apagar e recriar o app pra pegar mudanças novas (17/jul/2026)

Descoberto pela Márcia testando a correção da seção 28: fechou e reabriu o app (PWA salvo na tela do iPhone) depois do deploy e o bug do spinner continuava — só sumiu depois de apagar o ícone e salvar o app de novo.

**Causa raiz:** `sw.js` já tinha `self.skipWaiting()` (no `install`) e `self.clients.claim()` (no `activate`) — ou seja, um service worker novo assume o controle sozinho, em segundo plano, sem esperar as abas antigas fecharem. Mas `pwa-register.js` (o script que registra o service worker, incluído nas 6 telas do app) nunca escutava o evento `controllerchange` — quando o novo service worker assumia o controle, **nada avisava a tela já aberta pra recarregar**. Ela continuava rodando o JavaScript antigo, já carregado na memória, indefinidamente. "Fechar e abrir de novo" não bastava porque reabrir o ícone do PWA no iOS muitas vezes só retoma a mesma sessão suspensa, sem forçar um carregamento do zero — só apagar e recriar o registro do service worker (que apagar+recriar o ícone força) resolvia.

**Corrigido:** `pwa-register.js` agora escuta `navigator.serviceWorker.addEventListener('controllerchange', ...)` e recarrega a página sozinha (`window.location.reload()`) na primeira vez que um service worker novo assume — com uma flag (`jaRecarregou`) pra nunca recarregar mais de uma vez por sessão. Dali pra frente, toda atualização futura deve chegar sozinha, sem nenhum gesto manual da pessoa.

**Ressalva importante:** essa própria correção sofre do mesmo problema que ela resolve — quem já tinha o `pwa-register.js` antigo carregado (sem o listener) só recebe esse comportamento novo depois de UM refresh manual/forçado desta vez (não tem como o código velho detectar e aplicar uma correção que só existe no código novo). A partir daí, sim, tudo automático. Verificado direto em produção (`tumtu.com.br`, não no servidor local) com um navegador limpo, sem service worker anterior — confirmado que o login do Mestre pendente funciona igual ao testado localmente.

## 30. Investigação de carteirinha offline — lacuna encontrada, correção prototipada, revertida por decisão da Márcia (17/jul/2026)

Márcia perguntou se dá pra ver a carteirinha sem internet. `carteirinha.html` já carrega os dados da própria pessoa (nome, foto, cor da escola) via `localStorage`, o que já funcionaria offline — mas o QR code do verso (`qrcodejs`) e o próprio `@supabase/supabase-js` são carregados de CDN externo, e `sw.js` explicitamente nunca cacheia requisições de outra origem (comentário "nunca cachear Supabase/CDNs" no `fetch` handler). Essas duas dependem só do cache nativo do navegador — bem menos confiável que o cache próprio do app — e se faltarem, `new QRCode(...)` lançava erro sem try/catch, travando a carteirinha inteira carregando pra sempre.

**Correção prototipada e testada com sucesso em produção:** baixar as duas bibliotecas pra uma pasta `vendor/` própria do projeto, trocar as tags `<script>` nas 6 telas que usam Supabase-js (`login.html`, `cadastro.html`, `admin.html`, `super-admin.html`, `redefinir-senha.html`, `carteirinha.html`) e a que usa qrcodejs (`carteirinha.html`), incluir os 2 arquivos no `APP_SHELL` do service worker, e envolver `new QRCode(...)` num `try/catch` (defesa extra, mantida como boa prática independente da vendorização).

**Trade-off:** vendorizar trava a versão do Supabase-js num ponto fixo (testado com 2.110.7) em vez de sempre buscar a mais recente do CDN — precisaria de atualização manual ocasional.

**Decisão da Márcia: reverter por enquanto** — prefere manter a atualização automática enquanto o TumTu está em desenvolvimento ativo, lançando versões constantemente. Todo o código foi desfeito (`git checkout`), nada foi commitado. Detalhe completo da decisão e como retomar: memória `project_offline_carteirinha_investigacao` (fora deste repositório, sessão do Claude Code).

**Ideia relacionada, também registrada mas não iniciada:** um botão de atalho (inspirado no app Jaé) pra ir direto na última carteirinha vista, sem passar pelo login completo — e, numa visão maior, TumTu marcando presença em ensaio via QR, também offline. Ambas dependem da mesma correção acima quando forem retomadas.

## 31. Revisão de segurança do fluxo completo de carteirinha (18/jul/2026) — vazamento crítico corrigido

A pedido da Márcia, revisão de ponta a ponta do fluxo de escola→bateria→links de cadastro→aprovação→múltiplos vínculos, direto no banco (schema, RLS, triggers, funções) via Supabase MCP, não só nas telas.

**🔴 Crítico, corrigido na hora — view `ritmistas_com_instrumento` vazava dado de todo mundo.** A view (usada em `login.html`, `carteirinha.html`, `admin.html`, `super-admin.html` pra buscar pessoa+vínculo+instrumento numa tacada) estava marcada `SECURITY DEFINER` — isso faz a consulta rodar com a permissão de quem *criou* a view, ignorando por completo a RLS de `pessoas`/`vinculos` — e além disso tinha `GRANT SELECT` liberado pro papel `anon` (qualquer um, sem login). Resultado real, confirmado por teste: **qualquer pessoa, sem senha nenhuma, usando só a chave pública que já fica visível no código de qualquer página do site, conseguia puxar CPF, endereço, telefone e contato de emergência de todo mundo cadastrado, de todas as escolas.**

**Correção:** `ALTER VIEW ... SET (security_invoker = true)` — a view passa a rodar com a permissão de quem está perguntando, então a RLS que já existia em `pessoas`/`vinculos` (dono vê o próprio, admin vê a própria bateria, Super Admin vê tudo) volta a valer dentro da view também. `REVOKE ALL FROM anon` (sem login não vê nada) + `GRANT SELECT TO authenticated` (mantém o app funcionando pra quem está logado).

**Testado com contas fake reais antes de considerar concluído** (login via API do Supabase Auth, requisição direta contra a view):
- Sem login (chave anônima crua): `permission denied` — antes vazava tudo.
- Ritmista (`vini.santos@teste.tutti`): só vê o próprio registro; tentativa de puxar outro `pessoa_id` volta vazio.
- Mestre/Diretor (`fabinho.cardoso@teste.tutti`): vê os 14 membros da própria bateria; tentativa de puxar outra bateria volta vazio.
- Super Admin: continua vendo todo mundo (28 de ~29 pessoas, número batendo).

As outras 5 views `SECURITY DEFINER` do projeto (`baterias_publicas`, `mestres_publicos`, `bateria_instrumentos_publicos`, `bateria_medidas_publicas`, `ritmistas_emergencia`) foram checadas e **não precisam de correção** — são público de propósito (usadas antes do login, ex: validar link de cadastro, mostrar QR de emergência) e só expõem colunas mínimas sem CPF/endereço, ao contrário da `ritmistas_com_instrumento`.

**Outros achados da mesma revisão:**
- ✅ **Corrigido no mesmo dia — suspender/desligar alguém no painel Admin não bloqueava o acesso dela.** `login.html` (`continuarComVinculo`) só tratava explicitamente os status `pendente` e `rejeitado` — qualquer outro status (inclusive `suspenso` e `desligado`) caía no fluxo normal de acesso liberado. Corrigido: agora nega por padrão (só `aprovado` passa), reconfere o status a cada abertura do app (não confia mais em sessão salva antiga), e a telinha de "escolher bateria" esconde `desligado`/`rejeitado` da lista e mostra `pendente`/`suspenso` travados com o motivo ao lado.
- ✅ **Corrigido no mesmo dia — trocar cargo de alguém** (ex: Diretor virando Ritmista de novo, caso real que a Márcia já viu acontecer). Implementado em `super-admin.html`, aba Acessos → editar → campo "Perfil" ganhou a opção "Ritmista". Como Mestre/Diretor nunca preenchem instrumento no cadastro (mudança de 17/jul/2026), virar Ritmista exige escolher o instrumento **ali mesmo, na hora da troca** — decisão da Márcia depois de eu explicar que "pedir depois, no próximo login" exigiria construir uma tela nova de "complete seu cadastro" (mais escopo do que fazer isso valer na hora). `nivel_acesso` também é ajustado (`null` pra Ritmista, `'total'` pra Mestre/Diretor, mesma convenção do cadastro). **Escopo de hoje é só essa direção** (virar Ritmista) — promover um Ritmista existente pra Diretor ficou de fora porque a aba Acessos hoje só lista Mestre/Diretor (Ritmista nunca aparece lá); ela decidiu deixar essa direção pra quando entrar o projeto de unificação admin/super-admin (ver `project_unificacao_admin_super_admin` na memória, fora deste repo). Testado de ponta a ponta com uma conta real (Diretor→Ritmista com instrumento, sumiu da lista de Acessos como esperado, revertido depois).
- Tela de "escolher bateria" no login não distingue visualmente vínculo pendente de aprovado antes do clique. *(resolvido junto com o item de suspenso/desligado acima)*
- ✅ **Corrigido numa segunda passada de revisão, mesmo dia — sessão salva não pegava troca de CARGO, só de status.** A reconferência adicionada no item de suspenso/desligado (acima) só comparava o `status` salvo no celular contra o atual — não o `perfil`. Resultado: alguém rebaixado de Diretor pra Ritmista pela nova tela de trocar cargo, se ainda tivesse uma sessão salva de antes da troca, era mandado pro `admin.html` em vez da própria carteirinha (a permissão de banco já bloqueava qualquer dado real de aparecer lá — `minhas_baterias_admin()` sempre lê o cargo atual, nunca o cache — mas a pessoa via um painel vazio e confuso em vez de cair direto onde devia). Corrigido: a reconferência agora compara `status` **e** `perfil` juntos contra o banco antes de confiar no atalho. Achado ao pedir uma segunda rodada de revisão completa do fluxo depois de publicar a feature de trocar cargo — exatamente o tipo de ponta solta que aparece quando duas mudanças do mesmo dia se cruzam.
- Confirmado (não é bug): uma pessoa só pode ter 1 papel por bateria (`UNIQUE(pessoa_id, bateria_id)`) — não dá pra ser Diretor e Ritmista com instrumento na mesma bateria simultaneamente.

**Confirmado como correto nessa revisão (não mexer):** regra "Mestre aprova Ritmista e Diretor; Diretor só aprova/edita Ritmista" reforçada tanto na tela (`admin.html`) quanto no trigger `aplicar_matriz_edicao_vinculos` — testado, sem brecha. Ninguém consegue se autoaprovar ou trocar o próprio cargo/bateria — travado no trigger pra todo mundo, sem exceção, **inclusive contra edição SQL direta sem sessão de login de verdade** (achado ao testar a feature de trocar cargo: uma tentativa de corrigir dado de teste via SQL puro foi silenciosamente revertida pelo trigger, porque esse contexto não carrega `auth.uid()` — precisou ser feita via chamada autenticada de verdade, como o app faz).

**18/jul/2026, mesma sessão — decisão de arquitetura maior, registrada mas adiada:** a Márcia reconheceu que `admin.html` e `super-admin.html` como duas fachadas separadas foi uma decisão inicial equivocada — ela vai operar sozinha no piloto e não quer precisar "pular" de tela pra ver dado de uma bateria. Minha recomendação (aceita por ela): o modelo de permissão de verdade (RLS) já está correto e não precisa mudar — o que vale unificar é só a camada visual, reaproveitando (não duplicando) a lógica que já existe em `admin.html`, mesmo padrão do motor único de `ficha-perfil.js`. Combinado começar só depois de fechar os gaps da carteirinha. Detalhe: memória `project_unificacao_admin_super_admin` (fora deste repo).

## 32. Redesign completo da carteirinha ("9a") — publicado em produção (11-14/ago/2026)

Redesenho de ponta a ponta de `carteirinha.html` + `styles/carteirinha-tumtu-novo.css`, a partir de um handoff visual gerado numa ferramenta externa ("Claude Design", `docs/handoff-carteirinha-tumtu.md` + `docs/Carteirinha - Redesign.dc.html`). Primeira versão implementada foi de fundo escuro contínuo — rejeitada de cara pela Márcia ("sabe o que me parece? qualquer coisa, menos uma carteirinha") — e substituída pela versão off-white ("9a") a partir de novas telas que ela mandou da mesma ferramenta.

**Frente, estrutura nova:** foto do ritmista em tela cheia no topo (era foto circular com anel colorido), nome/apelido/cargo sobrepostos na foto com scrim (gradiente escuro) por trás pra garantir contraste. Abaixo, bloco central com escola/bateria/CPF sobre um leve tingimento da cor da escola (linear-gradient em `color-mix`) fazendo a transição visual entre a foto e o rodapé sólido — sem ele, o bloco central lia como "formulário solto". Rodapé sólido na cor da escola com "Membro desde" + logo da escola.

**Verso, ajustes:** logo da bateria centralizada e aumentada (borda dourada fixa, não depende mais da cor da escola), QR code de emergência corrigido (estava sendo gerado maior — 110×110px — que a própria moldura de 110×110px com padding, sempre vazando; corrigido pra 86×86px), bloco de Mestre(s) da bateria.

**Achados técnicos relevantes (ficam valendo pra qualquer trabalho futuro de CSS neste projeto):**

- **`color-mix()` não é perceptualmente uniforme entre espaços de cor.** `color-mix(in srgb, ...)` faz a mesma porcentagem de verde parecer visualmente mais fraca que a mesma porcentagem de rosa/magenta — não é bug, é como o olho humano percebe luminância em cada matiz. Sintoma real: o tingimento do bloco central ficava bem visível na escola de cor rosa (Jacarezinho) e quase imperceptível na de cor verde (Imperatriz), com o mesmo número no CSS. Resolvido trocando pra `color-mix(in oklch, ...)`, um espaço de cor pensado pra misturar de um jeito mais parecido com a percepção humana — mesma porcentagem passou a dar resultado comparável em força visual entre hues diferentes.
- **Custom property declarada num ancestral quebra o fallback de `var()` de um ancestral mais alto pra todos os descendentes** — mesmo que a intenção seja só "um valor padrão pra quando o JS ainda não rodou". Encontrado com a borda da logo (`--cor-logo-borda-final`): havia uma declaração `--cor-logo-borda-final: transparent;` dentro do bloco `.carteirinha` "só de segurança", que silenciosamente sobrescrevia o valor de verdade setado via JS num ancestral comum mais alto (`#carteirinhaInner`) — a herança normal de custom property não passa por cima de uma declaração explícita no meio do caminho. Corrigido removendo essa declaração de CSS por completo; o único fallback que sobrevive é o terceiro argumento do `var()` no ponto de uso (`.cf-logo { box-shadow: 0 0 0 2px var(--cor-logo-borda-final, transparent); }`).
- **Degradê com N "paradas" fixas no CSS, usando `var(--cor-N, fallback-pra-cor-N-1)` em cascata, pesa errado quando a escola tem menos de N cores reais.** A barra do topo (degradê horizontal com as cores da escola) foi implementada primeiro como 4 paradas fixas (`--cor-1` a `--cor-4`, cada uma caindo pro fallback da anterior se não existir) — na prática, isso faz a **última cor real se repetir várias vezes** até preencher as 4 posições, dominando a maior parte da barra. Sintoma real: Jacarezinho (só 2 cores, rosa+branco) ficava com a barra 75% branca; Imperatriz (3 cores, verde+branco+dourado) ficava com o dourado ocupando quase metade. Corrigido trocando pra um gradiente **montado em JS** só com as cores reais da escola (`cfg.cores.filter(Boolean)`), setado como custom property (`--gradiente-topbar`) — cada cor que a escola realmente tem pesa igual na barra, não importa se são 2, 3 ou 4.
- **Regra de negócio nova (definida pela Márcia direto em conversa, sem estar em nenhum documento):** a cor da borda da logo da escola (frente do cartão) segue a **última cor cadastrada que não seja branca**, nunca a cor primária — porque a cor primária já domina o resto do cartão, e uma borda na mesma cor "some". Ex.: Rocinha (vermelho, azul, branco) → borda azul, não vermelha nem branca; São Clemente (preto, amarelo) → borda amarela. Sem nenhuma cor não-branca disponível, cai no dourado do TumTu (`escolherCorBordaLogo` em `carteirinha.html`).
- **Espaçamento variável por conteúdo, "travado" num valor de referência.** No verso, a distância entre a logo e o QR code mudava conforme a bateria tinha 1 ou 2 Mestres cadastrados (61px vs 48.7px), porque os dois espaçadores flexíveis (`::before`/`::after` do `.v-content`) absorviam a folga nos dois lados do bloco de Mestre. A Márcia pediu que essa distância fosse sempre igual — resolvido travando só o espaçador de cima (`::before { height: 20.7px; flex-shrink: 0; }`, valor medido de verdade a partir do caso de 2 Mestres) e deixando só o de baixo (`::after`) flexível, absorvendo toda a diferença entre 1 e 2 Mestres.
- **Cache-busting esquecido depois de editar CSS já publicado num branch de preview.** Numa correção pontual (o ajuste de espaçamento acima), o CSS mudou mas o número de versão na URL (`?v=N`, ver regra em `CLAUDE.md`) não foi atualizado junto — resultado: quem já tinha aberto o app continuava vendo a versão antiga, mesmo depois do deploy novo. Lição prática: todo `Edit` em `styles/carteirinha-tumtu-novo.css` precisa vir acompanhado, no mesmo commit, da checagem de `?v=N` em `carteirinha.html` + `sw.js` (`APP_SHELL` e `CACHE_NAME`).

**Fluxo de teste local usado nessa sessão (útil pra replicar em redesenhos futuros):** um script Python (`gerar-teste.py`, vive fora do repositório, na pasta de scratch da sessão) copia o `carteirinha.html` real, troca os caminhos relativos por caminhos absolutos `file:///`, e substitui o bloco `DOMContentLoaded` por um stub com cenários fixos (nome, cores, foto) — permitindo screenshot via Chrome headless (`--headless=new --screenshot=...`) sem precisar de servidor nem depender do Supabase. Sempre regenerado a partir do arquivo de produção real antes de cada rodada de teste, pra nunca testar contra uma cópia desatualizada.

**Workflow de aprovação usado (primeira vez de ponta a ponta neste projeto) — substitui o texto antigo em `CLAUDE.md` sobre `vercel deploy`:** o CLI `vercel` **não está disponível neste ambiente** (confirmado por `command -v vercel`), então o link de teste avulso citado na regra "confirmar antes de subir ao GitHub" do `CLAUDE.md` foi gerado assim:
1. Commits das mudanças num branch dedicado (`preview/carteirinha-redesign-9a`), nunca direto na `main`.
2. `git push` desse branch pro GitHub — o projeto Vercel **`tumtu-app`** (não confundir com o projeto antigo **`ritmistas-app`**, que tem vários deploys avulsos de teste sem uso) está ligado por integração nativa do GitHub e publica um preview automático pra cada branch, sem precisar de nenhum comando manual.
3. A URL estável desse preview é o "branch alias" (formato `tumtu-app-git-<nome-do-branch>-marcia-ritmistas.vercel.app`), igual em todo deploy novo daquele branch — descoberta via ferramenta MCP `list_deployments`.
4. Como esse domínio de preview pede login da Vercel por padrão (SSO Protection ligada no projeto pra tudo que não é domínio próprio) e a Márcia não tem conta lá, a ferramenta MCP `get_access_to_vercel_url` gera um link com token (`?_vercel_share=...`) que libera acesso sem login por ~23h.
5. **Limitação encontrada:** esse link às vezes não funciona pro lado dela mesmo aparecendo certo do lado de cá — a ferramenta que testa do lado do Claude usa uma autenticação própria (a conta Vercel dela via MCP), diferente do fluxo real de cookie que o navegador da Márcia precisa completar. Regenerar o link e pedir pra abrir **direto no navegador** (não de dentro do WhatsApp/Instagram, cujo navegador embutido pode bloquear o cookie que o link depende) resolveu na prática. Alternativa mais robusta, ainda não usada, se voltar a dar problema: desligar a SSO Protection do projeto pros deploys de preview (não é risco de segurança de dado real — quem protege CPF/senha é o RLS do Supabase, não a obscuridade da URL).
6. Só depois da aprovação explícita dela (nesse caso: "Blz, pode publicar"), merge (`git merge --ff-only` do branch de preview) + `git push origin main` — a Vercel publica em produção automaticamente.

**Resultado:** publicado em produção em 14/ago/2026, 7 commits no branch de preview, aprovado depois de 3 rodadas de ajuste fino sobre a versão inicial (intensidade do tingimento, equilíbrio de cor da barra do topo, espaçamento do verso).

## 33. E-mails do Supabase Auth em português — servidor de envio próprio via Resend (14/ago/2026)

A Márcia percebeu que o e-mail de "esqueci minha senha" chegava em inglês. Causa: o Supabase manda esses e-mails automáticos (confirmação de cadastro, redefinir senha, etc.) por um servidor de e-mail genérico deles, compartilhado entre todos os projetos — e por isso **trava a edição do assunto/corpo do template até o projeto configurar seu próprio servidor de envio** ("custom SMTP"). Sem isso, os campos de texto aparecem na tela mas não são editáveis.

**Solução: conta no [Resend](https://resend.com), sob a conta pessoal dela (`marciaserrafr@gmail.com`) — mesmo padrão já usado em GitHub/Vercel/Supabase, decisão explícita pra não fragmentar ferramentas entre a conta pessoal e a `tumtuapp@gmail.com` (essa última reservada só pro papel de Super Admin *dentro* do próprio TumTu).**

**Domínio `tumtu.com.br` verificado no Resend** — região São Paulo (`sa-east-1`, mais perto do público brasileiro; não precisa bater com a localização de quem está configurando, é só sobre onde o servidor de envio roda). DNS do domínio é hospedado direto no **Registro.br** (`e.sec.dns.br`/`f.sec.dns.br`), não na Vercel — confirmado por `nslookup` antes de mexer em qualquer coisa. 4 registros novos adicionados na zona DNS existente, todos em subdomínios que não colidem com o `suporte@tumtu.com.br` (que já usa MX do ImprovMX no domínio raiz):

| Tipo | Nome | Função |
|---|---|---|
| TXT | `resend._domainkey.tumtu.com.br` | Chave pública DKIM (assinatura anti-falsificação) |
| MX | `send.tumtu.com.br` | Recebe confirmações de entrega (bounce) |
| TXT | `send.tumtu.com.br` | SPF (autoriza o Resend/Amazon SES a mandar e-mail em nome do domínio) |
| TXT | `_dmarc.tumtu.com.br` | Política DMARC (`p=none`, modo monitoramento) |

**Detalhe do processo:** o registro DKIM (o mais longo, ~220 caracteres) não salvou na primeira tentativa no painel do Registro.br — sumiu silenciosamente da lista sem erro visível, precisou ser recriado numa segunda tentativa (confirmado via `nslookup -type=TXT` direto no terminal, mais confiável que tentar ler visualmente uma string longa em print de tela — a mesma lógica se aplicou depois, na hora de confirmar o valor: em vez de comparar caracteres a olho entre duas capturas de tela, o certo foi deixar o próprio Resend validar, porque strings base64 longas (1/l/I, 0/O, 5/S, 8/B) são fáceis de ler errado tanto por humano quanto por leitura de imagem). Propagação no Registro.br foi rápida (minutos, não horas) — não precisa trocar de servidor DNS pra isso, só adicionar registro na zona já existente.

**Configuração final no Supabase** (Authentication → Emails → SMTP Settings): sender `suporte@tumtu.com.br` / "TumTu", host `smtp.resend.com`, porta `465`, usuário `resend`, senha = API key gerada no Resend (`re_...`, visível só uma vez no momento da criação). Endereço de remetente reaproveita o `suporte@tumtu.com.br` já existente (o mesmo que encaminha pro Gmail via ImprovMX) — não precisou criar caixa nova.

**Template "Reset password" traduzido** (Authentication → Emails → Templates), mantendo a mesma estrutura simples do template padrão do Supabase, só traduzido — sem redesenho, sem adicionar elemento visual não pedido:
```html
<h2>Redefinir sua senha</h2>
<p>Recebemos um pedido para redefinir a senha da sua conta no TumTu.</p>
<p><a href="{{ .ConfirmationURL }}">Clique aqui para escolher uma nova senha</a></p>
<p>Se você não pediu essa alteração, pode ignorar este e-mail com segurança.</p>
```
Testado de ponta a ponta em produção (`tumtu.com.br/login.html` → "Esqueci minha senha" → e-mail chegou em português na caixa do Super Admin).

**Pendência não resolvida ainda:** os outros templates do Supabase (Confirm sign up, Magic Link, Invite, Change Email, Reauthentication, e as notificações de segurança como "Password changed") continuam no texto padrão em inglês — não foram tocados porque não ficou confirmado com a Márcia se algum deles é realmente enviado hoje pelo fluxo do app (ex: cadastro público pode ou não exigir confirmação de e-mail, depende de uma configuração separada do projeto que não foi checada nessa sessão). Como o SMTP já está configurado, traduzir os demais — se algum deles se mostrar necessário — é só repetir o mesmo padrão de texto, sem infraestrutura nova.

---

## 34. Bug real: e-mail de "cadastro aprovado" não saía do navegador em `super-admin.html` (14/ago/2026)

A Márcia percebeu que o e-mail de "seu cadastro foi aprovado" (Edge Function `notificar-aprovacao`, criada antes desta sessão) não chegava quando quem aprovava era o Super Admin — mas funcionava normalmente quando era o Admin comum. Comportamento intermitente por tela, não por tipo de aprovação (ativação, reativação, primeira bateria, segunda bateria — todas usam o mesmo botão/função).

**Diagnóstico:** os logs do servidor (`get_logs(service='edge-function')`) só mostravam o pedido `OPTIONS` (preflight) chegando — o `POST` de verdade nunca aparecia, mesmo depois de tentar corrigir o CORS às cegas (adicionar `Access-Control-Allow-Methods`, que não resolveu). Ficou claro que o problema era do lado do navegador, não do servidor — mas os logs do servidor não mostram *por que* o navegador bloqueia algo antes de mandar. A virada só veio pedindo pra Márcia abrir o DevTools (F12) → aba Console → tentar de novo, e mandar o print. A mensagem exata:

```
Access to fetch at 'https://pkvzsgrkylrkyzligeim.supabase.co/functions/v1/notificar-aprovacao' from origin 'https://tumtu.com.br' has been blocked by CORS policy: Request header field prefer is not allowed by Access-Control-Allow-Headers in preflight response.
```

**Causa raiz:** `super-admin.html` reaproveita um objeto `headers` único (`{ apikey, Authorization: <anon key fixa>, Content-Type, Prefer: 'return=representation' }`) — criado originalmente pra chamadas diretas à API REST do Postgres (onde `Prefer: return=representation` é necessário/comum) — também na chamada à Edge Function `notificar-aprovacao`. A função, porém, só declarava `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type` — sem `prefer`. O navegador, ao ver um cabeçalho não autorizado, bloqueia o `POST` inteiro antes de mandar (é o próprio CORS fazendo o trabalho dele). `admin.html` nunca teve esse problema porque usa um objeto `authHeaders` separado, mais enxuto, sem `Prefer`.

**Correção:** adicionado `prefer` à lista de `Access-Control-Allow-Headers` da função `notificar-aprovacao` (redeploy, versão 4) — resolve na raiz, sem precisar mexer no front-end nem duplicar objetos de cabeçalho. Testado em produção com e-mail real: chegou.

**Lição pra próxima vez que uma chamada a uma Edge Function "sumir" sem log nenhum de erro no servidor:** pedir print do Console do navegador (F12 → Console) direto, em vez de tentar adivinhar pela lista de headers — a mensagem de erro de CORS é sempre explícita sobre qual cabeçalho foi rejeitado, só que só aparece no navegador de quem está usando, nunca nos logs do servidor.

---

## 35. Ajustes finos: apelido sem aspas, ficha de perfil, arrastar foto, carteirinha "redesign v2" (15/ago/2026)

Sessão de refinamento incremental — nenhuma mudança estrutural nova, só polimento em cima do que já existia. Todo o trabalho passou pelo fluxo normal de branch de preview (`preview/ficha-perfil-apelido-e-foto`) + link de teste da Vercel antes de ir pra `main`.

### Apelido sem aspas
Em todo lugar que mostra o apelido — `carteirinha.html` (frente do cartão e "Meu Perfil"), cards de `admin.html`/`super-admin.html`, cabeçalho da ficha em `ficha-perfil.js` — trocado `"${apelido}"` (aspas literais) por só o texto em itálico dourado, sem símbolo nenhum. Motivo: feedback de pessoas testando o app achando as aspas com "cara de documento", não de apelido de verdade. Foram cogitadas e descartadas alternativas (bolinha ●apelido●, traço –apelido–, fontes diferentes tipo Nunito/Lora/Fraunces — nenhuma "colou" no teste visual) — decisão final foi manter a fonte do app (Plus Jakarta Sans) em itálico, sem símbolo.

### Ficha de perfil (`ficha-perfil.js`/`.partial.html`, `styles/components.css`)
- **Barra de ações fixa (sticky)**: `.ficha-modal-acoes` (Salvar/Cancelar) ganhou `position: sticky; bottom: 0;` com fundo próprio (claro em `admin.html`/`super-admin.html`, escuro dentro de `.ficha-modal-overlay`) — evita ter que rolar até o fim da ficha só pra achar o botão de salvar depois de mexer em algo lá no topo (ex: a foto). Funciona nas 3 telas que reaproveitam o motor (o overlay/container de cada uma já é a própria área com rolagem).
- **Bug real corrigido — arrastar foto não descobrível**: a feature de "arrastar pra reposicionar" (adicionada 14/ago/2026) tinha um bug: clicar na foto (fora do modo de edição) chamava `fpAtivarEdicao()` E JÁ ABRIA o seletor de arquivo do sistema na mesma hora (`fpEl('fp-input-foto').click()`) — a pessoa nunca via a dica "arraste a foto..." nem tinha chance de tentar arrastar a foto já existente antes do seletor de arquivo tomar a tela. Corrigido em `fpAbrirSeletorFoto()`: o primeiro clique na foto agora só entra em modo de edição (revela o botão "Trocar foto" + a dica + libera o arrasto); só um clique subsequente (ou o botão "Trocar foto") abre o seletor de arquivo.

### Carteirinha — "redesign v2" (handoff externo, Claude Design)
A Márcia trouxe um segundo arquivo de handoff (`docs/Carteirinha - Redesign_versao2.dc.html`, não versionado no git, mesmo tratamento do handoff original) com 2 sutilezas em cima do redesign "9a" já publicado:

1. **Traço fino entre escola/bateria e CPF** (frente, `.cf-divider`) — 1px, 120px de largura, centralizado. Erro real no meio do caminho: a primeira implementação colocou o traço DEPOIS do CPF (lendo a posição errada no diff entre os dois arquivos de handoff) — corrigido pra ficar ANTES, entre o cabeçalho e o CPF, depois da Márcia comparar os dois documentos. Cor: começou fixa (dourado translúcido, igual o handoff pedia), mas foi trocada pra **dinâmica** (`var(--cor-logo-borda-final)`, via `color-mix()` pra manter a transparência) — mesma lógica já usada na borda das duas logos, decisão da Márcia pra não ser "mais um elemento dourado solto" e sim parte do mesmo sistema de acento por escola.

2. **Verso reordenado: Logo → Mestre de Bateria → QR** (antes era Logo → QR → Mestre) — identidade da bateria primeiro, dado de emergência do usuário logo abaixo. Foi a parte mais trabalhosa da sessão:
   - `.v-mestre` ganhou `min-height: 72px` (mesma técnica de "altura reservada" já usada no bloco de identidade da frente) pra garantir que o QR fique sempre na mesma distância da logo, com 1 ou 2 Mestres cadastrados — **essa posição fixa do QR é um requisito explícito e antigo da Márcia (13/ago/2026)**, quebrado sem querer 2 vezes ao longo da sessão (uma tentando zerar o espaçador de cima pra resolver desequilíbrio visual, outra sem perceber o efeito colateral de uma mudança) — as duas vezes tiveram que ser revertidas.
   - **Desequilíbrio visual corrigido com matemática, não tentativa e erro**: o vão logo→"Mestre de Bateria" estava maior que o vão nome→QR (a Márcia mandou print comparando os dois com retângulos vermelhos). A solução final: a distância total logo→QR tem que continuar exatamente igual (`header padding + content padding + ::before + min-height do .v-mestre + margin-bottom do .v-mestre` = constante, trava a posição do QR), mas dá pra **redistribuir** quanto fica antes (`::before`, 20.7px → 9.4px) vs depois (`margin-bottom`, 26px → 37.3px) do bloco sem mudar essa soma. Com o texto do Mestre centralizado (`justify-content: center`) dentro do espaço reservado e esses dois valores certos, prova-se algebricamente que os dois vãos ficam sempre iguais entre si — pra qualquer quantidade de conteúdo (1 ou 2 Mestres), porque o espaço vazio de dentro da caixa reservada se divide igual dos dois lados quando ela está centralizada, e a folga "de fora" (::before + margin-bottom) já nasce simétrica em relação ao início/fim dessa caixa.
   - **Traço entre 2 Mestres afinado**: `.v-mestre__sep` (linha entre os nomes quando há 2 Mestres) teve a margem lateral aumentada de 20px pra 40px, deixando o traço mais curto — pedido simples da Márcia, sem impacto em mais nada.
   - **Borda da logo do verso ganhou a mesma lógica dinâmica da logo da frente** — antes era sempre dourada fixa (`.v-logo`), agora usa `var(--cor-logo-borda-final)` igual a frente. Fecha a inconsistência de a frente "respeitar" a cor da escola e o verso não.

**Elementos avaliados e mantidos como já estavam** (a Márcia considerou mudar, decidiu não mexer): a sombra do cartão (achou que era "uma linha" separada embaixo do cartão — é só o `box-shadow` normal, explicado e descartado); a assinatura "TumTu" (T dourado + risco terracota) no rodapé do verso, que É de propósito fixa (cor da própria marca TumTu, não da escola — é a "assinatura" do produto, não da bateria).

## 36. Barra flutuante do Meu Perfil, aviso de e-mail e reformulação do e-mail de aprovação (15/ago/2026)

Sessão iniciada retomando um trabalho interrompido por uma queda de conexão/reinício do computador no meio de uma sessão anterior — nada tinha sido perdido (o `git diff` da sessão anterior estava limpo, só existia um arquivo de repro isolado, `_repro-meuperfil.html`, usado pra investigar o bug abaixo sem precisar reproduzir no app de verdade).

### Três correções na ficha de perfil (`ficha-perfil.js`, `styles/components.css`)

A barra de ações flutuante (`.ficha-modal-acoes`, ver seção 35) trouxe dois problemas novos, relatados pela Márcia depois de testar no celular:

1. **Botão "Cancelar" com o texto cortado, só no celular** — investigado por várias hipóteses erradas antes de achar a causa real (overflow horizontal de um `<select>` com opção longa; layout intermediário de rolagem) — a causa verdadeira só ficou clara com um print real do celular: era o **home indicator do iPhone** (a barrinha de gesto embaixo da tela) cobrindo a barra, porque o TumTu é instalado como PWA `display:standalone` (`manifest.json`) e nesse modo o iOS não reserva espaço pra essa barra sozinho — precisa de `env(safe-area-inset-bottom)` manualmente. Mesma técnica já usada antes no menu fixo de baixo do Super Admin no celular (`.nav-abas`, `super-admin.html`) — só nunca tinha sido aplicada em `.ficha-modal-acoes`. Corrigido com `padding: 16px 0 calc(16px + env(safe-area-inset-bottom));`.
2. **Clicar na foto continuava ativando a edição de TODOS os campos** — fazia sentido quando "Editar" só existia lá embaixo (ver seção 35), mas virou redundante e confuso depois que os botões passaram a flutuar (sempre alcançáveis). `fpAbrirSeletorFoto()` simplificada: clicar na foto fora do modo de edição não faz mais nada; só abre o seletor de arquivo se já estiver editando.
3. **Botão "Fechar" (ou ações extras de admin, via `#fp-acoes-extra`) crescendo a fileira flutuante durante a edição, sem necessidade** — já existe "Cancelar" fazendo esse papel enquanto edita. `fpAtivarEdicao()`/`fpCancelarEdicao()` agora escondem/mostram `#fp-acoes-extra` junto com o resto do modo de edição.

Publicado direto em `main` (branch `preview/meu-perfil-e-aviso-email` → merge fast-forward), pulando o link de teste da Vercel por pedido explícito da Márcia nessa sessão ("pode implementar que eu vou ver em produção mesmo") — desvio pontual da regra normal de aprovação por link antes do `git push` na `main` (ver `CLAUDE.md`), não uma mudança permanente do processo.

### Aviso de e-mail nas mensagens de "aguarde aprovação"

A Márcia notou que a mensagem de "aguarde aprovação" (mostrada logo após o cadastro, e de novo se a pessoa tentar logar antes de ser aprovada) não avisava que um e-mail chegaria depois — mesmo já existindo o e-mail de aprovação (`notificar-aprovacao`, seção 34). Adicionado "você vai receber um e-mail assim que for aprovado" nas 3 mensagens envolvidas: `cadastro.html` (2 variantes — Mestre/Diretor via link fixo vs. Ritmista) e `login.html` (tentativa de login com vínculo `pendente`).

### Reformulação do e-mail de "cadastro aprovado" (Edge Function `notificar-aprovacao`)

Pedido da Márcia: incentivar quem for aprovado a instalar o TumTu como PWA (ícone na tela inicial), já que hoje isso só acontece se a pessoa souber procurar por conta própria. Depois de várias rodadas de ajuste — cada uma testada com um e-mail real disparado pra `marciaserra.ms@gmail.com` (pessoa de teste dela, vínculo `109`/bateria Maricadência) via chamada direta à função com um token de sessão da conta QA (`teste-superadmin@tumtu.com.br`) — chegou nesse formato final:

- **Passo a passo de instalação** (Android via Chrome, iPhone via Safari) embutido no corpo do e-mail, mesmo texto que a Márcia já tinha escrito numa conversa anterior (perdido por não ter sido salvo em arquivo — lição: agora está aqui, documentado, pra não se perder de novo).
- **Endereço por extenso além do link clicável** (`Se o link não abrir direto no navegador... copie e cole: tumtu.com.br/login.html`) — alguns apps de e-mail (Gmail, WhatsApp) abrem o link numa janela própria em vez do navegador de verdade, o que trava a instalação (precisa ser Chrome/Safari nativo).
- **Frase de aprovação sem implicar que o TumTu concede o cargo**: era `"você já é Ritmista da X"`, virou `"Seu cadastro como Ritmista foi aprovado"` — a Márcia apontou que o cargo (Ritmista/Mestre/Diretor) é um fato da vida real da pessoa, o TumTu só aprova o cadastro/acesso.
- **Escola em destaque, sem duplicar "Bateria" nem colocar a bateria entre parênteses**: nome da bateria nem sempre é reconhecível de cara, mas o da escola sim — porém `"Bateria " + nomeBateria` duplicava a palavra quando o nome da bateria já começava com "Bateria" (mesma categoria de bug já corrigido antes no título do convite de cadastro), e parênteses davam a entender que a bateria era só um detalhe secundário (quando na verdade é dela que é a carteirinha). Formato final: `"{cargo} na {escola} — {bateria}"`, ambos em negrito, travessão como separador — mesmo padrão que outras telas do app já usam pra parear escola e bateria.
- **Símbolo da marca (dois círculos) tentado e revertido**: primeira tentativa usou `position:absolute` (como em `.simbolo-marca` de `login.html`) — funcionou na prévia (Artifact, que roda num navegador normal) mas o Gmail real ignora `position` silenciosamente, empilhando os dois círculos um em cima do outro. Segunda tentativa, com tabela HTML (técnica "à prova de balas" de e-mail), também não ficou boa — o círculo grande saiu ovalado no Gmail real. **Removido por enquanto**, ficou só o wordmark "TumTu" em texto (sempre renderiza certo) + linha dourada abaixo. Retomar o símbolo é tarefa futura, não decidida como definitivamente descartada.

Testado de ponta a ponta com e-mails reais (não só a prévia visual) antes de cada aprovação da Márcia — a prévia em Artifact ajudou a decidir textos e layout rápido, mas não substituiu o teste real, já que é exatamente onde o bug do símbolo apareceu.

## 37. Validade da carteirinha configurável por escola — solução provisória (15/ago/2026)

A Márcia notou que a carteirinha já **mostrava** um campo "Válida até" no verso (ao lado de "Temporada"), mas com uma data fixa no código, `31/07/2027` — nunca esteve ligada a nenhum dado real, nem existia essa configuração em lugar nenhum. Ela também apontou que isso precisa ser configurável por escola (cada escola pode ter uma validade diferente).

Decisão explícita da Márcia sobre onde colocar: cogitou criar já uma área dedicada "Configurações → Carteirinha" (mesmo padrão de Instrumentos/Medidas — biblioteca/config própria, com tab no menu), mas optou pelo caminho mais rápido agora — **campo provisório dentro do cadastro de escola já existente**, junto de "Temporada Atual", reaproveitando 100% do padrão que já existe (mesma tabela, mesmo formulário, mesmo modal de editar). A área dedicada fica pra quando o projeto de unificação admin/super-admin entrar (ver roadmap em `CLAUDE.md`) — nada do trabalho de hoje se perde nessa migração futura, o dado já nasce salvo do jeito certo no banco, só muda de lugar na tela depois.

Escopo explicitamente limitado a **só o campo** (guardar e mostrar a data) — **nenhuma lógica de validade foi criada** (não bloqueia acesso, não avisa vencimento, não muda comportamento nenhum). Isso fica pra uma etapa futura, a ser desenhada com calma.

- **Banco**: nova coluna `escolas.validade_carteirinha` (tipo `date`, opcional).
- **Super Admin** (`super-admin.html`): campo "Validade da Carteirinha" (`<input type="date">`) no formulário de nova escola e no modal de editar escola, logo abaixo de "Temporada Atual" — com nota visual pequena avisando que é provisório. O helper `campo()` do modal de editar ganhou suporte a `opts.tipo: 'data'` (formata a visualização com `fpFormatarData()`, de `ficha-perfil.js`, e usa `<input type="date">` em vez de texto).
- **Carteirinha** (`carteirinha.html`) e o **pré-carregamento em `login.html`** (mesma arquitetura de cache da seção 24 — a carteirinha nasce pronta, sem estado intermediário): ambos passaram a buscar `validade_carteirinha` junto com o resto dos dados da escola, e o card mostra a data formatada (`DD/MM/AAAA`) ou "—" quando vazia (nenhuma escola tinha essa data até a Márcia preenchê-las manualmente logo depois de publicar).

## 38. Bug real: QR sobe quando a bateria não tem nenhum Mestre cadastrado (15/ago/2026)

A Márcia criou uma carteirinha de teste numa bateria sem nenhum Mestre cadastrado e viu o QR fora do lugar de sempre — quebra direta do requisito explícito dela desde 13/ago/2026 ("o QR code era fixo, eu pedi isso"), que já tinha sido protegido com cuidado matemático pros casos de 1 e 2 Mestres (seção 35).

**Causa real**: `renderMestres()` (`carteirinha.html`) buscava os Mestres da bateria e, quando a lista vinha vazia, dava `return` cedo — nunca chegava a tocar em `#c-mestre-bloco`, que ficava com o `display:none` padrão do HTML. Só que é justamente **esse bloco** (`.v-mestre`, com `min-height: 72px` + `margin-bottom: 37.3px`, ver seção 35) que reserva o espaço fixo entre a logo e o QR — com `display:none`, o elemento sai do fluxo por completo e leva esse espaço reservado junto. Os casos de 1 e 2 Mestres nunca expuseram esse bug porque o bloco sempre ficava visível nesses casos (só o *conteúdo* dele variava); só o caso de **zero Mestres** deixava o bloco inteiro escondido.

**Correção**: `renderMestres()` agora sempre termina com `bloco.style.display = 'flex'`, em qualquer cenário (0, 1 ou 2 Mestres, e até em caso de erro na busca) — só o *conteúdo* interno (`container.innerHTML`/`label.textContent`) fica vazio quando não há Mestre. O bloco vazio, com seu `min-height` reservado, ocupa exatamente o mesmo espaço que ocupava com conteúdo, mantendo o QR sempre na mesma posição — mesmo raciocínio de "espaço reservado" já usado pros casos de 1/2 Mestres, agora estendido pro caso de zero.

## 39. Cadastro: dados do responsável quando a pessoa é menor de idade (17/ago/2026)

A Márcia começou a receber apoio de um diretor de bateria real, trazendo mais requisitos pro sistema — esse é o primeiro deles. Antes de implementar, ela também pediu uma **avaliação** (sem implementar nada) sobre criar uma permissão restrita "só ver Ritmistas e aprovar/rejeitar cadastro" — achado principal dessa avaliação, registrado aqui pra não se perder: os campos `vinculos.nivel_acesso`/`nivel_acesso_id` já existem no banco desde a migração pessoa/vínculo (13/jul/2026, seção 22) exatamente pra esse propósito futuro, mas nunca foram conectados a nenhuma regra de verdade (RLS ou trigger) — hoje só existe o valor "Total". Implementar essa permissão exigiria: (1) popular um novo valor nesse campo, (2) estender o trigger `aplicar_matriz_edicao_vinculos` (mesma função documentada na seção 22) pra travar campos com base nesse nível, não só no `perfil` do ator, (3) esconder o resto da tela do Admin pra esse nível, e (4) decidir se esse nível também vê dado sensível (CPF/endereço/etc.) do ritmista ou só os campos mínimos pra decidir aprovar — hoje toda a família RLS de `pessoas`/`vinculos` é por linha, não por coluna, então "ver menos campo" exigiria uma view própria. Avaliação: complexidade média, não iniciada.

### O que foi implementado

Ao preencher a Data de Nascimento, o formulário calcula a idade no navegador (mesma técnica de validação de data já usada) e, se a pessoa for menor de idade, revela um bloco pedindo Nome e CPF do responsável, os dois obrigatórios enquanto visível.

- **Idade de corte**: `IDADE_MAIOR = 18` (maioridade civil padrão) — provisório, a Márcia ainda vai confirmar o número certo com o diretor (cogitou 16); constante isolada em `cadastro.html`, fácil de trocar quando ela confirmar.
- **Banco**: novas colunas `pessoas.responsavel_nome`/`responsavel_cpf` (texto, opcionais) — mesma tabela de `emergencia_nome`/`emergencia_parentesco` (dado da pessoa, não do vínculo).
- **Cadastro** (`cadastro.html`): campos ficam **depois de todos os dados da própria pessoa** (não logo após Nascimento) — pedido explícito da Márcia, "fica confuso pedir dado do responsável no meio dos dados da pessoa". Revelados via `display:block/none` direto (não a classe animada `.campo-revelavel`/`.aberto`, pensada só pra campo único dentro da própria linha, tipo Nacionalidade/"Como se identifica") — usar a animação numa linha inteira nova como essa somava um `margin-top` extra por cima do espaçamento normal entre linhas, criando um vão desproporcional (achado real da Márcia, com print). Segue o mesmo padrão simples já usado em `#bloco-documento` (a mesma categoria de "linha inteira que aparece/some").
- **Ficha de perfil compartilhada** (`ficha-perfil.js`/`.partial.html` — Meu Perfil/Admin/Super Admin): dois novos campos em `FP_CAMPOS`, mesma matriz de permissão de "Data de nascimento" (só Super Admin edita; autoedição e Admin editando ritmista veem só leitura — nunca ficam com o campo aberto pra digitar, já que nem a Márcia quis abrir esse tipo de dado sensível pra edição ampla). A linha some por completo quando a pessoa não tem dado de responsável (maior de idade, ou cadastro anterior a essa feature) — mesmo critério de "Documento"/"Como se identifica". Campos ficam no fim de "Dados pessoais" (depois de "Cadastro"), mesmo motivo do cadastro.

**Limite conhecido, aceito por ora**: igual ao já existente em "Como se identifica" (gênero), não existe recálculo ao vivo dentro do modo de edição da ficha — se o Super Admin mudar a Data de Nascimento de alguém cruzando a linha de maior/menor idade, o bloco de responsável só reflete isso na próxima vez que a ficha for aberta (depois de salvar), não instantaneamente enquanto edita. Não foi pedido, e é o mesmo comportamento que o resto do app já tem pra casos parecidos.

## 40. Tema por escola no painel de gestão + rodada grande de ajustes do Admin + redesign do Exportar Excel (18/ago/2026)

Sessão longa, publicada em produção de uma vez via branch `preview/tema-por-escola`. Cobre uma feature nova (tema visual por escola no `admin.html`), uma leva de bugs reais encontrados por ela testando ao vivo (celular + desktop), e três rodadas de iteração no modal de Exportar Excel até chegar num formato aprovado.

### 40.1 Tema por escola (cor + logo) no cabeçalho do Admin

Pedido de UX real, validado numa conversa com a escola Imperatriz Leopoldinense: o painel de gestão (`admin.html`, usado por Mestre/Diretor) ganhou a opção de mostrar a cor e a logo da escola no cabeçalho, no lugar da marca TumTu — mas **opcional, por escola** (nem toda escola quer isso; a Márcia já tinha em mente escolas com vermelho saturado como cor principal).

- Nova coluna `escolas.tema_personalizado_ativo` (boolean, padrão `false`) — interruptor controlado pelo Super Admin em Escolas → Dados da Escola, mesmo padrão do já existente "Modo Carteirinha". Desligado por padrão: zero mudança visual pra quem não ligar.
- Escopo intencionalmente restrito ao **cabeçalho** (fundo + logo) — não é repintura de tela inteira; listas/formulários/botões continuam neutros. Reaproveita o mesmo mecanismo de cor dinâmica já construído pra `carteirinha.html` (`cor_primaria`/`secundaria`/`terciaria`/`quaternaria`, cálculo de contraste de texto).
- **Super Admin nunca é afetado** — a regra é "esta visão está presa a uma única escola?", não "isto é `admin.html`?": sobrevive à futura unificação Admin+Super Admin (ver seção 40.6) sem precisar ser reescrita, porque o gatilho é 100% baseado em dado (`temaPersonalizadoAtivo` só existe quando uma escola específica já foi resolvida), nunca no nome do arquivo.
- Marca "TumTu" nunca desaparece de vez — vira uma assinatura discreta e sempre visível no rodapé do painel (`<footer class="rodape-tumtu">`), ligado ou desligado o tema.
- **Ajustes pós-teste real** (Imperatriz, verde): logo foi de 32px empilhada pra 52px ao lado do nome (layout virou linha, não coluna); texto/botões trocaram de "contorno translúcido sem graça" pra texto branco+sombra (ou escuro, calculado por contraste) com botões de fundo sólido claro — fica nítido em qualquer cor de escola sem precisar acertar o tom exato; anel da logo usa a cor real da escola (mesma lógica `escolherCorBordaLogo`/`corEhBranca` de `carteirinha.html`, duplicada aqui) em vez de halo branco fixo; "Minha Carteirinha" virou pílula dourada de ação principal.
- **Bug real corrigido**: cabeçalho "piscava" preto antes de aplicar a cor da escola, porque `login.html` só buscava o cache de cor/logo (`localStorage`, chave `tumtu_cfg_<id>`) com antecedência pro caminho da carteirinha, nunca pro caminho do Admin. Corrigido estendendo esse mesmo cache antecipado pros três redirecionamentos de `login.html` pro `admin.html` (sessão salva, login manual, trocar de bateria) + nova `aplicarCacheConfigEscolaAntecipado()` em `admin.html`, chamada bem no início, antes de qualquer busca de rede.

### 40.2 Cabeçalho/rolagem: página passou a ter um único scroll real

Achado repetido da Márcia (duas vezes) num print mostrando a barra de rolagem do navegador cortando por dentro do cabeçalho verde: o cabeçalho era só `position:sticky`, o que funciona visualmente mas não estruturalmente — a página inteira (`body`) continuava sendo uma coisa só rolando, então a barra de rolagem do navegador somava a altura do cabeçalho junto com o resto.

**Correção estrutural**: `body` virou uma coluna flexível travada do tamanho exato da tela (`height:100dvh; overflow:hidden`, nunca rola sozinho). O cabeçalho ficou de fora, sempre visível, sem precisar de sticky. Tudo abaixo dele (nav-abas + main + footer) entrou num novo contêiner `.conteudo-rolavel` (`flex:1; min-height:0; overflow-y:auto`) — esse é o único scroll de verdade agora, e a barra de rolagem do navegador nasce e morre dentro dele, nunca sobe até o cabeçalho.

Efeito colateral encontrado e corrigido: `styles/tokens.css` reserva sempre o espaço da barra de rolagem vertical no `<html>` (`scrollbar-gutter:stable`, pensado pra outras telas não "pularem" de largura trocando de aba). Enquanto era o `body` que rolava, essa reserva e a barra de verdade eram a mesma coisa — sem gap visível. Depois da correção acima, a reserva continuava no `<html>` mesmo sem nenhuma barra real ali, sobrando um vão vazio cortando o cabeçalho. Corrigido: `scrollbar-gutter:auto` no `<html>`, `scrollbar-gutter:stable` movido pra `.conteudo-rolavel` (quem rola de verdade agora).

### 40.3 Bug real: botão "Editar" da ficha do ritmista não flutuava (só quando Ativo/Suspenso)

Causa raiz, achada reproduzindo ao vivo no navegador (abrindo o ritmista exato que ela estava testando, rolando passo a passo): existiam **duas barras `position:sticky;bottom:0` separadas** competindo no mesmo contêiner de rolagem — a do motor de ficha (`.ficha-modal-acoes`, dentro de `#fp-container-ritmista`) e uma segunda, mais antiga (`.modal-acoes-ficha`/`#modalCadastroAcoes` + botão Fechar), que envolvia a primeira. Quando duas barras sticky-bottom existem em sequência no mesmo scroll container, só a **última** no DOM consegue de fato "grudar" durante a maior parte da rolagem — a mais cedo fica estruturalmente impedida de flutuar, porque sticky respeita o conteúdo seguinte.

**Correção**: a segunda barra foi removida por completo — seu conteúdo (botões de ação por status: Ativar/Rejeitar, Suspender/Desligar, Reativar, + Fechar) passou a ser injetado dentro do hook `#fp-acoes-extra`, já existente na partial compartilhada (`ficha-perfil.partial.html`) exatamente pra esse fim (mesmo padrão que `carteirinha.html` já usava pro próprio botão "Fechar"). Resultado: uma única barra flutuante, que também ganha de graça o comportamento de esconder/reaparecer durante o modo de edição que o motor de ficha já tinha pra esse hook.

De caminho, o modal da ficha do ritmista (`#modalCadastroOverlay`/`.modal-cadastro`, distinto do modal da Diretoria `#modalAdmin`) nunca tinha recebido nenhum tratamento de rolagem própria — corrigido com o mesmo padrão já validado: overlay do tamanho real da tela rola, a caixa cresce livre sem `max-height`/cálculo de `vh` (à prova do "100vh mentiroso" do celular com barra de endereço visível), `align-items:flex-start` no overlay (necessário pra rolagem funcionar de forma confiável entre navegadores — centralizar verticalmente E permitir rolagem ao mesmo tempo é inconsistente).

### 40.4 Ajustes visuais e de fluxo no Admin

- **Fundo cinza atrás dos botões da ficha**: achado dela ("pq não dá pra entender que é uma barra") — `.ficha-modal-acoes` usa a cor de fundo geral do painel por padrão, correto quando fica direto numa página (Meu Perfil), mas dentro de um modal (caixa branca) esse cinza aparecia como retângulo sem explicação. Sobrescrito pra branco só dentro dos modais de Ritmista/Diretoria (`#modalCadastroOverlay .ficha-modal-acoes`, `#modalAdmin .ficha-modal-acoes`) — a regra compartilhada em `components.css` não mudou, preservando a aparência correta do Meu Perfil.
- **Cabeçalho**: nome da escola e nome da bateria ganharam estilos separados (escola em caixa normal, bateria em caixa alta com leve espaçamento) — mesmo tratamento que a carteirinha já usa (`.cf-escola`/`.cf-bateria`).
- **Rodapé "TumTu"**: respiro reduzido (padding de 28/26px para 16/14px, fonte de 15px para 13px) — tamanho exagerado pra uma assinatura que era pra ser discreta.
- **Foto obrigatória no autocadastro**: `cadastro.html` sempre teve uma pré-visualização de foto no Passo 1, mas ela nunca era de fato enviada pro banco — `previewFoto()` só trocava o `innerHTML`. Corrigido (redimensiona pra no máximo 1000px + converte pra base64, mesma técnica de `ficha-perfil.js`) e virou **obrigatória só no autocadastro** (link público/fixo) — no cadastro manual (Mestre/Diretor/Super Admin cadastrando outra pessoa) vira só um aviso, e pessoa que já tem cadastro (entrando numa bateria nova) fica dispensada. Edge Function `admin-create-user` também ganhou os campos que estavam faltando no objeto `dadosPessoa` do cadastro manual (`foto_url`, `responsavel_nome`, `responsavel_cpf`, `responsavel_celular`) — estavam sendo enviados pelo cliente e descartados silenciosamente no servidor.
- **"Celular do responsável"**: terceiro campo do responsável de menor de idade (ao lado de Nome/CPF, seção 39), mesmo padrão/rótulo do "Celular" de Contato de Emergência.
- **Foto quadrada na Diretoria**: `.dir-foto` (Mestres/Diretores) estava redonda, virou quadrada (`border-radius:8px`) — igual `.card-foto` dos Ritmistas, mesmo padrão do redesign "9a" da carteirinha (14/ago/2026).
- **Filtro padrão de Ritmistas**: virou "Ativos + Pendentes" (era "Todos os status") — lista completa com suspenso/desligado/rejeitado "polui o dia a dia", nas palavras dela. "Limpar filtro" continua sendo o jeito de ver todo mundo.
- **Agrupamento por status**: tanto a lista de Ritmistas quanto a de Diretoria (Mestres/Diretores) passaram a mostrar um título de seção (`.secao-titulo`) antes de cada grupo, em vez de uma lista corrida sem separação.
- **`.tt-m` (traço do M do wordmark)**: unidade fixa em `px` virou `em`, pra escalar proporcionalmente em qualquer tamanho que a marca for reaproveitada (rodapé pequeno vs. título grande de login) — sem isso, o traço ficava desproporcional em usos menores.

### 40.5 Redesign do modal "Exportar Excel" — três rodadas até aprovar

O modal já tinha ganhado nesta mesma sessão: filtro de Status/Instrumento embutido nele mesmo (antes dependia só do filtro já aplicado na lista de fora, achado dela: "não vi a opção de escolher por status e instrumento"), separação por instrumento (uma aba por instrumento no mesmo arquivo, pedido real de um Diretor pra montar lista de camisas), e título dentro de cada aba da planilha.

**Rodada 1 — bug de alinhamento.** Print dela ("está totalmente desconfigurada") revelou a causa: a regra `.modal input { width:100%; ... }` (pensada pra campos de texto/select) também pegava checkbox e radio — o input invisível esticava pra ocupar a linha inteira, empurrando o texto do rótulo pra longe (mais visível nos radio, sozinhos numa linha cheia; os checkboxes de "Dados pessoais" já escapavam disso com uma classe própria). Corrigido de forma geral: `.modal input:not([type="checkbox"]):not([type="radio"])` na regra de largura, e `.modal input[type="checkbox"], .modal input[type="radio"] { width:auto; margin-bottom:0 }` — não depende mais de lembrar de adicionar uma classe em cada campo novo.

**Rodada 2 — redesign completo, rejeitado.** Pedido dela ("use sua expertise de UX designer, faça o seu melhor") motivou uma reformulação: Status/Instrumento viraram etiquetas clicáveis (preenchimento escuro quando marcadas, mesma linguagem visual de `.btn-filtro` já usada nos filtros da lista de Ritmistas), e "Como você quer o arquivo" virou dois cartões em vez de radio solto. **Rejeitado por ela na hora**: "achei os botões desordenados... 'Como você quer o arquivo' não tá com cara de algo que possa ser selecionável... antes com os checks estava mais intuitivo, mas estava bagunçado". Lição: checkbox/radio nativos são uma affordance reconhecível por ela — a "bagunça" original não era o tipo de campo, era falta de organização/espaçamento.

**Rodada 3 — checkbox/radio de verdade, organização mantida.** Reversão pro campo nativo, preservando as melhorias de organização da rodada 2 que não foram o alvo da reclamação (as 3 seções — Quem exportar / Formato / Quais dados — com respiro e divisória entre si; `accent-color` dourado nos checkboxes; resumo com o número em negrito):
- Status/Instrumento: `display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))` em vez de `flex-wrap` — linhas retas e alinhadas, em vez de parede torta de etiquetas de largura variável.
- Formato do arquivo: radio nativo visível dentro de uma caixinha com borda (`.exp-radio-linha`), que ganha borda/fundo dourado quando marcada — fica claro que é selecionável (bolinha reconhecível) *e* qual das duas opções está valendo, sem esconder o radio.
- Todo seletor novo usa `.modal label.xxx` (não só `.xxx`) de propósito: a regra genérica `.modal label { display:block; font-weight:bold; ... }` (pensada pros `<label>` de campo de formulário comuns) tem especificidade class+elemento — uma classe sozinha perderia esse empate e o `display:block` vazaria por cima, repetindo a mesma causa-raiz do bug da Rodada 1.
- **Ajuste final**: "Sem instrumento" removido do filtro de Instrumento — instrumento é obrigatório pra todo ritmista (o único caso visto, uma pessoa de teste, era sobra de dado antigo, corrigida por ela direto no banco). `listaFiltradaExportacao()` simplificado (sem o "balde" especial pra ritmista sem instrumento). Atalhos "Marcar todos / Limpar" adicionados pro Status e pro Instrumento (mesmo padrão que "Quais dados incluir" já tinha) — pedido dela, marcar um por um fica trabalhoso com muitos instrumentos cadastrados.

### 40.6 Próximo passo combinado: unificação Admin + Super Admin

Ao longo da sessão, ela notou que os ajustes de UX (filtro padrão, agrupamento por status, fotos quadradas, etc.) estavam sendo feitos só em `admin.html`, sem replicar em `super-admin.html` — os dois arquivos têm telas parecidas (Ritmistas, Diretoria) mas código totalmente duplicado, e cada rodada de polimento feita só num lugar aumenta a divergência entre eles. Ela confirmou: **o próximo passo grande é a unificação Admin + Super Admin numa fachada só, com abas que aparecem/somem por permissão** — projeto já cogitado desde 18/jul/2026, adiado até os gaps de segurança (seção 31) e a feature de trocar cargo estarem prontos (ambos já resolvidos). Ponto importante a carregar pra esse projeto: os ajustes desta sessão (tema por escola, filtro padrão de status, agrupamento, fotos quadradas, modal de Exportar Excel redesenhado, correção de scroll/cabeçalho) devem servir de referência de como a tela unificada deve se comportar — não é só "juntar os dois arquivos", é levar o resultado já testado e aprovado dela pra dentro da tela nova.

## 41. Unificação Admin + Super Admin — permissões reais por pessoa, RLS de verdade, Escolas DEMO x reais (19/ago/2026)

Projeto grande, publicado em produção via branch `preview/unificacao-etapa2` (8 commits), em 4 entregas — cada uma testada ao vivo no navegador (login real, não só revisão de código) e aprovada por ela num link de prévia antes da próxima. `super-admin.html` foi apagado — `admin.html` é agora o único arquivo, usado por Super Admin, Mestre e Diretor.

### 41.1 Estrutura nova: barra lateral (Super Admin) + abas por escola (todo mundo)

- **Prévia de navegação primeiro (Etapa 1)**: antes de tocar em qualquer código, um Artifact estático (fora do repositório, só pra validação visual) simulou os 3 casos — Super Admin, Admin com acesso total, Admin restrito — pra ela aprovar o formato do menu sem risco. Ela pegou aí um detalhe real que quase se perdeu: o menu vertical lateral do Super Admin (`nav-abas` em `super-admin.html`, reformulado e aprovado em 21/jul/2026 por dar mais espaço de tela pras listas) **não devia virar aba horizontal** só por causa da fusão — ficou como estava.
- **Fusão real (Etapa 2)**: `admin.html` ganhou uma barra lateral nova (classes `.sa-sidebar`/`.sa-sidebar-item`, só existe quando `usuarioLogado.perfil === 'super_admin'`) com 4 itens exclusivos de Super Admin — `Dashboard` (agregado), `Escolas` (lista, clicar entra no contexto de uma), `Configurações` (biblioteca mestre global: Instrumentos, Medidas) e `Privacidade` (LGPD). Dentro do contexto de uma escola (Super Admin que clicou nela, ou Mestre/Diretor que já cai direto na própria — sem passar por "Escolas"), a barra horizontal de abas (`.nav-abas`/`.aba-btn`, já existente) ganhou módulos novos.
- **`bateriaIdContexto()` mudou de fonte**: antes resolvia via `localStorage.ritmista.bateria_id` ou o parâmetro de URL `?superadmin=true&bateria_id=` (o antigo "modo espiar", que abria `admin.html` numa aba nova fingindo ser aquela bateria). Esse parâmetro de URL foi **aposentado** — Super Admin agora navega Escolas → [escola] dentro da mesma tela, com o `bateria_id` guardado em memória (`saBateriaContexto`), sem precisar de aba nova nem de simular ninguém.
- **Tema de escola vazando pro painel do Super Admin (bug real, achado por ela testando)**: `aplicarConfigEscola()` sabia *aplicar* a cor/logo da escola no cabeçalho, mas nunca sabia *desfazer* — voltar de uma escola com tema ligado pro Dashboard/Escolas/Configurações/Privacidade deixava o cabeçalho preso na cor/logo da última escola visitada. Corrigido com `resetTemaHeaderPadrao()`, chamada tanto no início de `aplicarConfigEscola()` (evita vazar de uma escola pra outra) quanto em `mostrarShellSA()` (evita vazar da escola pro próprio painel).

### 41.2 Sistema de permissões: de perfil nomeado pra direto por pessoa (mudança de rumo no meio da conversa)

O sistema de permissões já existia pronto havia semanas (`niveis_acesso`/`escola_niveis_acesso`, lista `CAPACIDADES_NIVEL_ACESSO`, campo `vinculos.nivel_acesso_id`) mas **nunca tinha sido ligado a nenhuma tela real** — puro cadastro sem efeito. Na Etapa 2, ele foi portado pra `admin.html` tal como estava (perfil nomeado tipo "Total", escolhido num dropdown "Nível de Acesso" na ficha de Diretoria).

Ela testou e **rejeitou esse modelo** por dois motivos, na ordem em que foram descobertos:
1. **Indireto demais** — "eu não consigo selecionar um usuário e definir quais módulos eu quero que ele tenha acesso": criar/nomear um perfil numa tela separada antes de poder atribuir algo a alguém não bateu com o jeito que ela queria trabalhar (pouca gente por bateria, cada pessoa com sua combinação própria).
2. **Vazamento de informação, se a lista de capacidades tivesse morado dentro da ficha de Diretoria** (proposta intermediária, também descartada): qualquer pessoa com acesso normal à Diretoria (pra ver/aprovar Ritmistas ou Mestres/Diretores) enxergaria o que **qualquer outra pessoa** pode ou não fazer no sistema, só por abrir a ficha dela.

**Modelo final**: nova coluna `vinculos.capacidades` (jsonb, ex: `{"ver_ritmistas": true, "editar_ritmistas": false, ...}`) — cada pessoa marca suas próprias capacidades, sem perfil nomeado no meio. A aba **"Permissões"** continua existindo (mesmo nome de antes) mas o conteúdo virou outra coisa: uma lista de pessoas (Mestres/Diretores da bateria) + um editor de capacidades por pessoa, agrupado por módulo (par `ver_X`/`editar_X`) — **isolada da ficha de Diretoria de propósito**, só visível/editável por quem tiver a própria capacidade `ver_permissoes`/`editar_permissoes`. Ter acesso à Diretoria não dá acesso nenhum a essa aba.

18 capacidades ao todo: `ver_ritmistas`, `aprovar_ritmistas`, `editar_ritmistas`, `ver_acessos`, `aprovar_acessos`, `ver_visao_geral`, `ver_dados_escola`/`editar_dados_escola`, `ver_dados_bateria`/`editar_dados_bateria`, `ver_comercial`/`editar_comercial`, `ver_convites`, `ver_relatorios`, `ver_configuracoes`, `editar_configuracoes`, `ver_historico`, `ver_permissoes`/`editar_permissoes`. Toda pessoa nasce sem nenhuma capacidade marcada (`'{}'::jsonb`) — intencional: ela vai atribuir capacidade por capacidade, pessoa por pessoa, a partir da semana que vem, quando o piloto de verdade começar. Hoje, com só dado de teste no sistema, isso não afeta ninguém real.

Aprovar/rejeitar Diretor pendente também mudou de regra: antes era hardcoded "só um Mestre aprova" (`souMestre`); agora é regido por `aprovar_acessos` — qualquer pessoa com essa capacidade aprova, Mestre ou Diretor. Isso foi pedido implícito dela (quer poder criar um "Diretor Admin" com mais poder que os outros Diretores da mesma bateria).

**Teto que não muda nunca**: `pessoas.super_admin` (o boolean que faz alguém ser Super Admin de verdade) fica **fora desse sistema inteiro** — nunca lido/escrito por nenhuma policy nova, nunca aparece em UI nenhuma. Mesmo uma pessoa com as 18 capacidades ligadas não vira Super Admin.

### 41.3 Segurança real no banco (RLS), não só esconder aba — e um incidente que ela pediu pra documentar bem

Ela foi explícita: a trava tinha que ser de verdade no banco, não só visual (esconder botão resolve suposição, não impede alguém de chamar a API direto). Implementado:

- Função `tenho_capacidade(chave text, p_bateria_id bigint)` (`SECURITY DEFINER`) — resolve o vínculo da pessoa logada naquela bateria e checa se a chave está `true` em `vinculos.capacidades`.
- Policies novas de UPDATE em `escolas`/`baterias` — **não existia nenhuma liberação de UPDATE pra Admin comum antes disso**, só Super Admin escrevia. Agora libera quando `is_super_admin()` OU `tenho_capacidade('editar_dados_escola'/'editar_dados_bateria', ...)`.
- `vinculos` SELECT dividido por `perfil`: ver ritmista exige `ver_ritmistas`, ver mestre/diretor exige `ver_acessos` — sem a capacidade certa, a linha simplesmente não vem na resposta da API, não é só escondida na tela.
- Trigger de matriz de edição (`aplicar_matriz_edicao_vinculos`) estendida: editar o campo `capacidades` de alguém exige `editar_permissoes` **e** que o alvo não seja a própria pessoa — ninguém edita a própria capacidade, nem Super Admin precisa disso (ele já ignora o sistema inteiro).
- `baterias.modo_piloto` especificamente exige `editar_comercial` — mesmo que a pessoa tenha `editar_dados_bateria`, não basta; é a decisão comercial ("Comercial", seção 41.4) protegida à parte.
- Testado de propósito tentando furar via API direto (não só pela tela), logada como uma pessoa de teste sem a capacidade: tentativa de ligar Modo Carteirinha sem `editar_comercial` foi aceita pela API (200) mas **desfeita pela trigger**, o valor real no banco nunca mudou; tentativa de se autoconceder `editar_permissoes` teve o mesmo resultado.

**O incidente (achado no meio do trabalho, corrigido antes de qualquer prévia ser mostrada, mas registrado porque ela pediu pra sempre revisitar isso)**: a view `ritmistas_com_instrumento` — a mesma que teve o vazamento anônimo de CPF/telefone corrigido em 18/jul/2026 (seção 31), protegida desde então por `security_invoker=true` — precisou ser atualizada nesta sessão pra também expor a nova coluna `capacidades`. A única forma de mudar o que uma view seleciona, no Postgres, é `CREATE OR REPLACE VIEW` reescrevendo a "receita" inteira. **`security_invoker` não é parte dessa receita — é uma opção separada, grudada na view por fora (`ALTER VIEW ... SET (security_invoker = true)`), e `CREATE OR REPLACE VIEW` reseta essa opção pro padrão de fábrica (`false`) mesmo que ninguém tenha mexido nela de propósito.** `security_invoker=false` faz a view rodar com o dono dela, não com quem está de fato consultando — foi exatamente esse mecanismo que causou o vazamento original de julho.

A checagem de segurança que sempre roda ao final de qualquer mudança de banco (`get_advisors`) pegou isso ainda dentro do mesmo trabalho — religado (`ALTER VIEW ritmistas_com_instrumento SET (security_invoker = true)`) e **reconfirmado direto no banco** (`select reloptions from pg_class where relname = 'ritmistas_com_instrumento'` → `security_invoker=true`) antes de qualquer link ser mostrado a ela. Nunca ficou exposto de verdade — nem em produção, nem no link de prévia.

**Regra a carregar pra sempre** (o motivo de documentar isso com tanto detalhe): **toda vez que uma view protegida por `security_invoker=true` precisar ser alterada com `CREATE OR REPLACE VIEW`, reaplicar e reconferir essa opção depois, sem exceção.** Views protegidas hoje: `ritmistas_com_instrumento`. Rodar `get_advisors` (tipo `security`) depois de qualquer migração que toque em view é o hábito que pega isso — mas não é infalível o suficiente pra confiar cegamente; **checar o `reloptions` da view direto por SQL é o jeito de ter certeza absoluta**, e deveria ser passo padrão sempre que uma migração tocar numa view com esse tipo de proteção.

### 41.4 "Comercial" — Modo Carteirinha como módulo próprio, separado de Dados da Bateria

Pedido dela: o interruptor Modo Carteirinha (`baterias.modo_piloto`) saiu de dentro de "Dados da Bateria" e virou aba própria, **"Comercial"** (nome final — passou por "Modo de Venda" antes de ela pedir o ajuste de nome). Motivo: é uma decisão comercial (ex: vender só a carteirinha pra uma bateria que não quer o módulo de gestão completo), não um dado operacional do dia a dia da bateria — ela quer poder, no futuro, nunca conceder esse módulo a ninguém além dela mesma, mesmo que libere "Dados da Bateria" pra alguém de confiança. Reserva espaço pra outras decisões comerciais parecidas que possam surgir.

### 41.5 Escolas DEMO x reais

Novo campo `escolas.tipo` (`real`/`demo`, padrão `real`) — resolve um problema real dela: escolas de demonstração (pra mostrar o sistema a possíveis clientes) misturadas com escolas de verdade, poluindo os números que ela acompanha. Etiqueta "DEMO" nos cards da lista de Escolas; a partir de 19/ago/2026 (pedido dela, mesma sessão), a lista de Escolas do Super Admin também **separa visualmente** — escolas reais direto, sem título; escolas DEMO agrupadas embaixo com título "DEMO" (mesmo padrão `.secao-titulo` já usado em Diretoria pra Mestres/Diretores). `carregarDashboard()` conta só `tipo=eq.real` nos KPIs principais; a contagem de escolas DEMO aparece à parte, discreta.

### 41.6 O que ficou como legado, não apagado

`niveis_acesso`, `escola_niveis_acesso` e a coluna `vinculos.nivel_acesso_id` **não foram apagados do banco** — só pararam de ser usados por qualquer tela ou policy nova. Mesma linha de cautela já usada com a tabela antiga `ritmistas`: dado morto que não atrapalha nada ficando aí, fácil de limpar de verdade quando ela confirmar que não precisa mais. Perguntar antes de apagar, não presumir.

### 41.7 Pendências pequenas conhecidas

- **Configurações da bateria** (Instrumentos/Vagas/Medidas): quem só tem `ver_configuracoes` (sem `editar_configuracoes`) já é bloqueado de verdade no banco se tentar salvar, mas os controles da tela ainda não ficam visualmente desabilitados pra essa pessoa antes da tentativa — só um polimento visual, não é falha de segurança.
- **Ativar/Desativar uma escola ou bateria inteira** ficou sempre exclusivo de Super Admin, mesmo que `editar_dados_escola`/`editar_dados_bateria` esteja liberado — decisão tomada durante a implementação (mais pesada que editar um campo comum), não chegou a ser perguntada a ela antes. Se um dia ela quiser liberar isso também, é ajuste pequeno.

## 42. Apoio de Bateria, Modo Carteirinha individual, Diretor de Naipe e Repique de Bossa (21/ago/2026)

Retomada de duas frentes que tinham ficado pendentes desde a sessão de 18/ago/2026 (registro em `CLAUDE.md`), que se desdobraram em quatro entregas relacionadas durante a conversa de planejamento com ela. Publicado direto na `main` a pedido explícito dela ("preciso agilizar isso hoje... pode publicar direto... vou testar em produção") — cada entrega foi um commit + push próprio, sem prévia intermediária, mas com verificação direta no banco (via `execute_sql`) antes e depois de cada migração.

### 42.1 Apoio de Bateria — novo `perfil`, não um conceito novo

Ela foi explícita desde o início: Apoio "é uma pessoa que não é ritmista, não é diretor, não é mestre mas apoia a bateria... mas é uma 'autoridade' na bateria também" — serve água, ajuda em geral, pode usar camisa de Diretoria, mas não tem as mesmas permissões automaticamente (precisa receber capacidades como qualquer Mestre/Diretor). Tratado em pé de igualdade com Mestre/Diretor em todo lugar do sistema, não como um caso especial:

- **Banco**: `vinculos_perfil_check` recriada incluindo `'apoio'`; RLS `admin_select_propria_bateria` (SELECT) — array `mestre/diretor` virou `mestre/diretor/apoio`, mesma capacidade `ver_acessos`; trigger `aplicar_matriz_edicao_vinculos()` — o branch `else` (não-ritmista) já era genérico por natureza (só verifica `old.perfil = 'ritmista'` pra decidir qual ramo seguir, não lista os outros perfis um a um), então herdou a mesma trava de Mestre/Diretor automaticamente; só o check `sou_admin_em_algum_lugar` (desbloqueio de tamanho de roupa na autoedição) tinha o array hardcoded `('mestre','diretor')`, corrigido pra incluir `'apoio'`.
- **`admin.html`**: `renderizarDiretoria()` ganhou uma terceira lista/seção "Apoio", mesmo padrão visual de "Mestres"/"Diretores", sempre depois deles. Todo lugar com ternário binário `perfil==='mestre'?X:Y` (rótulos de exportação, cadastro-link, tela Permissões, card, ficha) virou 3 vias ou passou a chamar `labelPerfilSA()` (agora com `if (p === 'apoio') return 'Apoio de Bateria';`). Botão "+ Cadastrar Apoio" e link de autocadastro (`?cargo=apoio`) adicionados junto dos de Mestre/Diretor. Filtro de Cargo da aba Diretoria ganhou checkbox "Apoio de Bateria", marcado por padrão.
- **`cadastro.html`**: `ehAdmin` (esconde o campo Instrumento) passou a incluir `cargo === 'apoio'`; `cargoParam`/`perfil`/`cargoLabel`, tanto no link fixo (`?bateria=&cargo=`) quanto no modo manual (`?modo=manual&cargo=`), expandidos de binário pra 3 vias. Apoio recebeu link de autocadastro público, mesmo padrão de Mestre/Diretor (confirmado com ela antes de implementar).
- **`carteirinha.html`** e **`login.html`**: `labelCargo`/`isAdmin` (dois pontos em `login.html` — o atalho de sessão salva e o fluxo completo de login) ganharam o terceiro caso.
- **Lacuna real achada e corrigida no meio do trabalho seguinte (Naipe/Repique de Bossa, seção 42.3)**: `ficha-perfil.js` — a função `fpCamposEditaveis()`, que decide quais campos aparecem editáveis na ficha, checava `atorPerfil === 'diretor' || atorPerfil === 'mestre'` em dois lugares (desbloqueio de tamanho de roupa na autoedição; edição de Instrumento/Medidas de um Ritmista por um admin) sem incluir `'apoio'`. Resultado: um Apoio com a capacidade `editar_ritmistas` liberada conseguia editar Instrumento/Medidas via API direto (o banco já permitia, RLS/trigger não bloqueavam), mas a **tela nunca mostrava esses campos como editáveis** — parecia que a permissão não funcionava. Corrigido junto, nos dois pontos.

### 42.2 Modo Carteirinha individual

Ela puxou o assunto ao descrever Apoio: "pode ter diretor, que o mestre fale: esse aqui nem precisa entrar no sistema. deixa ele olhar só a carteirinha." Perguntou se isso "é complexo" — não era, porque o sistema de capacidades por pessoa (seção 41.2) já dava a base pronta; só faltava um campo que não é sobre *o que* a pessoa pode fazer dentro do painel (isso já é `capacidades`), mas sobre *se* ela chega a entrar nele.

- Nova coluna `vinculos.modo_carteirinha_individual` (boolean, `default false`) — deliberadamente **fora** do jsonb `capacidades`, por ser uma decisão de natureza diferente (acesso ao painel como um todo, não um módulo dentro dele).
- Confirmado com ela: vale pra Mestre, Diretor **e** Apoio — "na hora, o que vai valer é olhar o que estiver marcado." Ritmista já tem esse comportamento embutido, sem marcação nenhuma (nunca vê o painel, é como o sistema sempre funcionou).
- Toggle novo na tela Permissões (mesmo editor por pessoa da seção 41.2), com aviso de que ele "ignora as capacidades abaixo" quando ligado.
- **`login.html`**: os dois pontos de decisão `admin.html` x `carteirinha.html` (atalho de sessão salva e fluxo completo) passaram a checar `modo_carteirinha_individual` **direto do banco**, nunca do cache local — mesma cautela já aplicada a `status`/`perfil` (reconferidos a cada abertura, nunca confiando cegamente na sessão salva do aparelho). Resultado prático: `isAdmin && !modo_piloto && !modo_carteirinha_individual` → `admin.html`; qualquer um dos três "trava" manda pra `carteirinha.html`.
- **`admin.html`**: `iniciarUsuario()` ganhou a mesma trava que já existia pra `modo_piloto` ("Mestre/Diretor de bateria com modo_piloto ligado não vê o painel, mesmo digitando a URL direto") — agora também expulsa quem tem `modo_carteirinha_individual` ligado, mesmo entrando direto pela URL sem passar pelo `login.html`.
- View `ritmistas_com_instrumento` recriada pra expor a coluna nova (ver seção 42.5 sobre a disciplina de `security_invoker`).

### 42.3 Diretor de Naipe

Não é perfil novo — é atributo de um Diretor que já existe. Conversa de definição foi longa; ela testou a lógica em voz alta com exemplos reais antes de fechar a regra: "se marcar primeira e segunda, vai aparecer surdo de marcação, se marcar mais de uma opção de repique... vai aparecer repique somente... se for marcado uma opção só, como xequerê, aí a pessoa vai receber o selo xequerê."

- Nova coluna `vinculos.naipe` (jsonb, array de strings — nomes de instrumento, não IDs) — fica em `vinculos`, não em `pessoas`, porque um Diretor pode liderar naipes diferentes em baterias diferentes (é atributo do vínculo, não da pessoa).
- **Consolidação do selo** (`fpResolverSeloNaipe()`, em `ficha-perfil.js` — função pública, chamada tanto pela própria ficha quanto pelo card de `admin.html`):
  - 1 opção marcada → mostra o nome literal (inclusive "Especiais").
  - 2+ marcadas, todas dentro de `['Surdo de Primeira', 'Surdo de Segunda']` → "Surdo de Marcação".
  - 2+ marcadas, todas dentro de `['Repique', 'Repique Mor', 'Repique de Bossa']` → "Repique".
  - Qualquer outra combinação (sem regra específica) → nomes separados por vírgula, sem quebrar.
- Opções do multi-select vêm da mesma função que já monta o dropdown de Instrumento (`fpCarregarOpcoesInstrumento`, reaproveitada) + duas pseudo-opções fixas ("Repique de Bossa", "Especiais") que **não existem na biblioteca mestre de instrumentos** — nunca aparecem em `instrumento_categorias`/nem seriam confundidas com um instrumento real.
- **Decisão confirmada com ela**: o selo de Naipe aparece **só no painel** (aba Diretoria, ao lado do rótulo do cargo), nunca na carteirinha do Diretor.
- **Quem edita**: hoje só a própria pessoa (autoedição, `atorPerfil === 'diretor'`) ou Super Admin. Não existe ainda uma capacidade "editar outro Mestre/Diretor/Apoio" no sistema — a arquitetura de `fpCamposEditaveis()` só tem branches pra "editando a mim mesmo" e "Mestre/Diretor/Apoio editando um Ritmista"; não há um branch pra "editando outro Mestre/Diretor/Apoio" ainda. Registrado como limitação conhecida, não como bug — não foi pedido escopo maior que isso.
- Trigger `aplicar_matriz_edicao_vinculos()`: `new.naipe := old.naipe;` adicionado (sem condição) no branch de "editando outra pessoa" não-ritmista — congela o campo pra qualquer editor que não seja autoedição/Super Admin, coerente com a tela só permitir esses dois casos hoje.
- **Extensão em 25/ago/2026** — mesmo padrão de consolidação aplicado a Caixa: `FP_NAIPE_CAIXA = ['Caixa de 12"', 'Caixa de 14"']`, 2+ marcadas dentro dessa lista → selo "Caixa". Pedido dela ("quem é caixa de 12 e caixa de 14, tem que virar diretor de caixa"), confirmado por pergunta direta que era só o selo (não pediu ativar a categoria "Caixa de 14\"" pra nenhuma bateria — a Imperatriz real, por exemplo, só tem "Caixa de 12\"" ativa hoje, nomenclatura exibida como "Caixa"). Mesma limitação de string literal do Surdo/Repique: só funciona se a nomenclatura configurada na bateria for exatamente "Caixa de 12\""/"Caixa de 14\"" (não cobre nomenclatura customizada diferente).

### 42.4 Repique de Bossa

"Não é um instrumento de verdade, é um grupo especial dentro dos Ritmistas de Repique" — nunca vira linha em `instrumento_categorias`/`instrumento_nomenclaturas` (confirmado antes de implementar: 23 categorias reais existiam, nenhuma "Repique de Bossa", e não devia virar uma).

- Nova coluna `vinculos.repique_bossa` (boolean, `default false`) — flag simples no vínculo do Ritmista.
- Visível só quando `instrumento_nome` do Ritmista é `'Repique'` ou `'Repique Mor'` (comparação de texto — mesma convenção já usada em todo o resto do app pra decisões visuais ligadas a instrumento, não existe uma chave estável separada do nome de exibição).
- Editável por quem tem `editar_ritmistas` — mesma trava que já protege `bateria_instrumento_id`/tamanhos de roupa. Trigger ganhou `new.repique_bossa := old.repique_bossa;` dentro do mesmo `if not tenho_capacidade('editar_ritmistas', ...)` que já existia pra `bateria_instrumento_id`.
- **Exibição — passou por correção depois do primeiro deploy**: a primeira versão trocava o texto do instrumento por "Repique de Bossa" no card do painel (mesma lógica aplicada à carteirinha). Ela pediu ajuste no mesmo dia: "o ritmista que é repique de bossa tem que ter os dois selos. O selo do instrumento e o selo que é repique de bossa" — corrigido pra mostrar os dois juntos no card (`admin.html`): a pílula de instrumento continua com o nome real (ex: "🥁 Repique"), e um selo novo, discreto, aparece ao lado (`.badge-repique-bossa`, fundo claro/texto escuro — ela pediu explicitamente "pode ser mais discreto" depois de eu testar uma primeira versão com fundo sólido colorido, ajustado pro mesmo padrão visual do badge "Estrangeiro" já existente).
- **Carteirinha continua diferente do painel, por decisão explícita dela**: perguntada se queria os dois selos ali também, escolheu manter só a troca de texto ("Repique" → "Repique de Bossa" na linha do cargo), pra não mexer no espaço fixo do cartão (300×540px, regra que nunca muda sem aprovação — ver `CLAUDE.md`).
- Novo filtro sintético de Status na aba Ritmistas ("Repique de Bossa", cor teal) — mesmo padrão já usado pela chave `menor` em `LABELS_STATUS_FILTRO` (calculada a partir de um campo, não é um valor real de `status` no banco).

### 42.5 Views recriadas duas vezes nesta sessão — mesma disciplina da seção 41.3

`ritmistas_com_instrumento` foi recriada duas vezes (uma pra `modo_carteirinha_individual`, outra pra `naipe`/`repique_bossa`) — cada `CREATE OR REPLACE VIEW` reseta `security_invoker` pro padrão de fábrica (`false`), então cada uma delas reafirmou `security_invoker=true` explicitamente na própria instrução (`with (security_invoker = true) as ...`) e foi **reconferida por SQL direto** (`select reloptions from pg_class where relname = 'ritmistas_com_instrumento'`) antes de qualquer código que dependesse da coluna nova ser publicado. Zero brechas abertas, mesma regra da seção 41.3 aplicada à risca.

## 43. Ajustes finos: Diretoria como módulo inteiro, card da Visão Geral e título de coluna em Instrumentos (21/ago/2026)

Três pedidos pontuais na mesma sessão, depois das entregas da seção 42.

**Card "Diretoria e Apoio ativos" → "Diretoria ativa"**: criado nessa mesma sessão (contando Mestre+Diretor+Apoio juntos desde o início, via `listaDiretoriaAtual`, que já busca `perfil=in.(mestre,diretor,apoio)`), ela pediu só a troca do nome — "o nome precisa ser somente Diretoria". Contagem não mudou, só o rótulo em `admin.html` (HTML + os dois comentários que citavam o nome antigo).

**Aniversário/Estrangeiro na Diretoria**: os ícones 🎂 (aniversário do mês) e 🌍 (nacionalidade estrangeira) já existiam há tempos no card de Ritmistas (`card-linha1`). Ela pediu que "aniversário e estrangeiro seja apresentado na diretoria também... diretoria eu me refiro ao módulo inteiro, ok? mestre, diretores e apoio" — os mesmos cálculos (`aniversarioMesA`, checagem de `nacionalidade !== 'Brasileira'`) foram replicados no `cardHTML` de `renderizarDiretoria()`, idênticos ao de Ritmistas.

O widget "🎂 Aniversariantes do mês" da Visão Geral (`renderizarVisaoGeral()`) também foi ajustado: antes só olhava `todosRitmistas`; passou a somar `todosRitmistas.concat(listaDiretoriaAtual)`. Detalhe de exibição: a linha de detalhe (dia/idade/instrumento) mostra `r.instrumento_nome` só pra Ritmista; pra Diretoria, mostra o cargo (`labelPerfilSA(r.perfil)`) no lugar, já que instrumento não se aplica. Como `carregarDiretoria()` roda em paralelo com `carregarRitmistas()` (chamadas separadas, sem `await` entre elas), existe uma corrida onde a Visão Geral pode renderizar antes dos dados de Diretoria chegarem — resolvido chamando `renderizarVisaoGeral()` de novo dentro de `carregarDiretoria()`, depois que `listaDiretoriaAtual` é populada, então o widget nunca fica com gente faltando por muito tempo.

**Título de coluna em Configurações → Instrumentos**: ela notou, olhando um print, que os dropdowns de nomenclatura (Caixa, Repique, Surdo de Primeira, etc.) ficavam "meio soltos", sem indicar o que representam — exatamente o mesmo problema já resolvido em "Vagas de Ritmistas" em 19/ago/2026 (`.config-lista-cabecalho`, criada especificamente pra isso). Reaproveitada a mesma classe: `<div class="config-lista-cabecalho"><span>Instrumento</span><span>Nome usado</span></div>` antes da lista. Medidas não precisou do mesmo ajuste — não tem nenhuma coluna à direita, só checkbox.

## 44. URLs sem `.html` no endereço (21/ago/2026)

Pedido dela depois de reparar que todo endereço do TumTu (`tumtu.com.br/login.html`, `/admin.html`, etc.) termina em `.html`: "eu acho isso tão ruim... qualquer um vai saber a tecnologia que eu usei." Reação inicial foi de alarme ("Tão vulnerável.") — esclarecido explicitamente, antes de qualquer mudança, que **não é uma falha de segurança**: o `.html` no endereço não expõe dado nenhum, é puramente estético. A vulnerabilidade de verdade que o TumTu já teve (vazamento anônimo de CPF/telefone, seção 31) não tem nada a ver com extensão de arquivo na URL.

### 44.1 `cleanUrls` — recurso nativo da Vercel, sem reescrever nada

Criado `vercel.json` na raiz do projeto (não existia antes):

```json
{ "cleanUrls": true }
```

Isso faz a Vercel, na própria borda (antes de chegar no código do app), redirecionar (308) qualquer requisição a um arquivo `.html` pro mesmo endereço sem a extensão — `tumtu.com.br/login.html` → `tumtu.com.br/login`, automaticamente, pro site inteiro, sem precisar listar arquivo por arquivo nem mexer em nenhum link existente. **Testado antes de publicar**: deploy de prévia, acesso via `curl` (usando o token de bypass da proteção de deployment da Vercel, obtido via ferramenta MCP `get_access_to_vercel_url`, com cookie persistido entre chamadas pra simular navegação real) confirmando `/login.html` → 308 → `/login`, querystring preservada através do redirecionamento (testado com `/ficha-perfil.partial.html?v=21` → `/ficha-perfil.partial?v=21`), e arquivos que não são `.html` (`manifest.json`) intocados.

### 44.2 Por que não bastou só ligar o `cleanUrls`

O redirecionamento automático da Vercel só age **depois** que alguém (ou o navegador) já fez a requisição pro endereço com `.html` — ou seja, resolve a URL que aparece na barra de endereço depois de clicar, mas **não muda o texto de um link que já foi gerado e copiado antes disso**. Ela perguntou direto: "até os links de cadastro? tudo?" — apontando exatamente esse ponto cego. Dois lugares onde isso importava de verdade, porque são endereços que saem do app pro mundo real:

- Os **links de cadastro por bateria** (Mestre/Diretor/Apoio/Ritmista) que ela copia em Diretoria/Ritmistas → "Novo cadastro" e manda por WhatsApp — o texto que ela copia e cola continuaria com `.html` escrito, mesmo funcionando.
- O **QR de emergência da carteirinha** (`qr.html?id=`) — codificado numa imagem escaneada por celular, sem oportunidade nenhuma de "clicar" antes.

Corrigido na raiz, em vez de depender só do redirecionamento: todo lugar do código que **gera** um endereço (não só os que navegam pra ele) passou a montar já a versão limpa direto:

- `admin.html`: os dois construtores de link de cadastro (`renderizarLinkCadastroRitmista`/`renderizarLinksCadastroDiretoria`, base `${origin}/cadastro?bateria=...`) e as duas funções de cadastro manual (`irParaCadastroManualRitmista`/`irParaCadastroManualDiretoria`).
- `carteirinha.html`: `qrUrl` (`/qr?id=...`) e todos os `window.location.href`/redirecionamentos internos (`login`, `admin`).
- `login.html`, `cadastro.html`, `redefinir-senha.html`, `404.html`: todo `window.location.href`/`<a href>` interno.
- `index.html` (raiz do domínio): o `<meta http-equiv="refresh">` e o `window.location.replace()` que mandam pra `login`.
- **`manifest.json`**: `start_url` — o endereço que abre quando alguém toca no ícone do TumTu instalado na tela inicial do celular. Esse é o mais sensível dos três: só afeta instalações **novas** a partir de agora (quem já instalou o PWA tem o `start_url` antigo gravado no sistema operacional no momento da instalação, não é relido do `manifest.json` a cada abertura — abrir o app instalado antigo ainda vai por `login.html`, só que agora com um redirecionamento a mais, invisível, sem quebrar nada).
- **`sw.js`**: `APP_SHELL` (lista de arquivos pré-cacheados pelo Service Worker) e o fallback de navegação offline (`caches.match('./login.html')` → `'./login'`) passaram a usar os endereços limpos — evita um salto de redirecionamento extra logo na instalação do PWA, mantendo o cache alinhado com o que o app de fato vai pedir depois.
- **Edge Function `notificar-aprovacao`** (e-mail de "cadastro aprovado", enviado via Resend pra gente de verdade): tinha dois `tumtu.com.br/login.html` no corpo do e-mail (o link clicável e o texto de fallback pra quem não conseguir clicar) — corrigidos e a função redeployada (versão 12).

`ficha-perfil.partial.html` (fragmento interno, buscado via `fetch()` de dentro do JS, nunca visto/copiado por uma pessoa) foi deixado como está — não é um "endereço" no sentido que preocupava ela, e mudar o nome do arquivo em si seria uma mudança maior e desnecessária pra zero ganho visível.

### 44.3 O que não foi coberto

O e-mail de "esqueci minha senha" é um template nativo do Supabase Auth (configurado em Authentication → Emails, dentro do painel deles — ver seção 33), **não um arquivo neste repositório**. Nenhuma ferramenta disponível nesta sessão dava acesso de leitura/edição a esse conteúdo (a MCP do Supabase usada aqui cobre banco de dados e Edge Functions, não configuração de templates de Auth). Sinalizado a ela conferir diretamente no painel se esse e-mail também tiver algum link com `.html`.

### 44.4 Achado à parte, não investigado

Durante a limpeza, `index.html` mostrou fazer um redirecionamento imediato pra `login` (via `<meta refresh>` + `window.location.replace`) — o que diverge do que `CLAUDE.md` registra sobre esse arquivo desde 12/jul/2026 ("landing page provisória, 'Em breve', sem nenhum link/ação"). Não investigado nem corrigido nesta sessão (fora do escopo do pedido dela); vale conferir numa próxima sessão se a documentação ficou desatualizada ou se o comportamento atual é um regresso não percebido.

## 45. Redesign de Configurações → Instrumentos, correção de texto em Vagas, ID visível em Escola/Bateria (21/ago/2026)

### 45.1 Instrumentos — duas tentativas até acertar

A primeira tentativa (seção 43, mesmo dia) resolveu o problema errado: só ajustou o espaçamento entre o cabeçalho de coluna novo ("Instrumento" / "Nome usado") e o título de grupo ("Tradicionais") logo abaixo dele. Ela testou e achou pouco: "você só fez isso? jura que foi o seu melhor?... eu esperava mais de você" — o problema de raiz não era espaçamento, era ter **dois elementos com a mesma função visual (título) competindo um do lado do outro**, e a tela usar uma linha própria (`.config-instrumento-linha`) diferente do padrão de card já consolidado no resto do app (Vagas de Ritmistas, Diretoria, Escolas — todos usam `.item-card`).

Redesenho de verdade, em `renderizarLinhaInstrumento()`/`renderizarConfigInstrumentos()`:
- Cada instrumento virou um `.item-card` (fundo branco, borda, sombra leve — mesmo componente de Vagas/Diretoria/Escolas), não mais uma linha com `border-bottom` criada só pra essa tela.
- O cabeçalho de coluna foi **removido por completo**, não só reposicionado — sem coluna nenhuma pra descrever, não sobra nada pra competir com o título de grupo.
- Quando um instrumento tem mais de um nome possível (`c.nomenclaturas.length > 0`), o rótulo "Nome usado" (`.config-instrumento-nome-usado-label`, 10px, cinza) mora dentro do próprio card, coladinho no dropdown que ele descreve — a maioria dos instrumentos não tem esse controle, então a maioria dos cards fica só com o checkbox, sem lado direito nenhum (isso é esperado, não é bug).
- Título de grupo passou a reaproveitar `.secao-titulo` (já usado em Diretoria pra separar Mestres/Diretores/Apoio) em vez da classe própria `.config-grupo-titulo` — um componente a menos pra manter.
- Medidas **não mudou** — continua com a linha antiga (`.config-instrumento-linha`), porque nunca teve cabeçalho de coluna nem esse tipo de confusão (não tem controle nenhum à direita do checkbox).

**Segundo ajuste, mesmo dia**: ela achou que faltava respiro entre o fim de um grupo (último card de "Tradicionais") e o início do próximo ("Especiais") — pediu uma linha divisória. `.lista-cards .secao-titulo` ganhou `border-top` + `margin-top`/`padding-top` maiores; o primeiro grupo da lista (sem nada acima pra dividir) fica isento via `:first-child`.

### 45.2 Vagas de Ritmistas — frase corrigida, comportamento não mudou

Ela leu "Use 0 para sem limite" e interpretou errado o próprio propósito do campo — achou que fosse uma falha (0 devia significar zero vagas de verdade, não "sem limite pra sempre"). Investigado antes de mexer: o **comportamento já estava certo** desde 19/ago/2026 (`renderizarConfigVagas()`/`renderizarContagemInstrumentos()`, comentário no código já dizia: "sem vaga cadastrada mostra 'N / -'... fica VERMELHO de propósito -- pressiona quem gerencia a preencher a vaga") — 0 sempre foi tratado como "ainda pendente de definição", nunca como uma escolha permanente de "sem limite". Só a frase visível pra ela (`config-sub-desc` da sub-tela Vagas) estava desalinhada com isso. Corrigida pra "Deixe em 0 enquanto ainda não tiver decidido o limite desse instrumento" — nenhuma lógica mudou, só o texto.

### 45.3 ID visível em Dados da Escola / Dados da Bateria

Pedido dela pensando num cenário concreto: e se ela precisar ter duas escolas com o mesmo nome (ex: uma "Imperatriz" demo, outra real)? Resposta: o `id` numérico (chave primária) já garante isso sozinho — nunca colide, mesmo com nomes idênticos — só nunca tinha aparecido em tela nenhuma. Adicionado como primeiro campo (somente leitura, sem `<input>` — não é editável, é chave primária) em `renderizarDadosEscolaTab()` e `renderizarDadosBateriaTab()`.

## 46. Primeira escola real: Imperatriz Leopoldinense — plano de limpeza dos dados de teste (21/ago/2026, planejamento)

Ela sinalizou estar "bem próxima de criar a primeira escola" — a **Imperatriz Leopoldinense** (`escolas.id = 2`, sigla "G.R.E.S. Imperatriz Leopoldinense (T)", bateria "Swing da Leopoldina", `bateria_id = 2`), já marcada `tipo = 'real'` desde a feature de 19/ago/2026 (seção 41.5). O problema: essa mesma escola foi usada informalmente como ambiente de teste ao longo de várias sessões (ela queria um ambiente de homologação separado, mas optou por não pagar por um projeto Supabase à parte) — hoje tem 17 vínculos, a maioria claramente fake.

**Levantamento feito (consulta direta ao banco, read-only)**: dos 17, 15 são claramente teste — nome/e-mail no padrão `@teste.tutti`/`@teste.com` (criados em 03/jul/2026, quando o banco foi populado com dados fake) ou explicitamente nomeados "Diretor Teste Marcia"/"Teste Apoio" (esse último criado nesta própria sessão, testando Apoio de Bateria). Duas ficaram em aberto:
- **"Márcia Serra Freitas"** (`pessoa_id = 86`, `marciaserra.ms@gmail.com`, ritmista) — conta de teste dela mesma, com e-mail pessoal. Confirmado via SQL que `super_admin = false` nessa pessoa (é uma pessoa comum, não a conta oficial de Super Admin `tumtuapp@gmail.com`) — ela **pode** se excluir sem trava nenhuma, ao contrário do que ela imaginou ("eu não posso me excluir"). Decisão dela: deixar por enquanto, excluir mais tarde junto com a criação de um perfil fake próprio pra testes futuros.
- **"Jhones Pereira de Souza Silva"** (`pessoa_id = 98`, `jhones_thuran@hotmail.com`, ritmista, aprovado, cadastrado em 17/ago/2026) — nome e e-mail com cara de pessoa real, não de teste. Provável dado real cadastrado por engano ou em teste real. **Decisão dela: vai avisar explicitamente quando for a hora de excluir — não excluir por conta própria antes disso**, mesmo já sabendo que é essa a intenção.

**Estratégia final combinada** (mais simples que excluir pessoa por pessoa sob pressão de tempo): em vez de limpar a Imperatriz agora, ela vai **marcar essa escola como `demo`** (campo já existe, editável em Dados da Escola) — ela mesma vai fazer isso, não pedir pra fazer por ela — e criar, quando for a hora, uma **nova** escola "Imperatriz", já `real`, pra receber cadastros de gente de verdade a partir do zero. A antiga (agora demo) vira sua escola de teste permanente daqui pra frente — junto com as outras 7 que já existem `tipo=demo` (Jacarezinho, Rocinha, Botafogo, Maricá, Tijuca, Vila Isabel, Grande Rio), resolve de vez o problema de não ter ambiente de homologação pago: qualquer teste futuro (inclusive o próprio perfil fake dela) deve acontecer numa escola `demo`, nunca numa `real`.

**Detalhe técnico importante, achado direto no banco (`pg_get_functiondef`) e que vale lembrar pra próxima vez que uma exclusão de escola for cogitada**: `excluir_escola_lgpd()` apaga `vinculos`, `bateria_instrumentos`, `bateria_medidas`, `baterias` e a `escola` em si — e, por causa de `ON DELETE CASCADE` na FK `vinculos_historico_status.bateria_id → baterias.id`, o histórico de status daquela bateria some junto, automaticamente. **Mas a função não apaga `pessoas`** — comentário no próprio código confirma que é proposital ("não apagamos dado pessoal aqui"), a ficha da pessoa fica órfã (sem vínculo em bateria nenhuma), preservada. Se um dia ela quiser excluir uma escola **e também não deixar rastro nenhum das pessoas que só existiam ali** (como ela pediu aqui: "não quero que tenha histórico, nada"), a ordem certa é excluir as pessoas primeiro (busca por pessoa, aba Privacidade) e a escola depois — nunca o contrário, e nunca presumir que excluir a escola já resolve as pessoas.

Nada foi executado nesta sessão além das consultas de levantamento (todas read-only) — a exclusão do Jhones fica pendente, aguardando ela pedir explicitamente.

## 47. "Ritmistas por Instrumento" completo + aviso de vaga + colunas alinhadas em Instrumentos (21/ago/2026)

Sequência de ajustes na Visão Geral e em Configurações (Instrumentos/Vagas), cada um testado numa prévia própria antes do próximo — vários deles foram correções de alinhamento, com a Márcia mandando prints reais a cada rodada.

### 47.1 "Ritmistas por Instrumento" (Visão Geral) mostra naipes vazios

`renderizarContagemInstrumentos()` antes construía a lista a partir da própria contagem de ritmistas ativos (`Object.entries(contagem)`) — instrumento sem nenhum ritmista contado simplesmente não gerava entrada nenhuma, sumia da lista. Pedido dela: "é importante que eles vejam que tem naipe que ainda não se cadastrou, caso queira chamar atenção da galera." Corrigido pra percorrer `bateriaInstrumentosCache.filter(bi => bi.ativo)` (todos os instrumentos ativos da bateria) e só usar `contagem` pra saber o número de cada um (`0` quando não tem ninguém) — instrumento configurado sempre aparece, mesmo vazio. "Sem instrumento" (bucket de ritmista antigo sem instrumento atribuído) continua só aparecendo quando existe de verdade — não é um naipe configurado, não faz sentido mostrar "0" fixo pra ele.

### 47.2 Aviso "Faltam N" / "Sem definição de vagas"

Função nova, compartilhada entre a Visão Geral e Configurações → Vagas de Ritmistas:
```js
function avisoVagaHtml(l) {
    if (l.semVaga) return `<span class="vg-instrumento-faltam">Sem definição de vagas</span>`;
    if (l.faltam > 0) return `<span class="vg-instrumento-faltam">${l.faltam === 1 ? 'Falta' : 'Faltam'} ${l.faltam}</span>`;
    return '';
}
```
`faltam = vagas - qtd` (só quando `!semVaga && qtd < vagas`). Sem aviso nenhum quando a vaga está completa ou excedida — a pílula colorida (verde/vermelha) já avisa sozinha nesses dois casos, evitando redundância visual.

Pedido inicial dela (mensagem separada, mesma sessão): quando a vaga nunca foi definida (fica em 0), mostrar "Sem definição de vagas" em vez de nada — antes só existia o caso "Faltam N", que exigia uma vaga já configurada.

### 47.3 Alinhamento — três rodadas até acertar, causa raiz achada só na última

O aviso foi posicionado três vezes diferentes antes de ficar certo:
1. **Primeira versão**: coladinho no nome do instrumento (lado esquerdo da linha). Ela não gostou: "não gostei... pode ser mais próxima da pílula."
2. **Segunda versão**: movido pra perto da pílula, dentro do mesmo bloco flex à direita (`<span style="display:flex;gap:8px">aviso + pílula</span>`). Ainda errado — "esse 'coladinho' é que me mata... pode ser alinhado à direita" — gap aumentado pra 14px, e um `text-align:right` foi adicionado ao próprio texto do aviso (que na prática **não fazia nada**, porque o elemento não tinha largura extra sobrando pra alinhar dentro — span de largura automática igual ao próprio conteúdo).
3. **Causa raiz, achada na terceira rodada**: ela apontou precisamente — "vc colocou alinhado de acordo com o tamanho da pílula." A pílula de contagem da Visão Geral (`.vg-instrumento-qtd`) nunca tinha `min-width` fixo (diferente de `.config-vaga-contagem`, a pílula equivalente em Vagas de Ritmistas, que **já tinha** `min-width:56px` desde antes) — números diferentes ("3 / 5" vs "12 / 8") mudavam a largura da própria pílula, e como ela é o último elemento do bloco flex (`justify-content:space-between` empurra o bloco inteiro pra direita, mas a largura da pílula dentro dele varia), o aviso antes dela também mudava de posição horizontal linha a linha. Corrigido dando à `.vg-instrumento-qtd` o mesmo `min-width:56px` que `.config-vaga-contagem` já tinha — pílulas do mesmo tamanho em toda a lista, aviso finalmente alinhado de verdade.

Cor/peso do aviso também mudaram de ida e volta: vermelho forte + negrito (primeira versão) → ela pediu "mais suave, sem negrito" → troquei pra âmbar sem negrito → ela reclamou que gostava da cor vermelha original, só queria tirar o negrito → revertido pra vermelho (`#b3261e`) sem negrito (`font-weight:400`). Lição prática: quando ela pede "mais suave", não presumir que inclui trocar a cor — perguntar ou aplicar só o que foi pedido literalmente (peso), não generalizar pra "toda a aparência".

### 47.4 Configurações → Instrumentos: mesmo problema de alinhamento, um nível abaixo

Depois do redesign da seção 45 (cabeçalho de coluna removido) ela pediu ele de volta: "coloque Nome Usado como um título na parte de cima, igual vc fez para vaga de ritmistas" — reintroduzido `<div class="config-lista-cabecalho"><span>Instrumento</span><span>Nome Usado</span></div>` antes da lista, mesmo padrão de Vagas de Ritmistas. Com a divisória/respiro já corrigidos entre cabeçalho e título de grupo (seção 45.1), não repetiu o problema original de "dois títulos" confusos.

Segundo pedido, mesma leva: "o que não tiver nome definido, repita o nome que está aparecendo, do instrumento real" — confirmado por ela logo depois que vale **só pra quem está marcado (☑)**: instrumento ativo sem mais de uma nomenclatura possível (sem select pra escolher) passou a mostrar o próprio nome em texto simples (`.config-instrumento-nome-usado-fixo`) em vez de ficar com a coluna vazia; instrumento desmarcado continua sem nada à direita.

Isso expôs o mesmo problema de largura variável da seção 47.3, um nível abaixo: `<select>` nativo se ajusta ao próprio texto ("Caixa" bem mais estreito que "Surdo de Primeira"), e o texto fixo novo não tinha caixa nenhuma — a coluna inteira, vista de cima a baixo, ficava serrilhada, sem nenhum edge alinhado (ela mandou print mostrando exatamente isso: "isso tá muito desalinhado"). Corrigido dando **a mesma largura fixa (170px) e o mesmo estilo de caixa** (borda, padding, cantos arredondados) tanto ao `<select>` quanto ao texto fixo — só o fundo do texto fixo é levemente mais claro (`#f7f6fb` vs branco), sinalizando visualmente "não é campo editável" sem precisar de nenhuma seta de dropdown. Pedido final dela: texto alinhado à esquerda dentro da caixa (`text-align:left`, explícito nas duas variantes) — a caixa em si já ficava na mesma coluna por causa da largura fixa, faltava só isso.

**Padrão a levar pra qualquer lista futura com pílula/caixa de largura variável ao lado de texto**: dar `min-width`/`width` fixo ao elemento variável (pílula, select, tag) resolve o alinhamento na raiz — tentar alinhar o *texto* vizinho por `text-align`/`gap` sem antes travar a largura do elemento ao lado é sempre um retrabalho, porque a posição do texto depende da largura do vizinho, não o contrário.

## 48. Rodada de ajustes visuais do Admin + três iterações de cabeçalho (22-23/ago/2026)

Sequência de rodadas de polimento visual, cada uma publicada em produção separadamente depois de aprovada numa prévia. Nenhuma mudança de arquitetura — só CSS/HTML e uma reforma pequena em Medidas (22/ago, base do que a seção 49 tornaria totalmente aberto no dia seguinte).

### 48.1 Medidas: liga/desliga por TIPO inteiro (22/ago/2026)

Antes dessa data, `Configurações → Medidas` só deixava ativar/desativar cada **tamanho** dentro dos 4 tipos fixos (Camisa/Fantasia/Calça/Sapato) — o tipo inteiro sempre aparecia, mesmo pra bateria que não usa Calça, por exemplo. Nova tabela `bateria_medida_tipos` (`bateria_id`, `tipo` texto, `ativo`) resolveu isso: card fechado por tipo (igual ao padrão já usado em Instrumentos — checkbox + nome, clicar expande os tamanhos por dentro), "sem linha ainda = ativo por padrão" (mesma convenção de Instrumentos). Motivo de existir como tabela separada de `bateria_medidas` (que já fazia isso por tamanho): granularidade diferente — liga/desliga o grupo inteiro, não cada opção dentro dele. Essa tabela (com o texto fixo `'camisa'/'fantasia'/'calca'/'sapato'`) foi a base que a reforma do dia seguinte (seção 49) tornou aberta, trocando o texto por `tipo_id` (FK pra uma biblioteca mestre de verdade).

### 48.2 "Rodada 1" de ajustes do Admin (23/ago/2026, manhã)

Lista de itens aprovados numa prévia só: menu lateral com fundo dourado sólido (era mais claro/translúcido); botão "Sair" padronizado como dourado vazado (borda, sem preenchimento) em todo canto que aparece; Visão Geral reorganizada em 2 colunas; totalizador agregado no topo de Configurações → Vagas de Ritmistas; exportação de Diretoria igualada em campos/formato à de Ritmistas (`CAMPOS_EXPORTAVEIS_DIRETORIA`, ver seção 40); atalho "Permissões" dentro da ficha de uma pessoa, com botão de voltar; logo da escola exibida dinamicamente em Escolas; e uma primeira rodada de padronização de título/legenda (tamanho de fonte + linha dourada) espalhada pelo sistema.

### 48.3 Padronização de respiro e cor dos títulos (23/ago/2026)

Auditoria mais profunda pedida por ela ("tem coisa que está muito grudado no título e linha, outras que estão separadas"): linha dourada devolvida a **todos** os títulos de seção (ela preferiu manter a linha, não removê-la — tinha sido tirada numa rodada anterior por engano de generalização), incluindo 4 classes que tinham ficado de fora (`.exp-secao-titulo`, `.exp-campos-grupo-titulo`, `.config-grupo-titulo`, `.dash-secao-titulo`). Respiro unificado em três medidas fixas: 6px do texto até a linha, 12px da linha até o conteúdo, 24px antes de um título novo (quando não é o primeiro item do bloco) — corrigindo, no caminho, dois casos reais de "respiro dobrado" (a margem do próprio título somando com o `gap` do container pai, ex: Instrumentos tinha 24px em vez dos 12px esperados). Cor de título unificada num cinza mais forte (`#5a5770`) — antes era uma mistura de 4-5 tons de cinza quase iguais ao texto normal. "Filtros" (rótulo utilitário, não uma categoria de dado como Pendentes/Ativos) ganhou linha cinza neutra em vez de dourada, opinião pedida a ela e confirmada. "Nome usado" (Instrumentos) virou cabeçalho de coluna próprio, reaproveitando literalmente `.config-vagas-cabecalho` (mesma receita já usada em Vagas de Ritmistas).

### 48.4 Respiro de `.ficha-secao` + cards colados (23/ago/2026)

Mesmo padrão de 24px (espaço antes de um título novo) estendido à família `.ficha-secao-titulo`, usada em Dados da Escola/Bateria, Privacidade e nas fichas de Diretoria/Permissões — estava em só 14px (herdado do `margin-bottom` antigo do wrapper `.ficha-secao`), quase metade do padrão do resto do sistema. Auditoria completa (grep em toda ocorrência de `.item-card` no arquivo) achou 4 listas onde a classe `lista-cards` — responsável pelos 12px de espaço entre um card e outro — nunca tinha sido aplicada ao container: Histórico, Privacidade (resultado de busca), e as bibliotecas mestre de Categorias e Tamanhos em Configurações do Super Admin. Achado real dela, quinta vez apontando o mesmo tipo de problema — reforça o valor de auditar a categoria inteira (grep) em vez de corrigir só o exemplo citado.

### 48.5 Cabeçalho do painel: três iterações até a versão final (23/ago/2026)

O cabeçalho (nome da escola + bateria, junto do logo) passou por três versões na mesma tarde, cada uma publicada e comparada ao vivo antes da próxima:

1. **"Bateria em destaque"** — pedido inicial dela ("o sistema é sobre gerir a bateria, ela devia ter mais destaque"): inverte o peso visual de antes (escola — BATERIA numa frase só, mesmo tamanho) pra duas linhas coladas, bateria maior/mais forte em cima, escola menor/opaca embaixo. Nesse passo nasceu a coluna `escolas.nome_curto` (opcional, editada em Dados da Escola) — pensada pra tirar prefixos formais tipo "G.R.E.S." do que aparece ali (ex: "Imperatriz Leopoldinense" em vez de "G.R.E.S. Imperatriz Leopoldinense (T)"). Decisão dela desde o início: campo **manual**, não detecção automática de prefixo — escolas têm prefixos diferentes (G.R.C.S., "Acadêmicos de...") e o nome pelo qual a galera chama no dia a dia nem sempre é só tirar o prefixo formal (ex: "Acadêmicos do Grande Rio" vira "Grande Rio" pra quem fala, não dá pra adivinhar só com regex). Cai pra sigla quando vazio, nunca fica sem nome.
2. **"Escola em cima" (Option G)** — comparando a versão 1 ao vivo, ela pediu pra inverter de volta a ordem (escola em cima, bateria embaixo — pensando no futuro do TumTu virar gestor de escola completo, não só de bateria), com os dois tamanhos quase iguais (só 1px de diferença, compensando o efeito óptico da caixa alta) e a bateria sempre em caixa alta + dourado fixo (mesma convenção já usada na carteirinha, mesma concessão já aceita pro botão "Sair" — cor dourada sempre, mesmo em escola de cor clara). Aprovada e publicada em produção (commit `1699056`).
3. **De volta pra sigla** — depois de usar a versão 2 por um tempo (com `nome_curto` preenchido nalgum teste), ela decidiu que a versão com a sigla completa ("G.R.E.S. ...") "fica mais bonita". Revertido: `aplicarConfigEscola()` volta a usar só `cfg.nomeEscola` (a sigla) no cabeçalho — `cfg.nomeEscolaCurto` continua sendo carregado e o campo "Nome Curto" continua existindo em Dados da Escola, só não entra mais nessa exibição. Guardado por decisão dela pra um uso futuro ainda não definido.

## 49. Reforma de Medidas: sistema totalmente aberto (23/ago/2026) — item 7 completo

Camisa/Fantasia/Calça/Sapato deixam de ser 4 tipos fixos no código (com um `CHECK` de texto no banco e 4 `<select>` escritos à mão em cada tela) e viram uma **biblioteca mestre aberta**, exatamente o mesmo padrão já usado em Instrumentos desde 11/jul/2026: um tipo pode ser criado, editado ou desativado pelo Super Admin a qualquer momento, sem precisar de nenhuma mudança de código — e cada tipo novo já nasce obrigatoriamente ligado à própria escala de tamanhos (pedido explícito dela: "sempre que criar uma vestimenta nova, vai ter que estar ligada ao tamanho também, assim como é hoje").

Decisão de fazer agora, fora da ordem original do roadmap (que previa esperar o cadastro real da Imperatriz assentar antes de mexer em Medidas outra vez, ver `project_reforma-medidas-adiada-lancamento-imperatriz` na memória): ela pediu explicitamente pra adiantar ("Não vou esperar. Vamos fazer logo. Sei dos riscos"), avaliando que o cadastro real ainda não tinha começado (estava gripada, sem certeza de conseguir ir no dia seguinte). Trabalho dividido em duas etapas dentro da mesma sessão: **banco de dados** primeiro (com backup e verificação completa antes de qualquer coisa visível), **telas** depois, testadas ao vivo antes de cada publicação.

### 49.1 Banco de dados

- **Backup**: `backup_vinculos_medidas_pre_reforma_20260823` — cópia de `vinculos.id, pessoa_id, bateria_id` + as 4 colunas antigas de tamanho, RLS ligado sem nenhuma policy (só `service_role` acessa). Sem essa tabela, não teria como provar depois que a migração não perdeu nem trocou nenhum valor.
- **`medida_tipos`** (biblioteca mestre nova): `id, nome, ordem, ativo` — seed com os 4 tipos existentes (Camisa=1, Fantasia=2, Calça=3, Sapato=4), preservando os IDs pra migração de dados funcionar por nome.
- **`medida_tamanhos.tipo`** (texto/`CHECK`) virou **`medida_tamanhos.tipo_id`** (FK pra `medida_tipos`) — mesma ideia de `instrumento_nomenclaturas.categoria_id`.
- **`bateria_medida_tipos.tipo`** (texto, criado só no dia anterior — seção 48.1) virou **`bateria_medida_tipos.tipo_id`** do mesmo jeito, com `UNIQUE(bateria_id, tipo_id)`.
- **`bateria_medidas_publicas`** (view pública, usada pelo formulário de cadastro sem login) recriada com as colunas novas (`tipo_id, tipo_nome` no lugar de `tipo`) — **security posture preservada** (`SECURITY DEFINER` intencional, mesma família de `baterias_publicas`/`bateria_instrumentos_publicos`/`mestres_publicos`, documentada como exceção conhecida desde a seção 31).
- **`vinculos_medidas`** (tabela nova): `id, vinculo_id → vinculos (ON DELETE CASCADE), tipo_id → medida_tipos, valor, criado_em`, `UNIQUE(vinculo_id, tipo_id)` — o valor de cada medida de cada pessoa, um registro por tipo preenchido (em vez de 4 colunas sempre presentes em `vinculos`, preenchidas ou não).
  - **RLS**: 9 policies. `super_admin_full_access` (tudo). Pra SELECT: `proprio_select` (o próprio vínculo, via `pessoa_id = meu_pessoa_id()`) + `admin_select_propria_bateria` (admin da bateria, com `ver_ritmistas`/`ver_acessos` conforme o perfil do vínculo, igual à policy equivalente de `vinculos`). Pra INSERT/UPDATE/DELETE: **par duplo** em cada operação — uma policy `proprio_*` (o próprio vínculo, sem exigir capacidade nenhuma) e uma `admin_*_propria_bateria` (bateria admin com a capacidade `editar_ritmistas`). **Achado e corrigido antes de qualquer teste**: a primeira versão só tinha o par `admin_*`, exigindo capacidade até da própria pessoa preenchendo a própria medida no autocadastro — bloquearia o cadastro público e a autoedição de Mestre/Diretor/Apoio na hora. Corrigido pra espelhar exatamente o grão já usado em `vinculos` (RLS grosseiro: próprio vínculo OU admin da bateria — restrição fina por coluna, quando existe, é trigger, não RLS; aqui não existe trigger nenhum, então a policy já nasce no grão certo).
- **Migração de dados**: 4 `INSERT...SELECT` copiando valor não-nulo das 4 colunas antigas pra `vinculos_medidas`, resolvendo `tipo_id` pelo nome. **Verificação completa** (não amostrada): reconstrução das 4 colunas antigas a partir de `vinculos_medidas` via `CASE WHEN mt.nome = 'X' THEN vm.valor END`, comparada campo a campo contra o backup com `IS NOT DISTINCT FROM` (null-safe) — resultado: **zero diferenças em 56 vínculos, 188 valores migrados**.
- **As 4 colunas antigas em `vinculos` (`tamanho_camisa/fantasia/calca/sapato`) foram mantidas, sem receber mais escrita** — mesmo critério já usado com a tabela `ritmistas` congelada (ver seção 22): rede de segurança, remoção fica pra depois, exige aprovação dela quando chegar a hora.

### 49.2 Convenção "sem linha ainda = ativo por padrão" — bug achado e corrigido em dois lugares

`renderizarConfigMedidas()` (tela de bateria) já tratava a ausência de linha em `bateria_medida_tipos` como "ativo" (`!tipoExistente || !!tipoExistente.ativo`) — mas a primeira versão da reforma **não** replicou essa regra em dois lugares que dependem da mesma tabela:

1. **`fpCarregarTiposMedidaAtivos()`** (`ficha-perfil.js`, motor único de ficha usado por `admin.html` e `carteirinha.html`) — buscava só `bateria_medida_tipos?ativo=eq.true`, exigindo linha explícita. Corrigido pra buscar os **desligados** (`ativo=eq.false`) e considerar todo o resto ativo por padrão, mesma lógica de `renderizarConfigMedidas`.
2. **View `bateria_medidas_publicas`** — o `JOIN` com `bateria_medida_tipos` era `INNER JOIN ... WHERE bmt.ativo = true`, mesmo problema. Corrigido pra `LEFT JOIN` + `COALESCE(bmt.ativo, true) = true`.

Sem essa correção, qualquer tipo de medida novo criado pelo Super Admin **nunca apareceria em bateria nenhuma** (nem na ficha, nem no cadastro público) até alguém entrar em `Configurações → Medidas` daquela bateria especificamente e mexer manualmente no interruptor — o oposto do comportamento esperado ("tipo novo já disponível pra todo mundo, cada bateria desliga se não quiser"). Achado testando ao vivo (criando um tipo de teste e conferindo que sumia), antes de qualquer coisa ser mostrada pra ela.

### 49.3 Telas

- **`ficha-perfil.js` / `ficha-perfil.partial.html`** (motor único, ver seção 11): a seção "Medidas" (view + edição) deixou de ser 4 `<div class="ficha-campo">` fixos — vira um `#fp-medidas-grid` vazio, preenchido em tempo de execução por `fpRenderizarMedidas()` (um card por tipo ativo na bateria, na ordem configurada) e `fpAtivarEdicao()`/`fpSalvar()` (monta os `<select>` com os tamanhos ativos, grava em `vinculos_medidas` via upsert com `Prefer: resolution=merge-duplicates` pros valores preenchidos, `DELETE` pros deixados em branco de propósito). Chave de permissão simplificada: as 4 colunas antigas (`tamanho_camisa`...) saem de `fpCamposEditaveis()`/`FP_CAMPOS`, entra uma chave única `'medidas'`.
- **`admin.html` → Configurações → Medidas** (por bateria): `renderizarConfigMedidas()` passa a ler de `bibliotecaMedidaTipos` (carregada de `medida_tipos`) em vez do array fixo `TIPOS_MEDIDA` — qualquer tipo novo aparece automaticamente.
- **`admin.html` → Configurações do Super Admin → Medidas**: a antiga tela "Tamanhos" (só a biblioteca de tamanhos, tipo sempre um dos 4 fixos) virou **"Tipos de Medida"** — editor único, mesmo padrão da Categoria+Nomenclaturas de Instrumentos: nome do tipo + status + lista de tamanhos editável inline (adicionar/remover linha), tudo salvo junto. Validação obrigatória no salvar: pelo menos 1 tamanho preenchido, senão erro ("Adicione pelo menos um tamanho — toda medida precisa de uma escala de tamanhos") — trava em código a regra que ela pediu de tipo sempre vir com escala.
- **`cadastro.html`** (formulário público): os 4 `<select>` de tamanho, escritos à mão no HTML, viram um container vazio (`#linha-medidas-dinamico`, dentro de um `.form-row` — grid de 2 colunas que já quebra sozinho em pares) — `carregarOpcoesMedidas()` monta um campo por tipo ativo, `lerValoresMedidas()` lê os valores escolhidos na hora de montar o payload. Submissão grava em `vinculos_medidas` (POST separado, depois do `vinculos` principal, usando o `id` retornado via `Prefer: return=representation`).
- **Exportar Excel**: o grupo "Medidas" de `CAMPOS_EXPORTAVEIS`/`CAMPOS_EXPORTAVEIS_DIRETORIA` passa a ser carregado dinamicamente (`carregarGruposMedidaExport()`, chamado toda vez que o modal abre) — os checkboxes de campo (`medida_{tipo_id}`) refletem os tipos ativos daquele momento. `linhasExportacao()` busca os valores via `carregarValoresMedidaExport()` (um `GET` em `vinculos_medidas?vinculo_id=in.(...)` pro lote inteiro sendo exportado) em vez de ler direto do objeto do ritmista.
- **Edge Function `admin-create-user`** (cadastro manual, feito por Mestre/Diretor/Super Admin em nome de outra pessoa): o payload de `vinculos` deixa de incluir as 4 colunas de tamanho; depois do `INSERT` do vínculo (com `service_role`, então RLS não entra em jogo aqui), um segundo `INSERT` em lote grava `dados.medidas` (array `[{tipoId, valor}]` vindo do formulário) em `vinculos_medidas`.

### 49.4 Verificação ao vivo

Testado de ponta a ponta antes de qualquer prévia ser mostrada: criação de um tipo de medida de teste ("Vestido Teste QA", tamanhos P/M) pela tela do Super Admin, ativação numa bateria real (Imperatriz), edição e salvamento na ficha de uma pessoa real (dado migrado conferido: Camisa/Fantasia/Calça G, Sapato 36 — batendo com o valor antigo), renderização correta no formulário público (inclusive do tipo novo), cadastro manual completo via a Edge Function editada (criação real de pessoa+vínculo+medidas, conferida por SQL direto), e exportação Excel com o grupo de Medidas marcado. Os dois bugs da seção 49.2 e o de "Nome sumia ao clicar + Adicionar tamanho" (no editor novo de Tipos de Medida — `sincronizarTamanhosMTDoDOM()` só devolvia os tamanhos pro objeto antes de redesenhar a tela, não o nome/status já digitados) foram achados justamente nesse processo, corrigidos e testados de novo antes da aprovação final dela. Todos os dados de teste criados durante a verificação (tipo, valores, conta de cadastro manual) foram apagados direto no banco depois, sem deixar rastro na Imperatriz.

Publicado em produção depois de aprovação explícita dela ("Pode subir pra produção") — commit de merge documentado no histórico do repositório.

## 50. Figurino (catálogo + entrega), interruptor "ritmista edita medidas em branco" e bug real de dado legado apagado (23/ago/2026)

Item 10 do backlog (era "vestimentas de evento", renomeado por ela pra **Figurino**) + uma pendência antiga (ritmista nunca conseguia editar a própria Medida) fechados juntos, depois de um processo de alinhamento de design com várias rodadas de correção dela até a versão final ficar clara.

### 50.1 Desenho final acordado com ela

Distinção central, repetida várias vezes até fixar: **"Figurino Pai"** é um tipo de Medida já existente (Camisa, Fantasia, Calça, Sapato ou qualquer tipo custom, ex: "Vestido") — a seção "Medidas" da ficha continua sendo onde o tamanho do Figurino Pai é preenchido, sem nenhuma mudança de arquitetura ali. **"Figurino Filho"** é uma peça específica de evento cadastrada dentro de um Figurino Pai (ex: "Camisa da Final" dentro de "Camisa") — **nunca tem tamanho próprio**, só existe pra rastrear se a peça foi entregue ou não; quando o tamanho precisa aparecer (na tela de entrega), é lido ao vivo do valor de Medida da pessoa no Figurino Pai correspondente.

Ela foi enfática sobre esse ponto depois de eu propor errado duas vezes (edição de figurino dentro da ficha, e tamanho próprio por figurino filho): *"Cara, não existe EDIÇÃO DE TAMANHO DE FIGURINO."*

- **Catálogo** (`admin.html → Mais → Figurino`): tela por bateria onde o Diretor/Mestre cadastra Figurinos Filhos, cada um obrigatoriamente ligado a um Figurino Pai (só por referência de tamanho).
- **Entrega**: tela dedicada, uma por peça — busca por nome/apelido, filtro por instrumento, mostrando o tamanho real de cada pessoa (só leitura, vindo de Medidas) ao lado de um checkbox "Entregue" de um clique só. Ela reverteu de propósito uma preferência inicial por edição na ficha em favor dessa tela — pensando em uso pelo celular: *"uma tela única, busca a pessoa e dá um click do check... se for no menu ritmistas teria que buscar a pessoa, abrir o card, procurar a seção de Figurinos e depois dar o check. É muito mais passos."* Cobre Ritmistas **e** Diretoria juntos, pedido explícito dela.
- **Ficha da pessoa** ("Entrega de Figurinos", nome sugerido por mim e aceito por ela no lugar de só "Figurino"): resumo **100% de leitura**, nunca editável ali — nem pelo ritmista, nem pelo Diretor. Toda edição (marcar entregue/não entregue) é só na tela dedicada.
- **Permissão nova**: `ver_figurino`/`editar_figurino`, capacidade própria (não reaproveita `editar_ritmistas`), atribuível por pessoa como as demais.

### 50.2 Banco de dados

- `figurino_itens` (`id, bateria_id → baterias CASCADE, medida_tipo_id → medida_tipos, nome, ativo, ordem, criado_em`) — catálogo, sempre escopado a UMA bateria (peça de evento é específica da temporada/bateria, diferente de Instrumentos/Medidas que nascem como biblioteca compartilhada). RLS: Super Admin livre; qualquer membro aprovado da bateria pode ver (`SELECT`); só quem tem `editar_configuracoes` pode criar/editar/excluir — mesma capacidade que já gate Configurações → Medidas/Instrumentos.
- `figurino_entregas` (`id, vinculo_id → vinculos CASCADE, figurino_item_id → figurino_itens CASCADE, entregue_em, confirmado_por → pessoas, criado_em`, `UNIQUE(vinculo_id, figurino_item_id)`) — um registro por pessoa+peça. RLS: Super Admin livre; a própria pessoa só enxerga a própria linha (`SELECT`, pra alimentar o resumo da ficha); admin da bateria precisa de `ver_figurino` pra ler e `editar_figurino` pra escrever — **sem nenhuma policy de escrita pro ritmista**, reforçando em banco que a edição é só pela tela dedicada de Diretoria.

### 50.3 Interruptor "ritmista edita medidas em branco"

Pendência antiga (`project_reforma-medidas-adiada-lancamento-imperatriz` já resolvida, mas essa parte ficou de fora): ritmista nunca tinha como preencher a própria Medida — só Mestre/Diretor/Apoio se autoeditam. Ela pediu um controle **por bateria** (não por pessoa) em Permissões, com uma regra específica: *"se puder ter esse controle, do ritmista poder editar somente o que está em branco, melhor ainda. pq assim o impede de editar o restante das medidas."*

- Nova coluna `baterias.ritmista_pode_editar_medidas` (boolean, default `false`) — interruptor em Permissões → nova seção "Ritmistas", acima da lista de Diretoria (isolado de propósito, mesmo padrão de "Comercial" ficar separado por ser decisão de outra natureza).
- **RLS em `vinculos_medidas` redesenhada pra travar "preenche uma vez, nunca edita de novo" sem lógica condicional na policy**: as antigas `proprio_insert/update/delete` (irrestritas) viraram `proprio_insert_diretoria`/`proprio_update_diretoria`/`proprio_delete_diretoria` (só pra `perfil IN ('mestre','diretor','apoio')`, sem mudança de comportamento pra eles) + uma nova `proprio_insert_ritmista_liberado` — **só INSERT**, exigindo `perfil = 'ritmista'` E a bateria com o interruptor ligado. Não existe policy de UPDATE nem DELETE pro ritmista nessa tabela. Combinação de `UNIQUE(vinculo_id, tipo_id)` (bloqueia inserir de novo por cima) + ausência total de policy de update/delete = trava real em banco, não só escondida na tela.
- `ficha-perfil.js`: `fpEstado.medidasRestritoAoVazio` (novo flag) distingue esse modo restrito dos caminhos já existentes (autoedição livre de Diretoria, admin editando ritmista). `fpAplicarPermissaoRitmistaMedidas()` roda depois do render normal da ficha — busca o interruptor da bateria e, se ligado e existir pelo menos 1 campo de Medida em branco, libera o botão "Editar" (que antes ficava escondido pro Ritmista) e marca o flag. Em `fpAtivarEdicao()`, o loop que monta os `<select>` de Medida agora pula (não vira editável) todo campo que já tem valor quando o flag está ativo — um `if (fpEstado.medidasRestritoAoVazio && valorAtual) return;` antes de montar o `<select>`.

### 50.4 Bug real achado no caminho: valor legado de lista fechada apagado ao salvar

Testando o interruptor acima com uma conta de ritmista de teste, o campo "Parentesco" (contato de emergência) — que já tinha o valor "Esposa" — sumiu (virou `null`) depois de eu clicar Salvar **sem sequer ter mexido nesse campo**. Investigação: `fp-emergencia-parentesco-edit` é um `<select>` de lista fechada (Pai/Mãe/Cônjuge.../Outro, desde 17/jul/2026), mas "Esposa" é texto livre de antes dessa lista existir — não bate com nenhuma `<option>`. Em `fpAtivarEdicao()`, `input.value = valorAtual` num `<select>` sem opção correspondente resulta em nenhuma opção selecionada (comportamento padrão do DOM); ao salvar, isso vira string vazia → `null`, sobrescrevendo o dado antigo sem aviso nenhum.

**Levantamento no banco**: 16 pessoas com esse padrão hoje (`emergencia_parentesco` fora da lista fechada), incluindo pelo menos 1 conta real — Luiz Alberto, Mestre da Imperatriz Leopoldinense. Ou seja, qualquer edição de ficha dele (mesmo mudando só o celular, por exemplo) apagaria silenciosamente o parentesco salvo, sem ele perceber.

**Correção** (`fpAtivarEdicao()`, genérica pra qualquer campo `<select>` de `FP_CAMPOS`, não só Parentesco): antes de setar `input.value`, se o elemento for um `<select>` e o valor atual não bater com nenhuma `<option>` existente, insere uma opção nova com esse valor (selecionada) — preserva o dado legado na tela e, se a pessoa não mexer no campo, ele volta salvo do jeito que estava. Só passa a mudar de verdade se alguém escolher outra opção de propósito. Testado ao vivo: reabri a ficha do Bruno (conta de teste usada pra validar o interruptor de Medidas) com "Esposa" no banco, confirmei que o dropdown mostrou "Esposa" selecionado, salvei sem tocar em nada, e o banco manteve "Esposa" — comportamento corrigido.

**Nota técnica sobre como esse bug foi confirmado e depois "reaparecia" durante o teste**: ao tentar restaurar manualmente o valor de teste via SQL direto (fora do app), a trigger `trg_matriz_edicao_pessoas` (que restringe colunas editáveis por autoedição/admin, ver seção 11) reverteu o `UPDATE` de volta pro valor antigo — porque a trigger checa `auth.role() = 'service_role'`/`is_super_admin()`, ambos `false`/`null` numa conexão SQL direta (sem contexto de sessão do PostgREST), caindo no branch "admin editando pessoa de outra bateria", que preserva a maioria das colunas do valor antigo. Correção pontual feita com `ALTER TABLE ... DISABLE/ENABLE TRIGGER` ao redor do `UPDATE` de restauração — registrado aqui como nota pra qualquer correção futura de dado via SQL direto nesta tabela, não uma mudança de comportamento do app.

### 50.5 Verificação ao vivo

Testado antes de qualquer prévia: catálogo (criação de peça de teste ligada a um Figurino Pai), tela de entrega (lista combinada Ritmista+Diretoria, tamanho lido corretamente de Medidas, checkbox persistindo no banco), resumo na ficha (100% leitura, sem nenhum elemento editável). Interruptor de Medidas: ligar/persistir/reler no Permissões: confirmado; ciclo completo logado como o ritmista de teste (campo em branco vira editável, campos já preenchidos continuam travados, depois de preencher e salvar o campo recém-preenchido também trava) — confirmado nas duas pontas. Bug do Parentesco: achado, corrigido, testado. Todos os dados de teste (peça de catálogo, entrega, valor de Medida de teste, interruptor da Imperatriz) foram limpos do banco depois — a Imperatriz voltou ao estado de antes do teste, com o interruptor desligado, pra ela decidir quando ligar de verdade.

## 51. Dashboard zerado sem bateria real + Figurino ganha lista mestre e nomenclatura correta (24/ago/2026)

Duas frentes fechadas na mesma sessão: um bug pequeno no Dashboard do Super Admin, e uma reformulação grande do Figurino (seção 50) depois que ela apontou que o modelo entregue tinha um problema de fundo — não era só questão de tela.

### 51.1 Dashboard: números zerados em vez de sumir

Achado dela, com print: sem nenhuma bateria real cadastrada (todas marcadas `demo`), o Dashboard escondia os cards de Escolas/Baterias/Pessoas ativas/Pendências por completo, deixando só o título "Baterias" solto acima de "Nenhuma bateria real cadastrada ainda." — sem os números, o título não fazia sentido nenhum. Causa: `carregarDashboard()` (`admin.html`) tinha um `return` antecipado no caso de zero baterias, que também zerava `kpisEl.innerHTML`.

**Correção**: removido o `return` antecipado — `totalAtivos`/`totalPendentes`/os 4 cards de KPI agora são calculados normalmente sempre (naturalmente ficam em 0 quando não há bateria, já que os arrays filtrados ficam vazios); só a lista de baterias em si (`#dashboard-lista-baterias`) mostra a mensagem de vazio condicionalmente. Testado ao vivo: com a real da sessão (0 escolas reais, 9 demo, depois da Márcia marcar a Imperatriz de teste como `demo`), o Dashboard passou a mostrar "0 Escolas / 0 Baterias / 0 Pessoas ativas / 0 Pendências / 9 Escolas DEMO (fora da contagem)" — números reais, não mais em branco.

### 51.2 Figurino: nomenclatura corrigida e biblioteca mestre

A implementação da seção 50 (23/ago) tinha a arquitetura de dados certa (peça específica ligada a um tipo de Medida só por referência de tamanho), mas errou em três pontos que só apareceram depois dela testar em produção e pensar melhor sobre o modelo:

1. **Nome errado**: o que já existia como "Medidas"/"Tipos de Medida" (Camisa, Calça, Fantasia, Sapato) é conceitualmente **Figurino** — o tipo da peça de roupa. "Medida" deveria significar só o tamanho (P/M/G, 33-48...), nunca o tipo da peça em si. Ela resumiu numa tabela: **Categoria de Figurino** = tipo de peça; **Figurino** = peça específica (ex: Camisa da Final); **Medida** = tamanho de cada pessoa. Renomeado só o *rótulo* nas telas — a tabela `medida_tipos` e tudo que depende dela continuam com o nome técnico antigo, sem risco de quebrar nada.
2. **Catálogo de Figurino sem lista mestre**: a peça específica (`figurino_itens`, seção 50) era cadastrada do zero em cada bateria, sem nenhum reaproveitamento — diferente do padrão já usado em Instrumentos e Categoria de Figurino, onde o Super Admin cadastra uma vez e cada bateria só ativa o que usa.
3. **Ritmista e Diretoria misturados**: a peça (`figurino_itens`) não tinha nenhuma distinção de público — a tela de entrega de uma peça listava Ritmistas e Diretoria juntos. Pra ela, são peças diferentes por natureza (uma Camisa da Final de Ritmista não é a mesma peça que uma Camisa de Diretoria), e não deveriam nunca aparecer misturadas.

**Migração de banco** (substitui o `figurino_itens` bateria-scoped da seção 50 — só tinha 1 item de teste, sem dado real em jogo):
- `figurino_itens_mestre` (`id, nome, medida_tipo_id → medida_tipos, publico` [CHECK `'ritmista'`/`'diretoria'`]`, ativo, ordem, criado_em`) — biblioteca mestre global, mesmo padrão de `medida_tipos`: RLS `super_admin_full_access` (ALL) + `select_autenticado` (SELECT, `true` — qualquer autenticado lê, igual `medida_tipos`).
- `bateria_figurino_itens` (`id, bateria_id → baterias CASCADE, figurino_item_mestre_id → figurino_itens_mestre CASCADE, ativo, criado_em`, `UNIQUE(bateria_id, figurino_item_mestre_id)`) — ativação por bateria, mesmo formato de `bateria_medida_tipos`, mas com a **convenção invertida** (ver 51.3): sem linha = **inativo**, não ativo.
- `figurino_entregas.figurino_item_id` repontado de `figurino_itens(id)` pra `figurino_itens_mestre(id)` (`DROP CONSTRAINT` + `ADD CONSTRAINT` da FK) — RLS da tabela não mudou, não referenciava `figurino_itens` diretamente.
- `figurino_itens` (tabela bateria-scoped da seção 50) apagada — só tinha a peça de teste, já removida antes da migração.

### 51.3 Categoria de Figurino (ex-Medidas) também passa a nascer desligada

No meio da conversa sobre o Figurino novo, ela recuperou um ponto sobre a própria Categoria de Figurino: antes da reforma de 22-23/ago (seção 49), Camisa/Fantasia/Calça/Sapato eram **fixos no código** — por isso qualquer bateria nova "nascia" com eles prontos, sem precisar configurar nada. Depois da reforma, viraram só mais um tipo configurável — mas o comportamento "sem linha ainda = ativo por padrão" (`renderizarConfigMedidas` em `admin.html`, `fpCarregarTiposMedidaAtivos` em `ficha-perfil.js`, view `bateria_medidas_publicas`) ficou de herança do tempo em que eram fixos, sem ninguém ter revisitado a decisão. Regra dela: **"quando eu criar uma bateria, TUDO tem que nascer desligado"** — mesmo padrão que Instrumentos já segue.

**Risco real de mudar esse default**: hoje 5 tipos existem (`Camisa/Fantasia/Calça/Sapato` + `Vestido`, criado em 23/ago) — os 4 originais já tinham linha explícita `ativo=true` em toda bateria (seed da migração da seção 49), mas "Vestido" não tinha nenhuma linha em lugar nenhum, contando como ativo pra **todas** as 9 baterias existentes só pelo comportamento antigo. Trocar o default sem cuidado desligaria "Vestido" pra todo mundo do nada.

**Backfill de segurança, executado antes de qualquer troca de código**: `INSERT INTO bateria_medida_tipos (bateria_id, tipo_id, ativo) SELECT ... true ... WHERE NOT EXISTS (linha já existente)` — cobre qualquer combinação bateria+tipo hoje implicitamente ativa (não só Vestido, generalizado pra qualquer gap futuro). Confirmado por SQL: as 9 baterias passaram de 4 pra 5 linhas cada, todas `ativo=true` — zero mudança de comportamento efetivo pra quem já estava configurado.

**Só depois do backfill**, os três lugares que liam "sem linha = ativo" foram invertidos pra "sem linha = inativo", espelhando exatamente `renderizarConfigInstrumentos`:
- `admin.html`, `renderizarConfigMedidas()`: `const tipoAtivo = !!(tipoExistente && tipoExistente.ativo);`
- `ficha-perfil.js`, `fpCarregarTiposMedidaAtivos()`: busca `bateria_medida_tipos?ativo=eq.true` (linhas **ligadas**) em vez de buscar as desligadas e excluir — inclui só quem tem linha explícita.
- View `bateria_medidas_publicas` (cadastro público): `COALESCE(bmt.ativo, false) = true` (era `COALESCE(bmt.ativo, true)`).

Testado ao vivo na Imperatriz depois da troca: as 5 categorias continuaram todas marcadas ativas na tela — confirma que o backfill segurou o comportamento.

### 51.4 Telas novas/renomeadas

- **Super Admin → Configurações**: "Medidas"/"Tipos de Medida" → **"Categoria de Figurino"** (mesmo editor de sempre — nome + status + escala de tamanhos inline — só o rótulo mudou). Novo item **"Figurino"**: editor da lista mestre (nome + dropdown de Categoria + select de Público Ritmista/Diretoria + status), mesmo padrão visual de card+editor já usado em Instrumentos/Categoria de Figurino.
- **Bateria → Configurações**: "Medidas" → **"Categoria de Figurino"**. Novo item **"Figurino"**: ativação por bateria, agrupada Ritmistas (sempre primeiro) → Diretoria, sub-agrupada por Categoria dentro de cada público — reaproveita `LABEL_PUBLICO_FIGURINO_CONFIG` compartilhada com a tela de entrega.
- **Bateria → Mais**: "Figurino" (catálogo+entrega da seção 50) virou **"Entrega de Figurino"**, só entrega — sem nenhum cadastro/edição de peça. Pedido dela: evitar dois itens de menu chamados "Figurino" (o de Configurações e o de Mais) — só o item de Mais foi renomeado, já que o de Configurações fica claro por estar ao lado de "Categoria de Figurino". A lista abre agrupada igual à de Configurações (Ritmistas → Diretoria → Categoria), cada peça clicável abre a tela de busca+check já existente, agora naturalmente filtrada por público (`&perfil=eq.ritmista` ou `&perfil=in.(mestre,diretor,apoio)` na query de `ritmistas_com_instrumento`) — o filtro de instrumento (`select`) só aparece pra peça de Ritmista, escondido pra Diretoria (`style.display` condicional em `abrirEntregasFigurino`).
- **Ficha da pessoa → "Entrega de Figurinos"**: query atualizada pra ler de `bateria_figurino_itens` (ativo) + `figurino_itens_mestre` (filtrado por `publico` igual ao perfil de quem está vendo — ritmista só vê peça de ritmista, Diretoria só vê peça de diretoria) em vez do antigo `figurino_itens` bateria-scoped.

### 51.5 Bug real achado testando a reestruturação

`abrirEntregasFigurino()` escondia `.config-subtela` pra abrir a tela de detalhe de uma peça, mas `#figurino-lista` (a lista de nível 1) não tem essa classe — as duas telas ficavam sobrepostas na mesma página ao abrir uma peça. Bug já existia desde a implementação original da seção 50 (mesmo padrão de esconder), só não tinha sido notado até testar a versão nova ao vivo. Corrigido com `document.getElementById('figurino-lista').style.display = 'none';` explícito no início da função, mesmo padrão já usado em `abrirConfigTela()`.

### 51.6 Verificação ao vivo

Super Admin → Configurações → Figurino: criação de 2 peças de teste (uma Ritmista, uma Diretoria), confirmado agrupamento Ritmistas-antes-de-Diretoria na lista. Bateria → Configurações → Figurino: as duas peças nasceram desligadas (checkbox vazio), liguei as duas, confirmei gravação. Bateria → Entrega de Figurino: lista agrupada corretamente, peça de Ritmista mostrou os 6 ritmistas da Imperatriz com filtro de instrumento visível, peça de Diretoria mostrou os 4 membros da Diretoria (2 Diretores, 1 Mestre, 1 Apoio) sem filtro de instrumento. Check de entrega persistiu corretamente em `figurino_entregas` apontando pro id da lista mestre (confirmado por SQL). Ficha do Bruno (ritmista de teste): seção "Entrega de Figurinos" mostrou só a peça de Ritmista com o check certo, sem a peça de Diretoria — confirma o filtro por público. Categoria de Figurino: as 5 categorias da Imperatriz continuaram todas ativas depois da troca de default, sem nenhuma mudança visível pra ela. Renomeação de "Figurino" pra "Entrega de Figurino" no menu confirmada ao vivo depois do pedido dela. Dados de teste (as 2 peças + a entrega marcada) apagados do banco antes de publicar.

Publicado em produção depois de aprovação explícita dela ("Pode subir e documenta tudo. Suba tb a questão do dashboard.").

## 52. Figurino: público granular (Ritmista/Mestre/Diretor/Apoio) + título livre no Exportar Excel (24/ago/2026)

Dois ajustes pedidos na sequência, depois de ela ver a seção 51 publicada.

### 52.1 Público granular

Ela pediu pra separar o campo `publico` de `figurino_itens_mestre` em 4 valores (um por perfil: `ritmista`, `mestre`, `diretor`, `apoio`) em vez do agrupado `'diretoria'` usado até então — "pode ser que tenha essa divisão e eu quero estar preparada pra isso", pensando numa bateria que no futuro queira uma peça diferente por cargo (ex: camisa de Mestre diferente da de Diretor). Sem dado real cadastrado ainda (confirmado por SQL antes de mexer), migração livre:

```sql
alter table figurino_itens_mestre drop constraint figurino_itens_mestre_publico_check;
alter table figurino_itens_mestre add constraint figurino_itens_mestre_publico_check
  check (publico in ('ritmista','mestre','diretor','apoio'));
```

**Efeito colateral bom**: `publico` passou a ser literalmente igual a `vinculos.perfil` — os filtros que antes precisavam de `perfil=in.(mestre,diretor,apoio)` (pra cobrir o bloco "diretoria") viraram um simples `perfil=eq.${item.publico}`, tanto na tela de entrega (`admin.html`, `carregarEntregasFigurino`) quanto na ficha (`ficha-perfil.js`, `fpRenderizarEntregaFigurino`: `const publico = alvo.perfil;`).

Consolidado numa única `LABEL_PUBLICO_FIGURINO`/`ORDEM_PUBLICO_FIGURINO` compartilhada (existiam 2 cópias quase iguais, uma pro Super Admin e outra pra bateria, achado limpando o código antes de generalizar) — todas as telas que agrupam Figurino por público (Super Admin → Configurações → Figurino, bateria → Configurações → Figurino, Mais → Entrega de Figurino) passaram a iterar `ORDEM_PUBLICO_FIGURINO = ['ritmista', 'mestre', 'diretor', 'apoio']`, sempre nessa ordem.

### 52.2 Exportar Excel: título livre

Pedido dela, depois de uma conversa que passou por duas ideias descartadas antes de chegar na final: primeiro cogitou um checkbox de Figurino que gerasse o título automaticamente (ex: marcar "Camisa da Final" geraria "Relatório: Camisa da Final"), depois percebeu sozinha que isso não cobre um relatório sem nada a ver com Figurino (seu próprio exemplo: "quero fazer um relatório do endereço dos ritmistas... não faz sentido ter esse tipo de título que estou propondo"). Decisão final: campo de texto **livre e opcional**, sem nenhuma lógica de Figurino embutida.

- Novo campo `#exportTituloCustom` no modal "Exportar Excel" (`admin.html`), logo abaixo do resumo, acima de "Quem exportar".
- `tituloRelatorio(ehRitmistas, sufixoGrupo)`: se o campo estiver preenchido, usa esse texto como título (ignorando o `statusLabelExportacao()` automático) — mas ainda soma o sufixo de grupo (`— Nome do Instrumento/Cargo`) quando a exportação é "separado por instrumento/cargo", senão as abas ficariam todas com o mesmo título, indistinguíveis.
- Nome do arquivo baixado (`XLSX.writeFile`) também usa o texto, sanitizado: `normalize('NFD')` + remoção da faixa Unicode de acentos combinados (`̀`-`ͯ`) + troca de qualquer caractere não alfanumérico por hífen + aparo de hífen nas pontas. Ex: "Camisas da Final" → `Camisas-da-Final-2026-08-24.xlsx`.
- Em branco, o comportamento é idêntico ao que já existia (título automático "Relatório de Ritmistas — Ativos...", nome de arquivo `ritmistas-2026-08-24.xlsx`).

**Caso de uso real que motivou**: Diretor quer mandar pra fábrica a lista de tamanho de camisa de todo mundo, pra confecção da "Camisa da Final" — exporta com o grupo "Medidas" marcado (já existente desde a seção 49, não precisou de nada novo) e escreve "Camisas da Final" no título, saindo já com nome de arquivo e título prontos pra enviar. Confirmado com ela que "categoria do figurino e sua medida" já é exatamente esse grupo "Medidas" — nenhuma tela nova precisou ser criada pra isso.

### 52.3 Verificação ao vivo

Público granular: criadas 4 peças de teste (uma por público) na lista mestre — confirmado agrupamento Ritmistas/Mestres/Diretores/Apoio nessa ordem, tanto no Super Admin quanto na tela de ativação da bateria (Configurações → Figurino) e na tela de Entrega. Ativada uma peça de Diretor e aberta a tela de entrega dela: mostrou só os 2 Diretores da Imperatriz, sem misturar com o Mestre nem o Apoio — confirma o filtro granular funcionando. Dados de teste apagados do banco depois.

Título livre: testado via `XLSX.writeFile` interceptado (sem baixar arquivo de verdade) — com "Camisas da Final" preenchido, saiu `{ nome: "Camisas-da-Final-2026-08-24.xlsx", a1: "Camisas da Final" }`; em branco, saiu exatamente o comportamento antigo (`ritmistas-2026-08-24.xlsx`, título "Relatório de Ritmistas — Ativos, Pendentes"). Os dois caminhos confirmados corretos antes de mostrar a prévia pra ela.

Publicado em produção depois de aprovação explícita dela ("pode subir e documenta tudo").

## 53. Aniversariantes com cargo/gênero, cores padronizadas na Visão Geral, resumo de entrega de Figurino e 2 bugs reais corrigidos (24/ago/2026, sessão seguinte)

Sequência de pedidos pontuais + uma frente grande (resumo de Figurino), todos publicados juntos em produção depois de aprovação dela ("pode subir para produção"), cada um antes testado numa prévia própria (3 branches: `preview/visao-geral-cor-pendentes`, `preview/figurino-resumo-visao-geral`, `preview/bugs-avatar-e-nav-mobile`, merge sequencial pra `main` com resolução manual do conflito de sempre em `CACHE_NAME` do `sw.js`).

### 53.1 Aniversariantes do mês mostra o cargo + selos de Mestre/Diretor seguem o gênero

Pedido dela: "inclua se a pessoa é ritmista, apoio, mestre ou diretor" no widget "Aniversariantes do mês" da Visão Geral — antes um ritmista sem instrumento aparecia só com "—", sem dizer nem que era ritmista. `renderizarVisaoGeral()` (`admin.html`) ganhou `cargoAniv` (Ritmista/Mestre/Diretor/Apoio, com variação de gênero pra Mestre/Diretor — ver abaixo) concatenado com o instrumento quando existe: "Ritmista · Repique".

Ela reforçou em seguida, geral: "esses selos de mestre e diretor tem que seguir a lógica do gênero escolhido". Ao implementar o rótulo novo, achados mais 3 lugares que já mostravam "Mestre"/"Diretor" fixos, sem checar `pessoas.genero` (a lógica correta — Mestre/Mestra, Diretor/Diretora, Apoio invariável — já existia em `fpCargoLabel()`, `ficha-perfil.js`, usada só no cabeçalho da própria ficha):

- `labelPerfilSA(p)` → `labelPerfilSA(p, genero)`: usada no selo do card de Diretoria e no cabeçalho do editor de Permissões (`abrirEditorPermissoesPessoa`).
- `histPerfilLabel(p)` → `histPerfilLabel(p, genero)`: usada no Histórico.
- `rotulo` do modal de Suspender/Desligar (Diretoria): ganhou a mesma checagem de gênero inline.

Duas buscas precisaram de `genero` a mais no `select` pra alimentar isso: `permissoesPessoaCache` (`ritmistas_com_instrumento?...&select=id,nome,apelido,perfil,genero,capacidades,...`) e o embed `pessoa:pessoa_id(nome,genero)` na query de `vinculos_historico_status`.

Testado ao vivo mudando temporariamente o gênero de uma Diretora de teste (Imperatriz) pra "Feminino" — confirmado "Diretora" no card da lista e no cabeçalho da ficha — e revertido pro valor original antes de seguir.

### 53.2 Visão Geral: cores padronizadas (Pendentes terracota, Ativos verde)

Dois pedidos dela, mesma lógica: reaproveitar cor que já significa a mesma coisa em outro canto do painel, em vez de inventar uma nova.

- **Pendentes**: "Quando algo está pendente no dashboard, não é isso? vc poderia colocar essa mesma cor no visão geral?" — os números de "Pendentes" (Ritmistas e Diretoria) na Visão Geral ficavam na cor de texto padrão, sem destaque, diferente do card "Pendências" do Dashboard do Super Admin (`.kpi.atencao`, terracota quando > 0). Nova classe `.total-numero.atencao` (reaproveita `var(--cor-terracota)`), aplicada condicionalmente em `atualizarTotalizadores()`/`atualizarTotalizadoresDiretoria()` quando `pendentes > 0`.
- **Ativos**: pergunta exploratória dela ("E o que acha de ativos ficar verde? assim vira padrão, correto?"), confirmada com "como o ativo é verde no status, eu acho que vale a pena esse padrão" — apontando pro selo verde "Ativo" (`.badge-aprovado`, `#2d7a4f`) já usado em toda lista de Ritmistas/Diretoria como a cor de referência certa (não o outro verde do app, `.badge-ativo`/`.kpi.ok`, `#2e7d32`, usado pra status de Escola/Bateria). Classe `.total-numero.dourado` renomeada pra `.total-numero.ativo` (só tinha 2 usos: "Ritmistas ativos" e "Diretoria ativa"), cor trocada de `#D4AF37` (dourado) pra `#2d7a4f`.

### 53.3 Resumo de entrega de Figurino na Visão Geral

Pedido dela: "no Visão Geral apareça um resumo da entrega dos figurinos... não tem como ficar todos lá". Card novo `#vg-figurino-card` (👕 Entrega de Figurino), abaixo do grid de Instrumentos/Aniversariantes, só visível quando existe pelo menos 1 peça em condição de aparecer.

Peça de Ritmista quebra por naipe/instrumento, mesmo desenho visual de "Ritmistas por Instrumento" (`.vg-instrumento-linha`/`.vg-instrumento-qtd`/`.vg-instrumento-faltam`, sem CSS novo) — mas o **denominador é gente ativa daquele naipe**, não vaga configurada (conceito diferente do widget de vagas): `entregues / total_de_ritmistas_ativos_do_naipe`, "Faltam N" quando não bateu, pílula verde quando bate 100%. Peça de Mestre/Diretor/Apoio (sem naipe) mostra um total simples (ex: "Diretores — 2/3"), decisão dela confirmada por pergunta direta (opção "total simples" x "agrupado por cargo" x "não aparece").

**Desenho passou por 2 versões antes de fechar**, depois de um mal-entendido real que valeu a pena registrar como lição:

1ª versão: um único interruptor "Entrega encerrada" em `bateria_figurino_itens`, nascendo **desligado** — ou seja, ativar a peça em Configurações já bastava pra ela aparecer no resumo. Testada e publicada numa prévia, aprovada por ela inicialmente. Só que ao perguntar "já está concluída?", ela apontou o problema de verdade: **"se eu tiver 30 criadas e não encerradas vão aparecer as 30. E o fato de eu ter configurado com antecedência, quer dizer que eu quero mostrar na Visão Geral [não necessariamente]."** — ou seja, configurar uma peça com antecedência (planejamento) não é o mesmo que estar pronta pra aparecer publicamente no resumo.

2ª versão (final): **dois interruptores independentes**, os dois nascendo desligados, confirmados com ela via pergunta de múltipla escolha antes de implementar:
- `mostra_visao_geral` (rótulo "Mostrar na Visão Geral") — ela liga explicitamente quando decide acompanhar aquela peça. Nasce desligado sempre, mesmo peça recém-ativada.
- `entrega_finalizada` (rótulo "Entrega Finalizada") — "quer dizer que eu não tenho mais que me preocupar com aquele item e entregar mais nada pra ninguém". Também esconde do resumo, **mesmo com "Mostrar" ligado** (`&&` na query: `mostra_visao_geral=eq.true&entrega_finalizada=eq.false`).

```sql
alter table bateria_figurino_itens drop column entrega_encerrada; -- 1ª versão, descartada
alter table bateria_figurino_itens add column mostra_visao_geral boolean not null default false;
alter table bateria_figurino_itens add column entrega_finalizada boolean not null default false;
```

Os dois interruptores moram na própria tela de entrega da peça (Mais → Entrega de Figurino → abrir a peça), não em Configurações → Figurino — decisão confirmada com ela por pergunta direta (a alternativa era colocar em Configurações, junto do "ativo", mas isso misturaria "a bateria usa essa peça" com "a entrega dessa temporada já terminou/está visível", perguntas diferentes).

`carregarResumoEntregaFigurino()` (`admin.html`) faz 3 buscas em paralelo depois de achar as peças elegíveis: `figurino_itens_mestre` (nome/público), `ritmistas_com_instrumento` (pessoas ativas do(s) público(s) envolvido(s)) e `figurino_entregas` (quem já recebeu) — computa localmente contagem por naipe e ordena por "quem mais falta primeiro" (`faltam` desc), exatamente o caso de uso dela ("o mestre vai saber qual naipe tá faltando entregar camisa e pode cobrar do diretor responsável"). Card some por completo quando a busca de peças elegíveis volta vazia.

**Achado de espaçamento** depois de aprovado: sem gap entre o grid de 2 colunas (Instrumentos/Aniversariantes) e o novo card — o último `.vg-card` de um `.vg-grid-2col` sempre zera `margin-bottom` (pra não duplicar o gap do próprio grid), então o card seguinte, fora do grid, colava direto nele. Corrigido com `margin-top:16px` inline no `#vg-figurino-card`, mesmo valor do gap padrão.

Testado ao vivo 2 vezes (uma por versão do desenho) na Imperatriz Leopoldinense: criada peça de teste (`figurino_itens_mestre`), ativada pra bateria, marcadas entregas parciais, conferido o resumo aparecendo com naipe/pílula/"Faltam N" corretos, interruptores ligados/desligados em combinação, card sumindo quando esperado — dados de teste sempre apagados do banco antes de seguir. Na verificação final (já com o modelo de 2 interruptores em produção), usadas 3 peças reais que ela mesma já tinha cadastrado nesse meio-tempo ("Camisa da Final", "Camisa da Rainha", "Camisa do Mini Desfile") pra testar sem duplicar dado — estado original (interruptores desligados, sem entrega marcada) restaurado depois do teste.

### 53.4 Dois bugs reais corrigidos

**Menu do rodapé no celular, nome sumindo ao selecionar**: achado dela usando o celular de verdade. `.aba-btn.ativa`/`.sa-sidebar-item.ativa` (desktop) usam pílula dourada sólida + texto escuro (`#12101a`) por cima — desenho correto pra fundo claro. No celular, a barra vira rodapé fixo com fundo escuro (`var(--cor-fundo-escuro)`) e o override mobile já existente só tirava o fundo dourado (`background: none`, pra não formar uma pílula estranha numa barra horizontal) — mas **não** trocava a cor do texto, que continuava `#12101a` (quase preto) sobre um fundo quase preto: texto praticamente invisível. Corrigido adicionando `color: var(--cor-destaque)` (dourado) no mesmo override mobile — ícone + texto ficam dourados quando selecionado, sem pílula.

**Foto do Super Admin não aparecia na bolinha do cabeçalho**: dois bugs encadeados, achados investigando o relato dela ("acabei de colocar a foto... não está aparecendo").

1. `login.html`, fluxo de login do Super Admin (`pessoa.super_admin`): o `select` na tabela `pessoas` nunca pedia `foto_url` (só `id, nome, super_admin`), e o objeto salvo em `localStorage.ritmista` também não incluía o campo — mesmo com a foto certa no banco, o login nunca a carregava. Corrigido incluindo `foto_url` nos dois lugares. (O fluxo normal de Mestre/Diretor/Ritmista, via `ritmistas_com_instrumento?select=*`, já trazia `foto_url` corretamente — bug era só do caminho específico do Super Admin.)
2. Mesmo com a foto certa salva, editar "Meu Perfil" (Super Admin **ou** Mestre/Diretor) não atualizava a bolinha do cabeçalho na mesma sessão: `fpSalvar()` (`ficha-perfil.js`) já atualiza `localStorage.ritmista` com dado fresco do banco quando é autoedição, mas nada re-renderizava `#headerAvatarWrap` depois disso — só um reload/relogin pegava o valor novo. Corrigido registrando `aoSalvar: (novosDados) => renderizarAvatarHeader(novosDados)` nos dois pontos de entrada de "Meu Perfil" (`iniciarMeuPerfilSaAba`, `iniciarMeuPerfilAba`), reaproveitando o mesmo hook `aoSalvar` já usado noutros lugares (ex: recarregar lista depois de editar um Ritmista).

Verificado em produção com login novo (sessão antiga, criada antes do deploy, não carrega o campo novo até logar de novo — comportamento esperado, não é bug): `localStorage.ritmista.foto_url` presente depois do login, bolinha do cabeçalho mostrando a foto real. Menu do rodapé mobile verificado por simulação de CSS (injeção de `<style>` reproduzindo a media query, sem emulação de viewport real disponível no ambiente) — pedido a ela pra confirmar num celular de verdade antes/depois de aprovar.

**Falso alarme registrado pra não redescobrir**: ao testar em produção logo após o deploy, uma aba de teste antiga (sessão de Supabase Auth expirada, mas com `localStorage.ritmista` ainda presente do app) mostrou Dashboard zerado (0 escolas, sem o card "Escolas DEMO") — parecia bug grave. Confirmado com login novo, numa aba limpa, que é comportamento correto: sem sessão válida do Supabase Auth (`sb.auth.getSession()` vazio), `authHeaders.Authorization` fica preso no valor inicial (a `anon key`, nunca substituída pelo token de sessão de `iniciarSessaoAuth()`), e RLS bloqueia silenciosamente as tabelas protegidas — devolve array vazio, não erro. Não é um bug introduzido nesta sessão; é como o app já se comportava com sessão expirada. Login novo resolve.

## 54. Categoria de Figurino Tradicionais/Especiais, Visão Geral empilhada e polimento de Entrega de Figurino (24/ago/2026, sessão seguinte)

Três frentes pontuais, publicadas juntas em produção depois de aprovação dela ("Perfeito. Pode subir para produção."), cada uma testada numa prévia própria antes (3 branches: `preview/categoria-figurino-tradicionais-especiais`, `preview/visao-geral-empilhada`, `preview/entrega-figurino-cabecalho-e-caixa-tamanho` — merge sequencial pra `main`, com o conflito de sempre em `CACHE_NAME` do `sw.js` resolvido manualmente pra ficar com a versão mais alta das três).

### 54.1 Categoria de Figurino: grupo Tradicionais (obrigatório) / Especiais (opcional)

Pedido dela, mesmo rótulo/agrupamento visual já usado em Instrumentos: "assim como nos Instrumentos, pensei em separá-los entre Tradicionais e Especiais... os tradicionais sempre serão campos obrigatórios de preenchimento e especiais não serão obrigatórios". Motivação concreta que ela deu: se um Repique entra no fim da temporada, o cadastro dele pode mostrar campos de Categoria que só existem pra outro naipe (ex: "Vestido", pensado só pro Chocalho) — sem essa separação, todo campo era obrigatório pra todo mundo, mesmo quando não fazia sentido pra aquela pessoa.

Implementado direto em `medida_tipos` (não existe uma tabela de categoria separada da nomenclatura, diferente de Instrumentos):

```sql
alter table medida_tipos add column grupo text not null default 'tradicional'
  check (grupo in ('tradicional', 'especial'));
```

- **Super Admin (Configurações → Categoria de Figurino)**: editor de tipo ganhou `<select id="mt-edit-grupo">` (Tradicional/Especial); lista mestre agrupada em Tradicionais/Especiais via nova constante `GRUPOS_MEDIDA_TIPO = [['tradicional','Tradicionais'],['especial','Especiais']]` e helper `cardMedidaTipoSA(t)` extraído de `renderizarMedidaTiposListaSA()`.
- **Admin (Configurações → Categoria de Figurino, por bateria)**: mesma lógica, helper `cardConfigMedidaTipo(tipo)` extraído de `renderizarConfigMedidas()` — reaproveita `GRUPOS_MEDIDA_TIPO`. Comentário no código reverte explicitamente a decisão de 22/ago/2026 de omitir título de grupo nessa tela (fazia sentido só quando cada grupo tinha 1 item — deixou de valer com Tradicionais/Especiais podendo ter vários).
- **`bateria_medidas_publicas`** (view pública, sem `security_invoker` — nunca teve, então recriar não carrega risco de segurança, confirmado via `pg_class.reloptions` antes de mexer): ganhou `mtip.grupo AS tipo_grupo`.
- **`cadastro.html`**: campo de Medida só fica `required` (com o `*`) quando `t.grupo !== 'especial'` — Especial fica opcional, sem forçar preenchimento de quem não usa aquela peça.

**Bug real achado e corrigido testando ao vivo**: `sincronizarTamanhosMTDoDOM()` (função criada em 23/ago/2026 pra evitar perder Nome/Ativo no re-render disparado por "+ Adicionar tamanho") não tinha sido estendida pro campo `grupo`, novo nesta sessão — selecionar "Especial" e depois clicar "+ Adicionar tamanho" (sequência natural de uso) resetava a seleção de volta pra "Tradicional" antes de salvar. Confirmado via query direta no banco (registro salvo com `grupo='tradicional'` apesar de ter selecionado "Especial" na tela) e corrigido adicionando `grupo` à mesma função de sincronização.

Testado ao vivo de ponta a ponta na Imperatriz Leopoldinense: categoria de teste ("TESTE Vestido", grupo especial, tamanho "Único") criada, ativada pra bateria, conferida nas 3 telas (lista agrupada do Super Admin, lista agrupada do Admin, formulário público sem `*`/`required`) — depois toda a cadeia de dado de teste apagada (`bateria_medidas`, `bateria_medida_tipos`, `medida_tamanhos`, `medida_tipos`).

### 54.2 Visão Geral: cards empilhados, não mais grid de 2 colunas

Pedido dela, com print mostrando o problema: o grid `.vg-grid-2col` (Ritmistas por Instrumento + Aniversariantes lado a lado) deixava um vão vazio feio embaixo do card mais curto sempre que o outro crescia mais — "fica esse espaço vazio e não achei legal". Pedido explícito de nova ordem: "coloca aniversariantes primeiro... e depois os ritmistas por instrumento e depois as entregas de figurino".

Removido `.vg-grid-2col` e os overrides de `@media (max-width: 560px)` que só existiam por causa dele (o grid já forçava 1 coluna no mobile só nesses overrides — sem grid, não precisam mais existir). Os 3 cards (Aniversariantes, Ritmistas por Instrumento, Entrega de Figurino) viraram `<div class="vg-card">` simples em sequência, cada um com o `margin-bottom:16px` padrão da classe — inclusive o `#vg-figurino-card`, que teve o `margin-top:16px` inline (adicionado em 24/ago, seção 53.3, pra compensar o último card do grid zerando `margin-bottom`) removido: sem grid, não existe mais esse caso especial, o espaçamento padrão entre `.vg-card` já resolve sozinho.

### 54.3 Entrega de Figurino: cabeçalho de coluna, caixinha no tamanho e rótulo "Entrega Iniciada"

Pedido dela olhando a tela de detalhe de uma peça (Mais → Entrega de Figurino → abrir peça): "coloque um título... coloque uma linha e coloque os títulos Tamanho e Status embaixo de medidas e o 'Entregue'... Igual ao título que tem em Vaga por Instrumento. E o tamanho da roupa, coloque dentro de uma caixinha, para ficar mais bonito."

- **Cabeçalho de coluna**: reaproveita `.config-vagas-cabecalho` (mesma classe já usada em Vagas de Ritmistas e no cabeçalho de Instrumentos) com overrides inline pra essa tela — `padding:0 0 6px` (a lista de Entrega não tem o padding horizontal de 20px que a de Vagas tem) e dois `<span>` ("Tamanho" 44px, "Status" 78px) posicionados imediatamente antes de `#figurino-entregas-lista`.
- **Caixinha de tamanho**: nova classe `.figurino-tamanho-caixa` (borda 1.5px `#e0e0e0`, cantos 6px, mesma linguagem visual de `.config-vaga-input`, mas somente-leitura) envolve o valor de tamanho de cada pessoa em `renderizarEntregasFigurinoLista()`, no lugar do texto solto que existia antes.
- **Respiro entre colunas**: primeira versão da prévia usou `gap:10px` (igual ao resto da linha, nome+tamanho+status) — ela pediu mais respiro especificamente entre Tamanho e Status, mandando um print de referência de Vagas de Ritmistas com a régua marcada. Corrigido pra `gap:32px` em ambos (linha de dado e cabeçalho), o mesmo valor já usado em `#config-vagas-lista .item-acoes` pro mesmo tipo de par de colunas (achado da Márcia em 19/ago/2026, documentado ali como "2 colunas de dado de verdade, precisam de mais respiro entre si").
- **Rótulo do interruptor**: "Mostrar na Visão Geral" (criado em 24/ago/2026, seção 53.3) renomeado pra "Entrega Iniciada" — só o texto visível trocou; id (`figurino-mostra-visao-geral`), função (`toggleMostraVisaoGeral`) e coluna no banco (`bateria_figurino_itens.mostra_visao_geral`) continuam com o nome antigo, atualizado também o texto de ajuda logo abaixo dos dois interruptores e os comentários no código que citavam o rótulo antigo entre aspas, pra não ficar desalinhado do que a tela mostra.

Testado ao vivo em 2 rodadas de prévia (cabeçalho/caixinha primeiro, depois o ajuste de respiro + rótulo) na Imperatriz Leopoldinense, item "Camisa da Final" — conferido visualmente com zoom que "Tamanho"/"Status" alinham exatamente acima da caixinha e do checkbox "Entregue" de cada linha.

## 55. Auditoria de segurança pós-grandes-mudanças + 6 achados corrigidos (24/ago/2026, sessão seguinte)

Pedido dela antes de liberar o sistema pra uso real hoje: "que depois de tantas mudanças no banco você analise se tem algum dado que esteja com problemas de vazamento de dados... isso era importante revisitar sempre depois de grandes mexidas" — mesma disciplina já usada na revisão de 18/jul/2026 (seção 31) e na correção de `ritmistas_com_instrumento` durante a unificação Admin/Super Admin (seção 41). Analisado **antes** de começar o teste de release pedido por ela (criar escola/bateria/instrumentos/figurino/pessoas do zero e passar por todo o ciclo de aprovação) — ela mesma condicionou o início dos testes a essa auditoria estar limpa primeiro.

**Metodologia**: relatório automático de segurança do Supabase (`get_advisors`, tipo security) + inspeção manual de cada view/função `SECURITY DEFINER` (que ignoram RLS de propósito) achada por ele, cruzando com quem de fato tem `GRANT`/`EXECUTE` pro papel `anon` (via `has_table_privilege`/`has_function_privilege`, não só a lista de policies — RLS habilitada não basta se o `GRANT` de base ainda libera acesso). Todo achado foi confirmado com uma chamada HTTP real usando a chave pública (`anon`) contra a API do Supabase em produção, exatamente como um invasor sem login faria — não só teoria de permissão.

### 55.1 Achados, por gravidade

1. **🔴 CRÍTICO — exclusão de LGPD sem checagem de quem chama.** `excluir_pessoa_lgpd` e `excluir_escola_lgpd` (ambas `SECURITY DEFINER`, pensadas pra só serem chamadas pela tela Super Admin → Privacidade) nunca verificavam `is_super_admin()` — só bloqueavam excluir a própria conta de Super Admin (proteção do alvo, não de quem chama). Como ficam expostas em `/rest/v1/rpc/...`, **qualquer pessoa sem login conseguia apagar qualquer pessoa ou escola do sistema inteiro**, de forma irreversível (mesma característica de "sem desfazer" da exclusão normal, seção 20/jul/2026).
2. **🟠 ALTO — QR de emergência sem escopo.** `ritmistas_emergencia` (usada por `qr.html`, sem login por desenho — exceção documentada na política de privacidade) aceitava qualquer `pessoas.id` sequencial, sem checar vínculo ativo nem nada. Como os ids iam de 1 a 103 (`pessoas`, 40 linhas reais), dava pra "varrer" nome + tipo sanguíneo + nome/parentesco/celular do contato de emergência de **todo mundo já cadastrado** — inclusive rejeitado/desligado/de escola demo — só trocando o número na URL.
3. **🟡 MÉDIO — oráculo CPF → nome/e-mail.** `buscar_pessoa_por_cpf` (`SECURITY DEFINER`) devolvia nome e e-mail a partir de um CPF, sem login. Confirmado por busca no código que não é chamada por nenhuma tela hoje (provavelmente um artefato de uma versão anterior da checagem de duplicidade, que usa `verificar_pessoa_existente` — só booleanos, seguro) — mas continuava ativa e chamável.
4. **🟡 MÉDIO — `baterias_publicas` sem filtro.** View usada por `cadastro.html` (resolver o link fixo por `codigo_convite` ou id numérico antigo) não tinha `WHERE` nenhum — uma consulta sem parâmetro devolvia nome + `codigo_convite` de **todas** as baterias do sistema de uma vez, inclusive demo/não lançadas, sem login.
5. **🟢 BAIXO — `mestres_publicos` sem filtro.** Mesmo problema estrutural, gravidade menor (nome/apelido/gênero de Mestre aprovado, papel já semipúblico dentro do meio, sem CPF/telefone/endereço). `carteirinha.html` sempre filtra por `bateria_id`, mas nada no banco obrigava isso — uma consulta sem filtro trazia todo Mestre aprovado do sistema inteiro.
6. **🟢 BAIXO — política com nome desalinhado do que fazia.** `figurino_itens_mestre` tinha uma policy de `SELECT` chamada `select_autenticado_...` (nome sugere "exige login"), mas o papel configurado era `{public}` (inclui `anon`) em vez de `{authenticated}` — inconsistência entre intenção e implementação. Dado exposto era só nome de peça de Figurino (não é dado pessoal), mas sem motivo pra ficar aberto.

Confirmado no caminho que a view historicamente corrigida (`ritmistas_com_instrumento`, seções 31/41) **continua correta** — `security_invoker=true` intacto, `anon` sem acesso — apesar de ter sido recriada várias vezes desde então (seções 41, 42, 49, 51 e, nesta mesma sessão, pra ganhar a coluna `qr_token` — ver 55.2).

### 55.2 Correções aplicadas

- **1 e 3** (exclusão LGPD + oráculo CPF): `excluir_pessoa_lgpd`/`excluir_escola_lgpd` recriadas com `IF NOT is_super_admin() THEN RAISE EXCEPTION` logo no início (mesmo padrão de checagem já usado em RLS por todo o banco), mais `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated` (defesa em profundidade — mesmo sem a checagem interna, `anon` não consegue mais nem tentar). `buscar_pessoa_por_cpf` teve o `EXECUTE` revogado de `PUBLIC, anon, authenticated` por completo — sem uso real, sem motivo pra continuar exposta.
- **2** (QR de emergência): nova coluna `pessoas.qr_token` (`uuid`, `default gen_random_uuid()`, índice único) — identificador aleatório de 128 bits, impossível de adivinhar, substitui o `pessoas.id` sequencial em toda essa cadeia. `ritmistas_emergencia` recriada selecionando `qr_token` no lugar de `id` (só quem tem o token de verdade consegue ler os dados). `ritmistas_com_instrumento` ganhou `qr_token` no `SELECT` (com `security_invoker=true` reafirmado depois, mesma disciplina da seção 41) pra `carteirinha.html` conseguir montar a URL do QR sem expor `pessoas.id`. **Achado no caminho**: a geração do QR em `carteirinha.html` usava `ritmista.id` (que é `vinculo_id`, pela convenção documentada no `CLAUDE.md` — "`.id` em card/lista/URL significa vínculo, não pessoa") pra consultar uma view que sempre selecionou de `pessoas` — ou seja, além do buraco de segurança, o QR já rodava com o id errado (só "funcionava" por coincidência quando `vinculo_id` e `pessoa_id` batiam). Corrigido junto, usando `qr_token` (que não tem essa ambiguidade).
- **4 e 5** (`baterias_publicas`/`mestres_publicos` sem filtro): as duas views viraram funções `SECURITY DEFINER` que exigem o identificador como parâmetro — `resolver_bateria_publica(p_identificador text)` (aceita tanto `codigo_convite` quanto id numérico antigo, mesma lógica que já existia no front) e `mestres_publicos_da_bateria(p_bateria_id bigint)`. Sem o parâmetro, não tem como "listar tudo" numa chamada só. Views antigas mantidas na tabela mas com `SELECT` revogado de `anon`/`authenticated`/`public` (inertes, não apagadas). `cadastro.html` e `carteirinha.html` atualizados pra chamar as funções novas via `POST /rest/v1/rpc/...` no lugar do `GET` direto na view.
- **6** (`figurino_itens_mestre`): `ALTER POLICY select_autenticado_figurino_itens_mestre ON figurino_itens_mestre TO authenticated` — sem mudança de código, todo uso real (`admin.html`) já manda o token de sessão de verdade.

### 55.3 Verificação

Cada um dos 6 itens testado duas vezes: **(a)** chamada HTTP direta com a chave `anon` contra a API em produção, confirmando bloqueio (`401 permission denied` pras funções/views revogadas; `400 column does not exist` pro `id` que sumiu de `ritmistas_emergencia`; array vazio pra RLS sem policy aplicável) — **(b)** o caminho legítimo (com o parâmetro/token certo) confirmado funcionando, também via chamada real: `resolver_bateria_publica` por código novo e por id antigo, `mestres_publicos_da_bateria`, `ritmistas_emergencia` por `qr_token`. Depois, prévia (`preview/correcao-seguranca-vazamento-dados`) testada ao vivo no navegador: carteirinha completa (frente + verso com Mestre "Lolo" e QR renderizado) do vínculo `id=125` (Teste Apoio, Imperatriz), QR escaneado abrindo `qr.html?t=...` com os dados certos, `qr.html?id=1` (formato antigo) mostrando "QR code inválido", e cadastro via link fixo funcionando nos dois formatos de URL (`?bateria=7e7474f5` e `?bateria=2`). Aprovado por ela ("corrigir tudo agora") e publicado em produção.

**Nenhum dado real foi exposto durante a auditoria** — os testes de leitura usaram a conta de teste "Teste Apoio" (Imperatriz, mesma conta já usada em sessões anteriores) e as tentativas de exclusão/oráculo usaram ids inexistentes (`999999`) ou CPF fictício (`00000000000`), sempre esperando erro.

## 56. Sessão de 25/ago/2026: soluço de infraestrutura, achado real da lentidão (fotos sem cache), gatilho bloqueando escrita em `baterias`, e correções pontuais

Sessão longa, disparada por ela reportando "Ativar" travando no painel. Cobre cinco frentes distintas, na ordem em que aconteceram.

### 56.1 Soluço de infraestrutura (banco reiniciou sozinho, ~14h38-14h54 horário de Brasília)

Investigação nos logs (`postgres_logs`) achou: `database system was interrupted; last known up at 2026-08-25 17:38:14 UTC` seguido de `automatic recovery in progress` e reinício às 17:42:11 UTC — o compute do Postgres (lado Supabase, não código do TumTu) reiniciou sozinho. Antes e depois do reinício, uma sequência de `canceling statement due to statement timeout` (17:19-17:54 UTC) explica a janela real de lentidão/travamento que ela viveu — nada relacionado a mudança de código do dia. Sem ação corretiva possível do nosso lado (infraestrutura do provedor); registrado só pra não ser confundido com bug de código numa investigação futura.

### 56.2 Achado real por trás da lentidão: fotos em base64 sem cache nenhum

Confirmado com `EXPLAIN ANALYZE`: a consulta que traz os Ritmistas roda em milissegundos (7ms pros 111 da Imperatriz) — **não é volume de dado nem consulta lenta**. O problema real: `pessoas.foto_url` guarda a foto de cada pessoa como texto base64 direto na linha (não como link pra um arquivo à parte, tipo Supabase Storage) — medido em 174KB de média, **22MB somando as 128 pessoas da Imperatriz**. Como é texto embutido na resposta JSON (não uma URL de imagem separada), **o navegador nunca consegue guardar isso em cache sozinho** — toda vez que a lista de Ritmistas/Diretoria recarrega, baixa a foto de todo mundo de novo, inteira. Isso rodava: (a) a cada 30s sozinho (atualização automática, seção do dia anterior), (b) logo depois de qualquer Ativar/Suspender/Rejeitar/Desligar/Reativar, porque essas ações recarregam a lista pra atualizar a tela, e (c) ao abrir a tela pela primeira vez. Caso (b) é a causa raiz do "Ativar sem resposta": o banco aprovava na hora (confirmado por consulta direta, menos de 1s), mas a tela ficava presa baixando 22MB antes de mostrar qualquer coisa, sem nenhum aviso de "aguarde" — daí o Diretor clicando a mesma pessoa 6-7 vezes seguidas achando que travou (confirmado no histórico de requisições).

**Conserto definitivo (comprimir as fotos de verdade, já salvas e futuras) ficou pra depois, com calma** — mexe em dado real de gente de verdade, decisão dela de não fazer isso sob pressão. Confirmado nessa sessão que a ferramenta certa (Pillow, Python) já está disponível neste ambiente quando for a hora.

### 56.3 Três mitigações aplicadas (sem tocar em nenhum dado de foto)

Todas em `admin.html`, cobrindo os três casos acima sem risco de perda de qualidade/dado:

1. **`leve=true` em `carregarRitmistas()`/`carregarDiretoria()`** — nova constante `COLUNAS_RITMISTAS_SEM_FOTO` (lista explícita de colunas da view `ritmistas_com_instrumento` exceto `foto_url`) usada pela atualização automática de 30s. `reaproveitarFotosCache()` reaplica a foto já carregada de quem já estava na tela (sem apagar nada visível); só quem aparece pela primeira vez nesse ciclo de fundo fica sem foto até o próximo carregamento completo.
2. **Reload pós-ação também usa `leve=true`** — `atualizarStatus()`, `aprovarDiretor()`, `rejeitarDiretor()`, `abrirModalSuspender()`/`abrirModalDesligar()` (via `acaoAtualRecarregar`) e `recarregarDiretoria()` passaram a recarregar leve depois de Ativar/Rejeitar/Suspender/Desligar/Reativar. Fecha a lacuna real por trás do "Ativar sem resposta". Reload depois de **editar ficha** (`fpIniciar aoSalvar`) continua completo de propósito — é o único caminho onde a própria foto pode ter mudado de verdade.
3. **Primeira carga da tela: "mostra rápido, foto entra depois"** — `carregarRitmistasComFotos()`/`carregarDiretoriaComFotos()` (usadas em `entrarContextoEscolaSA` e no fluxo normal de Mestre/Diretor/Apoio) buscam `leve` primeiro (nome, status, tudo já clicável na hora — cada card sem foto cai no mesmo fallback que sempre existiu, a inicial do nome) e completam com a foto de verdade logo em seguida, silenciosamente. Corrigido junto um pisca-pisca que essa mudança teria causado: `carregarDiretoria()` só remonta o spinner de "carregando" quando a lista ainda está vazia (`!listaDiretoriaAtual.length`), não mais toda vez que é chamada.

Bônus: `entrarContextoEscolaSA()` também teve 5 pedidos sequenciais ao banco (escola, baterias, biblioteca de instrumentos, instrumentos da bateria, nome escola/bateria) reorganizados em 2 levas com `Promise.all` onde não há dependência real entre eles — reduz o tempo até a tela sequer começar a mostrar algo.

### 56.4 Gatilho de proteção bloqueando `UPDATE` direto em `baterias` (mesmo padrão de `pessoas`/`vinculos`)

Ao tentar corrigir a logo da bateria da Imperatriz direto via SQL (ver 56.5), `UPDATE baterias SET logo_url = ...` **parecia funcionar sem erro** (retornava `RETURNING` normal) mas o valor nunca mudava de verdade — confirmado repetindo a mesma tentativa várias vezes, sempre voltando ao valor antigo. Causa: `baterias` tem o mesmo gatilho de proteção `BEFORE UPDATE` já documentado pra `pessoas`/`vinculos` (`trg_matriz_edicao_baterias` → `aplicar_matriz_edicao_baterias()`), que reverte silenciosamente campos que a pessoa autenticada (ou, nesse caso, a ausência de uma sessão de usuário de verdade ao rodar SQL direto) não tem permissão de mudar por esse caminho. **Padrão a lembrar pra qualquer correção manual futura em qualquer tabela com esse tipo de gatilho**: `ALTER TABLE <tabela> DISABLE TRIGGER <nome_do_gatilho>;` antes do `UPDATE`, e `ENABLE TRIGGER` de volta logo em seguida, na mesma migração.

### 56.5 Logo da bateria "Swing da Leopoldina" corrigida

Achado dela: o círculo dourado da logo (verso da carteirinha) não ficava "certinho" dentro da moldura que o TumTu desenha por cima de toda logo de bateria. Investigação: o arquivo cadastrado (`baterias.logo_url`, bateria id=13) tinha uma margem transparente de ~14px ao redor do círculo verde (numa imagem de 500×500px) — quando o TumTu desenha seu próprio anel colorido bem na borda do quadro (`.v-logo`, `box-shadow`), sobrava um respiro visível entre o anel da arte e o anel do TumTu. Corrigido recortando a imagem rente ao círculo (removendo a margem, sem perder nenhum pixel da arte em si) e comprimindo pra 120×120px (mais que suficiente pro tamanho real de exibição, ~100px). Arquivo de referência salvo em `imagens/carteirinhas de escola de samba/logo-swing-recortada-25ago.png`. Achado no caminho: o gatilho da seção 56.4 fez a primeira e segunda tentativa de correção parecerem bem-sucedidas sem realmente mudar nada — só descoberto ao comparar o tamanho do arquivo antes/depois via `char_length(logo_url)`.

### 56.6 Aniversariantes do mês: totalizador + acordeão sempre aberto

Pedido dela: mesmo padrão de totalizador (pílula com número) já usado em "Ritmistas por Instrumento", e a opção de fechar o card pra ver o resto da tela com mais facilidade. Diferença importante em relação aos outros acordeões da Visão Geral (que nascem fechados, ex: Ritmistas por Instrumento desde 25/ago): esse precisa **sempre nascer aberto** a cada carregamento da tela, nunca lembrando que a pessoa fechou da última vez — `vgAniversariantesAberto` reinicia `true` toda vez que a página carrega, sem persistência em `localStorage` nem em lugar nenhum.

### 56.7 Backlog de medida: ver seção separada

O acompanhamento da limpeza manual de medida perdida no autocadastro (bug de antes de 23/ago) tem entrada própria no `CLAUDE.md`, seção "Estado atual" — não duplicado aqui.

## 57. Sessão de 26/ago/2026: Repique de Bossa controlado por permissões, campos obrigatórios (achado: nunca publicado), Convidados com Instrumento, card "Menores ativos", e caso de conta órfã no cadastro

### 57.1 Repique de Bossa vira campo controlado por permissões — só dentro da ficha/Meu Perfil

Pedido dela: "Registro de Bossa" (= Repique de Bossa) é campo delicado ("impacta muito na vaidade das pessoas"), então a linha editável dentro de Meu Perfil/ficha do Ritmista deixou de ser visível/editável por padrão pra Diretoria e passou a depender de permissão explícita, em duas frentes independentes:

- **Ritmista (autoedição)**: dois novos interruptores por bateria em Permissões → Ritmistas — `baterias.ritmista_pode_ver_repique_bossa` e `baterias.ritmista_pode_marcar_repique_bossa` (`boolean NOT NULL DEFAULT false` os dois, nascem desligados).
- **Diretoria (Mestre/Diretor/Apoio vendo/editando a ficha de um Ritmista)**: duas novas capacidades por pessoa, `ver_repique_bossa`/`editar_repique_bossa`, dentro do grupo "Ritmistas" já existente em Permissões — separadas de `editar_ritmistas` de propósito: ninguém tem acesso até ser liberado pessoa por pessoa, mesmo quem já edita Ritmistas normalmente.

Trava real em dois níveis, não só visual: `aplicar_matriz_edicao_vinculos()` reverte a coluna `repique_bossa` no próprio banco quando falta a capacidade certa (movida de dentro do bloco de `editar_ritmistas` pra um `if` próprio, e adicionada reversão na autoedição condicionada a `ritmista_pode_marcar_repique_bossa`); em `ficha-perfil.js`, o bloco `fp-bloco-repique-bossa` nasce **sempre escondido** em `fpIniciar`, e só é revelado por `fpAplicarPermissaoRepiqueBossa` (nova função assíncrona, mesmo padrão fire-and-forget de `fpAplicarPermissaoRitmistaMedidas`) depois de confirmar a permissão — nunca põe o valor real no DOM antes de checar, em vez de só esconder um bloco já preenchido.

**Correção de escopo, no meio da mesma sessão**: a primeira implementação também escondeu o selo "Repique de Bossa" no card da lista de Ritmistas, a opção de filtro por Repique de Bossa, e o nome mostrado na carteirinha (que trocava pra "Repique de Bossa" no lugar do instrumento) — checando as mesmas capacidades novas. Ela esclareceu que a sensibilidade era só sobre o **campo dentro da ficha/Meu Perfil**; esses 3 pontos sempre foram públicos (o selo funciona como o próprio nome do instrumento) e deviam continuar assim. Revertido de volta ao comportamento de sempre nesses 3 lugares (badge no card, checkbox de filtro em `admin.html`, `nomeInstrumentoExibido` em `carteirinha.html` nos dois modos — self e `?id=` via admin) — só a trava dentro da ficha permanece.

Publicado em produção (merge direto a pedido dela, dado o caráter sensível/urgente do pedido).

### 57.2 Campos obrigatórios com asterisco na ficha — achado real: a trava já existia mas nunca foi publicada

Ela pediu pra marcar com asterisco (`*`) os campos obrigatórios em Meu Perfil/ficha, igual `cadastro.html`. Investigando, achado real: a **trava de Salvar** com campo obrigatório em branco (Nome, CPF, Nascimento, Celular, E-mail, Endereço, Número, Cidade, Estado, País, Emergência, Responsável, Instrumento) tinha sido construída e testada em 25/ago/2026 (commit `eb2aca9`, `FP_CAMPOS_OBRIGATORIOS` em `ficha-perfil.js`) — mas ficou numa branch de preview (`preview/campos-obrigatorios-na-ficha`) que nunca chegou a ser publicada. Ou seja: até esta sessão, essa trava simplesmente **não existia em produção** (só a de Medida, essa sim já estava no ar desde antes).

Corrigido nesta sessão: mergeada essa branch esquecida pra `main` (único conflito real foi `CACHE_NAME` em `sw.js`, resolvido incrementando), e adicionado o asterisco visual (esse sim, novo — nunca tinha sido feito nem naquela branch antiga) em `ficha-perfil.partial.html`, nos mesmos 16 campos que `fpSalvar` já valida. Casos condicionais tratados com toggle de `display` em `fpIniciar`: `#fp-cpf-asterisco` some quando a pessoa já usa Documento (Passaporte/RNE); os 3 asteriscos de Responsável (`#fp-responsavel-asterisco-1/2/3`) só aparecem quando a pessoa É menor de idade **hoje** (não quando só existe dado histórico de antes de fazer 18 anos). Nova classe `.ficha-campo .obrigatorio` em `components.css`, mesma cor/estilo de `.auth-form-group .obrigatorio` (cadastro.html).

**Lição pra lembrar**: sempre que uma branch de preview for aprovada e "pausada" por qualquer motivo, ela pode ficar esquecida — vale conferir de tempos em tempos se algo aprovado ainda não chegou à `main`.

### 57.3 Convidados: placeholder revisado, campo Instrumento (Tipo "Ritmistas"), e "Menores ativos" ao lado de Convidados na Visão Geral

Três ajustes pontuais em Convidados/Visão Geral:

1. **Placeholder de Observações**: "Ex: convidado do Lolo..." → "Ex: convidado da bateria...", pedido dela.
2. **Campo Instrumento**: quando o Tipo de Convidado é "Ritmistas", o editor (`renderizarEditorExtra`) passa a mostrar um campo Instrumento obrigatório, reaproveitando `fpCarregarOpcoesInstrumento` (já global via `ficha-perfil.js`, mesma lista de instrumentos ativos da bateria usada na ficha) — nova coluna `extras.bateria_instrumento_id` (`bigint REFERENCES bateria_instrumentos(id)`). Campo aparece/some ao trocar o Tipo (`onchangeGrupoExtra`, nova função — preserva Nome/Observações/Medidas já digitados antes de re-renderizar). Validado em `salvarExtra()`: obrigatório só quando `grupo === 'ritmista'`.
3. **Card "Menores ativos" na Visão Geral**: novo totalizador (Ritmistas ativos que são menores de idade hoje, mesmo cálculo do badge "Menor" já usado na lista) — pedido dela pra ficar **ao lado** do card de Convidados, dividindo a mesma linha (`.totalizadores`) meio a meio, mesmo padrão do par "Ritmistas ativos/pendentes". Isso exigiu mover o show/hide condicional (`ver_extras`) de "esconder a linha inteira" pra "esconder só o card de Convidados" (`atualizarTotalizadorExtras` — antes escondia `#totalizadoresExtras` como linha, agora esconde o próprio `.total-card`), senão os dois desapareciam juntos quando a pessoa não tinha `ver_extras`.

Publicado em produção (merges diretos, a pedido dela em cada um).

### 57.4 Caso de suporte: Julio Cesar Santos Silva (conta saudável, senha esquecida) e Caio Costa (conta órfã de cadastro incompleto)

Dois casos reais de "não consigo entrar/me cadastrar" investigados na mesma sessão, resultados bem diferentes:

- **Julio Cesar Santos Silva** (CPF `089.553.297-25`, pessoa_id 200, bateria Swing da Leopoldina): tudo saudável no banco — vínculo aprovado, e-mail confirmado, sem suspensão, e ele já tinha conseguido logar uma vez no dia anterior. Conclusão: senha simplesmente errada/esquecida, não bug. Como Super Admin nunca vê/define senha de outra pessoa (regra ética do sistema), disparado manualmente o e-mail de "esqueci minha senha" pra ele via `POST /auth/v1/recover` (mesma chamada que o botão da tela de login faz) — confirmado no banco (`auth.users.recovery_sent_at` atualizado no mesmo instante). Ela pediu esclarecimento se "baixar o app" (instalar o PWA) teria relação com o problema — não tem: é o mesmo site, mesmo login, senha mora só no servidor, nunca no aparelho.

- **Caio Costa** (`cayocosta2006@gmail.com`): reportou erro "Erro ao criar acesso: User already registered" tentando se cadastrar (print anexado, mensagem em inglês). CPF que ele citou (`205.006.527-24`) não existe em lugar nenhum (nem `pessoas`, nem a tabela congelada `ritmistas`) — não era colisão de CPF. Causa real, achada ao investigar o e-mail: `cadastro.html` faz o cadastro em **dois passos separados e não-atômicos** — primeiro `sb.auth.signUp()` (cria a conta de acesso), só depois um `POST` pra tabela `pessoas` (salva a ficha). Na primeira tentativa dele (25/ago), o passo 1 teve sucesso mas o passo 2 nunca aconteceu (provável queda de conexão/app fechado nesse meio do caminho) — sobrou uma linha em `auth.users` sem nenhuma linha correspondente em `pessoas`. Como ele nunca viu "Cadastro enviado com sucesso!", tentou de novo (comportamento normal de qualquer pessoa) — e caiu nesse erro, porque a conta de acesso "pela metade" já ocupava o e-mail. Resolvido apagando a linha órfã de `auth.users` (confirmado antes que não existia nenhuma `pessoas.auth_user_id` apontando pra ela) — ele pode recomeçar o cadastro do zero, dessa vez até o fim.

**Pendência criada a partir daqui** (mitigação de verdade, não implementada ainda — ver `CLAUDE.md`, seção "Estado atual"): detectar esse tipo de conta órfã automaticamente na segunda tentativa de cadastro, em vez de precisar de intervenção manual do Super Admin cada vez. Desenho já combinado com ela, bloqueado nesta sessão por uma queda de conexão da ferramenta MCP do Supabase (confirmado, via `curl` direto na API REST com a chave pública, que o banco/site em si continuavam saudáveis — só a ferramenta de acesso administrativo é que caiu).

## 58. Sessão de 26/ago/2026 (continuação): desenho da reforma de Permissões, redesign de Aniversariantes, e modelo "sem carteirinha" — nada implementado, tudo bloqueado pela queda do Supabase MCP

Depois dos itens da seção 57, a sessão continuou só em modo de desenho/planejamento (a ferramenta de banco nunca voltou), cobrindo três frentes. **Nenhum código foi alterado nesta parte** — fica tudo registrado aqui pra não se perder, pra retomar quando o acesso ao banco voltar.

### 58.1 Aniversariantes do mês — redesign combinado, não implementado

Pedido dela: o 🎂 na frente de cada nome (lista "Aniversariantes do mês" da Visão Geral) estava poluído visualmente. Desenho fechado:

1. O 🎂 de cada linha vira o **número do dia** (`dia.toString().padStart(2, '0')`, mesmo valor já calculado hoje pra linha de detalhe).
2. Título ganha o nome do mês atual: "Aniversariantes do mês" → "Aniversariantes do mês · Agosto" (nome em português, ex: `Intl.DateTimeFormat('pt-BR', { month: 'long' })` ou array fixo de meses).
3. Quem faz aniversário **hoje** (dia e mês do `nascimento` batendo com `new Date()`) ganha um texto **"🎉 Hoje!"** do lado — ela recusou explicitamente a ideia alternativa de trocar o número pelo bolo só nesse caso ("Não quero bolo no lugar do número, deixa o número. e quero a opção C do É Hoje!").

Ponto ainda não confirmado com ela: a linha de detalhe abaixo do nome hoje mostra "Dia XX · idade anos · cargo" — com o número do dia migrando pra frente do nome, ficaria redundante repetir "Dia XX" ali. Recomendação (a confirmar na hora de implementar): tirar o "Dia XX" da linha de detalhe, deixando só "idade anos · cargo".

Não precisa do banco — é só `admin.html` (`renderizarVisaoGeral`, por volta da linha 3116, e o HTML do título por volta da linha 1900).

### 58.2 Reforma do modelo de Permissões — desenho completo, catálogo proposto, escopo de Diretor de Naipe ainda aberto

**Gatilho**: ela relatou achar o menu Permissões cada dia mais confuso, "toda hora precisamos colocar algo novo na permissão" — mais um Diretor real trazendo um pedido novo e pesado (Diretor de Naipe só ver/agir no próprio naipe), que ela reconheceu como "muda até a forma de filtrar na frente" e pediu ajuda pra estruturar antes de desenhar.

**Levantamento completo** (feito por um agente em fork, lendo `admin.html`, `ficha-perfil.js`, `ficha-perfil.partial.html`, `carteirinha.html`):

- Confirmado que existem **3 mecanismos de controle de acesso hoje, misturados sem distinção visual nenhuma**:
  1. Capacidade por pessoa (`vinculos.capacidades` jsonb, ~22 chaves no catálogo `GRUPOS_CAPACIDADES`, `admin.html` linha ~5773).
  2. Interruptor por bateria (colunas soltas em `baterias`: `ritmista_pode_editar_medidas`, `ritmista_pode_ver_repique_bossa`, `ritmista_pode_marcar_repique_bossa`) — na prática já é um "padrão de grupo" (grupo = todo Ritmista da bateria), só que feito ad-hoc, fora do modelo de capacidades.
  3. Regra fixa no código, sem toggle nenhum — `fpCamposEditaveis()` em `ficha-perfil.js` decide por **nome do cargo** (`atorPerfil`), não por capacidade: base de autoedição sempre editável; `medidas` liberado pra mestre/diretor/apoio; `naipe` liberado só pra `diretor`; editar a ficha de OUTRO Mestre/Diretor/Apoio retorna sempre `new Set()` (só Super Admin consegue, sem capacidade nenhuma pra abrir isso pra mais alguém).
- **Bugs reais confirmados no caminho**:
  - O botão Editar de Instrumento/Medidas na ficha de um Ritmista aparece pra **qualquer** Diretoria que abra a ficha (porque `fpCamposEditaveis` pro caso "Diretoria editando Ritmista" sempre retorna `['bateria_instrumento_id', 'medidas']`, sem checar `editar_ritmistas`) — a checagem de verdade só existe no gatilho do banco (`aplicar_matriz_edicao_vinculos`), então quem não tem a capacidade edita, clica Salvar, parece funcionar, e o banco reverte tudo em silêncio, sem nenhum aviso na tela.
  - Suspender/Desligar/Reativar **dentro do modal da ficha** (tanto Ritmista quanto Diretoria) não checam capacidade nenhuma no botão — só o Ativar/Rejeitar do card principal da lista checa (`aprovar_ritmistas`/`aprovar_acessos`). A ação real continua bloqueada no banco, mas o botão aparece pra qualquer um.
  - "Ver carteirinha ↗" (4 ocorrências no código) nunca checou capacidade em lugar nenhum, só `status === 'aprovado'`.
  - "Naipe que lidera" (`fp-secao-naipe`) é visível pra qualquer pessoa com `ver_acessos` — não existe `ver_naipe`/`editar_naipe` em lugar nenhum (nem código, nem banco) — confirmado.
  - CPF, endereço, contato de emergência, dados do responsável (menor) — sempre visíveis como texto pra qualquer um que abra a ficha; hoje é tudo-ou-nada junto com `ver_ritmistas`/`ver_acessos`, sem granularidade.
  - `editar_configuracoes` existe no catálogo da tela mas nunca é checado em nenhuma parte do código — capacidade morta/decorativa.

**Modelo aprovado pra resolver a raiz do problema**: cada permissão passa a ter um **padrão por grupo** — os 4 grupos que ela definiu, mapeando 1:1 com os `perfil` já existentes no banco (Ritmista=`ritmista`, Diretor=`apoio`, Diretor de Bateria=`diretor`, Mestre=`mestre`) — e, por cima, um **ajuste por pessoa específica** que vence o padrão do grupo quando existir. Regra de resolução: "se a pessoa tem marcação própria naquela permissão, vale a marcação própria; se não tem, vale o padrão do grupo dela." Na prática mecânica (a implementar), isso significa estender `tenho_capacidade()` pra checar primeiro um valor por pessoa (como hoje) e, se não existir marcação explícita ali, cair pro padrão de uma tabela nova de "padrão por grupo/bateria" — hoje essa tabela não existe.

**Princípio-guia fixado por ela no meio da conversa, vale pra toda a reforma**: *"Ninguém entra em padrão nenhum, tudo tem que ser configurável. Sempre."* — os "padrões por grupo" (ex: Mestre sem restrição por padrão, Diretor de Naipe restrito por padrão) são só **valores iniciais sugeridos**, guardados como dado, nunca uma regra travada direto no código/JS/SQL. Consequência natural discutida com ela, mas **explicitamente não decidida ainda se entra nesta rodada da reforma** (ela pediu só pra eu avisar, não resolver): as regras hoje fixas por nome de cargo em `fpCamposEditaveis` (ex: só Diretor edita o próprio Naipe, só mestre/diretor/apoio editam Medidas, editar outro Diretoria só Super Admin) deveriam, pelo mesmo princípio, também virar dado configurável em vez de `if` no código.

**Regra que fica INTOCÁVEL, fora desse princípio**: Super Admin sempre vê e faz tudo, em qualquer lugar (tela e banco), sem excecão — isso já é assim hoje (`souSuperAdmin` no front, `is_super_admin()` no banco, sempre checados primeiro e sempre vencem) e continua exatamente igual depois da reforma, não é uma "permissão" sujeita a nenhuma reorganização.

**Proposta de catálogo novo** (rascunhada por um segundo agente em fork, a partir do levantamento acima — ainda não revisada/aprovada por ela linha a linha):

| Área | Mudança proposta |
|---|---|
| Menu/aba | Praticamente sem mudança — as ~11 capacidades de aba/módulo continuam como estão |
| Ficha | `ver_naipe`/`editar_naipe` (nova); `aprovar_ritmistas`/`rejeitar_ritmistas`/`suspender_ritmistas`/`desligar_ritmistas`/`reativar_ritmistas` (separadas, eram uma só); mesma separação em 5 pra Diretoria (`aprovar_acessos` etc.); `editar_instrumento_ritmista`/`editar_medidas_ritmista` (separadas, eram `editar_ritmistas`); `ver_dados_sensiveis_ritmistas`/`ver_dados_sensiveis_acessos` (novas); `editar_acessos` (nova — editar outro Mestre/Diretor/Apoio, recomendado **só por pessoa**, nunca por grupo inteiro, por ser muito poder); `ver_carteirinha_outros` (nova); `editar_declaracao_responsavel` (nova, adicionada 26/ago/2026 — marcar/desmarcar a "Declaração do Responsável" de menor de idade, hoje `alternarDeclaracao()` em `admin.html` sem checagem de capacidade nenhuma; ela pediu explicitamente que também precisa fazer sentido pro escopo de Diretor de Naipe, ver item logo abaixo) |
| Carteirinha | Nenhuma mudança — carteirinha sempre foi controlada por status+RLS, não por capacidade de tela, e isso continua fazendo sentido |
| Outras | `exportar_ritmistas`/`exportar_diretoria` (separadas, eram `ver_relatorios`); `editar_instrumentos`/`editar_medidas`/`editar_vagas`/`editar_figurino_bateria`/`editar_toggles_ritmista` (separadas, eram `ver_configuracoes` inteira); `editar_configuracoes` removida (morta) |

**Pedido separado, mais pesado, escopo de visão restrita ao próprio naipe — SEM DESENHO FECHADO ainda, próxima etapa depois desta reforma de catálogo**: um Diretor real pediu que um Diretor de Naipe só veja/aprove/rejeite/suspenda/desligue/reative/libere figurino do **próprio naipe**, perdendo a visão do resto — isso não é uma permissão de ver/editar simples, é um "raio de visão" que filtra qual CONJUNTO de pessoas cada ação se aplica, uma dimensão nova por cima do catálogo de capacidades. Regras já confirmadas com ela ao longo da conversa, importantes pra não perder ao desenhar isso depois:
- Ter naipe atribuído (`vinculos.naipe`) e ficar restrito a ele são **duas coisas independentes** — um Diretor pode liderar um naipe E ter função de administrador da bateria, vendo tudo, sem contradição. A restrição nunca deve ser derivada automaticamente de "a pessoa tem naipe"; precisa ser seu próprio interruptor.
- **Mestre**, por padrão, também não fica restrito (mesma lógica do Diretor com alçada).
- Ainda **em aberto**, perguntas que ficaram sem resposta: (a) a restrição também esconde outros membros da Diretoria (não só Ritmistas fora do naipe), ou só afeta a lista de Ritmistas? (b) o que acontece com um Diretor sem naipe nenhum atribuído, quando a restrição estiver ativa na bateria — continua vendo tudo, ou fica sem ver nada até alguém marcar um naipe pra ele?

### 58.3 Modelo "sem carteirinha" — caso de uso real de um Mestre, desenho fechado dentro da mesma reforma (não é um "Modelo Comercial" à parte)

Surgiu no meio da conversa acima, a partir de um caso real: um Mestre adorou a ideia de usar a gestão, mas não quer distribuir carteirinha digital pra Ritmistas esta temporada — as carteirinhas físicas já foram pagas por todo mundo, e ele acha injusto agora "dar" a digital de graça, undercutting quem já pagou pela física.

**O que ela queria fazer**: pegar os dados de todos os Ritmistas numa planilha (Google Forms, por exemplo) e me pedir pra cadastrar todo mundo em lote direto no banco, pra esse Mestre já ter a gestão funcionando (aprovar, editar instrumento/medidas, etc.), sem passar pelo autocadastro normal — mas sem ninguém ganhar acesso à carteirinha digital esse ano.

**Decisões tomadas, em sequência**:

1. **Senha de cada conta importada**: ela cogitou senha = CPF da pessoa. **Recusado, mesmo motivo já decidido em 22/jul/2026** (ver seção correspondente no `CLAUDE.md`) — CPF não é segredo, aparece em vários lugares do próprio sistema (carteirinha, exportação, ficha), então usar como senha não protege nada, e piora exatamente o risco que ela queria evitar (alguém "descobrir" acesso). Decisão: senha **aleatória de verdade**, gerada na hora da importação, nunca entregue a ninguém.
2. **Como a pessoa usa a carteirinha no futuro, se a senha é desconhecida até pra ela mesma**: o caminho natural e já existente é "Esqueci minha senha" (mesmo `resetPasswordForEmail` já usado no caso do Julio Cesar, seção 57.4), usando o e-mail que veio na planilha — **por isso o formulário/Forms precisa coletar um e-mail de verdade que a pessoa realmente acesse**, senão ela não consegue entrar depois.
3. **O problema real que ela identificou** (e que a simples senha aleatória não resolve): mesmo com senha desconhecida, se a própria pessoa (dona legítima da conta) usar "Esqueci minha senha" com o e-mail certo, ela consegue entrar e ver a carteirinha normalmente — porque tecnicamente é ela mesma entrando, não uma invasão. Só que a Márcia **não quer que ninguém tenha carteirinha esse ano**, mesmo sendo a pessoa certa entrando. Isso pede uma trava de verdade, separada de senha/login.
4. **Trava desenhada**: um par de novos interruptores por bateria (dentro da mesma reforma da seção 58.2, cada grupo com seu próprio espaço, **não um "Modelo Comercial" à parte** — ela cogitou colocar em Comercial junto com Demo/Somente Carteirinha, mas reconsiderou: "o perfil comercial de sem carteirinha talvez não caiba... teria que ser direto no bloco Ritmista lá em permissões"): **"Ritmistas sem carteirinha esta temporada"** e **"Diretoria sem carteirinha esta temporada"**, independentes um do outro (dá pra ligar um sem o outro — ex: Ritmista sem carteirinha, mas Mestre/Diretor continuam com a própria). Quando ligado pro grupo, `login.html`/`carteirinha.html` mostram uma mensagem explicando (ex: "Sua carteirinha digital não está disponível esta temporada. Fale com a diretoria da sua bateria.") em vez do cartão — mesmo se a pessoa entrar com a senha certa.
5. **Fluxo completo aprovado, de ponta a ponta**: (a) Diretor pede que os Ritmistas preencham um Forms com todos os dados, inclusive e-mail de verdade; (b) importação em lote direto no banco (pessoas + vínculos + login com senha aleatória, mesmo padrão do cadastro manual de hoje, só que em lote a partir da planilha), **já direto como `status = 'aprovado'`**; (c) Ritmista aparece normalmente na gestão do Mestre, sem acesso à carteirinha; (d) quando decidirem liberar (ex: temporada seguinte): desliga o interruptor "Ritmistas sem carteirinha" + dispara "esqueci minha senha" em lote pra todo mundo de uma vez (mesma chamada usada pro Julio Cesar, só que repetida pra vários e-mails).
6. **Confirmado no código (26/ago/2026), pergunta dela**: importar já como `aprovado` dispara o e-mail de "cadastro aprovado" (`notificar-aprovacao`) pra todo mundo em lote? Não. Essa Edge Function só é chamada pelo **navegador**, dentro de `admin.html` (função `notificarAprovacao(vinculoId)`, linha ~2570), e só a partir de dois pontos exatos: `atualizarStatus()` (linha ~2563, quando alguém clica "Ativar" na tela) e o fluxo de aprovar Diretoria (linha ~6820). Não existe gatilho de banco, webhook, nem nada do lado do Postgres chamando essa função sozinha quando uma linha nasce com `status = 'aprovado'` via INSERT direto. Ou seja, a importação em lote pode inserir todo mundo já aprovado sem nenhum ajuste extra de código, e ninguém recebe esse e-mail — porque ninguém clicou em "Ativar" pra eles.

**Ideia relacionada, levantada e explicitamente pausada por ela (não descartada, só posta de lado por enquanto)**: tornar configurável até o fato de Ritmista nunca ter acesso a nenhuma parte do painel de gestão hoje (hoje é uma regra estrutural, não uma marcação — Ritmista simplesmente não tem capacidade nenhuma em lugar nenhum do código). Ela mesma reconheceu que, "se for um problema sério, vamos deixar de lado, não faremos agora" — fica registrado como ideia futura, fora do escopo atual da reforma.

**Nada disso foi implementado** — é desenho puro, esperando a ferramenta MCP do Supabase voltar (confirmado, seção 57.4, que o banco/site em si continuavam saudáveis a sessão toda; só a ferramenta de acesso administrativo caiu).

## 59. Sessão de 27/ago/2026: Entrega de Figurino implementada e publicada + achado real sobre "um público por peça" + pendência de Público múltiplo

### 59.1 Aniversariantes do mês + Entrega de Figurino: implementado, revisado e publicado

Tudo o que foi desenhado na sessão anterior (seção 58.1, aniversariantes; parte da 58.2, achados de bugs na Entrega) foi implementado nesta sessão, revisado com cuidado antes de publicar, e aprovado por ela via prévia interativa (Artifact) em várias rodadas de ajuste fino antes do código de verdade.

**Aniversariantes do mês** (`admin.html`, `renderizarVisaoGeral`): número do dia (`diaFormatado`) no lugar do 🎂 de cada linha; nova constante `MESES_PT` alimenta o título (`#vg-aniversariantes-titulo`) com o nome do mês atual; quem faz aniversário hoje (`dia === diaAtual`) ganha "🎉 Hoje!" ao lado do nome; "Dia XX" removido da linha de detalhe (ficaria redundante).

**Entrega de Figurino, reforma completa** (`admin.html`):
- **Confirmação antes de marcar**: `pedirConfirmacaoEntregaFigurino(tipo, id)` marca `.confirmando = true` no cache e re-renderiza, mostrando "Confirma?" + Sim/Cancelar inline; só `toggleEntregaFigurino(tipo, id, true)` (clique em "Sim") salva de verdade. Um toque sozinho no botão "Marcar" nunca marca ninguém.
- **Trava depois de marcado**: quando `p.entregue`, a linha mostra um ✓ verde (`.figurino-check-verde`) ao lado do nome (não mais um badge de texto "Entregue" separado) + um link "↺ Desfazer" que chama `toggleEntregaFigurino(tipo, id, false)`.
- **Alinhamento**: `.figurino-coluna-check` (17px, sempre presente, com ou sem conteúdo) garante que nome/detalhe alinhem no mesmo x haja ou não o check; `.figurino-coluna-acao` (96px, conteúdo centralizado) garante que Marcar/Confirmar/Desfazer sempre ocupem a mesma posição, sem "pular" a cada mudança de estado. Cabeçalho de coluna ("Tamanho"/"Status") ajustado de 78px pra 96px pra bater com a largura nova.
- **Ordenação**: `ordenarPendentesPrimeiro` (`Number(a.entregue) - Number(b.entregue)`) aplicado tanto na lista de Ritmistas/Diretoria quanto na de Convidados — não entregues sempre em cima, entregues descem pro fim.
- **Filtro por status**: nova UI (`#figurino-filtro-status`, `renderizarFiltroStatusFigurino()`) com 3 botões (Todos/Não entregues/Entregues), estado em `figurinoEntregaFiltroStatus`. **Bug real achado e corrigido na própria revisão antes de publicar**: a primeira versão do filtro combinado (busca + instrumento + status) usava `if/return` em cascata dentro do `.filter()`, e como o filtro de instrumento tinha prioridade de retorno, o filtro de status era **silenciosamente ignorado** sempre que um instrumento estivesse selecionado. Corrigido pra cada condição só retornar `false` quando reprovar (AND de verdade entre todos os filtros), nunca `return true`/`return` antecipado.
- **Contador separado por tipo**: quando `item.inclui_extras` e existem Convidados de fato nesse item, o totalizador (`#figurino-entregas-totalizador`) mostra dois blocos lado a lado (`.figurino-totalizadores-grupo`), um rotulado pelo público do item (Ritmistas/Mestres/etc.) e outro "Convidados", cada um com seu próprio Total/Faltam (`totalDuploHtml`). Sem Convidados, continua um totalizador só, como sempre foi.
- **Totalizador subiu pro topo da tela**: pedido dela ao vivo, depois de testar em produção ("os números... precisavam ficar mais na parte de cima e não no final. eu tenho que escrolar tudo para ver") — movido de depois da lista pra logo abaixo do título/descrição, antes dos interruptores de Entrega Iniciada/Finalizada.
- **Ficha da pessoa** (`ficha-perfil.js`, `fpRenderizarEntregaFigurino`): rótulo e status na mesma linha (`.ficha-campo--linha`, nova classe em `components.css`, override pontual só desse bloco — não muda o padrão geral de `.ficha-campo`, que continua rótulo-em-cima/valor-embaixo em todo o resto da ficha); valor "Entregue" ganha `.ficha-valor-entregue` (verde `#2d7a4f`). Passou por uma correção de posição no meio da sessão: a primeira versão manteve rótulo em cima/valor embaixo (igual o resto da ficha) e ela pediu ao lado — corrigido trocando `flex-direction:column` por `justify-content:space-between` (linha única).
- **Card do Convidado, novidade**: `carregarFigurinoParaExtras()` (nova função) busca as peças ativas com `inclui_extras=true` e os registros de `figurino_entregas` de todos os Convidados da bateria; `renderizarExtrasLista()` usa `grupoExtraDoPublico(it.publico)` pra filtrar quais peças valem pro lado (ritmista/diretoria) de cada Convidado, e mostra uma lista compacta (✓ verde + nome, ou nome esmaecido "— não entregue") dentro do próprio card, sem precisar abrir nada.

Cache-busting: `ficha-perfil.js` v31→v32, `styles/components.css` v19→v20, `sw.js` CACHE_NAME v320→v322 (dois bumps na sessão, um na implementação inicial e outro no ajuste de posição do totalizador).

Publicado direto em produção (branch de preview + merge, ela aprovou a prévia interativa antes: "Ficou bom, pode implementar tudo" / "Pode publicar.").

### 59.2 Achado real, não é bug: cada peça de Figurino é sempre de UM público só

Depois de publicado, ela reportou confusão: "Camisa da Final" só aparecia pra Ritmistas na tela de Entrega, esperando que Mestres/Diretores de Bateria/Diretores também aparecessem "com a divisão que eu pedi". Investigado no código (sem precisar do banco, que continuava fora do ar) e confirmado: `figurino_itens_mestre.publico` é sempre um valor só (`ritmista`/`mestre`/`diretor`/`apoio`) — não existe hoje nenhum jeito de uma peça cobrir mais de um grupo. Ela foi até a tela real (Super Admin → Configurações → Figurino, editando "Camisa da Final") e confirmou visualmente: só havia UM cadastro, com Público = Ritmistas, nenhum outro. Não era bug nem dado incorreto — ela simplesmente não tinha cadastrado a peça pros outros grupos, porque não sabia que precisava fazer isso separadamente. Explicado o caminho certo (criar a mesma peça de novo, uma vez por grupo, em Configurações → Figurino, e depois ativar em cada bateria) — mas isso levou direto ao pedido da seção 59.3 abaixo.

No mesmo momento, ela perguntou se dava pra excluir um Convidado ("não lembro de ter implementado isso") — confirmado no código que **já existia** desde a criação de Convidados: botão "Excluir" (`excluirExtra(id)`) dentro do editor, só visível editando um Convidado já existente (não aparece criando um novo). Nenhuma mudança necessária, só confirmação.

### 59.3 Pendência grande: Público múltiplo por peça de Figurino + Convidados em 3 grupos — desenho fechado (refinado ao longo da conversa), bloqueado pelo Supabase MCP

A partir do achado da seção 59.2, ela propôs uma mudança de estrutura: em vez de cadastrar "Camisa da Final" 4 vezes (uma por grupo), poder marcar **checkboxes** de Público (Ritmistas/Mestres/Diretores de Bateria/Diretores) numa peça só. Motivo real, prático: evitar trocar de tela toda hora durante uma entrega de verdade ("fico imaginando ter que ficar trocando toda hora de tela para entregar camisa. É mais fácil trocar o filtro mas permanecendo na mesma tela").

**A primeira versão do desenho (5 seções + filtro por grupo) foi substituída** por uma versão mais simples, depois de eu dar minha opinião direta quando ela perguntou "você acha que estou viajando muito? Ou é melhor duas telas diferentes pra cada público?" — recomendei nem 5 grupos soltos nem duas telas de navegação separada, e sim uma tela só com um filtro de 2 opções (Diretoria/Ritmista), que ela aprovou. Desenho final, em 5 partes:

1. **Biblioteca mestre** (Super Admin → Configurações → Figurino): campo "Público" deixa de ser um `<select>` de valor único e vira checkboxes de múltipla escolha. Precisa de migração no banco: `figurino_itens_mestre.publico` (hoje `text`, um valor) vira uma lista (`text[]` ou tabela associativa) — dados existentes precisam ser migrados pra manter o valor atual como item único da lista, sem perder nada.
2. **Ativação por bateria** (Configurações → Figurino, dentro de uma bateria): a mecânica não muda — já é um interruptor por peça (`bateria_figurino_itens.ativo`), não por público, então uma peça multi-público continua sendo UMA linha de ativação só. Só muda o rótulo/exibição, que passa a mostrar todos os grupos que a peça cobre (ex: "Camisa da Final — Ritmistas + Mestres + Diretores de Bateria + Diretores").
3. **Convidados ganham 3 grupos, em vez de 2**: hoje `extras.grupo` (junto com `LABEL_GRUPO_EXTRA`, o `<select>` "Tipo de Convidado" em `renderizarEditorExtra`, e `grupoExtraDoPublico`) só distingue "Ritmistas"/"Diretoria" como bloco único — passa a distinguir Ritmista / Diretor de Bateria (`diretor`) / Diretor-Apoio (`apoio`), sem grupo próprio pra Mestre ("Só o Mestre que é único mesmo, rs" — não existe conceito de "Convidado do Mestre"). **Sem nenhum Convidado real cadastrado ainda em nenhuma bateria** (ela confirmou, 27/ago, ao ser avisada sobre o risco de reclassificação) — pode alterar a estrutura (inclusive o `CHECK`/valores aceitos da coluna) sem nenhuma preocupação de migrar dado existente.
4. **Tela de Entrega, o motivo real do pedido — versão final, mais simples que a primeira ideia**: em vez de título de seção por grupo + filtro de 5 opções, um filtro de **2 opções** no topo — "Diretoria" (Mestre + Diretor de Bateria + Diretor + Convidados desses 3 grupos, tudo junto numa lista só — grupo pequeno, ela mesma disse "acho mais simples", não precisa de mais subdivisão) e "Ritmista" (só Ritmistas + Convidados-Ritmista — "que é um mundo de gente", continua se beneficiando dos filtros que já existem, instrumento e status). Clicar troca o conteúdo mostrado, sem sair da tela nem recarregar nada — resolve o "ficar trocando de tela toda hora" sem precisar de 5 grupos soltos.
5. **Contador do topo**: passa a separar só Diretoria x Ritmista (2 blocos), não mais um bloco por grupo (o "5 blocos" da ideia anterior foi abandonado nessa simplificação).

Pontos de código que essa reforma vai tocar, mapeados com antecedência pra não redescobrir do zero: `renderizarEditorFigurinoMestre`/`salvarFigurinoMestre` (checkbox em vez de select, salvar lista); `renderizarConfigFigurino` (agrupamento por público na ativação por bateria — como uma peça pode estar em mais de um grupo agora, precisa decidir se aparece repetida em cada seção ou uma vez com rótulo combinado); `renderizarFigurinoLista` (mesmo dilema, na lista de peças ativas antes de entrar na Entrega); `carregarEntregasFigurino` (query hoje é `perfil=eq.${item.publico}`, precisa virar `perfil=in.(...)` pra buscar todos os públicos da peça de uma vez, e agrupar em só 2 baldes -- Diretoria/Ritmista -- na hora de montar a lista); `renderizarEntregasFigurinoLista` (filtro de 2 opções em vez de seções por grupo, contador com 2 blocos); `extras.grupo`/`LABEL_GRUPO_EXTRA`/`renderizarEditorExtra` (3 valores em vez de 2); `grupoExtraDoPublico` (hoje resolve um público pra um lado só — precisa passar a agrupar ritmista/mestre/diretor/apoio nos 2 baldes Diretoria/Ritmista pro filtro novo, e casar com os 3 grupos novos de Convidados); e a leitura em `fpRenderizarEntregaFigurino` (ficha da pessoa, hoje filtra `publico=eq.${alvo.perfil}`, precisa virar checagem "está na lista").

**Bloqueada nesta sessão** — ela mesma confirmou que a ferramenta MCP do Supabase não volta ainda hoje ("Você não vai conseguir usar o banco hoje"), então nada disso foi tocado além do desenho. Fica registrado pra retomar quando o banco voltar.

## 60. Sessão de 27/ago/2026 (continuação): Visão Geral (Menores, Convidados, plural, ordenação), incidente em produção + causa real, duas tentativas revertidas de layout arrastável (botão + GridStack), recarregar ao entrar na aba, ajustes finos, e desenho de Temporada

### 60.1 Visão Geral: 4 ajustes implementados, publicados em branch de preview (Vercel MCP também caiu)

Depois do desenho da seção 59.3, ela pediu 4 ajustes concretos na Visão Geral, todos sem precisar do banco (puro `admin.html`):

1. **Novo card "📄 Declaração do Responsável (Menores)"**: `renderizarControleMenores()`, reaproveitando exatamente o padrão visual de `renderizarContagemInstrumentos()` (Ritmistas por Instrumento) e do `linhaHtml` de `renderizarResumoEntregaFigurino` (resumo de Figurino) — acordeão fechado por padrão, pílula de Total/Faltam no cabeçalho (`totalDuploHtml`), detalhe por instrumento (`bateria_instrumento_id`) mostrando "Falta N" + "X / Y" quando aberto. Filtra `todosRitmistas` por `status === 'aprovado'` e `calcularIdade(nascimento) < 18`; conta `declaracao_responsavel` por naipe. Card inteiro some (`display:none`) quando não há nenhum menor ativo. Ligado ao mesmo ciclo de `carregarRitmistas()` que já chama `renderizarContagemInstrumentos()`/`carregarResumoEntregaFigurino()`.
2. **Plural de "Faltam" corrigido**: só `totalDuploHtml()` tinha o bug (rótulo fixo "Faltam" independente do número) — as outras duas ocorrências (`avisoVagaHtml()` e o `linhaHtml` do resumo de Figurino) já tratavam singular corretamente desde que foram escritas. Corrigido com `${faltam === 1 ? 'Falta' : 'Faltam'}` no rótulo.
3. **Box "Convidados" dividido em dois**: `#totalizadoresExtras` (a linha inteira, não mais um único `.total-card`) agora contém dois cards, "Convidados Ritmistas" (`#totalExtrasRitmistas`) e "Convidados Diretoria" (`#totalExtrasDiretoria`), cada um filtrando `extrasCache` por `grupo`. Isso também **substituiu** o box "Menores ativos" (criado em 26/ago) que ocupava a mesma linha — ficou redundante com o card novo do item 1, então foi removido (junto com `#totalMenores` e o cálculo correspondente em `atualizarTotalizadores`, que continua calculando `menoresAtivos` mas não escreve mais em nenhum lugar da tela — **nota técnica**: essa variável ficou órfã, sem consumidor, poderia ser removida numa limpeza futura, mas não afeta nada rodar sem uso).
4. **Resumo de Figurino, rótulos renomeados**: peça de público não-ritmista (mestre/diretor/apoio) — a linha que antes mostrava `LABEL_PUBLICO_FIGURINO[item.publico]` (Mestres/Diretores de Bateria/Diretores, específico) passa a mostrar só `'Diretoria'` (genérico); a linha de Convidados (quando `item.inclui_extras`) passa de `'Convidados'` fixo pra `'Convidados Ritmistas'`/`'Convidados Diretoria'`, calculado a partir de `grupoExtraDoPublico(item.publico)`. Alinha a nomenclatura com os cards novos do item 3, e antecipa a terminologia "Diretoria" que a reforma da seção 59.3 já usa no filtro de 2 opções da tela de Entrega.

**Achado extra, corrigido no caminho**: dentro de cada seção de Diretoria (Mestres/Diretores de Bateria/Diretores) em `renderizarDiretoria()`, os 3 arrays (`mestres`/`diretores`/`apoios`) nunca eram ordenados por status — vinham só na ordem alfabética que a API já retorna (`order=perfil.asc,nome.asc`), então um pendente podia ficar escondido no meio de uma lista de ativos, sem se destacar. Corrigido com `pendentePrimeiro` (comparador simples, `Number` implícito via ternário 0/1) aplicado antes do `.map(cardHTML)` de cada grupo — pendente sobe pro topo da própria seção, mantendo a ordem alfabética como critério secundário (sort estável do JS moderno preserva isso).

Cache-busting inicial: `sw.js` v322→v323 (só JS de `admin.html` mudou, sem tocar `ficha-perfil.js`/`components.css` nessa rodada).

**Publicado direto em `main`** (não em branch de preview) — a ferramenta MCP da Vercel (usada pra gerar o link de teste sem login) continuou fora do ar a sessão inteira, e ela autorizou explicitamente pular esse passo hoje ("não vai conseguir gerar link hoje, só publica o que tem que publicar"). **Ver seção 60.3 pra como essa publicação realmente terminou** — teve um incidente real em produção no meio do caminho, só resolvido depois de duas rodadas de reversão.

### 60.2 Desenho de Temporada — retomado por ela, evoluído em conversa, com uma lacuna aberta

Ela trouxe de volta o item 4 do roadmap antigo (10/jul/2026, "lógica de temporada em relação a ritmistas", adiado pra pós-piloto) — só pra conversar e desenhar, sem intenção de implementar hoje ("Isso é só uma ideia, aceito sugestões melhores e mais simples").

**Pedido inicial dela**: um jeito de registrar desde quando cada bateria está no TumTu + um histórico de todas as temporadas que teve, mas **sem guardar nenhum histórico de dado operacional** (ela foi enfática: "guardar dados das entregas das camisas... Isso é muito louco"). E um mecanismo de "recadastro" pra quem já está na bateria de temporadas anteriores — mas não do zero: um e-mail com link pra a própria pessoa confirmar/editar os próprios dados, e — na ideia original dela — o Diretor **também** teria que dar um "ok" nesse pedido antes de valer.

**Simplificação proposta por mim, aceita por ela** ("Faz sentido, gostei mais simples"): eliminar a segunda etapa de aprovação do Diretor sobre o *acesso à gestão* — no início de uma temporada nova, todo Ritmista ativo continua ativo automaticamente, sem nenhuma trava. O e-mail de início de temporada é um convite pra revisar/atualizar os próprios dados (reaproveitando a ficha em modo autoedição), não uma condição pra manter acesso. Quando a pessoa revisa, marca um "revisado nesta temporada" (visível pro Diretor como lista/contagem de quem falta, mesmo estilo dos avisos "Faltam N" já usados). Quem realmente saiu, o Diretor desliga manualmente com o botão "Desligar" que já existe — sem inventar um novo estado "pendente de recadastro", e sem precisar responder a pergunta difícil de "o que acontece com quem nunca responde o e-mail" (ninguém perde acesso à gestão por isso).

**Requisito que ela trouxe depois, e não abre mão** ("Ah, tem isso... Disso eu não poderei fugir"): mesmo sem travar a gestão, a **carteirinha** precisa ficar bloqueada pra quem ainda não revisou os dados da temporada atual — só libera de novo depois da revisão. Isso reaproveita **o mesmo mecanismo de bloqueio desenhado um dia antes** (seção 58.3/59, o par de interruptores "Ritmistas/Diretoria sem carteirinha esta temporada" pro caso do Mestre que não queria distribuir carteirinha) — aqui o gatilho passa a ser "revisão da temporada pendente" em vez de "bateria com o interruptor ligado". Conecta também com `escolas.validade_carteirinha` (campo criado em 15/ago/2026, seção 37, até hoje sem nenhuma lógica de trava real associada — "Só o campo — nenhuma lógica de validade foi criada ainda") — pode ser exatamente o gatilho que marca quando a temporada "virou" pra essa escola, disparando a exigência de revisão.

**Lacuna aberta, ela mesma sem decidir**: depois da pessoa revisar os próprios dados, será que o Diretor também precisa dar um "ok" separado sobre esse pedido de renovação antes da carteirinha liberar de verdade — reintroduzindo uma segunda etapa de aprovação, só que agora specificamente sobre a carteirinha, não sobre acesso à gestão? Palavras dela: "é uma ideia minha. Pode ser que os diretores nem vejam valor sobre isso." **Não decidido** — ela sinalizou querer validar isso com Diretores reais antes de fechar esse ponto específico do desenho. Resto do desenho (histórico leve da bateria, revisão sem travar gestão, carteirinha travada até revisar) está fechado.

Peças de dado que essa reforma vai precisar, mapeadas com antecedência: uma tabela/lista de temporadas por bateria (ex: `bateria_temporadas`, só bateria_id + identificador da temporada, sem mais nada); um campo por pessoa/vínculo indicando "revisado na temporada atual" (booleano + timestamp, ex: `vinculos.revisado_temporada_atual`/`revisado_em`); reaproveitamento do mecanismo de bloqueio de carteirinha já desenhado (seção 59, "sem carteirinha esta temporada") com um gatilho novo; e possivelmente ligação com `escolas.validade_carteirinha` como o disparador de "a temporada virou, hora de revisar".

**Nada implementado** — puro desenho de conversa, sem pressa dela pra construir; e mesmo se houvesse, o banco continua fora do ar.

### 60.3 Incidente em produção da seção 60.1 — causa real achada e corrigida

Pouco depois de publicar a seção 60.1 direto em `main`, ela reportou "Ritmistas por Instrumento" e o resumo de "Entrega de Figurino" com a tela toda travada/vazia ("tá dando pau na tela"). Sequência real do que aconteceu, incluindo dois diagnósticos errados antes do certo:

1. **1ª reação — revert imediato, sem investigar**: `git revert -m 1 <merge>` pra parar o problema na hora, verificado com `git diff` contra o commit anterior (idêntico, byte a byte). Ela confirmou "agora está ok" mesmo antes de qualquer coisa ser republicada, o que por si só já era uma pista de que o problema não era 100% determinístico/sempre-reproduzível.
2. **1ª hipótese, errada**: suspeita de que o bug estava dentro da função nova, `renderizarControleMenores()` — talvez uma exceção lançada ali travando as chamadas seguintes dentro de `carregarRitmistas()`. Reaplicado o revert (restaurando a feature) e adicionada uma blindagem `try { ... } catch (erro) { console.error(...) }` ao redor do corpo inteiro dessa função, só por precaução, sem confirmação de que era realmente a causa. Republicado (`sw.js` v323→v324).
3. **O erro voltou mesmo assim** — prova de que a hipótese 1 estava errada (se o problema estivesse dentro de `renderizarControleMenores()`, o `try/catch` teria contido). Revertido de novo.
4. **Diagnóstico certo, só depois de pedir o Console real**: a pista que faltava só veio quando ela testou de novo com o DevTools do Chrome já aberto (F12 → aba Console) e mandou print do erro exato: `Uncaught (in promise) TypeError: Cannot set properties of null (setting 'textContent') at atualizarTotalizadores (admin:2331:61) at carregarRitmistas (admin:2444:9)`.
5. **Causa raiz real**: dentro de `atualizarTotalizadores()` (função bem mais antiga, de 26/ago/2026 — nada a ver com o card novo de Menores), sobrava a linha `document.getElementById('totalMenores').textContent = menoresAtivos;`, escrevendo num elemento (`#totalMenores`, o antigo box "Menores ativos") que a própria seção 60.1 tinha REMOVIDO do HTML ao criar os boxes "Convidados Ritmistas"/"Convidados Diretoria" no lugar. A nota técnica do item 3 da seção 60.1 já tinha percebido que o *cálculo* (`menoresAtivos`) ficava órfão, mas não flagrou que a linha que **escreve no DOM** continuava lá, apontando pra um elemento inexistente — isso lança uma exceção não capturada, e como `atualizarTotalizadores()` é chamada bem no início da cadeia síncrona de `carregarRitmistas()` (antes de `renderizarVisaoGeral`/`renderizarContagemInstrumentos`/`renderizarControleMenores`/`carregarResumoEntregaFigurino`), a exceção interrompia a função ali mesmo e **nenhuma das chamadas seguintes rodava** — daí a tela ficar com "Ritmistas por Instrumento" e "Entrega de Figurino" vazios, mesmo essas duas partes não tendo nada de errado nelas mesmas.
6. **Correção**: removida a linha órfã (e o cálculo `menoresAtivos` que só ela consumia) de `atualizarTotalizadores()`. Reaplicado o revert do revert, cache-busting `sw.js` v324→v325, publicado.

**Lição registrada em CLAUDE.md pra não esquecer**: quando um bug em produção não é óbvio pela leitura do código, pedir o print do Console do navegador (F12 → Console) é muito mais rápido e confiável do que tentar adivinhar pela leitura — as duas primeiras hipóteses (cache/estado transitório, depois "está dentro da função nova") estavam erradas, e a causa real (uma referência órfã numa função completamente diferente, de uma mudança de dias antes) só apareceu no print do erro real.

### 60.4 Aniversariantes sempre por último + layout flexível dos cards (botão) — os DOIS revertidos no mesmo dia

Dois pedidos na sequência do incidente da seção 60.3, ambos sem precisar do banco — mas os dois acabaram desfeitos ainda em 27/ago/2026 (ver 60.6/60.5).

**Ordem fixa (revertida depois, ver 60.6)**: "Aniversariantes do mês" passou a vir sempre depois dos outros três cards (pedido dela: "com o tempo, infelizmente esse item será o de menos importância"). Sequência da época: Ritmistas por Instrumento → Declaração do Responsável (Menores) → Entrega de Figurino → Aniversariantes do mês.

**Layout flexível por botão (implementado e REVERTIDO na hora, ela odiou)**: ela pediu um painel onde os 4 cards de baixo pudessem ser arrumados por "gosto pessoal", ocupando a fileira inteira ou só a metade. Implementação (histórico, código já removido):

- Os 4 cards viraram filhos de um único contêiner flex, `#vg-cards-flex` (`display:flex; flex-wrap:wrap; gap:16px`), com `flex-basis` de cada card controlado via JS.
- Cada card ganhou um botão pequeno "Dividir tela" / "Ocupar tela toda" (`.vg-card-tamanho-btn`) chamando `toggleTamanhoCard(chave)`.
- Preferência guardada em `localStorage['tumtu_visao_layout']`.
- `aplicarLayoutVisaoGeral()` calculava pares de cards `'meio'` vizinhos visíveis, encaixando lado a lado; card `'meio'` sem parceiro ocupava a fileira inteira sozinho, sem buraco.
- Mobile (`@media (max-width: 720px)`) sempre forçava fileira inteira.

**Reação dela, testando ao vivo**: "Odiei... Eu não tô nem conseguindo arrastar a tela... TIRA ISSO AGORA. EU DETESTEI" — o que ela esperava era arrastar de verdade (puxar a borda, ver o encaixe se ajustar ao vivo — "como se fosse um encaixe"), não um botão de 2 estados fixos. Revertido no mesmo turno (`git checkout <commit-anterior> -- admin.html sw.js`, mesmo padrão de reversão já usado nos incidentes anteriores).

### 60.5 Segunda tentativa: quadro arrastável de verdade com GridStack — implementado, publicado sem teste em navegador, quebrou no celular, revertido

Depois do botão ser rejeitado, ela confirmou quando perguntada que queria arrastar/redimensionar de verdade ("é possível esse método de arrastar? Era isso que eu queria"). Explicado a ela em linguagem simples (sem jargão) o que seria usar uma biblioteca de terceiro pronta pra isso — comparado ao jeito que o Supabase já é carregado hoje (um link, sem conta/login/custo) — e ela autorizou ("Pode seguir").

**Escolha técnica**: [GridStack.js](https://gridstackjs.com) v9.5.1, via CDN (`cdn.jsdelivr.net/npm/gridstack@9.5.1/dist/gridstack-all.js` + `.css`), MIT/gratuita, sem conta. Antes de escrever qualquer código, a API foi conferida por `WebFetch` direto na documentação oficial (não por suposição) — método `save()`/`load()`, `resizeToContent()` (sempre manual, biblioteca não detecta mudança de conteúdo sozinha), `removeWidget(el, false)`/`makeWidget(el)` (tira/devolve um item do quadro sem apagar o DOM, pra não deixar buraco reservado quando um card como Menores/Figurino não tem nada pra mostrar), opção `handle` (restringe o arrasto a um elemento específico, não o card inteiro), `resizable: { handles: 'e, w' }` (só bordas esquerda/direita — largura livre), `columnOpts: { breakpoints: [{w:720, c:1}] }` (1 coluna só em telas pequenas).

**Decisão de design deliberada**: largura arrastável livremente (1 a 12 colunas), mas **altura NUNCA arrastável** — sempre recalculada automaticamente pelo conteúdo real (`sizeToContent` + `resizeToContent()` chamado em todo ponto que um card pode mudar de tamanho: fim de `carregarRitmistas()`, `finally` de `carregarResumoEntregaFigurino()`, e cada toggle de acordeão). Motivo: o conteúdo desses cards muda de altura sozinho o tempo todo (dado novo, acordeão abre/fecha) — deixar arrastar a altura ia "voltar sozinho" no próximo carregamento e frustrar mais do que ajudar.

**Alcinha de arrasto**: um botão "⠿" (`.vg-drag-alca`) no cabeçalho de cada card, não o card inteiro — `handle: '.vg-drag-alca'` no `GridStack.init()`, e `event.stopPropagation()` no clique da alcinha pros 3 cards com acordeão (senão clicar na alcinha também abriria/fecharia o acordeão).

**Falha real, sem ferramenta de navegador disponível pra testar antes**: a ferramenta de automação de navegador (Claude in Chrome) estava desconectada nessa sessão (junto com Supabase e Vercel MCP) — o código foi revisado com cuidado (releitura completa, checagem de chaves/parênteses, nomes de método/opção confirmados na documentação oficial), mas **nunca visto rodando de verdade antes de publicar**. Resultado: ela reportou "os blocos estão quebrados, tá bem feio" no celular — prints mostraram o card "Entrega de Figurino" aparecendo como uma caixa em branco, sem título nem conteúdo, no meio da lista (o texto "👕 Entrega de Figurino" simplesmente não aparecia). Causa raiz **não investigada** (revertido na hora, sem ferramenta pra depurar ao vivo) — hipótese mais provável, não confirmada: o recálculo de largura/altura na troca de `columnOpts` pra 1 coluna não recalculou certo o `.grid-stack-item-content` daquele item especificamente, mas isso fica pra confirmar se ela pedir pra retomar.

**Revertido** (`git checkout <commit-anterior> -- admin.html sw.js`, mesmo padrão). **Lição registrada em CLAUDE.md**: não repetir personalização de layout na Visão Geral sem a ferramenta de navegador disponível pra testar de verdade em tela pequena antes de publicar — as duas tentativas do dia foram publicadas sem esse teste.

### 60.6 Ordem final da Visão Geral, depois de mais uma virada + Aniversariantes fechado por padrão

Sem relação com o GridStack — puro pedido de ordenação. Ela pediu Aniversariantes de volta pro primeiro lugar ("debaixo dos totalizadores"), revertendo o pedido da seção 60.4 sem dar motivo (aplicado na hora, sem questionar — regra de CLAUDE.md). **Ordem final do dia**: Aniversariantes do mês → Ritmistas por Instrumento → Entrega de Figurino → Declaração do Responsável (Menores). Aniversariantes também deixou de nascer sempre aberto (`vgAniversariantesAberto` de `true` pra `false`, mais `style="display:none"` no HTML e tirada a classe `aberta` da seta) — agora fechado por padrão como os outros 3.

### 60.7 Recarregar ao entrar na aba (Visão Geral/Ritmistas) + 3 ajustes finos

**Achado real dela**: cadastrou um Convidado, voltou pra Visão Geral e viu o número antigo até atualizar a página manualmente. Investigando, `trocarAba()` (função central de navegação entre abas do painel) já tinha uma linha de recarregamento pra quase toda aba (`diretoria`, `meu-perfil`, `configuracoes`, `dados-escola`, `dados-bateria`, `comercial`, `figurino`, `extras`, `permissoes`, `historico`, `administrativo`) — **só faltava em `visao` e `ritmistas`**, que dependiam só do carregamento inicial + do ciclo de 30s do `iniciarAutoRefreshRitmistas()`. Corrigido chamando `carregarRitmistas(true)` (versão leve, sem foto) ao entrar em qualquer uma das duas, e também `carregarDiretoria(true)`/`carregarExtras().then(atualizarTotalizadorExtras)` (com `diretoriaCarregada = false` antes, senão o guard `if (diretoriaCarregada) return;` de `carregarDiretoria()` ignora a chamada) ao entrar em Visão Geral, pros cards "Diretoria ativa"/"Convidados" também virem atualizados. Deliberadamente **não** usada a versão completa (com foto) — mesmo cuidado de performance do incidente de 25/ago/2026 (seção 56), pra não reintroduzir o custo de baixar as fotos de todo mundo a cada troca de aba.

**Três ajustes pequenos, mesma sessão**:
1. "Convidados Ritmistas"/"Convidados Diretoria" → "Convidados - Ritmistas"/"Convidados - Diretoria" (tracinho) em todo canto visível — totalizadores da Visão Geral (`#totalExtrasRitmistas`/`#totalExtrasDiretoria`) e rótulo de Convidados no resumo de Figurino (`rotuloConvidados` em `renderizarResumoEntregaFigurino`).
2. Tela de Entrega de Figurino (`#figurino-entregas-totalizador`): `margin-bottom` de 18px pra 24px (padrão de respiro de seção já usado no resto do app). Quando a peça inclui Convidados, o totalizador passou a mostrar primeiro um total geral (Ritmistas + Convidados somados, `totalDuploHtml()` tamanho normal) e, embaixo (com borda separadora), o detalhe por tipo de pessoa em tamanho `mini` — pedido dela: "totalzão geral e depois um total por tipo de pessoa, pode ser menor".
3. Card de Convidado (`renderizarExtrasLista()`, tela Convidados): instrumento (só existe pra Convidado do Tipo Ritmistas, via `e.bateria_instrumento_id`) passou a aparecer junto da observação, na MESMA linha, separados por " - " (ex: "Repique - Teste") — 1ª tentativa colocou em duas linhas `.item-detalhe` separadas, corrigida na hora que ela apontou ("é para ficar o Instrumento um tracinho e aí a observação... eu falei isso, que queria um ao lado do outro"). Motivo do pedido: ajudar a identificar o Diretor de Naipe responsável por aquele Convidado.

Cache-busting final desta sessão: `sw.js` v322→v336 (v323 = batch da seção 60.1; v324 = blindagem try/catch, revertida; v325 = correção da causa raiz do incidente; v326 = revert do layout-botão; v327 = GridStack; v328 = revert do GridStack; v329 = reordenação figurino 2º lugar; v330 = revert de novo pro estável; v331 = reordenação; v332 = respiro+totalzão figurino; v333 = recarregar ao entrar na aba + rename Convidados; v334 = instrumento no card de Convidado; v335 = Aniversariantes fechado; v336 = ordem final + correção instrumento/observação na mesma linha).

## 61. Sessão de 27/ago/2026 (continuação — depois de um `/logout` acidental cortar a conversa anterior): fotos corrigidas de vez, reforma do Figurino publicada, cadastro "pela metade" resolvido, renomeação de Apoio, e uma rodada grande de refinamento na tela de Entrega

Sessão retomada depois que ela pediu pra trocar de conta no Claude Code (`/logout`), o que encerrou a conversa anterior sem avisar que cortaria a sessão no meio. Nada foi perdido de verdade — o histórico completo ficou salvo em disco (Claude Code grava cada sessão num arquivo local) e foi possível recuperar exatamente onde parou, inclusive um problema real que estava em aberto (fotos sem aparecer).

### 61.1 Causa raiz real do travamento de fotos — corrigida de vez, não só remendada

O que a sessão anterior tinha corrigido (seção 60, indiretamente) foi só a blindagem contra a tela travar pra sempre depois de um erro do banco. O motivo do erro em si — por que o banco respondia com erro 500 — não tinha sido investigado (faltava a ferramenta MCP do Supabase, fora do ar). Nesta sessão, com a ferramenta de volta, achada a causa raiz de verdade:

- **Consulta real**: `carregarRitmistas(leve=false)` (a versão "com fotos", chamada em todo carregamento de tela nova ou troca de escola) pedia `select=*` na view `ritmistas_com_instrumento` pra bateria inteira — incluindo a coluna `foto_url` (texto base64 direto na linha, não um link pra arquivo à parte, decisão antiga já documentada na seção 56).
- **Tamanho real, medido**: 187 pessoas na bateria real da Imperatriz, **31 MB** só de fotos nessa consulta (crescido desde os 22MB medidos na seção 56, 25/ago) — e **36 MB no sistema inteiro** (238 pessoas com foto, em todas as baterias).
- **Erro exato, achado via `query_logs` do Supabase MCP**: `{"code":"57014","message":"canceling statement due to statement timeout"}` — repetido **14 vezes em 1h30** só nessa consulta específica. Não era um erro pontual.
- **Achado contraintuitivo, confirmado com `EXPLAIN ANALYZE`**: a consulta em si, do lado do banco, levava só **4,5 milissegundos** — o gargalo não é o banco montando os dados, é o **tempo de transferir 31 MB pela internet** até o navegador de quem está usando (principalmente em conexão de celular mais lenta), enquanto o banco mantém a consulta "aberta" esperando o cliente terminar de receber.
- **Papel `authenticated` tinha `statement_timeout=8s`** (config nativa do Supabase) — baixo demais pra aguentar transferir 31 MB numa conexão ruim.

**Duas correções aplicadas, em conjunto** (uma sozinha não bastava a longo prazo):

1. **Remendo imediato, zero risco**: `ALTER ROLE authenticated SET statement_timeout = '30s';` — sobe de 8 pra 30 segundos, dá mais fôlego pra conexões lentas sem mexer em nenhum dado.
2. **Correção de verdade**: comprimidas as 238 fotos reais do sistema (não só as da Imperatriz) via uma Edge Function nova, `comprimir-fotos` (Super Admin only, batches de até 50 registros por chamada pra nunca estourar o tempo de execução da função). Usa a biblioteca `imagescript` (Deno, WASM puro, sem dependência nativa) pra decodificar, redimensionar (lado maior no máximo 640px, só se for maior que isso) e reencodar em JPEG qualidade 72. **Resultado: 36 MB → 13 MB no total** (a maior foto individual caiu de 444 KB pra 129 KB), sem perder nenhuma foto — confirmado por contagem antes/depois e teste real de decodificação (Pillow) numa amostra.
   - **Backup de segurança antes de tocar em qualquer foto real**: `CREATE TABLE pessoas_foto_backup_20260827 AS SELECT id, foto_url FROM pessoas WHERE foto_url IS NOT NULL;` (238 linhas, intacto, guardado como rede de segurança, nunca usado pra reverter nada).
   - Mesmo padrão já documentado (seção "feedback_sql_direto_trigger_matriz_edicao" da memória): a trigger de proteção de edição (`trg_matriz_edicao_pessoas`) foi desligada só durante o lote de UPDATEs e religada logo em seguida.
   - Autenticação necessária pra chamar a Edge Function feita via login temporário do Super Admin (senha já documentada em "Contas de teste"), token nunca salvo em arquivo nenhum depois de usado.

**Consequência prática pra ela**: a demora de "a tela mostra nomes na hora, foto completa alguns segundos depois" continua existindo por desenho (documentado na seção 56) — isso é esperado, não é bug. O que mudou é que agora esse carregamento **sempre termina** (2-6 segundos observados nos logs depois da correção, contra os 8-30+ segundos que estouravam o limite antes) em vez de falhar aleatoriamente.

### 61.2 Reforma do Figurino: Público múltiplo por peça + Convidados em 3 grupos — pendência da seção 58/60 fechada

Desenho já fechado com ela em sessões anteriores (seção 58, bloqueado até agora pela queda do Supabase MCP). Implementado nesta sessão, em várias rodadas de refinamento depois de ela testar ao vivo.

**Migração de banco** (aplicada com backup/verificação antes de tocar em código):
- `figurino_itens_mestre.publico`: texto de 1 valor → `text[]` (uma peça agora pode cobrir vários públicos ao mesmo tempo, ex: Ritmista + Diretor de Bateria na mesma peça, sem cadastrar duas vezes). Constraint recriada: `publico <@ ARRAY['ritmista','mestre','diretor','apoio'] AND array_length(publico,1) > 0`.
- `extras.grupo` (Convidados): de 2 valores (`ritmista`/`diretoria`, bloco combinado) pra 3 (`ritmista`/`diretor`/`apoio`) — **sem grupo próprio pra Mestre** ("só o Mestre que é único mesmo, rs"). Confirmado antes de migrar: só 2 linhas de teste/demo tinham `grupo='diretoria'` (nenhuma na bateria real), migradas pra `'diretor'` por padrão.
- Ordem dos `ALTER`/`UPDATE`/`DROP CONSTRAINT` importou de verdade: precisou dropar a constraint antiga **antes** de mudar o tipo da coluna (senão a constraint antiga tenta se revalidar contra o novo tipo e quebra com `operator does not exist: text[] = text`), e dropar a constraint de `extras` **antes** do `UPDATE` que migra os valores antigos (senão o próprio `UPDATE` é rejeitado pela constraint antiga, que ainda não aceita `'diretor'`).

**Biblioteca mestre** (Super Admin → Configurações → Figurino): campo "Público" virou checkboxes (era `<select>` de 1 escolha). Editor salva o array direto.

**Ativação por bateria**: sem mudança de mecânica (continua 1 interruptor por peça inteira) — só o rótulo passou a listar todos os públicos que a peça cobre.

**Convidados**: "Tipo de Convidado" ganhou a 3ª opção (Ritmistas / Diretor de Bateria / Diretoria (Apoio)), com `LABEL_GRUPO_EXTRA` reaproveitado tanto no editor quanto nos títulos de seção da lista.

**Achado real dela, corrigido no mesmo dia**: a primeira versão agrupava as 3 telas de listagem (biblioteca mestre, ativação por bateria, "Mais → Entrega de Figurino") por **público** — como uma peça agora pode ter vários públicos, isso fazia a mesma peça aparecer **repetida**, uma vez por seção correspondente ("por que o card se repete se ele já mostra o público dentro?"). Corrigido nas 3 telas: agrupamento passou a ser por **Categoria de Figurino** (Camisa, Calça...) — continua sendo dono único de cada peça, nunca muda, então nunca repete.

**Tela de Entrega — o motivo real do pedido**, reformada em várias rodadas depois de teste ao vivo:
- Quando uma peça cobre Ritmista(s) **e** Diretoria (Mestre/Diretor/Apoio) ao mesmo tempo, aparece um filtro de 2 abas no topo (Ritmista/Diretoria) — nunca mistura as duas listas juntas. Consulta de pessoas passou a buscar `perfil=in.(...)` (todos os públicos da peça de uma vez); qual lado mostrar é decidido na renderização, sem nova ida ao banco ao trocar de aba.
- **Achado dela, 2ª rodada**: dentro do lado Diretoria, a lista ainda misturava Diretor de Bateria e Diretoria (Apoio) sem separar — corrigido sub-dividindo em 3 seções (Mestres/Diretores de Bateria/Diretoria (Apoio)), Convidados de cada cargo aparecendo dentro da seção do próprio cargo (não misturados).
- **Achado dela, 3ª rodada**: faltava, do lado Diretoria, um filtro equivalente ao "Instrumento" que já existia do lado Ritmista. A mesma pílula de filtro passou a ser reaproveitada nos dois lados — filtra por Instrumento na Ritmista, filtra por Tipo de pessoa (Mestre/Diretor de Bateria/Diretoria (Apoio)) na Diretoria (mesmo `<select>`, opções trocadas via JS conforme o lado ativo).
- Totalizador do topo passou a separar Diretoria x Ritmista (2 blocos), no lugar da separação antiga por Vínculo x Convidado.

### 61.3 Correções pontuais publicadas antes da reforma do Figurino

1. **Filtro por checkbox (Instrumento/Status/Cargo) só filtra e fecha ao clicar "Aplicar"** — achado dela: marcar a caixinha e clicar "Aplicar" chamavam a mesma função por trás, então o filtro aplicava sozinho a cada clique (o botão "Aplicar" nunca fazia nada de diferente) e o dropdown nunca fechava. Corrigido separando: `onChangeStatus`/`onCheckInstrumento`/`onChangeCargo`/`onChangeStatusDiretoria` (chamados pelo `onchange` de cada caixinha) passaram a só atualizar o rótulo/estado visual; 4 funções novas (`aplicarFiltroStatus`, `aplicarFiltroInstrumento`, `aplicarFiltroCargo`, `aplicarFiltroStatusDiretoria`), chamadas só pelo clique em "Aplicar", é que de fato filtram e fecham o dropdown (`fecharDropdown()`, helper novo).
2. **Asterisco de campo obrigatório caindo pra linha de baixo, na ficha** (CPF e os 3 campos de responsável) — causa: `.ficha-campo span { display:block }` (regra genérica pro rótulo do campo) pegava também o `<span class="obrigatorio">*</span>` aninhado dentro do mesmo `<span>` pai, virando bloco e caindo pra linha seguinte. Corrigido com `display:inline` explícito em `.ficha-campo .obrigatorio` (specificity maior que a regra genérica, então ganha independente da ordem no arquivo). `cadastro.html` nunca teve esse bug — lá o `*` fica dentro de `<label>`, não de outro `<span>`.
3. **Cadastro "pela metade" (caso do Caio Costa, seção 57) — resolvido**: `verificar_pessoa_existente()` ganhou `existe_conta_orfa` (e-mail existe em `auth.users`, nenhuma linha correspondente em `pessoas` — acontece quando o cadastro trava entre criar o login e salvar a ficha). Detectado, `cadastro.html` tenta `signInWithPassword` com a senha que a pessoa acabou de digitar: se bater (mesma senha da tentativa anterior), completa o cadastro sozinho (cria a linha em `pessoas` que faltava), sem erro nenhum visível; se não bater, mostra mensagem em português pedindo "Esqueci minha senha" em vez do erro em inglês "User already registered". Testado com uma conta órfã real de dado de teste antes de publicar.

### 61.4 Renomeação "Apoio" → "Diretoria (Apoio)" + contadores novos

Ela pediu 2ª rodada de nomenclatura pro cargo `apoio` (era "Apoio", tinha virado só "Diretor" na maioria dos lugares) — virou **"Diretoria (Apoio)"**, com uma regra por contexto (confirmada com ela em 2 rodadas, a 1ª usou "Diretoria (Apoio)" em tudo sem distinguir singular/plural/gênero, corrigida na 2ª):

- **Título de seção/grupo (plural, coletivo)**: "Diretores (Apoio)" — mesma forma de "Diretores de Bateria". Vale em: aba Diretoria, tela de Permissões, dropdowns de filtro (rótulo do "selecionados"), `LABEL_PUBLICO_FIGURINO`.
- **Selo de uma pessoa específica** (ficha, aniversariante, telinha de escolher bateria no login): gênero real da pessoa — "Diretor (Apoio)" ou "Diretora (Apoio)". Funções que já recebiam `genero` como parâmetro (`labelPerfilSA`, `fpCargoLabel` em `ficha-perfil.js`, `cargoLabelVinculo` em `login.html`) ganharam o `apoio` gendered, igual já existia pra `mestre`/`diretor`.
- **Rótulo genérico de categoria** (checkbox de filtro, coluna de exportação Excel, "quem preenche" de Medida/Figurino, texto de convite de cadastro): singular sem gênero, "Diretor (Apoio)" — mesmo padrão já usado ali pra "Diretor de Bateria".
- **Carteirinha, única exceção, intocada**: continua só "Diretor"/"Diretora", sem "(Apoio)" — só que corrigido no caminho um bug real que já existia (nunca variava por gênero, sempre mostrava "Diretor" mesmo pra quem é "Diretora").

**Contadores novos** (mesmo estilo gold já aprovado no dia pro contador de status em Ritmistas): aba Diretoria ganhou número ao lado de cada título de seção (Mestres/Diretores de Bateria/Diretoria (Apoio)); tela de Convidados ganhou contador por tipo + um total geral no topo.

### 61.5 Logo da Imperatriz aplicada na bateria demo + PNG corrompido corrigido

Pedido dela: aplicar na bateria demo (id=2) a mesma logo já corrigida manualmente na bateria real (id=13, seção 56) — ela não tinha o arquivo local, só existia como base64 dentro do banco.

**Achado real no caminho**: o arquivo salvo desde a correção manual da seção 56 tinha um defeito técnico — checksum (CRC) inválido num chunk `IDAT` do PNG. Navegadores toleram isso silenciosamente (ignoram o CRC, decodificam normal), por isso nunca deu problema visível no app; mas ferramentas mais rigorosas (Pillow com `verify()`, o validador de upload de arquivo desta sessão) recusam o arquivo como corrompido. Provável causa: um bug de geração de base64 em alguma etapa manual anterior (não investigado a fundo, já que os pixels em si estavam intactos).

**Correção**: pixels recuperados com `Image.load()` do Pillow (tolerante a CRC ruim, `ImageFile.LOAD_TRUNCATED_IMAGES = True`), reencodados como PNG novo (CRC correto), aplicados nas duas baterias (13 e 2) via `UPDATE baterias SET logo_url = ... WHERE id IN (2, 13)` (com a trigger `trg_matriz_edicao_baterias` desligada/religada ao redor, mesmo padrão da seção 56). Confirmado com download fresco + `Image.verify()` direto do banco depois da correção. Arquivo final salvo em `imagens/logo-bateria-imperatriz-swing-leopoldina.png` (fora do Git), pra ela ter acesso local.

**Nota de processo**: a primeira tentativa de mandar o arquivo pra ela via `SendUserFile` falhou (upload rejeitado, "server returned 400") — só depois de investigar com Pillow que ficou claro que o arquivo original realmente estava corrompido (não era um problema da ferramenta de envio).

### 61.6 Refinamento visual da tela de Entrega de Figurino, em 5 rodadas depois de teste ao vivo

Depois da reforma de público múltiplo (seção 61.2), ela pediu uma sequência de ajustes finos na mesma tela, cada um testado ao vivo antes do próximo:

1. **"Status" virou selo de verdade**: a coluna mostrava uma ação ("Marcar"), não um status — inconsistente com o próprio título da coluna. Virou selo colorido, "Não entregue" (cinza) / "✓ Entregue" (verde), que continua sendo o mesmo clique de marcar/desfazer de sempre (**marcar continua pedindo confirmação, desfazer continua direto, sem confirmação — perguntado a ela explicitamente se queria simetria, ela preferiu manter como estava**: "acho que não precisa" — menor risco: desfazer é barato de corrigir, marcar por engano pode fazer alguém ficar sem receber de verdade). Tirado o ✓ solto que ficava antes do nome, redundante com o selo novo.
2. **Reorganização dos filtros** (aba pro lado + pílulas pro refino): ela reportou "muito filtro misturado" — 4 blocos empilhados com o mesmo peso visual (o toggle Ritmista/Diretoria, busca, instrumento, status). Antes de implementar, montado um mockup comparativo (Artifact HTML, cores/fontes reais do app) mostrando a ideia — aprovado por ela ("gostei") antes de codar. Implementado: Ritmista/Diretoria virou aba com sublinhado dourado (é navegação, não filtro); Instrumento e Status viraram `<select>` estilo pílula, lado a lado, debaixo de um rótulo "Filtros" (native select em vez do dropdown-com-checkbox de Ritmistas, porque aqui cada um é sempre 1 escolha só).
3. **Totalizador + os 2 interruptores lado a lado**: ideia dela, aproveitar o espaço vazio ao lado do card do totalizador em tela larga, em vez de empilhar "Entrega Iniciada"/"Entrega Finalizada" embaixo. Puro flexbox com `flex-wrap`, sem media query — empilha sozinho em tela estreita. **Achado dela no meio do caminho**: o texto explicativo desses 2 interruptores tinha ficado "solto" longe deles (caía depois do card do totalizador, que é mais alto) — movido pra dentro da mesma coluna dos interruptores.
4. **Remoção do reordenamento "entregue desce pro fim da lista"**: ela pediu isso originalmente em 26/ago (seção 57) e mudou de ideia — numa lista grande, marcar alguém como entregue fazia a pessoa "sumir" pro fim, dando a impressão de que nada tinha acontecido. Como já existe o filtro Não entregues/Entregues, não fazia mais sentido reordenar sozinho. Removida a função `ordenarPendentesPrimeiro` (não só do lado Ritmista, dos 3 sub-grupos de Diretoria e Convidados também) — lista volta a seguir a ordem alfabética que a API já retorna (`order=nome`).
5. **Alinhamento do totalizador com CSS grid de verdade**: pedido inicial dela foi só "dar uma distância" entre os blocos Ritmistas/Diretoria (resolvido com `gap`), mas depois ela esclareceu que queria algo mais específico — "Faltam" (linha de cima, total geral) alinhado exatamente com onde "Diretoria" (linha de baixo, título do grupo) começa. Como as duas linhas têm conteúdo diferente, gap sozinho nunca ia garantir isso de verdade — refeito com CSS grid de 2 colunas (`grid-template-columns: max-content max-content`): o `.total-duplo` de cima vira `display:contents` (seus 2 itens, Total e Faltam, caem direto nas 2 colunas da grade — só o de cima, não os mini de baixo, via seletor `.figurino-total-grid > .total-duplo`), e os títulos/mini-totais de Ritmistas e Diretoria usam essas mesmas colunas. Resultado: alinhamento garantido pela estrutura, não por tentativa de acertar o valor certo de gap.

Reação final dela, depois de tudo publicado: "Nossa, ficou tudo lindo. Muito obrigada de verdade por essa tela."

Cache-busting desta sessão: `sw.js` v337→v361 (bump a cada publicação — filtro Aplicar, asterisco, fotos/timeout [sem mudança de front, só backend], filtro Instrumento/Status/Cargo, cadastro pela metade, contador Convidados, renomeação Apoio + contadores Diretoria, ajuste plural/singular/gênero, migração + implementação completa do Figurino, correção de repetição por Categoria, sub-divisão Diretoria por cargo, filtro por tipo em Diretoria, respiro Total/Faltam, selo de status + posição do texto, resumo do texto explicativo, remoção do reordenamento, alinhamento em grid).

## 62. Sessão de 28/ago/2026: Reforma de Permissões — catálogo novo, enforcement real no front, RLS corrigido, Comercial travado pra Super Admin

Desenho tinha sido fechado com ela em 26/ago (seção 58) mas ficou bloqueado o dia inteiro pelo Supabase MCP fora do ar. Nesta sessão, com prazo apertado dela ("preciso dela funcionando até amanhã"), a implementação de ponta a ponta: catálogo revisado com ela → migração dos dados existentes → trigger reescrita → enforcement no front inteiro → um RLS desalinhado achado e corrigido → dois ajustes pedidos por ela ao vivo, testando o link de preview (Ver/Editar separado em Configurações, Comercial travado pra Super Admin) → publicado em produção.

### 62.1 Catálogo revisado com ela antes de implementar

O rascunho da seção 58 (feito por um agente) foi apresentado pra ela grupo por grupo. Três correções que ela pediu antes de eu tocar em qualquer código:

1. **"Editar Diretoria" (editar outro Mestre/Diretor/Apoio) não devia ser um bloco só** — ela: "eu acho que deveria ser Editar por tipo de pessoa (mestre, diretores de bateria e diretores (apoio). pq eu posso não querer que ngm edite o mestre, somente ele mesmo." Isso virou `editar_mestre`/`editar_diretor`/`editar_apoio` no catálogo — **e depois foi removido de novo no meio da sessão**, ver 62.6.
2. **Relatórios (Exportar) levantou uma pergunta que virou regra pra toda a reforma**: "se a pessoa não tiver acesso, como aparece o botão? ele fica desabilitado, ou ele simplesmente não aparece? O que não pode acontecer é o botão aparecer habilitado e não funcionar, isso é péssimo e isso tem que valer para todo o site e permissões." — essa frase dela é a regra-mãe de toda a implementação: qualquer botão de ação (Ativar/Suspender/Novo Cadastro/Ver carteirinha/etc.) **some por completo** quando falta a permissão, nunca fica visível e falhando escondido.
3. **"Convites" (Novo Cadastro) precisava virar permissão própria** — "nem todo mundo poderia ter permissão para cadastrar alguém e pegar o link do ritmista." Virou `criar_cadastro_ritmistas`/`criar_cadastro_diretoria`.

Ela também aceitou fazer o resto (Diretor de Naipe restrito ao próprio naipe, "sem carteirinha esta temporada") como etapas **separadas**, depois desta: "vc quer fazer o resto separado? Ok. [...] Vambora."

### 62.2 Catálogo final, publicado

```
Visão Geral        ver_visao_geral
Dados da Escola     ver_dados_escola, editar_dados_escola
Dados da Bateria    ver_dados_bateria, editar_dados_bateria
Ritmistas           ver_ritmistas, ver_dados_sensiveis_ritmistas, criar_cadastro_ritmistas,
                    aprovar_ritmistas, rejeitar_ritmistas, suspender_ritmistas,
                    desligar_ritmistas, reativar_ritmistas,
                    editar_instrumento_ritmista, editar_medidas_ritmista,
                    ver_naipe, editar_naipe, ver_repique_bossa, editar_repique_bossa,
                    editar_declaracao_responsavel, exportar_ritmistas
Diretoria           ver_acessos, ver_dados_sensiveis_acessos, criar_cadastro_diretoria,
                    aprovar_acessos, rejeitar_acessos, suspender_acessos,
                    desligar_acessos, reativar_acessos, exportar_diretoria
Figurino            ver_figurino, editar_figurino
Convidados          ver_extras, editar_extras
Carteirinha         ver_carteirinha_outros
Configurações       ver_instrumentos, editar_instrumentos, ver_medidas, editar_medidas,
                    ver_vagas, editar_vagas, ver_figurino_bateria, editar_figurino_bateria
Histórico           ver_historico
Permissões          ver_permissoes, editar_permissoes
```

Comparado ao catálogo antigo: `aprovar_ritmistas`/`aprovar_acessos` (que cobriam aprovar+rejeitar+suspender+desligar+reativar juntos) viraram 5 chaves cada; `editar_ritmistas` virou `editar_instrumento_ritmista`/`editar_medidas_ritmista`; `ver_ritmistas`/`ver_acessos` (que já destravavam CPF/endereço/emergência/responsável junto) ganharam `ver_dados_sensiveis_ritmistas`/`ver_dados_sensiveis_acessos` separado; `ver_relatorios` virou `exportar_ritmistas`/`exportar_diretoria`; `ver_configuracoes` (única, morta — nunca checada em lugar nenhum) virou 8 chaves reais (`ver_`/`editar_` por sub-tela); `editar_configuracoes` (também nunca exposta na tela, mas viva no RLS — ver 62.5) foi removida; `editar_mestre`/`editar_diretor`/`editar_apoio` foram removidas de novo (62.6); `ver_comercial`/`editar_comercial` foram removidas (62.7). `TODAS_CAPACIDADES` (usada por `salvarPermissoesPessoa()`/`renderizarEditorPermissoesPessoa()`) continua derivada automaticamente de `GRUPOS_CAPACIDADES` via `flatMap` — nenhuma das duas funções precisou de mudança pra suportar o catálogo novo.

### 62.3 Migração dos dados existentes — aditiva, verificada

`vinculos.capacidades` é um jsonb sobrescrito por inteiro toda vez que alguém salva permissões pela tela (`salvarPermissoesPessoa()`) — então trocar o catálogo por si só não apaga nada de quem já tinha configuração salva, mas também não dá as chaves novas equivalentes sozinho. Antes de mexer no front, backup + migração:

- `CREATE TABLE vinculos_capacidades_backup_20260827 AS SELECT id, capacidades FROM vinculos WHERE capacidades IS NOT NULL AND capacidades <> '{}'::jsonb;` (20 linhas).
- `UPDATE vinculos SET capacidades = capacidades || jsonb_build_object(...)` — **aditivo** (`||` faz merge, nunca substitui): quem tinha `ver_ritmistas=true` ganhou `criar_cadastro_ritmistas`, `ver_dados_sensiveis_ritmistas`, `ver_carteirinha_outros`, `editar_declaracao_responsavel` também `=true`; quem tinha `editar_ritmistas=true` ganhou `editar_instrumento_ritmista`, `editar_medidas_ritmista`, e as 5 ações de status (`aprovar_`/`rejeitar_`/`suspender_`/`desligar_`/`reativar_ritmistas`); mesmo padrão espelhado pro lado Diretoria (`ver_acessos`→`criar_cadastro_diretoria`+sensíveis, `editar_ritmistas` já geral→5 ações de `_acessos`); quem tinha `ver_relatorios=true` ganhou `exportar_ritmistas`/`exportar_diretoria`; quem tinha `ver_configuracoes=true` ganhou as 4 chaves `editar_*` de Configurações (na época ainda sem separação Ver/Editar, ver 62.6) mais a antiga `editar_configuracoes` preservada (ver 62.5). Chaves antigas (`editar_ritmistas`, `ver_relatorios`, `ver_configuracoes`, `editar_configuracoes`, etc.) **não foram apagadas** — ficam como lixo inofensivo no jsonb até a próxima vez que alguém salvar as permissões dessa pessoa pela tela (`salvarPermissoesPessoa()` reescreve do zero, só com `TODAS_CAPACIDADES` do catálogo atual).
- **Verificação, feita via `execute_sql` antes de tocar em qualquer tela**: as 20 linhas migradas conferidas uma a uma — confirmado que quem tinha acesso configurado antes (`Jhones Silva`, `Luiz Alberto`, `Luiz Alberto Barros Barbosa` com acesso quase total; um punhado de Diretores com `ver_ritmistas`/`editar_ritmistas` parciais) ganhou exatamente as chaves novas equivalentes, sem gap. `Adenilson Bemvindo dos Santos` e outros com tudo `false` continuaram com tudo `false` (sem regressão nem ganho indevido).

### 62.4 Trigger `aplicar_matriz_edicao_vinculos()` reescrita (migração `reforma_permissoes_trigger_vinculos_granular`)

Antes, a trigger só sabia bloquear tudo-ou-nada por `editar_ritmistas` numa ação de status genérica. Reescrita pra checar a capacidade certa por tipo de mudança:

```sql
if old.perfil = 'ritmista' then
  if new.status is distinct from old.status and not tenho_capacidade(
    case
      when new.status = 'aprovado' and old.status in ('suspenso','desligado') then 'reativar_ritmistas'
      when new.status = 'aprovado' then 'aprovar_ritmistas'
      when new.status = 'rejeitado' then 'rejeitar_ritmistas'
      when new.status = 'suspenso' then 'suspender_ritmistas'
      when new.status = 'desligado' then 'desligar_ritmistas'
      else 'aprovar_ritmistas'
    end, old.bateria_id) then
    new.status := old.status; new.aprovado_por := old.aprovado_por; new.motivo_status := old.motivo_status;
  end if;
  if not tenho_capacidade('editar_instrumento_ritmista', old.bateria_id) then
    new.bateria_instrumento_id := old.bateria_instrumento_id; ...
  end if;
  if not tenho_capacidade('editar_medidas_ritmista', old.bateria_id) then
    new.tamanho_camisa := old.tamanho_camisa; ...
  end if;
  if not tenho_capacidade('editar_declaracao_responsavel', old.bateria_id) then
    new.declaracao_responsavel := old.declaracao_responsavel;
  end if;
else
  -- Mestre/Diretor/Apoio: mesma separação de ações de status (aprovar_/rejeitar_/
  -- suspender_/desligar_/reativar_acessos). naipe, bateria_instrumento_id,
  -- cadastro_completo continuam SEMPRE travados aqui -- nunca dependeram de
  -- editar_mestre/diretor/apoio, então removê-las do catálogo (62.6) não mudou
  -- nada de verdade no banco.
end if;
```

Mesmo padrão de sempre: `is_super_admin()`/`service_role` bypassam tudo no topo da função; autoedição (a própria pessoa editando o próprio vínculo) tem sua própria ramificação, sem checar capacidade nenhuma pros próprios dados.

### 62.5 Achado sério: RLS de Configurações ainda checava a chave morta `editar_configuracoes`

Antes de tocar em qualquer tela, conferido o RLS real de `bateria_instrumentos`/`bateria_medidas`/`bateria_medida_tipos`/`bateria_figurino_itens` (as 4 tabelas por trás de Configurações) — surpresa: **`editar_configuracoes` não era morta de verdade**, como uma nota antiga (seção 41/58) tinha registrado. Ela nunca aparecia em nenhuma tela, mas as políticas de INSERT/UPDATE/DELETE dessas 4 tabelas checavam literalmente `tenho_capacidade('editar_configuracoes', bateria_id)`. Como o catálogo novo só oferece as 8 chaves granulares (`editar_instrumentos`/`editar_medidas`/`editar_vagas`/`editar_figurino_bateria` + os 4 `ver_*` equivalentes), sem essa correção, conceder "Editar Instrumentos" pra alguém novo pareceria salvar (o checkbox marca, a tela recarrega) mas o `PATCH`/`POST` de verdade seria rejeitado pelo RLS em silêncio — exatamente o tipo de "botão que parece funcionar mas não funciona" que ela proibiu.

**Corrigido** (migração `reforma_permissoes_rls_configuracoes_granular`): as 4 tabelas passaram a checar as chaves granulares novas:
- `bateria_instrumentos` (serve duas capacidades — Instrumentos ativa/desativa, Vagas escreve `vagas`, mesma tabela, colunas diferentes): `tenho_capacidade('editar_instrumentos', bateria_id) OR tenho_capacidade('editar_vagas', bateria_id)`.
- `bateria_medidas` e `bateria_medida_tipos`: `tenho_capacidade('editar_medidas', bateria_id)`.
- `bateria_figurino_itens`: `tenho_capacidade('editar_figurino_bateria', bateria_id)`.

Zero regressão pra quem já tinha acesso: a migração da seção 62.3 já tinha dado a chave antiga (`editar_configuracoes`) E as novas granulares pra quem já usava Configurações — a troca do RLS só passou a ignorar a chave antiga, que ninguém mais vai ganhar de novo (não está mais no catálogo).

### 62.6 "Editar Mestre/Diretor/Apoio" removida — dado pessoal é só a própria pessoa ou Super Admin, sempre

No meio da implementação, perguntada sobre por que a permissão "Editar Diretoria" (item 62.1) estava sendo tratada como fase separada, ela reagiu: "Peraí... dado pessoal ngm pode editar mesmo. Somente a própria pessoa, PELO AMOR DE DEUS." e, depois de eu confirmar (incorretamente, na hora) que "nem Super Admin" editava, ela corrigiu: **"Ou eu."** — a regra certa, confirmada: **só a própria pessoa, ou Super Admin. Nunca ninguém mais, nunca configurável.**

Conferido o que já valia (sem eu ter mexido em nada): `aplicar_matriz_edicao_pessoas()` — quando quem edita não é nem a própria pessoa nem Super Admin — já travava incondicionalmente foto, nome, apelido, nacionalidade, CPF, documento, nascimento, celular, e-mail, tipo sanguíneo, endereço completo, **contato de emergência (nome/parentesco/celular)** e gênero. Ela perguntou explicitamente se isso cobria Contato de Emergência ("Dados pessoais, nunca. Nem de Contato de Emergência. Vc quer repassar isso?") — confirmado que sim, já cobria, sem precisar de nenhuma mudança.

O que existia de errado era só no **catálogo de Permissões** — `editar_mestre`/`editar_diretor`/`editar_apoio` (criadas no rascunho de 26/ago, item 62.1) sugeriam que dava pra configurar isso, quando na prática nunca dava (o trigger de `vinculos` já trava `naipe`/`bateria_instrumento_id`/etc. de outra pessoa incondicionalmente, nunca checou essas 3 chaves). Removidas do catálogo — puramente uma limpeza de texto, zero mudança de comportamento no banco.

### 62.7 Ver/Editar separado em Configurações — pedido dela ao vivo, testando o link

Ela testou o link de preview e estranhou: "Continuo não entendendo. a pessoa nunca pode só ver. vai ter a opção de editar tb. é isso?" — os outros grupos (Dados da Escola, Dados da Bateria) já tinham Ver/Editar separados, mas Configurações (Instrumentos/Medidas/Vagas/Figurino da bateria) só tinha uma permissão por sub-tela (ver+editar juntos, decisão minha ao montar o catálogo, nunca aprovada por ela nesse nível de detalhe). Ela: "eu acho justo sim, se o mestre tiver curiosidade, ele poder olhar o que foi cadastrado na bateria dele, mesmo que ele não mexa" — pediu pra criar.

Implementado: cada uma das 4 sub-telas ganhou `ver_X`/`editar_X` separados (8 chaves no total, ver 62.2). Quem só tem "Ver": a tela abre normal (não esconde nada), mas **todo `input`/`select`/`button` dentro dela fica `disabled` de verdade** (não só visual) + `opacity:0.55` na tela inteira (`.config-subtela--somente-leitura`) — mesmo padrão já usado no interruptor "Ritmista edita medidas" dentro de Permissões (`chkRitmista.disabled = !podeEditarPermissoes`). `abrirConfigTela(nome)` chama `aplicarSomenteLeituraConfigTela(nome, !podeEditarConfigSubtela(nome))` logo depois de renderizar; como os controles ficam desabilitados de verdade, os `onchange`/`onclick` nunca disparam, então não precisa re-aplicar a trava depois — só quem tem "Editar" consegue interagir e re-renderizar a tela.

### 62.8 Comercial vira exclusivo de Super Admin — achado dela depois de publicar

Já com a reforma publicada em produção, ela se deu conta: "eu preciso fazer uma coisa... eu acho que vou ter que criar algo de permissões diferente. o menu Comercial só poderia ser visto pelo Super Admin." O catálogo (herdado de antes da reforma, seção 41) tinha `ver_comercial`/`editar_comercial` tratados como qualquer outra permissão configurável — abria a possibilidade (mesmo que ninguém tivesse usado ainda, confirmado nos dados migrados) de um Super Admin conceder sem querer acesso ao interruptor "Modo Carteirinha" (decisão comercial, nunca deveria ser opção de Mestre/Diretor/Apoio).

Corrigido: `ver_comercial`/`editar_comercial` removidas do catálogo (não aparecem mais como algo pra conceder) e `podeVerAba('comercial')` passou a checar `souSuperAdmin` direto, sem passar pela capacidade nenhuma — trava tanto a lista do "Administrativo" (item some) quanto `trocarAba('comercial')` chamado direto (ex: forçado via console). Publicado direto (sem link de preview) por decisão dela — mudança só restringe, ninguém tinha essa permissão hoje.

### 62.9 Enforcement no front — lista completa do que passou a checar capacidade

Todos os itens abaixo, antes desta reforma, ou não checavam capacidade nenhuma (apareciam pra qualquer um com acesso à tela/ficha) ou checavam uma capacidade genérica demais (`ver_ritmistas`/`editar_ritmistas`/`ver_relatorios`). Todos seguem a regra da Márcia: **some por completo quando falta a permissão, nunca fica visível e falhando escondido** — exceção única e deliberada é 62.7 (Ver-sem-Editar em Configurações), onde "olhar sem poder mexer" é o comportamento pedido.

- **Ficha do Ritmista** (`admin.html`, dentro de `abrirCadastro()`): Ativar/Rejeitar/Suspender/Desligar/Reativar, cada um checando sua própria chave (`aprovar_`/`rejeitar_`/`suspender_`/`desligar_`/`reativar_ritmistas`) — antes, os 5 apareciam juntos sem checagem nenhuma dentro do modal (só o card da lista já checava `aprovar_ritmistas` pro Ativar).
- **Ficha da Diretoria** (`admin.html`, dentro da função equivalente): mesmos 5 botões, mesma separação, com as chaves `_acessos`.
- **"+ Novo Cadastro"** (Ritmistas e Diretoria): cabeçalho inteiro (não só o conteúdo) some sem `criar_cadastro_ritmistas`/`criar_cadastro_diretoria` — `aplicarGatingNovoCadastro()`, chamada uma vez no carregamento da tela do Admin.
- **"Ver carteirinha ↗"** de outra pessoa (dentro da ficha de Ritmista e de Diretoria): checa `ver_carteirinha_outros`.
- **Botões Exportar** (Ritmistas/Diretoria): split de `ver_relatorios` pra `exportar_ritmistas`/`exportar_diretoria`, cada botão checando o seu.
- **Configurações**: aba inteira só aparece se a pessoa tiver ANY `ver_`/`editar_` de qualquer uma das 4 sub-telas (`podeVerAba('configuracoes')`); cada item da lista (Instrumentos/Vagas/Categoria de Figurino/Figurino) some individualmente sem `ver_X`/`editar_X`; `abrirConfigTela(nome)` bloqueia abrir mesmo forçado via console.
- **Selo de Naipe** (card de Diretor, aba Diretoria): checa `ver_naipe` — antes aparecia pra qualquer um com `ver_acessos`.
- **Declaração do Responsável** (toggle na ficha de um Ritmista menor de idade): quem não tem `editar_declaracao_responsavel` vê o mesmo selo (Entregue/Não entregue), mas sem `onclick` nem `cursor:pointer` — nunca parece clicável.
- **`ficha-perfil.js` (`fpCamposEditaveis`)**: a entrada que liberava `bateria_instrumento_id`/`medidas` pra qualquer Diretoria editando um Ritmista virou duas checagens independentes (`editar_instrumento_ritmista`/`editar_medidas_ritmista`) — essa era a lacuna mais séria encontrada no levantamento de 26/ago ("a pessoa edita, salva, parece funcionar, mas o banco reverte em silêncio").
- **`ficha-perfil.js` (`fpIniciar`)**: CPF, documento (Passaporte/RNE), endereço completo, contato de emergência e dados do responsável somem por inteiro da ficha (não só ficam vazios) quando quem olha não é a própria pessoa, não é Super Admin, e não tem `ver_dados_sensiveis_ritmistas`/`ver_dados_sensiveis_acessos` (dependendo do perfil de quem está sendo visto).

### 62.10 Workflow de publicação

Trabalho feito em branch dedicado `preview/reforma-permissoes` (3 commits: catálogo, enforcement no front, Ver/Editar em Configurações), com link de preview gerado a cada rodada (`get_access_to_vercel_url`) — ela testou ao vivo antes de aprovar, e foi nesse teste que surgiram os dois ajustes das seções 62.6 (removido antes de qualquer publicação) e 62.7 (pedido durante o teste). Depois do "Pode publicar.", merge pra `main` (`git merge preview/reforma-permissoes`, 1 conflito em `sw.js` — número de cache divergente entre os dois branches, resolvido ficando com o maior). A correção do Comercial (62.8) veio depois, direto na `main` (sem branch de preview — mudança só restritiva, aprovado por ela explicitamente pra pular esse passo desta vez).

### 62.11 Fora de escopo desta rodada (fica pra depois)

- **Diretor de Naipe restrito ao próprio naipe** — segue sem desenho fechado (ver CLAUDE.md).
- **"Ritmistas/Diretoria sem carteirinha esta temporada"** (par de interruptores por bateria, caso do Mestre com bulk import) — ela confirmou explicitamente "fica pra depois" quando perguntada nesta sessão.
- **Modelo "padrão por grupo + ajuste por pessoa"** que ela tinha descrito em 26/ago (grupo vence quando a pessoa não tem marcação própria) — não entrou nesta rodada. O catálogo publicado continua 100% por pessoa (mesma mecânica de sempre). Fica como ideia se ela sentir falta do "pessoa por pessoa toda vez" na prática.
- **Regras hoje fixas por nome de cargo em `fpCamposEditaveis`** (ex: só Diretor edita o próprio Naipe) virarem configuráveis — ainda não decidido se cabe numa rodada futura.

### 62.12 Checkbox dependente trava/desmarca sozinho na tela de Permissões

Já com a reforma em produção, ela pediu uma melhoria geral no meio da conversa sobre o interruptor "Restrito ao naipe" (seção 63): "se ver ritmistas não estiver marcado, não é nem para liberar essa marcação, ela deveria ficar desabilitada" — e generalizou: "a mesma coisa é: se uma pessoa não pode ver a tela ritmistas, então ela não pode editar."

Implementado como um mapa declarativo: cada item de `GRUPOS_CAPACIDADES` ganhou um `dependeDe` opcional (ex: `{ chave: 'aprovar_ritmistas', ..., dependeDe: 'ver_ritmistas' }`); `DEPENDE_DE` é derivado automaticamente desse catálogo (`chave → chave pai`). Função nova `aplicarDependenciasPermissoes()` roda ao abrir o editor e a cada clique em qualquer checkbox (`onchange` em todos): pra cada chave com `dependeDe`, desabilita o checkbox se o "pai" estiver desmarcado, e força desmarcar se já estava marcado — em cascata (`while` até estabilizar), cobrindo corrente de 2 níveis onde existe (`editar_naipe` depende de `ver_naipe`, que depende de `ver_ritmistas`). CSS `#pe-editor input:disabled + label { opacity:0.45 }` deixa visualmente óbvio o que está travado.

Dependências aplicadas em todo o catálogo, não só em Ritmistas: todo `editar_X` depende do `ver_X` correspondente (Dados da Escola/Bateria, Figurino, Convidados, Configurações — as 4 sub-telas, Permissões), e dentro de Ritmistas/Diretoria todas as ações (aprovar/rejeitar/suspender/desligar/reativar/editar/exportar/criar cadastro/ver dados sensíveis) dependem do `ver_ritmistas`/`ver_acessos` correspondente. **Importante**: essa trava existe só na TELA (evita configurar uma combinação sem sentido) — não é uma trava de banco nova. A trava real de cada ação já existia nos triggers/RLS desde a reforma original (seção 62.4/62.5), independente disso.

## 63. Sessão de 28/ago/2026 (continuação): Diretor de Naipe restrito ao próprio naipe

Pedido antigo (seção 58/CLAUDE.md, 26/ago), ainda sem desenho fechado até esta sessão: um Diretor real pediu que Diretor de Naipe só veja/aprove/edite Ritmistas do próprio naipe, perdendo a visão do resto. Fechado o desenho direto com ela nesta sessão, em conversa curta (perguntas pontuais, sem mockup):

- **Escopo confirmado por ela**: a restrição é **só sobre Ritmistas** — "a restrição é somente à Ritmistas. No figurino ele pode ver. pq ele poderia ajudar na entrega das roupas." Diretoria (outros Mestres/Diretores/Apoio) também continua 100% visível — ela escolheu explicitamente não esconder isso.
- **Só Diretor de Bateria tem naipe** — confirmado por ela, corrigindo minha pergunta inicial (eu tinha perguntado se Mestre/Apoio também deveriam ser elegíveis; ela: "Só quem tem naipe é Diretor de Bateria. Os demais não são ligados a um naipe.").
- **Sem naipe atribuído + restrição ligada = lista vazia, permitido**: "pode ligar e a pessoa vai ver a lista vazia." Não há bloqueio na tela impedindo ligar a restrição sem naipe.
- **Duas camadas independentes, confirmadas com ela**: `ver_ritmistas` decide se a aba existe; "Restrito ao naipe" só faz efeito em cima de quem já tem `ver_ritmistas` — sem isso, ligar/desligar a restrição não muda nada (não tem o que restringir). Isso motivou o checkbox dependente da seção 62.12.

### 63.1 Casando o naipe do Diretor com o instrumento do Ritmista

`vinculos.naipe` (jsonb, array de strings) guarda uma mistura de nomes de instrumento reais (as opções que aparecem como checkbox no editor de naipe, `fpEl('fp-naipe-edit')` em `ficha-perfil.js`, carregadas de `fpCarregarOpcoesInstrumento`) mais duas pseudo-opções fixas, sempre adicionadas no fim da lista (`nomes.push('Repique de Bossa', 'Especiais')`): "Repique de Bossa" (não é instrumento — cobre Ritmistas com `repique_bossa = true`, de qualquer instrumento de Repique) e "Especiais" (cobre Ritmistas cujo instrumento pertence ao grupo "especial" da biblioteca mestre, não "tradicional").

A view `ritmistas_com_instrumento` já expõe `instrumento_nome` e `instrumento_grupo` prontos por linha (join com `bateria_instrumentos`/`instrumento_nomenclaturas`/`instrumento_categorias`), então o casamento é direto, sem precisar de joins adicionais na hora de checar.

### 63.2 Banco: coluna, função e RLS de verdade (não só escondido na tela)

- **Coluna nova**: `vinculos.restrito_ao_naipe boolean NOT NULL DEFAULT false` — mesmo padrão de `modo_carteirinha_individual` (atributo do vínculo, fora do jsonb `capacidades`, porque não é uma capacidade tudo-ou-nada, é um modificador de uma capacidade já existente).
- **Função `tenho_acesso_ritmista_por_naipe(p_vinculo_ritmista_id, p_bateria_id)`** (SQL, `STABLE SECURITY DEFINER`): retorna `true` direto se quem chama não está restrito (não filtra nada pra ninguém sem a restrição ligada); senão, só `true` se o Ritmista alvo casar com o naipe de quem chama — `naipe ? n.nome` (operador jsonb `?`, testa se o array contém aquele elemento texto) para instrumento real, `naipe ? 'Repique de Bossa' AND v_alvo.repique_bossa` e `naipe ? 'Especiais' AND cat.grupo = 'especial'` pras pseudo-opções.
- **RLS de SELECT em `vinculos`** (`admin_select_propria_bateria`, reescrita): o branch de `perfil = 'ritmista'` ganhou `AND tenho_acesso_ritmista_por_naipe(id, bateria_id)` além do já existente `tenho_capacidade('ver_ritmistas', ...)`. Como a view `ritmistas_com_instrumento` é `security_invoker=true`, isso filtra a visibilidade tanto pela view quanto por qualquer consulta direta a `vinculos` — **filtro de banco de verdade**, não front-end: um Diretor restrito literalmente não recebe do banco os dados dos Ritmistas fora do naipe, nem via Console do navegador forçando a chamada.
- **Trigger `aplicar_matriz_edicao_vinculos`, branch `perfil = 'ritmista'`**: cada uma das 5 checagens de capacidade (status via `aprovar_`/`rejeitar_`/`suspender_`/`desligar_`/`reativar_ritmistas`, `editar_instrumento_ritmista`, `editar_medidas_ritmista`, `editar_declaracao_responsavel`, `editar_repique_bossa`) passou a exigir também `tenho_acesso_ritmista_por_naipe(old.id, old.bateria_id)` — quem está restrito não consegue aprovar/editar um Ritmista de fora do naipe mesmo tendo a capacidade geral marcada. O branch de Mestre/Diretor/Apoio (não-ritmista) **não** ganhou essa checagem — confirmado com ela que a restrição é só sobre Ritmistas.
- **Achado e corrigido no caminho, antes de publicar**: `restrito_ao_naipe` não estava protegida contra autoedição — a lista de campos resetados no branch `autoedicao` da trigger (`new.capacidades := old.capacidades`, etc.) não incluía essa coluna nova, o que deixaria um Diretor desligar a própria restrição direto via API, sem passar pela tela. Corrigido adicionando `new.restrito_ao_naipe := old.restrito_ao_naipe;` no branch de autoedição (sempre, incondicional) e agrupando a checagem de escrita (branch não-self) junto de `capacidades`, sob a mesma trava `editar_permissoes` — é permissão de verdade, mesma disciplina.
- **View `ritmistas_com_instrumento` recriada** com `v.restrito_ao_naipe` adicionada ao fim do `SELECT` (Postgres exige coluna nova no fim de uma `CREATE OR REPLACE VIEW`, não no meio — tentativa inicial no meio da lista deu erro `cannot change name of view column`). `security_invoker=true` reafirmado explicitamente na recriação e reconferido depois (`reloptions`), `anon` sem SELECT e `authenticated` com SELECT reconferidos via `has_table_privilege` — mesma disciplina de toda mudança de view desde a seção 41.

### 63.3 Tela de Permissões

Interruptor "Restrito ao próprio naipe" injetado dentro do grupo "Ritmistas" do editor, só quando `pe.perfil === 'diretor'` (checado no `abrirEditorPermissoesPessoa`, que agora também guarda `perfil` no estado `permissoesPessoaEditando`). Trava com "Ver lista" via `aplicarDependenciasPermissoes()` (seção 62.12) — caso especial fora do mapa `DEPENDE_DE` porque é uma coluna própria, não uma chave de `capacidades`. `salvarPermissoesPessoa()` lê o checkbox só se ele existir no DOM (perfil `diretor`); pra qualquer outro perfil, salva `false` sempre (nunca esteve disponível pra marcar). Resumo da pessoa na lista (`permissoesResumoTexto`) e na ficha (`permissoesResumoDetalhado`) ganharam o indicador "· restrito ao naipe" quando ligado.

### 63.4 Workflow de publicação

Branch `preview/diretor-naipe-restrito`, 1 commit, link de preview testado por ela com sugestão de roteiro real (ligar a restrição num Diretor de teste com naipe já atribuído, logar com a conta dele, conferir a lista filtrada). Aprovação: "aprovadíssimo, amei." Merge fast-forward pra `main` (sem conflito), publicado direto em produção.

## 64. Sessão de 28/ago/2026 (continuação): "Desfile" (Não Desfila), Observações, e um bug real de verdade achado com ela ao vivo

Motivação real: ela queria dar carteirinha pra 2 Ritmistas reais (tocam em mais de uma escola, "colaram" no desfile, optaram por desfilar pela outra mas continuam na Imperatriz) — usou o link de cadastro da bateria DEMO como solução de contorno pra eles terem carteirinha, e pediu ajuda pra transferir os dois pra bateria real. A transferência real foi pausada por ela mesma ("calma, para transferí-los eu vou precisar fazer a criação do status Não Desfila, lembra") até esse recurso existir — a transferência em si (`vinculos.bateria_id`/`bateria_instrumento_id`/`vinculos_medidas` da demo pra real) não chegou a ser executada nesta sessão, fica pendente pra quando ela pedir.

### 64.1 Por que não é um status novo

Ela insistiu inicialmente que a pessoa "não é ativa" e não devia ter status "Ativo" — mas confirmado com ela que o motivo real é só a CONTAGEM/EXIBIÇÃO, não o acesso: "só o selo/contagem muda... ela continua com acesso total." Criar um 6º status de verdade (diferente de `aprovado`) quebraria a premissa usada em praticamente todo o sistema (RLS, login, `is_membro`, capacidades) de que `status='aprovado'` = tem acesso — exigiria auditar e reescrever essa checagem em dezenas de lugares. Em vez disso: `vinculos.nao_desfila boolean not null default false`, coluna própria fora do jsonb `capacidades` (mesmo padrão de `modo_carteirinha_individual`/`restrito_ao_naipe`), sem nenhuma mudança em RLS/login.

### 64.2 Nome e leitura visual — 3 rodadas até fechar

1. Rascunho inicial meu: selo adicional "Não Desfila" ao lado de "Ativo" (padrão "selos somam"). Ela corrigiu: "não acho que é só um selo no card, para mim é o status dele mesmo. Ao invés de Ativo vai ter que aparecer Não Desfila, mas por baixo dos panos ele é ativo." — vira SUBSTITUIÇÃO da palavra "Ativo", não adição. Exceção deliberada e única, registrada em CLAUDE.md, à regra de "selos somam, não substituem".
2. Nome do campo/interruptor: ela pediu ajuda ("me ajude a achar um status pra esse caso?") — cogitado "OFF" (sem confirmação de que é jargão real de bateria) e "Reserva" (descartado por ela mesma, "é interessante para futebol"). Fechado em "Não Desfila" pelo motivo de não carregar bagagem de outro contexto.
3. Leitura do interruptor em si: ela pediu inverter a psicologia — em vez do interruptor representar a EXCEÇÃO (ligado = não desfila), ele representa a NORMALIDADE (ligado = "Ok", vai desfilar; desligado = "Não desfila"). Reforçado depois: "quando não vai desfilar tem que ser Não desfila" (não "Não vai desfilar", que eu tinha sugerido primeiro) — mesmo texto do selo do card, sem variação.

### 64.3 Banco: coluna, trigger, view

- `ALTER TABLE vinculos ADD COLUMN nao_desfila boolean NOT NULL DEFAULT false;`
- Trigger `aplicar_matriz_edicao_vinculos`: branch de autoedição ganhou `new.nao_desfila := old.nao_desfila;` (nunca autoeditável, mesma trava de `capacidades`/`restrito_ao_naipe`); branch de edição por terceiro (Diretoria editando um Ritmista) ganhou `if not (tenho_capacidade('editar_nao_desfila', ...) and tenho_acesso_ritmista_por_naipe(...)) then new.nao_desfila := old.nao_desfila; end if;` — mesma checagem dupla (capacidade + naipe, quando o editor está restrito) já usada pras outras ações de Ritmista.
- View `ritmistas_com_instrumento` recriada com a coluna nova no fim do `SELECT` — `security_invoker=true` reafirmado, `anon` sem SELECT e `authenticated` com SELECT reconferidos via `has_table_privilege`, mesma disciplina desde a seção 41.

### 64.4 Contagens e filtro — função `grupoStatusEfetivo()`

Achado real dela, com print: a lista de Ritmistas agrupa por status em seções com título+contador ("ATIVOS 7"), e o Diretor de status = `r.status` literal fazia quem está "Não Desfila" (status='aprovado' por baixo) cair dentro da seção "Ativos", inflando a contagem e aparecendo misturado. Função nova:

```js
function grupoStatusEfetivo(r) {
  return (r.status === 'aprovado' && r.nao_desfila) ? 'nao_desfila' : (r.status || 'pendente');
}
```

Usada em 3 lugares que antes usavam `r.status` cru: `aplicarFiltros()` (ordenação da lista via `ordemStatus`), `renderizar()` (agrupamento em seções + contador por seção), e o filtro de Status em si (`filtroStatusSelecionados.some(f => ... f === 'aprovado' ? (r.status === 'aprovado' && !r.nao_desfila) : ...)`, pra "Ativos" e "Não Desfila" ficarem mutuamente exclusivos na checkbox, mesmo padrão de "menor"/"repique_bossa" já existente ali). Mesma exclusão aplicada em `atualizarTotalizadores()` (Ritmistas ativos), `renderizarContagemInstrumentos()` (Ritmistas/Vagas por Instrumento na Visão Geral) e `renderizarConfigVagas()` (Vagas de Ritmistas em Configurações).

### 64.5 Fantasia: exclusão só da coluna, não da linha

Ela foi explícita: "a única coisa que me preocupa é a questão das roupas... pq ele teria que aparecer sempre, entendeu? menos para fantasia pq ele não desfila" — ou seja, a pessoa continua aparecendo em QUALQUER relatório/exportação, só o valor da coluna "Fantasia" especificamente é que some. Como o Exportar Excel é por linha (uma pessoa, várias colunas marcadas), a exclusão foi feita dentro de `linhasExportacao()`, checando o **label** do campo (`campo.label.toLowerCase().includes('fantasia')`) em vez de excluir a pessoa inteira do relatório:

```js
if (chave.startsWith('medida_')) {
  if (r.nao_desfila && campo.label.toLowerCase().includes('fantasia')) {
    valor = '';
  } else {
    // ...valor normal da medida
  }
}
```

### 64.6 Bug real, achado com print ao vivo: interruptor fazendo o botão "Salvar" sumir

Depois de publicado o primeiro interruptor, ela reportou: "Eu adorava eles, são facilmente identificáveis na ficha" (voltando de uma versão em checkbox simples que eu tinha feito por engano — ver 64.7) e, separadamente, um bug real: "clicar em editar, mexer nos botões do declaração e desfile e depois salvar o resultado. o botão salvar não aparece ao mexer nesses botões."

**Causa raiz, confirmada com print do DevTools**: a primeira implementação do interruptor (clique instantâneo) chamava `carregarRitmistas(true)` seguido de `abrirCadastro(id)` a cada clique — isso **reabria a ficha inteira do zero**, o que resetava o modo de edição (Salvar/Cancelar visíveis) de volta pro modo de visualização (só "Editar" visível), descartando qualquer edição de Nome/CPF/outros campos que estivesse em andamento. Ela já tinha mencionado essa "pulada" antes (ao abrir o card, causada por Medidas/Entrega de Figurino serem `fire-and-forget` e aparecerem com atraso — **ainda não investigada/corrigida**, fica registrada como pendência real pra próxima sessão), mas dessa vez o sintoma era mais grave: perda de dado funcional, não só visual.

**Correção**, em duas rodadas:
1. Primeira tentativa: integrar Declaração/Desfile ao fluxo Editar/Salvar/Cancelar como campos padrão (checkbox simples, mesmo padrão de `repique_bossa`) — funcionalmente correto, mas ela preferiu não perder o clique instantâneo nem o visual do interruptor de trilho/bolinha.
2. Versão final: voltaram a ser clique-instantâneo (fora do fluxo Editar/Salvar), mas **sem nunca mais chamar `abrirCadastro()`**. Funções novas em `ficha-perfil.js` (`fpAlternarDeclaracao`/`fpRenderToggleDeclaracao`, `fpAlternarNaoDesfila`/`fpRenderToggleNaoDesfila`): o clique faz o PATCH, atualiza só o container do próprio interruptor (`#fp-declaracao-area`/`#fp-nao-desfila-area`) e o selo do cabeçalho da ficha (`fc-status-badge`, via `document.getElementById` direto, já que esse elemento fica fora do container da ficha compartilhada) — nunca mais toca em `fpAtivarEdicao`/`fpCancelarEdicao`/no resto do DOM da ficha. Qualquer edição de outros campos em andamento continua 100% intacta.

**Efeito colateral achado e corrigido na mesma sessão**: a versão final ainda chamava `carregarRitmistas(true)` (só isso, sem `abrirCadastro`) pra manter a lista por trás sincronizada — ela reportou "continua a tela piscando", isolado especificamente ao clique nos interruptores. Removida a chamada; a lista por trás sincroniza sozinha ao fechar a ficha ou na atualização automática periódica, sem re-renderizar tudo a cada clique.

### 64.7 Observações: por que não seguiu o mesmo padrão de clique instantâneo

Diferente de Declaração/Desfile, ela pediu explicitamente que Observações siga o fluxo PADRÃO (Editar → digita → Salvar/Cancelar): "para mim todos os campos da ficha precisavam do editar para fazer alguma ação e acho que isso tinha que ser padrão." A diferença de tratamento entre os três campos (dois clique-instantâneo, um staged) não foi acidental nem inconsistente — foi uma decisão dela, calibrada por campo: interruptor (ação binária, ligar/desligar) fica fora do fluxo por escolha explícita ("adorava" o clique direto); texto livre (Observações) entra no fluxo porque, na cabeça dela, é um CAMPO da ficha como Nome/CPF, não uma ação isolada.

Implementação: `observacoes` (text, `vinculos`) entrou em `FP_CAMPOS`/`FP_CAMPO_TABELA` como qualquer outro campo de texto — sem código especial em `fpAtivarEdicao`/`fpCancelarEdicao`/`fpSalvar` (o laço genérico já cobre). Textarea com `maxlength="500"` (limite curto, pedido dela: "pense em um mínimo de caracteres, não precisa ser muita coisa"). Visibilidade (`ver_observacoes`) resolvida dentro de `fpIniciar`, escondendo o `.ficha-campo` inteiro pra quem não tem a capacidade — mesmo padrão do bloco de "dados sensíveis" já existente, só que ao contrário: aqui a própria pessoa NUNCA vê (autoedição sempre falsa), enquanto o bloco de dados sensíveis sempre libera a própria pessoa.

### 64.8 Permissões: catálogo final desta rodada

```
Ritmistas → ver_declaracao_responsavel, editar_declaracao_responsavel (dependeDe: ver_declaracao_responsavel)
          → ver_nao_desfila, editar_nao_desfila (dependeDe: ver_nao_desfila)
          → ver_observacoes, editar_observacoes (dependeDe: ver_observacoes)
```

Mesmo padrão Ver/Editar já estabelecido (Repique de Bossa, Naipe) -- todos com `dependeDe` no mapa `DEPENDE_DE` (seção 62.12), travando/desmarcando sozinho na tela de Permissões se o "Ver" correspondente não estiver marcado.

### 64.9 "Fale com o suporte" — reordenado

Achado dela: com as 3 seções novas sendo injetadas logo antes de `#fp-secao-suporte` (posição original de Suporte no `ficha-perfil.partial.html`), Suporte ficou "no meio" da ficha em vez de por último. Corrigido movendo `<div id="fp-extra-conteudo"></div>` pra ANTES da seção de Suporte (era depois) -- Suporte volta a ser sempre a última coisa antes dos botões de ação, em qualquer tela que usa a ficha compartilhada (Meu Perfil incluso, mesmo sem conteúdo nenhum em `fp-extra-conteudo` lá).

### 64.10 Pendência real, não resolvida nesta sessão

A "pulada" de Medidas/Entrega de Figurino ao ABRIR a ficha (não ao clicar nos interruptores, que já foi corrigido) continua sem investigação — causa provável já suspeitada: os dois usam `display:none` até o fetch assíncrono terminar (`fpRenderizarMedidas`/`fpRenderizarEntregaFigurino`, fire-and-forget), então a seção "pula" de altura zero pra altura cheia quando os dados chegam, empurrando o resto da ficha. Fica pendente pra confirmar e corrigir (provável solução: reservar o espaço com um spinner leve em vez de esconder a seção inteira).
