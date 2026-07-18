# CLAUDE.md

> Este arquivo é lido automaticamente pelo Claude Code toda vez que uma sessão começa nesta pasta. É a ficha de instruções fixas do projeto — diferente dos documentos em `docs/`, que são a documentação de produto/técnica para humanos. Atualizar sempre que uma decisão importante mudar o que está escrito aqui.
> Última atualização: 17/jul/2026

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

`docs/README.md` **não existe mais** — foi removido em 09/jul/2026 por descrever uma versão bem antiga do sistema (senha em texto puro, sem Super Admin) que divergia dos 4 docs acima.

---

## Regras que eu nunca posso quebrar

### Comportamento geral
- **Nunca mudar layout, espaçamento ou organização visual sem aprovação explícita.** Se a mudança não foi pedida, não faço. Quando há dúvida sobre estilo, nome de botão, cor ou layout, mostro opções e espero a Márcia escolher antes de implementar.
- **Nunca adicionar detalhe visual não pedido** (separadores, ícones extras, cores, espaçamentos) — implementar exatamente o que foi descrito, nada a mais.
- **Confirmar antes de subir ao GitHub** — mostrar preview/screenshot antes do commit/push.
- **Quando a Márcia disser "estava melhor antes"** — reverter imediatamente, sem questionar e sem tentar "melhorar" a versão anterior por conta própria.
- **Dimensão da carteirinha é fixa em 300×540px (documentado em `docs/tumtu-design-guide.md`, seção 7.3) — nunca aumentar o tamanho do cartão pra caber conteúdo novo.** Se fonte, logo, respiro ou qualquer elemento não couber, o ajuste é no conteúdo (reduzir/redistribuir), nunca no tamanho do cartão. Mudar essa dimensão exige aprovação explícita da Márcia todas as vezes — regra criada em 13/jul/2026 depois de eu aumentar o tamanho sem avisar duas vezes seguidas na mesma sessão. (Único ajuste aprovado desde então: 500px→540px de altura em 14/jul/2026, a pedido explícito dela — "um pouquinho mais comprida"; a regra de nunca mudar sem aprovar de novo continua valendo.)

### Regras de produto (não violar sem confirmar com a Márcia)
- **Um único formulário de cadastro** (`cadastro.html`, renomeado de `index.html` em 12/jul/2026 — ver seção "Domínio" abaixo), reaproveitado em 3 modos (público/link fixo/manual) — nunca duplicar em telas separadas. O modo "público" (escolher escola livremente) existe no código mas não é linkado de lugar nenhum hoje — todo cadastro real acontece via link fixo, vinculado a uma bateria específica.
- **Um único motor de edição de perfil** (`ficha-perfil.js` + `ficha-perfil.partial.html`) compartilhado por `admin.html`, `super-admin.html` e `carteirinha.html` — nunca copiar/colar essa lógica numa tela nova.
- **Telas que mostram o mesmo modelo de dados para perfis diferentes devem ter os mesmos campos.** Ex: modal de Admin e modal de Ritmista mostram os mesmos campos — a diferença entre perfis é sobre quem pode ver/editar, não sobre quais campos existem na tela.
- **Dados de escola são sempre variáveis via `config-escola.js`** — nunca hardcoded no código.
- **Conta de Super Admin nunca é exposta a exclusão pela interface**, em nenhuma tela — evita lockout, já que ninguém acima dela pode restaurar o acesso.
- **Super Admin nunca tem acesso a ver/definir a senha de outra pessoa** — decisão ética explícita da Márcia. Reset de senha é sempre self-service via Supabase Auth nativo.

### Priorização
- **Função antes de polimento.** Ao sugerir o que atacar a seguir, separar "não funciona / está quebrado" de "funciona mas podia ser mais conveniente/bonito" — na dúvida, priorizar o primeiro grupo. Não presumir que uma melhoria de UX bem definida é prioridade só por estar pronta pra implementar.
- **O card do ritmista é o elemento mais importante da tela do Admin.** Tudo ao redor (filtros, vagas, seções extras) é secundário — deve ficar clean, sem poluir visualmente o card.

### Hierarquia visual
- Botão de ação principal (ex: "Cadastro") precisa de destaque real: fundo sólido escuro `#12101a` ou dourado `#D4AF37` (tokens `--cor-fundo-escuro`/`--cor-destaque` em `styles/tokens.css`). Botões secundários = só borda, transparente.
- Seções auxiliares (ex: "Vagas por Instrumento") devem ser simples — listas com texto, sem chips/cards aninhados/cores excessivas.

---

## Como trabalhar com a Márcia

- Explicar tudo do zero absoluto — o que é cada ferramenta, por que está sendo usada, cada passo em linguagem simples. Nunca assumir conhecimento técnico prévio, inclusive sobre onde clicar em painéis externos (Supabase, GitHub, Vercel).
- Ela fica ansiosa com telas desconhecidas (painel de controle de versão, opções administrativas do Supabase) — tranquilizar primeiro ("nada quebrou, nada foi feito errado") antes de explicar o próximo passo.
- Ela está aos poucos aprendendo a se organizar (pastas, versionamento) — reforçar positivamente esses avanços, sem forçar demais de uma vez.

---

## Stack e infraestrutura

- **Frontend:** HTML + CSS + JavaScript puro. Sem framework, sem bundler, sem `package.json`. Cada tela é um `.html` autocontido.
- **Backend:** Supabase (Postgres + Auth + Edge Functions), sem servidor próprio. Project ref `pkvzsgrkylrkyzligeim`.
- **Deploy:** GitHub (`marciaserrafr/tumtu-app`) → Vercel (projeto `ritmistas-app`, nome ainda não alinhado ao repo — renomear é cosmético, baixa prioridade), automático a cada `git push` na `main`.
- **Ferramentas de linha de comando disponíveis localmente:** `gh` (GitHub CLI, autenticado) e `vercel` (Vercel CLI, autenticado e com a pasta linkada ao projeto `ritmistas-app`/team `marcia-ritmistas`) — usar em vez de pedir pra Márcia navegar em painéis desconhecidos, sempre que a tarefa permitir (ex: `vercel domains`, `vercel env`, `gh repo`).
- **Fonte:** Plus Jakarta Sans (Google Fonts).
- **Biblioteca de terceiros:** `@supabase/supabase-js@2` via CDN. (`bcryptjs` foi removido em 05/jul/2026 — não usar mais, autenticação é 100% Supabase Auth.)
- **PWA:** instalável direto do navegador (`manifest.json` + `sw.js`), sem loja/custo. **Atenção:** todo arquivo do "app shell" (listado em `APP_SHELL` dentro de `sw.js`) é servido do cache — ao alterar qualquer `.html`/`.css`/`.js` do shell, subir a versão de `CACHE_NAME` em `sw.js`, senão quem já visitou o site continua vendo a versão antiga.
- **Cache-busting por versão na URL (`?v=N`):** `styles/tokens.css`, `styles/components.css`, `carteirinha-tumtu.css`, `ficha-perfil.js`, `ficha-perfil.partial.html` e `config-escola.js` são referenciados com `?v=1` (ou mais recente) em todo HTML que os usa, e no `fetch()` dentro de `ficha-perfil.js`. **Toda vez que algum desses arquivos mudar, subir esse número em TODOS os lugares que o referenciam** (busca por `?v=N` no projeto) — isso é mais forte que só trocar o `CACHE_NAME`: derrota até cache de operadora/proxy no meio do caminho, porque a URL vira literalmente outro arquivo. Criado em 10/jul/2026 depois de um incidente real onde a Márcia ficou presa numa versão antiga mesmo depois de limpar cache do navegador — a causa era cache fora do controle do navegador dela.

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

- **Desde 13/jul/2026, "pessoa" e "vínculo com bateria" são duas tabelas separadas** — mudança grande, ler a seção 22 da documentação técnica antes de mexer em cadastro/login/aprovação/edição de perfil:
  - **`pessoas`**: quem é a pessoa, não muda entre baterias (nome, CPF, endereço, contato de emergência, foto, `super_admin` boolean, `genero` — desde 13/jul/2026, ver seção 23 da documentação técnica). IDs `bigint`, não UUID.
  - **`vinculos`**: o vínculo de uma pessoa com UMA bateria específica (`perfil`, `status`, instrumento, os 4 tamanhos de roupa, `aprovado_por`). Uma pessoa pode ter vários vínculos, um por bateria — resolve o bug antigo de uma pessoa não conseguir se cadastrar numa segunda bateria.
  - **Convenção importante:** `.id` em card/lista/URL (`carteirinha.html?id=`) significa **vínculo**, não pessoa. Só autoedição e `aprovado_por` usam `pessoa_id` de verdade.
  - A tabela antiga `ritmistas` (que juntava as duas coisas numa linha só) ainda existe no banco como rede de segurança, sem receber mais escrita. **Atualizado 17/jul/2026:** confirmado que só 2 das 28 linhas são reais (a conta da Márcia + uma conta de teste dela, ambas já migradas corretamente para `pessoas`) — as outras 26 são dado fake. Risco de apagar agora é baixíssimo; ela reagiu bem à ideia ("todos os dados são fakes, tirando o do super admin") mas **ainda não deu o "pode apagar" explícito** — perguntar de novo antes de executar, não presumir autorização.
- `cargo` (o que aparece na carteirinha) é separado de `nivel_acesso` (hoje só existe o valor `"total"`) — decisão proposital para permitir permissões granulares no futuro sem migração.
- Tabelas `escolas` e `baterias` completam o modelo. Tabela `convites` **não existe mais** (dropada 05/jul/2026). `baterias.modo_piloto` (boolean) controla se Mestre/Diretor daquela bateria caem na carteirinha (true) ou no painel admin (false) ao logar — editável em Super Admin → Escolas → aba Bateria (interruptor "Modo Piloto", adicionado 17/jul/2026).
- Autenticação real via Supabase Auth (`auth.users` ligado por `pessoas.auth_user_id`) — RLS ligado em `pessoas`, `vinculos`, `escolas`, `baterias`. Restrição por coluna (quem edita o quê) é feita por trigger (`aplicar_matriz_edicao_pessoas` + `aplicar_matriz_edicao_vinculos`), não pela policy de RLS. **Funções de RLS corretas pra "minha bateria":** `meu_pessoa_id()` e `minhas_baterias_admin()` — leem de `pessoas`/`vinculos`. **Nunca usar** `meu_perfil()`/`meu_bateria_id()`/`meu_status()` (funções antigas, liam da tabela `ritmistas` congelada — causavam permissão silenciosamente quebrada pra contas criadas depois de 13/jul; corrigido em `bateria_instrumentos` e `baterias` em 17/jul/2026, ver `tumtu-documentacao-tecnica.md` seção 27).
- Instrumentos são configuráveis (biblioteca mestre de categorias/nomenclaturas + ativação por bateria), não uma lista fixa no código — tabelas `instrumento_categorias`, `instrumento_nomenclaturas`, `bateria_instrumentos`.
- **Medidas (camisa/fantasia/calça/sapato) também são configuráveis, mesmo padrão de Instrumentos (17/jul/2026)** — biblioteca mestre em `medida_tamanhos` (tipo fixo no código, nome do tamanho configurável) + ativação por bateria em `bateria_medidas`. Dado semente: PP-XGG (camisa/fantasia/calça), 33-48 (sapato) — padrão brasileiro pesquisado. Sem "Momo" pré-cadastrado de propósito (a Márcia cadastra quando uma escola pedir).
- Vocabulário: o valor "ativo" no banco é literalmente `status = "aprovado"`, não `"ativo"`.

## Estado atual (alto nível — ver `docs/tumtu-documentacao-tecnica.md` seção 21 para histórico completo)

✅ Concluído: rename de marca Tutti→TumTu (inclusive nomes de arquivo da documentação e do repositório GitHub), autenticação real + RLS, motor único de edição de perfil, "esqueci minha senha" self-service, PWA, exportação de ritmistas para Excel (seção 17), auditoria completa de UX + cadastro em etapas (seção 19), cache-busting por versão pra evitar qualquer tipo de cache travar atualização (seção 20), configuração de instrumentos (biblioteca mestre + por bateria), domínio `tumtu.com.br` no ar (DNS + certificado SSL configurados em 12/jul/2026), migração de arquitetura "pessoa" separada de "vínculo com bateria" (seção 22 — resolve o bug de ritmista em mais de uma bateria).
✅ `index.html` agora é uma landing page provisória ("Em breve", sem nenhum link/ação) — o formulário de cadastro real foi renomeado para `cadastro.html`. Decisão de 12/jul/2026: como o domínio virou público, não faz sentido expor o cadastro aberto (modo "público", sem bateria vinculada) na porta de entrada do site.
✅ Depois da migração pessoa/vínculo: dois ajustes finos no cadastro (13/jul/2026) — "tamanhos" virou "medidas" no aviso de pessoa já existente (consistente com o nome da seção do formulário), e correção de rolagem automática (tanto a mensagem final de sucesso/erro quanto o aviso "Que bom te ver de novo" agora trazem a tela até eles, em vez de aparecerem fora da área visível em telas de computador). Tudo testado e **já enviado ao GitHub** (commits `86564c6` e `9a85130`).
✅ **Campo de gênero + nome liberado pra autoedição (13/jul/2026)** — `pessoas.genero`/`genero_personalizado` novos (Masculino/Feminino/"Prefiro me identificar como..."/Prefiro não informar, sempre opcional); `nome` saiu da trava de Super Admin, pessoa edita o próprio. Rótulo Mestre/Mestra e Diretor/Diretora já aplicado em `carteirinha.html`, `admin.html` e `login.html`. Detalhe completo: `tumtu-documentacao-tecnica.md` seção 23. Testado de ponta a ponta e **enviado ao GitHub**.
✅ **Redesign visual + arquitetura de dados da carteirinha, publicado em produção (14–16/jul/2026)** — sistema de cores dinâmico por N cores da escola (`color-mix()` a partir de até 4 cores reais em `escolas.cor_primaria/secundaria/terciaria/quaternaria`), logo da escola (frente, 96px) e da bateria (verso, 88px) via upload de arquivo de verdade (base64, mesmo padrão da foto do ritmista — `super-admin.html`), dimensão base fixa 300×540px (nunca mudar sem aprovação — ver regra abaixo). Cor/logo/nome da escola ficam em cache em `localStorage` (mesma chave usada por `login.html` e `carteirinha.html`) e são buscados **ainda na tela de login**, antes de trocar de tela — a carteirinha nasce sempre pronta, sem estado intermediário visível. Detalhe técnico completo (causas raiz, arquitetura de cache, correção do service worker): `tumtu-documentacao-tecnica.md` seção 24.
✅ **Botões novos da carteirinha + "Trocar de Bateria" funcionando (16/jul/2026)** — rodapé do cartão tem "Meu Perfil" (dourado, ação principal) e "Trocar de Bateria" (borda, só aparece com 2+ vínculos aprovados); topo do cartão voltou a ter só "Sair". Trocar de bateria reaproveita a sessão do Supabase Auth (sem pedir senha de novo) e busca a cor/logo de todas as baterias em segundo plano enquanto a pessoa decide, pra trocar ser instantâneo. **Só a parte do ritmista foi construída** — o fluxo do Admin pós-piloto (cair direto em `admin.html`, "Ver minha carteirinha") continua desenhado mas não implementado, adiado a pedido da Márcia até o piloto estar redondo.
✅ **Tema visual escuro implementado em login/cadastro/Meu Perfil/tela de carregando (17/jul/2026)** — fundo escuro de ponta a ponta, campos de formulário escuros com borda clara (não mais caixa branca flutuando), símbolo da marca + tipografia do logotipo padronizados. A parte de "arte"/identidade visual mais ousada (ilustração ou composição gráfica) foi tentada e pausada por decisão dela — ver `tumtu-documentacao-tecnica.md` seção 26.5.
✅ **Modo Piloto com interruptor de verdade na tela (17/jul/2026)** — antes só existia no banco (`baterias.modo_piloto`), sem controle visual; toda bateria nova nascia com ele desligado por padrão. Agora dá pra ligar/desligar direto em Super Admin → Escolas → aba Bateria.
✅ **Configuração de Medidas por bateria (17/jul/2026)** — mesmo padrão de Instrumentos (biblioteca mestre + ativação por bateria): `medida_tamanhos` + `bateria_medidas`. Resolve a pendência antiga de nomenclatura de tamanho por escola (XXG vs XGG). No caminho, achou e corrigiu uma falha de permissão pré-existente em Instrumentos/baterias (funções de RLS antigas lendo a tabela `ritmistas` congelada) — ver `tumtu-documentacao-tecnica.md` seção 27.
✅ **Tela de carregando no formato final (17/jul/2026)** — depois de testar uma animação do símbolo da marca (revertida por ser rápida demais no celular pra perceber o movimento) e um spinner clássico com logo+texto (inconsistente com outras telas do app), chegou no formato definitivo: spinner dourado sozinho, maior, com brilho suave, sem logo nem texto — referência Netflix/Disney+. Usado em `login.html` e `carteirinha.html` (que também ganhou lógica de nunca mostrar o cartão pela metade — só revela quando nome/foto/cor da escola estiverem 100% prontos). Detalhe completo: `tumtu-documentacao-tecnica.md` seções 24.9-24.10.
✅ **Correções de aprovação de Admin + log de auditoria + PWA (17/jul/2026, sessão à tarde)** — spinner travado pra quem tenta logar pendente (mensagem escrita atrás do spinner, nunca escondido); Dashboard do Super Admin escondia pendências de Mestre/Diretor (filtro só contava ritmista); atalho "X pendente" no Dashboard já abre direto na aba Acessos; Dashboard virou aba inicial do Super Admin (era Escolas). Campo solto "Mestre de Bateria" (texto livre, desconectado do sistema real) removido da aba Bateria. Nova tabela `vinculos_historico_status` + aba "Histórico" no Super Admin registram quem aprovou/rejeitou/mudou status de qualquer vínculo. Nacionalidade virou lista fechada (era texto livre com sugestão). PWA corrigido pra nunca mais precisar apagar e recriar o ícone numa atualização (service worker recarrega sozinho). Detalhe completo: `tumtu-documentacao-tecnica.md` seções 28-29.
🚫 **Carteirinha offline — decisão fechada em 17/jul/2026: NÃO vamos fazer por enquanto.** Lacuna real encontrada e correção prototipada/testada, mas revertida — ela prefere manter atualização automática da biblioteca do Supabase enquanto o app está em desenvolvimento ativo. Não retomar sem ela puxar o assunto. Detalhe: `tumtu-documentacao-tecnica.md` seção 30.
✅ **4 ajustes no formulário de cadastro (17/jul/2026, sessão da noite)** — transição suave nos campos que aparecem/somem (nacionalidade estrangeira, "como se identifica", documento sem CPF, "outro" estado), campo de Instrumento some inteiro da tela pra Admin/Super Admin (nunca fica obrigatório pra quem não tem instrumento), País virou lista fechada de países (era texto livre, "Brasil" continua default), Parentesco do contato de emergência virou lista fechada (Pai/Mãe/Cônjuge.../Outro, sem campo de texto pro "Outro"), e correção automática de maiúscula/minúscula ao sair do campo (nome, endereço, complemento, bairro, cidade, nome do contato — apelido fica de fora de propósito, por causa de abreviações tipo "LC"). Tudo só no cadastro novo, edição de perfil (`ficha-perfil.js`) não é afetada.

🚧 Pendências conhecidas (não urgentes, todas confirmadas como pós-piloto em 17/jul/2026): Apagar a tabela antiga `ritmistas` (risco confirmado baixo — só 2 das 28 linhas são reais, já migradas corretamente; falta só o "pode apagar" final dela). Cadastro de temporadas com histórico e interruptor pra ritmista editar as próprias medidas — 2 ideias registradas, nenhuma desenhada ainda.

📦 Backlog "só se o TumTu crescer muito" (itens rebaixados por decisão explícita da Márcia em 17/jul/2026 — não tratar como prioridade nem sugerir de novo sem o cenário mudar): "Leaked Password Protection" (trava de senha vazada, depende de plano pago do Supabase, que ela não pretende contratar por enquanto). Face ID/sessão persistente (não pedir senha toda vez) — rebaixado a pedido dela em 17/jul, mesma sessão.

## Roadmap combinado com a Márcia em 10/jul/2026 (ordem definida por ela)
Depois do domínio: 1) revisão de todas as telas (correções gerais) → 2) revisão de layout com visão de UX expert → 3) **inclusão de instrumentos (urgente, logo após a revisão de telas)** → 4) lógica de temporada em relação a ritmistas → 5) controle de camisas por temporada (múltiplas entregas na mesma temporada, não só "marcar quem recebeu"). Depois de tudo isso: fase de marketing, começando por e-mail com o domínio próprio. **Itens 1, 2 e 3 já concluídos** (revisão de telas + UX em 10/jul, ver seção 19 da documentação técnica; instrumentos configuráveis em 11/jul, ver linha do tempo na seção 21). **Itens 4 e 5, confirmados pós-piloto em 17/jul/2026** — ela mesma concordou que o valor desses dois só aparece com histórico de mais de uma temporada, e o piloto está só começando. Fora da ordem original, mas resolvido com urgência por ser bloqueador do piloto: a migração pessoa/vínculo (13/jul/2026, seção 22 da documentação técnica).

**Sequência combinada em 14–17/jul/2026, específica da carteirinha/piloto (prioridade dela, fora do roadmap de 10/jul acima) — CONCLUÍDA:** 1) cor/logo por escola ✅ 15/jul → 2) botões novos da carteirinha (Meu Perfil + Trocar de Bateria) ✅ 16/jul → 3) redesign visual de login/cadastro/perfil pra "cara de app moderno" ✅ 17/jul (fundo+campos escuros implementados; parte de "arte" ilustrada pausada por decisão dela) → 4) configuração de medidas (mesma lógica dos instrumentos) ✅ 17/jul. Fluxo de login pós-piloto completo pro Admin (cair direto em `admin.html`) fica pra **depois do piloto estar redondo**, decisão explícita dela em 16/jul — "o piloto é o piloto".

**Próximo grande marco:** cadastrar a primeira escola/bateria real (hoje só existem 2 baterias de teste no banco) e ligar o Modo Piloto nela — aí sim o piloto começa de verdade.

---

## Contas de teste

Banco roda só com dados fake (`dados/tumtu-dados-fake-reset.xlsx`). Senha padrão de todas as contas fake: `Teste123`. Super Admin (Márcia): e-mail `tumtuapp@gmail.com`, senha `tumtu2027`.
