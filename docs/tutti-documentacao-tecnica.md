# TumTu — Documentação Técnica
## Referência de arquitetura, banco de dados e segurança

> Documento vivo. Complementa `tumtu-visao-geral.md` (visão de produto/negócio) e `tumtu-mvp.md` (escopo funcional) — este aqui é o "como funciona por dentro". Atualizar sempre que a arquitetura mudar.
> Última atualização: 09/jul/2026

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

- **Reset de senha pelo Super Admin removido em 05/jul/2026** (a tela de Acessos tinha um campo "Nova senha (opcional)" sem função real depois da migração para Supabase Auth) e **não foi reconstruído** — decisão explícita da Márcia em 06/jul/2026 de não devolver ao Super Admin a capacidade de ver/definir a senha de outra pessoa. Resolvido de outra forma: ver seção 15 ("Esqueci minha senha" nativo do Supabase Auth, sem nenhum admin no meio).
- **Excluir usuário (LGPD):** ainda não existe nenhuma forma de apagar um cadastro, nem o Super Admin. Discutido em 06/jul/2026 e adiado de propósito — será construído só quando a primeira solicitação real de exclusão acontecer (Super Admin apenas, para pedidos sérios de exclusão de dados, não uma ação de rotina).
- **CPF não é único** na tabela `ritmistas` — sem constraint, baixa prioridade.
- **Domínio `tumtu.com.br`** já comprado pela Márcia, ainda não conectado ao deploy da Vercel — passo manual (painel Vercel + DNS do registrador), não é mudança de código.
- **Nomes dos arquivos de documentação** (`tutti-visao-geral.md`, `tutti-mvp.md`, `tutti-design-guide.md`, `tutti-documentacao-tecnica.md`, `tutti-plano-de-testes.md`, `tutti-dados-fake-reset.xlsx`) continuam com "tutti" no nome — só o conteúdo foi unificado para TumTu. Renomear os arquivos em si não estava no escopo combinado, fica como pendência menor.
- **"Leaked Password Protection"** do Supabase Auth está desligada (checagem de senha vazada contra HaveIBeenPwned). **Descoberto em 09/jul/2026: só existe no plano Pro do Supabase (pago), não aparece no plano Free.** Rebaixado para o final da lista de propósito — a Márcia avalia que o projeto não deve precisar disso tão cedo e não quer gastar no Supabase agora; revisitar só se/quando houver receita real.

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

## 17. Histórico de decisões de arquitetura (linha do tempo resumida)

- **02/jul/2026** — decisão de separar `cargo` de `nivel_acesso`; decisão de usar hash de senha (bcrypt) em vez de texto plano.
- **03/jul/2026** — abandona modelo de "convite por token de uso único", adota link fixo permanente por bateria+cargo. Implementa Fases 1-5 do prompt de cadastro (schema, links fixos, aprovação, cadastro manual, hash bcrypt). Reset completo do banco a pedido da Márcia (produção passa a rodar só com dado fake, populado a partir de `tutti-dados-fake-reset.xlsx`).
- **05/jul/2026** — sessão de migração para autenticação real do Supabase + RLS (7 fases, plano em `C:\Users\Márcia Serra\.claude\plans\replicated-stirring-rossum.md`): coluna `auth_user_id`, funções auxiliares, views públicas, cadastro/login/logout migrados para Supabase Auth, Edge Function `admin-create-user`, RLS ligado com políticas por perfil/bateria, remoção do bcrypt. Além disso: correção da regra de CPF+e-mail no cadastro, confirmação de consentimento no cadastro manual (LGPD), correção do bug de isolamento entre baterias no painel do Admin (achado ao popular dados fake de 2 escolas), implementação do PWA (manifest, service worker, ícones — seção 13), view `mestres_publicos` pra carteirinha mostrar Mestre(s) reais (seção 10), hierarquia de edição por perfil (versão original da seção 11), "Meu Perfil" do Super Admin (seção 12), e — mais adiante no mesmo dia — o rename de marca de fato no código (seção 14).
- **06/jul/2026** — sessão de "esqueci minha senha" + unificação do motor de edição de perfil (plano em `C:\Users\Márcia Serra\.claude\plans\validated-orbiting-thompson.md`): "Esqueci minha senha" e troca de senha logado via Supabase Auth nativo, testado de ponta a ponta em produção com e-mail real (seção 15); revisão completa da matriz de edição com a Márcia — Ritmista passa a editar alguns dados próprios, Mestre deixa de editar dados de Diretor (seção 11, substitui a versão de 05/jul); motor único `ficha-perfil.js`/`ficha-perfil.partial.html` compartilhado por `admin.html`, `super-admin.html` e `carteirinha.html`, eliminando duas cópias quase-divergentes do "Meu Perfil"; ícone de perfil na carteirinha do Ritmista (seção 16); SQL da trigger de restrição por coluna escrito, revisado e **executado com sucesso**, validado com tentativas reais de bypass (seção 7); bug corrigido na máscara do campo de login que impedia digitar e-mail letra por letra (seção 5); decisão explícita de adiar "excluir usuário" (LGPD) até a primeira solicitação real (seção 9).
- **09/jul/2026** — Márcia moveu a pasta do projeto de dentro do OneDrive para `C:\Users\Márcia Serra\Projetos\Tumtu`, reorganizando documentação (`docs/`), dados fake (`dados/`) e material de referência visual (`imagens/`, fora do controle de versão) — nada foi perdido, o `sw.js` (que tinha ficado pra trás na mudança) foi restaurado do histórico do Git (seção 1). Ícone de mostrar/esconder senha trocado de emoji para SVG, e adicionado também em `redefinir-senha.html` (seção 15).
