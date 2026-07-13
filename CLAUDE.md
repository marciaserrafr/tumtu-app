# CLAUDE.md

> Este arquivo é lido automaticamente pelo Claude Code toda vez que uma sessão começa nesta pasta. É a ficha de instruções fixas do projeto — diferente dos documentos em `docs/`, que são a documentação de produto/técnica para humanos. Atualizar sempre que uma decisão importante mudar o que está escrito aqui.
> Última atualização: 13/jul/2026

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
  - **`pessoas`**: quem é a pessoa, não muda entre baterias (nome, CPF, endereço, contato de emergência, foto, `super_admin` boolean). IDs `bigint`, não UUID.
  - **`vinculos`**: o vínculo de uma pessoa com UMA bateria específica (`perfil`, `status`, instrumento, os 4 tamanhos de roupa, `aprovado_por`). Uma pessoa pode ter vários vínculos, um por bateria — resolve o bug antigo de uma pessoa não conseguir se cadastrar numa segunda bateria.
  - **Convenção importante:** `.id` em card/lista/URL (`carteirinha.html?id=`) significa **vínculo**, não pessoa. Só autoedição e `aprovado_por` usam `pessoa_id` de verdade.
  - A tabela antiga `ritmistas` (que juntava as duas coisas numa linha só) ainda existe no banco como rede de segurança, sem receber mais escrita — **não apagar sem confirmar com a Márcia primeiro** (ela quer testar o site publicado com as próprias mãos antes).
- `cargo` (o que aparece na carteirinha) é separado de `nivel_acesso` (hoje só existe o valor `"total"`) — decisão proposital para permitir permissões granulares no futuro sem migração.
- Tabelas `escolas` e `baterias` completam o modelo. Tabela `convites` **não existe mais** (dropada 05/jul/2026).
- Autenticação real via Supabase Auth (`auth.users` ligado por `pessoas.auth_user_id`) — RLS ligado em `pessoas`, `vinculos`, `escolas`, `baterias`. Restrição por coluna (quem edita o quê) é feita por trigger (`aplicar_matriz_edicao_pessoas` + `aplicar_matriz_edicao_vinculos`), não pela policy de RLS.
- Instrumentos são configuráveis (biblioteca mestre de categorias/nomenclaturas + ativação por bateria), não uma lista fixa no código — tabelas `instrumento_categorias`, `instrumento_nomenclaturas`, `bateria_instrumentos`.
- Vocabulário: o valor "ativo" no banco é literalmente `status = "aprovado"`, não `"ativo"`.

## Estado atual (alto nível — ver `docs/tumtu-documentacao-tecnica.md` seção 21 para histórico completo)

✅ Concluído: rename de marca Tutti→TumTu (inclusive nomes de arquivo da documentação e do repositório GitHub), autenticação real + RLS, motor único de edição de perfil, "esqueci minha senha" self-service, PWA, exportação de ritmistas para Excel (seção 17), auditoria completa de UX + cadastro em etapas (seção 19), cache-busting por versão pra evitar qualquer tipo de cache travar atualização (seção 20), configuração de instrumentos (biblioteca mestre + por bateria), domínio `tumtu.com.br` no ar (DNS + certificado SSL configurados em 12/jul/2026), migração de arquitetura "pessoa" separada de "vínculo com bateria" (seção 22 — resolve o bug de ritmista em mais de uma bateria).
✅ `index.html` agora é uma landing page provisória ("Em breve", sem nenhum link/ação) — o formulário de cadastro real foi renomeado para `cadastro.html`. Decisão de 12/jul/2026: como o domínio virou público, não faz sentido expor o cadastro aberto (modo "público", sem bateria vinculada) na porta de entrada do site.
🚧 Pendências conhecidas (não urgentes): ver seção 9 de `tumtu-documentacao-tecnica.md` — "Leaked Password Protection" adiada por depender de plano pago do Supabase. Apagar a tabela antiga `ritmistas` (só depois da Márcia testar o site publicado). Sistema de nomenclatura de tamanho de roupa por escola (XXG vs XGG), adiado a pedido dela.
⚠️ **Commit local não enviado:** no momento desta atualização, o commit `487ff17` ("Não pede confirmação de senha pra quem já tem conta") estava só local — a Márcia ainda não confirmou o envio. Checar `git log origin/main..HEAD` antes de presumir que já foi enviado ao GitHub.

## Roadmap combinado com a Márcia em 10/jul/2026 (ordem definida por ela)
Depois do domínio: 1) revisão de todas as telas (correções gerais) → 2) revisão de layout com visão de UX expert → 3) **inclusão de instrumentos (urgente, logo após a revisão de telas)** → 4) lógica de temporada em relação a ritmistas → 5) controle de camisas por temporada (múltiplas entregas na mesma temporada, não só "marcar quem recebeu"). Depois de tudo isso: fase de marketing, começando por e-mail com o domínio próprio. **Itens 1, 2 e 3 já concluídos** (revisão de telas + UX em 10/jul, ver seção 19 da documentação técnica; instrumentos configuráveis em 11/jul, seção 22 do MVP/técnica) — itens 4 e 5 ainda não detalhados. Fora da ordem original, mas resolvido com urgência por ser bloqueador do piloto: a migração pessoa/vínculo (13/jul/2026, seção 22 da documentação técnica).

---

## Contas de teste

Banco roda só com dados fake (`dados/tumtu-dados-fake-reset.xlsx`). Senha padrão de todas as contas fake: `Teste123`. Super Admin (Márcia): e-mail `tumtuapp@gmail.com`, senha `tumtu2027`.
