# TumTu — Documentação Técnica
## Referência de arquitetura, banco de dados e segurança

> Documento vivo. Complementa `tumtu-visao-geral.md` (visão de produto/negócio) e `tumtu-mvp.md` (escopo funcional) — este aqui é o "como funciona por dentro". Atualizar sempre que a arquitetura mudar.
> Última atualização: 13/jul/2026 — **⚠️ ver seção 22 antes de confiar na seção 2**: o modelo de dados descrito na seção 2 (tabela única `ritmistas`) foi substituído em 12-13/jul/2026 por duas tabelas (`pessoas` + `vinculos`). A seção 2 foi mantida como está por descrever a tabela antiga, que ainda existe no banco como rede de segurança (será apagada só depois de testes finais) — mas o código de produção já usa o modelo novo, documentado na seção 22.

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
