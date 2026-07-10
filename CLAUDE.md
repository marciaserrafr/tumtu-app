# CLAUDE.md

> Este arquivo é lido automaticamente pelo Claude Code toda vez que uma sessão começa nesta pasta. É a ficha de instruções fixas do projeto — diferente dos documentos em `docs/`, que são a documentação de produto/técnica para humanos. Atualizar sempre que uma decisão importante mudar o que está escrito aqui.
> Última atualização: 10/jul/2026

---

## O que é o TumTu

SaaS de gestão de baterias de escola de samba: cadastro de ritmistas, aprovação por Mestre/Diretor, carteirinha digital. Nome vem do som do surdo de bateria ("TUM-TU, TUM-TU..."). Piloto gratuito na Swing da Leopoldina (bateria da G.R.E.S. Imperatriz Leopoldinense), com visão de virar produto comercial multi-escola no futuro.

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

`docs/README.md` **não existe mais** — foi removido em 09/jul/2026 por descrever uma versão bem antiga do sistema (senha em texto puro, sem Super Admin) que divergia dos 4 docs acima.

---

## Regras que eu nunca posso quebrar

### Comportamento geral
- **Nunca mudar layout, espaçamento ou organização visual sem aprovação explícita.** Se a mudança não foi pedida, não faço. Quando há dúvida sobre estilo, nome de botão, cor ou layout, mostro opções e espero a Márcia escolher antes de implementar.
- **Nunca adicionar detalhe visual não pedido** (separadores, ícones extras, cores, espaçamentos) — implementar exatamente o que foi descrito, nada a mais.
- **Confirmar antes de subir ao GitHub** — mostrar preview/screenshot antes do commit/push.
- **Quando a Márcia disser "estava melhor antes"** — reverter imediatamente, sem questionar e sem tentar "melhorar" a versão anterior por conta própria.

### Regras de produto (não violar sem confirmar com a Márcia)
- **Um único formulário de cadastro** (`index.html`), reaproveitado em 3 modos (público/link fixo/manual) — nunca duplicar em telas separadas.
- **Um único motor de edição de perfil** (`ficha-perfil.js` + `ficha-perfil.partial.html`) compartilhado por `admin.html`, `super-admin.html` e `carteirinha.html` — nunca copiar/colar essa lógica numa tela nova.
- **Telas que mostram o mesmo modelo de dados para perfis diferentes devem ter os mesmos campos.** Ex: modal de Admin e modal de Ritmista mostram os mesmos campos — a diferença entre perfis é sobre quem pode ver/editar, não sobre quais campos existem na tela.
- **Dados de escola são sempre variáveis via `config-escola.js`** — nunca hardcoded no código.
- **Conta de Super Admin nunca é exposta a exclusão pela interface**, em nenhuma tela — evita lockout, já que ninguém acima dela pode restaurar o acesso.
- **Super Admin nunca tem acesso a ver/definir a senha de outra pessoa** — decisão ética explícita da Márcia. Reset de senha é sempre self-service via Supabase Auth nativo.

### Priorização
- **Função antes de polimento.** Ao sugerir o que atacar a seguir, separar "não funciona / está quebrado" de "funciona mas podia ser mais conveniente/bonito" — na dúvida, priorizar o primeiro grupo. Não presumir que uma melhoria de UX bem definida é prioridade só por estar pronta pra implementar.
- **O card do ritmista é o elemento mais importante da tela do Admin.** Tudo ao redor (filtros, vagas, seções extras) é secundário — deve ficar clean, sem poluir visualmente o card.

### Hierarquia visual
- Botão de ação principal (ex: "Cadastro") precisa de destaque real: fundo sólido escuro `#1a1a2e` ou dourado `#F5C518`. Botões secundários = só borda, transparente.
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

## Modelo de dados (resumo — detalhe completo em `docs/tumtu-documentacao-tecnica.md`)

- Tabela `ritmistas` guarda **todos os perfis** (`ritmista`/`mestre`/`diretor`/`super_admin`), diferenciados pela coluna `perfil`. IDs são `bigint`, não UUID.
- `cargo` (o que aparece na carteirinha) é separado de `nivel_acesso` (hoje só existe o valor `"total"`) — decisão proposital para permitir permissões granulares no futuro sem migração.
- Tabelas `escolas` e `baterias` completam o modelo. Tabela `convites` **não existe mais** (dropada 05/jul/2026).
- Autenticação real via Supabase Auth (`auth.users` ligado por `ritmistas.auth_user_id`) — RLS ligado em `ritmistas`, `escolas`, `baterias` desde 05/jul/2026. Restrição por coluna (quem edita o quê) é feita por trigger (`aplicar_matriz_edicao_ritmistas`), não pela policy de RLS.
- Vocabulário: o valor "ativo" no banco é literalmente `status = "aprovado"`, não `"ativo"`.

## Estado atual (alto nível — ver `docs/tumtu-documentacao-tecnica.md` seção 18 para histórico completo)

✅ Concluído: rename de marca Tutti→TumTu (inclusive nomes de arquivo da documentação e do repositório GitHub), autenticação real + RLS, motor único de edição de perfil, "esqueci minha senha" self-service, PWA, exportação de ritmistas para Excel (seção 17).
🚧 Em andamento: conexão do domínio `tumtu.com.br` na Vercel (seção 19 — domínio já adicionado ao projeto via `vercel domains add`, falta a Márcia apontar o DNS no Registro.br).
🚧 Pendências conhecidas (não urgentes): ver seção 9 de `tumtu-documentacao-tecnica.md` — "Leaked Password Protection" adiada por depender de plano pago do Supabase.

## Roadmap combinado com a Márcia em 10/jul/2026 (ordem definida por ela)
Depois do domínio: 1) revisão de todas as telas (correções gerais) → 2) revisão de layout com visão de UX expert → 3) **inclusão de instrumentos (urgente, logo após a revisão de telas)** → 4) lógica de temporada em relação a ritmistas → 5) controle de camisas por temporada (múltiplas entregas na mesma temporada, não só "marcar quem recebeu"). Depois de tudo isso: fase de marketing, começando por e-mail com o domínio próprio. **Nenhum desses itens está detalhado ainda** — cada um precisa de uma conversa de escopo antes de implementar.

---

## Contas de teste

Banco roda só com dados fake (`dados/tumtu-dados-fake-reset.xlsx`). Senha padrão de todas as contas fake: `Teste123`. Super Admin (Márcia): `tutti2027`.
