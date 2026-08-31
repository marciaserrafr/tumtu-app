# CLAUDE.md

> Este arquivo é lido automaticamente pelo Claude Code toda vez que uma sessão começa nesta pasta. É a ficha de instruções fixas do projeto — diferente dos documentos em `docs/`, que são a documentação de produto/técnica para humanos. Atualizar sempre que uma decisão importante mudar o que está escrito aqui.
> **Regra de tamanho, criada em 31/ago/2026**: este arquivo passou do limite de tamanho que o Claude Code consegue carregar de uma vez, porque o "diário de sessões" (o que virou a seção "Estado atual" antiga) cresceu demais. Esse diário foi movido pra `docs/tumtu-historico-sessoes.md` — aqui fica só um resumo curto do estado atual + pendências abertas. **Daqui pra frente, ao final de cada sessão, registrar o resumo de "o que mudou" no arquivo de histórico (`docs/tumtu-historico-sessoes.md`), não aqui** — este arquivo deve continuar enxuto.
> Última atualização: 31/ago/2026, sessão seguinte (Convidado Especial publicado — causa real era sessão de login compartilhada, não o banco; Figurino: Público/Incluir Convidados agora é decisão por bateria, publicado)

---

## O que é o TumTu

SaaS de gestão de baterias de escola de samba: cadastro de ritmistas, aprovação por Mestre/Diretor, carteirinha digital. Nome vem do som do surdo de bateria ("TUM-TU, TUM-TU..."). Visão de virar produto comercial multi-escola no futuro.

**Quem constrói:** Márcia Serra — empreendedora, **não é desenvolvedora**, zero conhecimento prévio de programação. Todo o código é escrito pela IA (Claude Code); Márcia decide produto, UX e regras de negócio. Ela está aprendendo sobre IA construindo este projeto ao mesmo tempo.

---

## Antes de mexer em qualquer coisa: mapa da documentação

Este projeto tem documentação de produto detalhada em `docs/` — **leia o documento relevante antes de qualquer mudança estrutural**, não assuma.

| Arquivo | Cobre | Quando ler |
|---|---|---|
| `docs/tumtu-visao-geral.md` | Visão de negócio, marca, identidade visual, jurídico/LGPD | Antes de decisões de produto/negócio |
| `docs/tumtu-mvp.md` | Escopo funcional do MVP, perfis, fluxos, regras numeradas (1 a 11) | Antes de mudar fluxo de cadastro/aprovação/permissão |
| `docs/tumtu-design-guide.md` | Paleta, tipografia, componentes visuais, checklist obrigatório antes de mudança visual | **Sempre antes de qualquer alteração visual** |
| `docs/tumtu-documentacao-tecnica.md` | Arquitetura, modelo de dados, RLS, Edge Function, histórico de decisões técnicas | Antes de mexer em banco, autenticação, permissões |
| `docs/tumtu-plano-de-testes.md` | Estratégia de teste, dados fake, roteiros de teste manual | Antes de testar mudanças ou popular dados |
| `docs/tumtu-estrategia-piloto.md` | Estratégia de entrada via carteirinha beta gratuita, operação do piloto (problema de ritmista em múltiplas baterias já resolvido em 13/jul/2026, ver seção 14) | Antes de mexer em cadastro/aprovação/login pensando no piloto |
| `docs/tumtu-historico-sessoes.md` | Diário completo de tudo que já foi feito, sessão por sessão, do mais antigo pro mais recente | Se precisar do detalhe completo de uma decisão antiga que não está no resumo curto deste arquivo |

`docs/README.md` **não existe mais** — foi removido em 09/jul/2026 por descrever uma versão bem antiga do sistema (senha em texto puro, sem Super Admin) que divergia dos docs acima.

---

## Regras que eu nunca posso quebrar

### Comportamento geral
- **Nunca mudar layout, espaçamento ou organização visual sem aprovação explícita.** Se a mudança não foi pedida, não faço. Quando há dúvida sobre estilo, nome de botão, cor ou layout, mostro opções e espero a Márcia escolher antes de implementar.
- **Nunca remover/desistir de algo que ela pediu, mesmo depois de várias tentativas sem sucesso, sem perguntar antes.** Regra criada em 22/ago/2026, depois de eu remover sozinho o rótulo "Nome usado" (Configurações → Instrumentos) porque não conseguia acertar o alinhamento dele — ela tinha pedido pra AJUSTAR, não pra tirar, e ficou justificadamente brava ("QUEM MANDOU VOCÊ TIRAR?"). Se depois de várias tentativas eu não estiver conseguindo acertar algo visual, o caminho certo é falar isso pra ela e perguntar como seguir (tentar de outro jeito, pausar, ou só aí sim remover) — nunca decidir sozinho que "o mais simples é tirar" e simplesmente fazer.
- **Nunca adicionar detalhe visual não pedido** (separadores, ícones extras, cores, espaçamentos) — implementar exatamente o que foi descrito, nada a mais.
- **Confirmar antes de subir ao GitHub.** Regra reforçada em 18/jul/2026 (a Márcia pediu essa "rede de segurança" explicitamente, depois de perceber que hoje toda mudança vai direto pra produção sem ambiente de teste separado): antes de publicar de verdade (`git push` na `main`, que a Vercel publica automaticamente em `tumtu.com.br`), gerar um **link de teste avulso** e mandar pra ela conferir no próprio celular/computador — não só descrever em palavras ou mostrar print estático. Só depois da aprovação dela, commit + push de verdade (ou merge do branch de preview pra `main`). Vale pra qualquer mudança visual ou de fluxo perceptível por quem usa o app — não precisa pra ajustes 100% internos (ex: só comentário de código, só reorganização de memória). **Método atualizado em 14/ago/2026** (o `vercel` CLI não está disponível neste ambiente — ver "Stack e infraestrutura"): commitar num branch dedicado (`preview/nome-da-mudanca`, nunca direto na `main`) → `git push` desse branch → a integração GitHub↔Vercel do projeto `tumtu-app` publica sozinha um preview pra esse branch, sem comando manual → pegar a URL estável desse preview (formato `tumtu-app-git-<branch>-marcia-ritmistas.vercel.app`, via ferramenta MCP `list_deployments`) → gerar um link sem exigência de login da Vercel com a ferramenta MCP `get_access_to_vercel_url` (expira em ~23h) e mandar pra ela abrir **direto no navegador** (não de dentro do WhatsApp/Instagram — o navegador embutido desses apps pode bloquear o cookie que esse link depende, já aconteceu de "funcionar" do lado de cá e não abrir pra ela). **Exceção pontual, só quando ela pedir nesses termos explicitamente** (aconteceu em 31/ago/2026, pra "Confirmar Presença": "acho mais fácil, ngm sabe dessa funcionalidade e eu controlo aqui") — publicar direto na `main`, pulando o link de teste. Detalhe técnico completo: `tumtu-documentacao-tecnica.md` seção 32.
- **Quando a Márcia disser "estava melhor antes"** — reverter imediatamente, sem questionar e sem tentar "melhorar" a versão anterior por conta própria.
- **Dimensão da carteirinha é fixa em 300×540px (documentado em `docs/tumtu-design-guide.md`, seção 7.3) — nunca aumentar o tamanho do cartão pra caber conteúdo novo.** Se fonte, logo, respiro ou qualquer elemento não couber, o ajuste é no conteúdo (reduzir/redistribuir), nunca no tamanho do cartão. Mudar essa dimensão exige aprovação explícita da Márcia todas as vezes — regra criada em 13/jul/2026 depois de eu aumentar o tamanho sem avisar duas vezes seguidas na mesma sessão. (Único ajuste aprovado desde então: 500px→540px de altura em 14/jul/2026, a pedido explícito dela — "um pouquinho mais comprida"; a regra de nunca mudar sem aprovar de novo continua valendo.)

### Regras de produto (não violar sem confirmar com a Márcia)
- **Um único formulário de cadastro** (`cadastro.html`, renomeado de `index.html` em 12/jul/2026), reaproveitado em 3 modos (público/link fixo/manual) — nunca duplicar em telas separadas. O modo "público" (escolher escola livremente) existe no código mas não é linkado de lugar nenhum hoje — todo cadastro real acontece via link fixo, vinculado a uma bateria específica.
- **Um único motor de edição de perfil** (`ficha-perfil.js` + `ficha-perfil.partial.html`) compartilhado por `admin.html` e `carteirinha.html` — nunca copiar/colar essa lógica numa tela nova. (`super-admin.html` foi apagado em 19/ago/2026 — `admin.html` unificou as duas telas.)
- **Telas que mostram o mesmo modelo de dados para perfis diferentes devem ter os mesmos campos.** Ex: modal de Admin e modal de Ritmista mostram os mesmos campos — a diferença entre perfis é sobre quem pode ver/editar, não sobre quais campos existem na tela.
- **Dados de escola são sempre variáveis via `config-escola.js`** — nunca hardcoded no código.
- **Conta de Super Admin nunca é exposta a exclusão pela interface**, em nenhuma tela — evita lockout, já que ninguém acima dela pode restaurar o acesso.
- **Super Admin nunca tem acesso a ver/definir a senha de outra pessoa** — decisão ética explícita da Márcia. Reset de senha é sempre self-service via Supabase Auth nativo.
- **Toda feature nova que toque em Diretoria deve tratar Mestre/Diretor de Bateria/Diretor (Apoio) como campos ou checkboxes SEPARADOS, nunca um bloco único "Inclui Diretoria".** Regra fixada em 29/ago/2026 depois dela rejeitar exatamente esse desenho no módulo de Presença ("o mestre pode não querer dar presença, mas quer presença só do apoio... não dá pra prever a combinação").

### Priorização
- **Função antes de polimento.** Ao sugerir o que atacar a seguir, separar "não funciona / está quebrado" de "funciona mas podia ser mais conveniente/bonito" — na dúvida, priorizar o primeiro grupo. Não presumir que uma melhoria de UX bem definida é prioridade só por estar pronta pra implementar.
- **O card do ritmista é o elemento mais importante da tela do Admin.** Tudo ao redor (filtros, vagas, seções extras) é secundário — deve ficar clean, sem poluir visualmente o card.

### Hierarquia visual
- Botão de ação principal (ex: "Cadastro") precisa de destaque real: fundo sólido escuro `#12101a` ou dourado `#D4AF37` (tokens `--cor-fundo-escuro`/`--cor-destaque` em `styles/tokens.css`). Botões secundários = só borda, transparente.
- Seções auxiliares (ex: "Vagas por Instrumento") devem ser simples — listas com texto, sem chips/cards aninhados/cores excessivas.

### Segurança
- **Auditar segurança sozinho, a cada sessão com mudança de banco — sem esperar ela pedir.** Regra endurecida em 28/ago/2026 depois dela ter que pedir de novo e a checagem achar um vazamento crítico ativo. Rodar a ferramenta automática de segurança do Supabase **primeiro** (pega sistematicamente o que checagem manual não cobre), depois checagem manual direcionada nas áreas mexidas. Testar com chamada HTTP real (chave pública bloqueada) e com login de verdade (edição legítima continua funcionando) — não só ler o código.

---

## Como trabalhar com a Márcia

- Explicar tudo do zero absoluto — o que é cada ferramenta, por que está sendo usada, cada passo em linguagem simples. Nunca assumir conhecimento técnico prévio, inclusive sobre onde clicar em painéis externos (Supabase, GitHub, Vercel).
- Ela fica ansiosa com telas desconhecidas (painel de controle de versão, opções administrativas do Supabase) — tranquilizar primeiro ("nada quebrou, nada foi feito errado") antes de explicar o próximo passo.
- Ela está aos poucos aprendendo a se organizar (pastas, versionamento) — reforçar positivamente esses avanços, sem forçar demais de uma vez.

---

## Stack e infraestrutura

- **Frontend:** HTML + CSS + JavaScript puro. Sem framework, sem bundler, sem `package.json`. Cada tela é um `.html` autocontido.
- **Backend:** Supabase (Postgres + Auth + Edge Functions), sem servidor próprio. Project ref `pkvzsgrkylrkyzligeim`.
- **E-mail transacional (e-mails automáticos do Supabase Auth — redefinir senha, etc.):** servidor de envio próprio via **Resend** (custom SMTP, configurado em Authentication → Emails → SMTP Settings do Supabase, 14/ago/2026) — sem isso, o Supabase usa um servidor genérico deles e trava a edição do texto dos e-mails, que ficam em inglês. Conta do Resend é a pessoal da Márcia (`marciaserrafr@gmail.com`, mesmo padrão de GitHub/Vercel/Supabase — `tumtuapp@gmail.com` fica só pro papel de Super Admin dentro do próprio app). Domínio `tumtu.com.br` verificado no Resend via registros DNS na zona do **Registro.br** (não é a Vercel que hospeda o DNS). Remetente reaproveita o `suporte@tumtu.com.br` já existente. **Só o template "Reset password" foi traduzido até agora** — os outros e-mails do Supabase (confirmação de cadastro, etc.) continuam em inglês, sem confirmação ainda se algum deles é realmente enviado no fluxo atual do app.
- **Deploy:** GitHub (`marciaserrafr/tumtu-app`) → Vercel (projeto **`tumtu-app`**, team `marcia-ritmistas` — é o projeto com a integração GitHub de verdade, publica automático a cada `git push`, tanto na `main` quanto em qualquer outro branch, como preview). **Existe um projeto Vercel antigo separado, `ritmistas-app`, que NÃO é esse** — tem vários deploys avulsos de teste sem uso, criados por engano numa sessão anterior; não usar.
- **Domínios no ar**: `tumtu.com.br` (raiz redireciona pra `/login`, ainda sem landing page de divulgação de verdade) e `app.tumtu.com.br` (adicionado 30/ago/2026, mesmo app/deploy, pensado como endereço fixo pra divulgar pra ritmistas instalarem — não substitui o domínio antigo).
- **Ferramentas de linha de comando disponíveis localmente:** `gh` (GitHub CLI, autenticado) — usar em vez de pedir pra Márcia navegar em painéis desconhecidos, sempre que a tarefa permitir. **O `vercel` CLI NÃO está disponível neste ambiente**. Pra qualquer necessidade de deploy/preview/consulta à Vercel, usar as ferramentas MCP (`mcp__claude_ai_Vercel__*`: `list_deployments`, `get_access_to_vercel_url`, `get_project_deployment_protection`, etc.) — ver fluxo completo na regra "Confirmar antes de subir ao GitHub" acima. **Nota**: em pelo menos uma sessão (31/ago/2026) nem `gh` nem as ferramentas MCP da Vercel estavam disponíveis — se isso se repetir, contornar consultando a API pública do GitHub via `curl` (o repo é público) e sinalizar pra ela como limitação da sessão, não presumir que sumiu de vez.
- **Fonte:** Plus Jakarta Sans (Google Fonts).
- **Biblioteca de terceiros:** `@supabase/supabase-js@2` via CDN; `jsQR` via CDN (leitor de QR, usado no scanner da Diretoria e no "Confirmar Presença" da carteirinha). (`bcryptjs` foi removido em 05/jul/2026 — não usar mais, autenticação é 100% Supabase Auth.)
- **PWA:** instalável direto do navegador (`manifest.json` + `sw.js`), sem loja/custo. **Atenção:** todo arquivo do "app shell" (listado em `APP_SHELL` dentro de `sw.js`) é servido do cache — ao alterar qualquer `.html`/`.css`/`.js` do shell, subir a versão de `CACHE_NAME` em `sw.js`, senão quem já visitou o site continua vendo a versão antiga.
- **Cache-busting por versão na URL (`?v=N`):** `styles/tokens.css`, `styles/components.css`, `carteirinha-tumtu.css`, `ficha-perfil.js`, `ficha-perfil.partial.html` e `config-escola.js` são referenciados com `?v=N` em todo HTML que os usa, e no `fetch()` dentro de `ficha-perfil.js`. **Toda vez que algum desses arquivos mudar, subir esse número em TODOS os lugares que o referenciam** (busca por `?v=N` no projeto) — isso é mais forte que só trocar o `CACHE_NAME`: derrota até cache de operadora/proxy no meio do caminho, porque a URL vira literalmente outro arquivo.
- **Sem `viewport-fit=cover` no site inteiro** (achado 30/ago/2026) — `env(safe-area-inset-bottom)`/`env(safe-area-inset-top)` sempre resolvem pra zero sem isso, então ajustes antigos que dependiam disso podem nunca ter funcionado de verdade (só coincidiu de sobrar espaço suficiente). Corrigir isso no site inteiro é uma mudança pendente, ainda não feita — mexe em como toda página se comporta perto das bordas do iPhone.

## Estrutura de pastas

```
Tumtu/
├── *.html, *.css, *.js        # código do app, solto na raiz
├── styles/                    # tokens.css (CSS variables) + components.css (componentes reutilizáveis)
├── icons/                     # ícones do PWA
├── docs/                      # documentação de produto/técnica (.md)
├── dados/                     # planilha de dados fake para popular o banco de testes
├── imagens/                   # material de referência visual — fora do Git (.gitignore)
└── .claude/
```

## Modelo de dados (resumo — detalhe completo em `docs/tumtu-documentacao-tecnica.md`, seção 22)

- **Desde 13/jul/2026, "pessoa" e "vínculo com bateria" são duas tabelas separadas** — ler a seção 22 da documentação técnica antes de mexer em cadastro/login/aprovação/edição de perfil:
  - **`pessoas`**: quem é a pessoa, não muda entre baterias (nome, CPF, endereço, contato de emergência, foto, `super_admin` boolean, `genero`, dados do responsável de menor de idade, `qr_token`). IDs `bigint`, não UUID.
  - **`vinculos`**: o vínculo de uma pessoa com UMA bateria específica (`perfil`, `status`, instrumento, os 4 tamanhos de roupa/Medidas, `aprovado_por`, `capacidades` jsonb de permissão, `naipe`, `repique_bossa`, `nao_desfila`, `observacoes`). Uma pessoa pode ter vários vínculos, um por bateria.
  - **Convenção importante:** `.id` em card/lista/URL (`carteirinha.html?id=`) significa **vínculo**, não pessoa. Só autoedição e `aprovado_por` usam `pessoa_id` de verdade.
  - A tabela antiga `ritmistas` (que juntava as duas coisas numa linha só) ainda existe no banco como rede de segurança, sem receber mais escrita. **Decisão registrada em 27/ago/2026: NÃO apagar** — ela decidiu manter mesmo com risco baixíssimo confirmado ("ainda me ajuda com testes"). Não sugerir apagar de novo sem ela puxar o assunto.
- `cargo` (o que aparece na carteirinha) é separado de permissão de acesso. Permissões granulares vivem em `vinculos.capacidades` (jsonb, uma capacidade por chave, atribuída direto por pessoa — reforma de permissões concluída em 28/ago/2026, ver `tumtu-documentacao-tecnica.md` seção 62). Os campos antigos `vinculos.nivel_acesso`/`niveis_acesso`/`escola_niveis_acesso` (perfil nomeado) ficaram obsoletos.
- Tabelas `escolas` e `baterias` completam o modelo. `baterias.modo_piloto` (rótulo na tela: **"Modo Carteirinha"**) controla se Mestre/Diretor daquela bateria caem na carteirinha (true) ou no painel admin (false) ao logar.
- Autenticação real via Supabase Auth (`auth.users` ligado por `pessoas.auth_user_id`) — RLS ligado em `pessoas`, `vinculos`, `escolas`, `baterias`. Restrição por coluna (quem edita o quê) é feita por trigger (`aplicar_matriz_edicao_pessoas` + `aplicar_matriz_edicao_vinculos`), não pela policy de RLS. **Funções de RLS corretas pra "minha bateria":** `meu_pessoa_id()` e `minhas_baterias_admin()`. **Nunca usar** `meu_perfil()`/`meu_bateria_id()`/`meu_status()` (funções antigas, congeladas, causam permissão silenciosamente quebrada).
- Instrumentos são configuráveis (biblioteca mestre de categorias/nomenclaturas + ativação por bateria), não uma lista fixa no código — tabelas `instrumento_categorias`, `instrumento_nomenclaturas`, `bateria_instrumentos`.
- **Medidas (camisa/fantasia/calça/sapato e qualquer tipo novo) são um sistema totalmente aberto desde 23/ago/2026** — biblioteca mestre em `medida_tipos` (tipo + escala de tamanhos, todo tipo novo já nasce com escala obrigatória) + ativação por bateria em `bateria_medidas`/`bateria_medida_tipos`.
- **Figurino** (peça de evento, ex: "Camisa da Final") tem lista mestre própria (`figurino_itens_mestre`, Categoria = tipo de peça reaproveitando Medida, `publico` = lista de perfis que a peça cobre) + ativação por bateria (`bateria_figurino_itens`) + registro de entrega (`figurino_entregas`).
- **Eventos/Presença** (módulo novo, 29/ago/2026, gate comercial `baterias.modulo_presenca_ativo`): `evento_tipos` (biblioteca mestre) + `eventos` (por bateria, com `temporada_id` obrigatório e `perfis_diretoria_inclusos` array) + `evento_presencas` (uma linha = presença marcada; sem linha = ausente).
- Vocabulário: o valor "ativo" no banco é literalmente `status = "aprovado"`, não `"ativo"`.

## Estado atual (resumo — histórico completo sessão por sessão em `docs/tumtu-historico-sessoes.md`)

✅ **O que já está em produção, funcionando de ponta a ponta**: autenticação real + RLS, motor único de edição de perfil, cadastro em etapas com autocadastro/link fixo/manual, carteirinha digital com cor/logo dinâmicos por escola, aprovação de Ritmistas/Diretoria com histórico de auditoria, permissões granulares por pessoa (Reforma de Permissões, 28/ago/2026), Instrumentos/Medidas/Figurino como bibliotecas mestre 100% configuráveis (Público/Incluir Convidados do Figurino são decisão por bateria desde 31/ago/2026), "Convidado Especial" — gente de fora da bateria oficial com carteirinha de verdade, fila e permissões próprias (31/ago/2026), exportação para Excel, PWA instalável, Face ID/Digital como trava local de privacidade dentro do app, módulo de Presença via QR Code (leitor embutido no app, tanto pra Diretoria escanear quanto pra Ritmista "Confirmar Presença" sozinho), domínios `tumtu.com.br` e `app.tumtu.com.br` no ar, fundamentos de LGPD (política de privacidade, exclusão de dados sob pedido). Painel de gestão é um único arquivo (`admin.html`) com barra própria pro Super Admin. Auditorias de segurança recorrentes já corrigiram vazamentos reais várias vezes — ver regra "Segurança" acima.

✅ **"Convidado Especial" publicado em produção (31/ago/2026, sessão seguinte, commit `b06eb8a`)** — a causa real do bug de duplicação/perda de dado da sessão anterior (só a última pessoa cadastrada sobrevivia na fila) **não era o banco**: `cadastro.html` e `admin.html` compartilhavam a mesma sessão de login persistida no navegador, e cada autocadastro novo (`signUp()`) sobrescrevia silenciosamente a sessão de quem já estava logado (ex: o Admin, testando no mesmo aparelho) — daí o painel passar a "ver" só a própria ficha da última pessoa criada. Corrigido isolando a sessão do autocadastro num cliente Supabase próprio (`sbCadastro`, nunca persiste em localStorage), que nunca mais troca a sessão de quem já estava logado. Publicado sem ela testar ao vivo antes — decisão dela, explicando o motivo: um Diretor pedindo carteirinha fake pra esposas de Diretores (fora da bateria oficial) estava criando trabalho manual recorrente pra ela gerenciar na mão; preferiu absorver o risco pontual e tirar esse peso de cima. Detalhe técnico completo: `docs/tumtu-historico-sessoes.md` (última entrada) e memória de longo prazo `project_convidado_especial_bug_duplicacao`.

✅ **Figurino: "Público" e "Incluir Convidados" viram decisão por bateria (31/ago/2026, mesma sessão, commits `a84800f` e `e93f78c`).** Antes moravam no item GLOBAL (Super Admin → Configurações → Figurino), valendo pra todas as escolas ao mesmo tempo — ela apontou que só cada bateria sabe quem recebe uma peça (ex: "Camisa da Final") e se quer incluir Convidados nela. Migrado pra `bateria_figurino_itens`, mesmo padrão já usado em Categoria de Figurino/Medida (com backfill dos registros existentes, zero mudança de comportamento pra quem já estava configurado, e correção de uma política de RLS que ainda dependia do campo global). O rótulo do checkbox virou só "Convidado" (era um texto explicativo comprido). Detalhe técnico: `docs/tumtu-historico-sessoes.md` e memória `project_figurino_publico_por_bateria`.

🚧 **Outras pendências abertas, sem urgência definida:**
- **Lógica de Temporada** (recadastro leve por temporada + trava de carteirinha pra quem não revisou) — desenho detalhado já discutido com ela em 27/ago/2026, nada implementado. Ver `docs/tumtu-historico-sessoes.md`.
- **"Ritmistas/Diretoria sem carteirinha esta temporada"** (bulk import com senha aleatória, pra Mestre que já pagou carteirinha física) — "Fica pra depois", 28/ago/2026.
- **Área dedicada "Configurações → Carteirinha"** — hoje `validade_carteirinha` mora provisoriamente dentro do cadastro de escola.
- **Limpeza manual do bug antigo de medida perdida no autocadastro** (corrigido pra cadastros novos desde ~23/ago) — restavam 2 pessoas com Medida em branco na Imperatriz na última conferida (25/ago/2026): Gabriel Finizola André, Lucas Antunes Ribeiro. Consulta pra recontar: ver seção 56.7 da documentação técnica.
- **`viewport-fit=cover` faltando no site inteiro** — ver "Stack e infraestrutura" acima.
- Textos de ajuda (`config-sub-desc`) longos demais espalhados pelo app — revisão pontual, não sistemática ainda.
- Ideias soltas, sem decisão/desenho ainda (ver memória de longo prazo pra detalhe de cada uma): mascarar dados sensíveis em Meu Perfil (toque-pra-revelar), suporte via WhatsApp, suspender acesso por inadimplência, "Área de recados" futura, preview de cor de carteirinha sem criar escola demo.

📦 **Backlog "só se o TumTu crescer muito"** (rebaixado por decisão explícita dela, 17/jul/2026 — não sugerir de novo sem o cenário mudar): "Leaked Password Protection" (depende de plano pago do Supabase).

🚫 **Não retomar sem ela pedir de novo**: carteirinha offline (decisão fechada 17/jul/2026); personalização de layout arrastável da Visão Geral (duas tentativas revertidas em 27/ago/2026 — só retomar com ferramenta de teste de navegador disponível).

---

## Contas de teste

Banco roda só com dados fake (`dados/tumtu-dados-fake-reset.xlsx`). Senha padrão de todas as contas fake: `Teste123`. Super Admin (Márcia): e-mail `tumtuapp@gmail.com`, senha `tumtu2027`.
