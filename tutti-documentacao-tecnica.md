# TumTu — Documentação Técnica
## Referência de arquitetura, banco de dados e segurança

> Documento vivo. Complementa `tumtu-visao-geral.md` (visão de produto/negócio) e `tumtu-mvp.md` (escopo funcional) — este aqui é o "como funciona por dentro". Atualizar sempre que a arquitetura mudar.
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
| Ver/editar o próprio perfil | **Mestre, Diretor ou Super Admin**, na própria linha (`auth_user_id = auth.uid()`). **Ajustado em 05/jul/2026** (policy `proprio_perfil_update`): antes não checava `perfil`, então um Ritmista autenticado também conseguia editar a própria linha via API direta — corrigido para excluir `perfil = 'ritmista'`, batendo com a regra de produto "Ritmista não edita nada, nem a si mesmo" |
| Ver/editar qualquer linha | Super Admin |
| Ver ritmistas/admins da própria bateria | Mestre ou Diretor aprovado, só onde `bateria_id` bate com o dele |
| Editar (qualquer campo, não só status) um Ritmista | Mestre ou Diretor aprovado, só da própria bateria (`admin_update_ritmistas_propria_bateria`) |
| Editar (qualquer campo, não só aprovar/rejeitar) um Diretor | **Só Mestre** aprovado da própria bateria (`mestre_update_diretor_propria_bateria`) — um Diretor não consegue mexer em outro Diretor nem no Mestre, nem chamando a API direto (testado com tentativa de bypass real, 0 linhas afetadas). RLS não distingue coluna por coluna dentro de uma policy de UPDATE — a mesma regra que já liberava aprovar/rejeitar Diretor também libera editar qualquer outro dado dele |
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
- **Domínio `tumtu.com.br`** já comprado pela Márcia, ainda não conectado ao deploy da Vercel — passo manual (painel Vercel + DNS do registrador), não é mudança de código.
- **Nomes dos arquivos de documentação** (`tutti-visao-geral.md`, `tutti-mvp.md`, `tutti-design-guide.md`, `tutti-documentacao-tecnica.md`, `tutti-plano-de-testes.md`, `tutti-dados-fake-reset.xlsx`) continuam com "tutti" no nome — só o conteúdo foi unificado para TumTu. Renomear os arquivos em si não estava no escopo combinado, fica como pendência menor.

---

## 10. Carteirinha — Mestre(s) de Bateria dinâmico

Implementado em 05/jul/2026. Antes disso, `carteirinha.html` **não buscava nada do Supabase** para o campo "Mestre de Bateria" — usava só a string fixa `configEscola.mestreDeBateria` (`config-escola.js`), digitada manualmente e igual para o site inteiro, mesmo já existindo suporte a múltiplas escolas/baterias em outras partes do sistema.

**Como funciona agora:**
- `carteirinha.html` já buscava a própria linha do ritmista no Supabase (para nome, foto, CPF etc.) — essa busca já trazia `bateria_id`, mas ele era ignorado. Agora, depois de renderizar a carteirinha, uma nova função `renderMestres(bateriaId)` busca na view `mestres_publicos` (seção 2) todos os Mestres aprovados daquela bateria.
- **Mostra todos os Mestres aprovados, não só um** — se a bateria tiver 2 ou mais, os nomes aparecem empilhados e o rótulo muda para "Mestres de Bateria" (plural). Se não houver nenhum Mestre aprovado ainda, o bloco continua escondido (mesmo comportamento de antes, quando o campo estava vazio).
- `baterias.mestre_de_bateria` (texto livre) fica **obsoleto para esse fim** — não foi apagado do banco, só parou de ser lido nesse fluxo. Mesma coisa para `configEscola.mestreDeBateria` em `config-escola.js`.
- Testado em 05/jul/2026 com dados reais: bateria com 1 Mestre aprovado mostra o nome corretamente; bateria sem nenhum Mestre aprovado mantém o bloco escondido.

---

## 11. Hierarquia de edição de dados por perfil

Implementado em 05/jul/2026, junto com a Fase A (seção 10). Regra decidida:

| Quem edita | Ritmista da bateria | Outro Diretor | Mestre | Próprio perfil |
|---|---|---|---|---|
| Ritmista | — | — | — | ❌ |
| Diretor | ✅ | ❌ | ❌ | ✅ |
| Mestre | ✅ | ✅ (da própria bateria) | ❌ | ✅ |
| Super Admin | ✅ | ✅ | ✅ | ✅ |

**No banco:** só foi necessário ajustar a policy `proprio_perfil_update` (ver seção 7) — as policies que permitem Mestre editar Diretor e qualquer Admin editar Ritmista da própria bateria **já existiam** (criadas antes, provavelmente para o fluxo de aprovar/rejeitar) e, por não terem restrição por coluna, já cobriam edição de qualquer campo.

**Em `admin.html`:** o modal da aba "Diretoria" (ficha de Mestre/Diretor) era só leitura e mostrava poucos campos (CPF, celular, e-mail, nascimento, medidas). Passou a ter **exatamente os mesmos campos e a mesma estrutura do modal de Ritmista** (dados pessoais, endereço, medidas, saúde, contato de emergência) — decisão explícita da Márcia de não ter conjuntos de campos diferentes para o mesmo modelo de dados. O motor de edição (`ativarEdicaoFicha`/`salvarEdicaoFicha` etc.) foi generalizado em funções únicas (`_iniciarEdicao`, `_cancelarEdicao`, `_salvarEdicao`) parametrizadas por tipo de ficha (`ritmista` ou `admin`), reaproveitando a mesma lista `CAMPOS_EDITAVEIS` (a lista de Admin é derivada dela, só trocando o prefixo dos IDs de `fc-` para `ma-`) — nunca duas listas de campos mantidas à mão.

O botão "Editar" no modal da Diretoria só aparece quando a hierarquia permite (`abrirFichaAdmin`) — isso é só cosmético, a segurança real é a RLS acima. Testado com contas fake reais (Mestre e Diretora da bateria 2): edição funcionando nos casos permitidos, e as duas tentativas de burlar (Diretora editando outra pessoa da diretoria) retornaram 0 linhas afetadas direto na API, sem passar pela tela.

---

## 12. "Meu Perfil" do Super Admin

Implementado em 05/jul/2026. Antes, o Super Admin não tinha nenhuma tela para editar os próprios dados — a aba "Meu Perfil" só existe em `admin.html`, e quando o Super Admin acessa essa tela via "Acessar como Admin" (`?superadmin=true`), ela mostra um aviso "não se aplica" (é a visão de outra pessoa, não a própria).

**Onde mora:** nova aba principal "Meu Perfil" em `super-admin.html`, ao lado de "Dashboard" e "Escolas" — não como sub-aba de uma escola, já que o Super Admin não pertence a nenhuma bateria específica.

**Reaproveitamento:** o CSS `.mp-*` (usado pelo formulário de Meu Perfil) foi extraído do `<style>` inline de `admin.html` para `styles/components.css`, compartilhado agora pelas duas telas. O HTML do formulário e as funções `mpPreviewFoto`/`salvarMeuPerfil` foram copiados de `admin.html` para `super-admin.html` (nova função `iniciarMeuPerfilSuperAdmin`, sem o aviso "não se aplica" e sem o parâmetro `?superadmin=`, já que aqui é sempre o próprio Super Admin). `salvarMeuPerfil` em `super-admin.html` usa a constante `headers` (já inclui `Content-Type` e `Prefer: return=representation`) em vez de `authHeaders` de `admin.html`.

---

## 13. PWA (Progressive Web App)

Implementado em 05/jul/2026. Deixa o TumTu instalável direto do navegador (ícone na tela do celular, abertura em tela cheia), sem loja e sem custo.

**Arquivos novos:**
- `manifest.json` — nome, ícones, cor de tema (`#12101a`) e `start_url` apontando para `login.html` (entrada comum a todos os perfis).
- `sw.js` — service worker. Faz cache do "app shell" (as 6 telas HTML, CSS, `config-escola.js` e os ícones) na instalação, para o app abrir mesmo sem internet. Chamadas para o Supabase (ou qualquer origem externa) **nunca são cacheadas** — passam direto pra rede, sempre com dado atual. Em navegação (troca de tela), tenta a rede primeiro e só cai no cache se estiver offline.
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

## 15. Histórico de decisões de arquitetura (linha do tempo resumida)

- **02/jul/2026** — decisão de separar `cargo` de `nivel_acesso`; decisão de usar hash de senha (bcrypt) em vez de texto plano.
- **03/jul/2026** — abandona modelo de "convite por token de uso único", adota link fixo permanente por bateria+cargo. Implementa Fases 1-5 do prompt de cadastro (schema, links fixos, aprovação, cadastro manual, hash bcrypt). Reset completo do banco a pedido da Márcia (produção passa a rodar só com dado fake, populado a partir de `tutti-dados-fake-reset.xlsx`).
- **05/jul/2026** — sessão de migração para autenticação real do Supabase + RLS (7 fases, plano em `C:\Users\Márcia Serra\.claude\plans\replicated-stirring-rossum.md`): coluna `auth_user_id`, funções auxiliares, views públicas, cadastro/login/logout migrados para Supabase Auth, Edge Function `admin-create-user`, RLS ligado com políticas por perfil/bateria, remoção do bcrypt. Além disso: correção da regra de CPF+e-mail no cadastro, confirmação de consentimento no cadastro manual (LGPD), correção do bug de isolamento entre baterias no painel do Admin (achado ao popular dados fake de 2 escolas), implementação do PWA (manifest, service worker, ícones — seção 13), view `mestres_publicos` pra carteirinha mostrar Mestre(s) reais (seção 10), hierarquia de edição por perfil (seção 11), "Meu Perfil" do Super Admin (seção 12), e — mais adiante no mesmo dia — o rename de marca de fato no código (seção 14).
