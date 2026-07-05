# Tutti (TumTu) — Documentação Técnica
## Referência de arquitetura, banco de dados e segurança

> Documento vivo. Complementa `tutti-visao-geral.md` (visão de produto/negócio) e `tutti-mvp.md` (escopo funcional) — este aqui é o "como funciona por dentro". Atualizar sempre que a arquitetura mudar.
> Última atualização: 05/jul/2026

---

## 1. Stack e infraestrutura

- **Frontend:** HTML + CSS + JavaScript puro, sem framework, sem bundler. Cada tela é um arquivo `.html` autocontido.
- **Backend:** Supabase (Postgres + Auth + Edge Functions), sem servidor próprio.
- **Hospedagem/deploy:** GitHub → Vercel, deploy automático a cada `git push` na branch `main`.
- **Fonte:** Plus Jakarta Sans (Google Fonts).
- **Bibliotecas de terceiros via CDN:** `@supabase/supabase-js@2` (cliente oficial do Supabase). `bcryptjs` foi usado entre 03/jul e 05/jul/2026 e foi removido — não existe mais no código.

**Projeto Supabase:** URL `https://pkvzsgrkylrkyzligeim.supabase.co`, project ref `pkvzsgrkylrkyzligeim`.

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
`id`, `nome`, `escola_id` (liga com `escolas.id`), `logo_url`, `instagram`, `mestre_de_bateria` (texto livre, mostrado na carteirinha — **não** é uma referência a um Mestre específico; quando há mais de um Mestre na bateria, esse campo guarda só o nome de quem deve aparecer, decidido manualmente por quem cadastra a bateria), `ativa`.

### Tabela `convites`
**Não existe mais** — foi dropada em 05/jul/2026. Fazia parte do modelo antigo de "convite por token de uso único", abandonado em 03/jul/2026 em favor do link fixo por bateria+cargo.

### Views públicas (sem RLS, leitura liberada para `anon`)
- **`ritmistas_emergencia`**: `id, nome, tipo_sanguineo, emergencia_nome, emergencia_parentesco, emergencia_celular` — usada por `qr.html` (QR code escaneado por qualquer pessoa, sem login, em caso de emergência).
- **`baterias_publicas`**: `id, nome, ativa` — usada por `index.html` para validar o parâmetro `?bateria=` de um link de cadastro **antes** da pessoa se autenticar, sem expor `mestre_de_bateria`, `instagram` etc. a quem só está se cadastrando.

Essas views existem justamente para não precisar dar acesso público à tabela inteira — elas usam as permissões de quem as criou (não do usuário que consulta), então funcionam mesmo com RLS ligado nas tabelas de origem.

---

## 3. Autenticação (Supabase Auth)

**Migrado em 05/jul/2026.** Antes disso, o login comparava CPF/e-mail + senha manualmente contra a tabela `ritmistas` (com hash bcrypt desde 03/jul). Hoje:

- Toda conta tem um registro real em `auth.users`, ligado via `ritmistas.auth_user_id`.
- **Cadastro** (`index.html`, modos público e link fixo): chama `supabase.auth.signUp({ email, password })`. Como o Supabase Auth exige e-mail, e o cadastro do Tutti agora sempre exige e-mail (ver seção 5), não há necessidade de e-mail sintético para essas duas modalidades.
- **Cadastro manual** (Super Admin ou Mestre/Diretor cadastrando por outra pessoa): a criação da conta de autenticação acontece dentro da Edge Function `admin-create-user` (ver seção 4), porque criar uma conta **em nome de outra pessoa** exige privilégio de administrador (`service_role`), que nunca deve ficar exposto no navegador.
- **Login** (`login.html`): se o identificador digitado não tem `@`, é tratado como CPF e traduzido para o e-mail correspondente via a função SQL `resolve_login_email(identificador)` (ver seção 5), chamada via RPC. Depois disso, sempre `supabase.auth.signInWithPassword({ email, password })`.
- **Logout:** todas as telas (`admin.html`, `super-admin.html`, `carteirinha.html`) chamam `supabase.auth.signOut()` além de limpar o `localStorage` — antes só limpavam o `localStorage`, deixando a sessão do Supabase válida por trás (achado e corrigido em 05/jul/2026).
- **Confirmação de e-mail:** desligada nas configurações do Supabase (Authentication → Sign In/Providers → "Confirm email"), porque a validação de identidade do Tutti é a aprovação por Mestre/Diretor/Super Admin, não confirmação de e-mail — e muita gente se cadastra com e-mail que talvez não confira com frequência.
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

---

## 6. LGPD — confirmação de consentimento no cadastro manual

Decisão de 05/jul/2026, depois de uma discussão sobre o risco de o Super Admin (ou Mestre/Diretor) cadastrar alguém manualmente sem essa pessoa ter digitado nada.

**O que existe:** todo cadastro no modo manual exige marcar um checkbox — *"Confirmo que a pessoa cadastrada está ciente deste cadastro e autorizou seus dados serem inseridos no Tutti"* — antes de enviar. Validado nos dois lados:
- **Front-end** (`index.html`): bloqueia o envio e mostra erro se não estiver marcado.
- **Backend** (Edge Function `admin-create-user`): rejeita com 400 se `consentimento_confirmado !== true` — funciona mesmo que alguém tente burlar a tela.

Campo `ritmistas.consentimento_confirmado` (boolean, default `false`) só fica `true` em cadastro manual. Autocadastro (a própria pessoa preenchendo, público ou via link) não passa por essa tela — o consentimento ali é implícito, a própria pessoa digitou os dados dela.

**Isto é uma mitigação proporcional ao estágio atual do projeto, não uma validação jurídica.** Ver seção Jurídico/LGPD em `tutti-visao-geral.md` para o raciocínio completo e o gatilho definido para revisitar com advogado.

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
| Ver/editar o próprio perfil | Qualquer pessoa autenticada, na própria linha (`auth_user_id = auth.uid()`) |
| Ver/editar qualquer linha | Super Admin |
| Ver ritmistas/admins da própria bateria | Mestre ou Diretor aprovado, só onde `bateria_id` bate com o dele |
| Editar (aprovar/rejeitar/suspender etc.) um Ritmista | Mestre ou Diretor aprovado, só da própria bateria |
| Editar (aprovar/rejeitar) um Diretor | **Só Mestre** aprovado da própria bateria — um Diretor não consegue mexer em outro Diretor, nem chamando a API direto (testado com tentativa de bypass real) |
| Criar cadastro (INSERT) | Só a própria pessoa recém-autenticada (`auth_user_id = auth.uid()`) — cobre autocadastro público/link fixo. Cadastro manual passa pela Edge Function, que usa `service_role` e ignora RLS |
| Apagar (DELETE) | Ninguém, exceto acesso administrativo direto ao banco (não existe essa ação no app) |

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

- **"Leaked Password Protection"** do Supabase Auth está desligada (checagem de senha vazada contra HaveIBeenPwned) — fácil de ligar, não é urgente.
- **Reset de senha pelo Super Admin removido:** a tela de Acessos tinha um campo "Nova senha (opcional)" que ficou sem função real depois da migração (escrevia na coluna `senha`, hoje obsoleta). Removido em 05/jul/2026. Se for reconstruído, precisa de uma nova Edge Function usando `admin.auth.admin.updateUserById()`.
- **Sem "esqueci minha senha"** — mais fácil de implementar agora que existe Supabase Auth nativo (tem fluxo pronto de recuperação por e-mail), mas ainda não foi feito.
- **CPF não é único** na tabela `ritmistas` — sem constraint, baixa prioridade.
- **Renomear Tutti → TumTu** no código e nas telas, incluindo redesenho do logo (ver aviso no topo de `tutti-visao-geral.md`).
- **PWA** ainda não implementado — próxima prioridade de produto declarada.

---

## 10. Histórico de decisões de arquitetura (linha do tempo resumida)

- **02/jul/2026** — decisão de separar `cargo` de `nivel_acesso`; decisão de usar hash de senha (bcrypt) em vez de texto plano.
- **03/jul/2026** — abandona modelo de "convite por token de uso único", adota link fixo permanente por bateria+cargo. Implementa Fases 1-5 do prompt de cadastro (schema, links fixos, aprovação, cadastro manual, hash bcrypt). Reset completo do banco a pedido da Márcia (produção passa a rodar só com dado fake, populado a partir de `tutti-dados-fake-reset.xlsx`).
- **05/jul/2026** — sessão de migração para autenticação real do Supabase + RLS (7 fases, plano em `C:\Users\Márcia Serra\.claude\plans\replicated-stirring-rossum.md`): coluna `auth_user_id`, funções auxiliares, views públicas, cadastro/login/logout migrados para Supabase Auth, Edge Function `admin-create-user`, RLS ligado com políticas por perfil/bateria, remoção do bcrypt. Além disso: correção da regra de CPF+e-mail no cadastro, confirmação de consentimento no cadastro manual (LGPD), decisão de renomear a marca para TumTu, correção do bug de isolamento entre baterias no painel do Admin (achado ao popular dados fake de 2 escolas).
