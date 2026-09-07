# Plano de reestruturação — TumTu

Documento para o Claude Code. Ordem de implementação, o que já está desenhado,
o que ainda falta decidir. Data: 07/set/2026.

**Referência obrigatória:** `tumtu-design-guide.md` (raiz do projeto). Onde este
plano e o guia divergirem, **o guia manda** — as divergências conhecidas estão
listadas no fim.

---

## A estratégia: camada a camada, não tela a tela

A ideia original era refazer tela por tela, deixar tudo em homologação e subir
só quando o conjunto estivesse pronto — para o usuário não conviver com duas
linguagens visuais.

O objetivo está certo, mas o caminho tem um custo: meses de duas bases
divergindo, sem retorno de usuário real, e uma virada única de risco alto.

A proposta é dividir em **camadas**, onde a primeira é invisível
estruturalmente e pode subir sozinha sem susto:

| Etapa | O que é | Sobe para produção? |
|---|---|---|
| **Camada 0** | Tokens + estados de carregamento | Sim, sozinha |
| Etapa 1 | Ritmistas | Homologação |
| Etapa 2 | Ficha da pessoa | Homologação |
| Etapa 3 | Presença + Entrega | Homologação |
| Etapa 4 | Visão Geral | Homologação |
| Etapa 5 | Dados da Escola, Configurações, Permissões, Histórico | Homologação |

Depois da Camada 0, as telas antigas e novas já compartilham cor, tipo e
espaçamento — o "duas formas de enxergar" deixa de ser um problema visual e
passa a ser só uma diferença de layout, tela por tela.

---

## Camada 0 — tokens + estados de carregamento

**Por que primeiro:** não muda layout nenhum, então não tem o que homologar
em termos de usabilidade. Entrega ganho imediato de percepção de velocidade,
corrige o flicker do iPhone e — o mais importante — elimina o hex escrito à
mão. Sem isso, cada tela nova das etapas seguintes vira retrabalho.

### 0.1 Tokens

Todas as cores viram variável CSS na raiz, com os valores do guia:

```css
:root {
  --cor-fundo-escuro:    #12101a;
  --cor-fundo-medio:     #1e1b2e;
  --cor-fundo-claro:     #f7f6fb;
  --cor-superficie:      #ffffff;
  --cor-destaque:        #D4AF37;
  --cor-destaque-hover:  #B8922A;
  --cor-texto-principal: #12101a;
  --cor-texto-secundario:#5a5770;
  --cor-texto-muted:     #8b88a0;
  --cor-texto-claro:     #ffffff;
  --cor-borda:           #e8e6f0;
  --cor-terracota:       #7c2d12;
}
```

**Critério de conclusão:** `grep` por `#` nos arquivos de componente não
retorna cor nenhuma fora do bloco `:root` e dos overrides `[data-tema]`.

**Dourado tem dois valores, definidos pelo fundo:** `#D4AF37` sobre escuro
(sidebar, splash, header preto); em texto pequeno sobre fundo claro, `#D4AF37`
dá ~1.9:1 de contraste. Ver "Divergências" no fim — precisa de decisão da
Márcia.

### 0.2 Estados de carregamento

Quatro pesos. Regra geral: **nunca tirar da tela o que já está desenhado.**
Quanto mais curta a espera, mais discreto o sinal.

| Espera | Sinal | Onde | Status |
|---|---|---|---|
| Abertura fria | Spinner dourado 56px | Tela cheia, uma vez por sessão | Já existia (spinner "Passaporte") |
| Troca de tela | Barra de 3px | Abaixo do header, tela anterior a 72% | ✅ **Em produção (07/set/2026)** — só a troca de aba dentro de uma bateria e a navegação do Super Admin (`trocarAba`/`trocarSaAba`); acende só depois de 150ms de espera real |
| Buscando dados | Esqueleto | No formato do conteúdo que vem | CSS pronto em `components.css`, ainda não aplicado em nenhuma tela |
| Ação da pessoa | Giro no botão | No elemento tocado, nunca na tela | CSS pronto em `components.css` (`.btn-carregando`), ainda não aplicado em nenhum botão |
| Menos de 300ms | Nada | Piscar sinal é pior que não mostrar | Já embutido na barra de 3px (atraso de 150ms antes de acender) |

Isto substitui o comportamento atual de "só atualizar quando estiver pronto".
A troca é deliberada: tela em branco por 800ms lê como travada; esqueleto por
800ms lê como carregando. O tempo é o mesmo, a percepção não.

**Regras duras:**

- Header e sidebar **não desbotam** durante a espera — só a área de conteúdo.
- A barra de navegação fica **abaixo** do header, nunca sobre ele. O header
  tem a cor da escola (verde, preto, o que for) e uma barra dourada em cima
  dele pode simplesmente não aparecer.
- No desktop, a barra começa depois da sidebar; a sidebar continua clicável.
- Nada de indicador sobre o header. Se for inevitável em algum caso: branco
  com trilho `rgba(255,255,255,.25)`.
- O esqueleto tem que ter a **mesma altura** do conteúdo real, senão a chegada
  dos dados sacode o layout.

**Splash / carregando:** spinner dourado de 56px com glow, **sozinho, sem logo
e sem texto** — o mesmo do login e da carteirinha (decisão de 17/jul, seção 7.3
do guia). Sempre escuro nos dois temas: abre antes de o app saber a preferência
do usuário.

Spec completa, com keyframes e posições:
`design_handoff_estados_carregamento/README.md`.
Referência visual: `Estados de Carregamento - TumTu.dc.html`.

### 0.3 Tema claro/escuro (opcional nesta camada)

Se entrar agora, sai de graça — a camada de tokens é o trabalho todo.

- Atributo na raiz: `<html data-theme="light|dark">`.
- Primeira visita segue `prefers-color-scheme`; toggle manual sobrescreve.
- Persistir em `localStorage` (`tumtu:theme`).
- **Aplicar em script inline no `<head>`, antes do primeiro paint.** Via
  React/useEffect a tela pisca clara antes de virar escura — o mesmo flash que
  estamos combatendo no iOS.
- Trocar `<meta name="theme-color">` junto.

### 0.4 Flicker no iPhone

Flash branco/cinza na transição de tela, documentado desde 03/set. Duas frentes:

1. View Transition API parece amplificar — testar desligada.
2. A causa provável é ordem de carregamento: markup e CSS do splash precisam
   vir **antes** de qualquer script bloqueante.

A carteirinha é o grupo de controle: mesmo padrão de código, nunca piscou.

---

## Etapa 1 — Ritmistas

**Por que antes da Visão Geral:** é a tela mais usada, e é onde nasce o padrão
de linha de pessoa (nome, apelido, status, naipe) que a Ficha, a Presença e a
Entrega herdam. Fazendo primeiro, as etapas seguintes saem em metade do tempo.

Referência: `Ritmistas e Ficha - Proposta.dc.html`, turno 2 (o de cima).

### Linha de pessoa — o padrão que as outras telas herdam

Duas linhas de altura fixa:

- **Primeira linha:** nome completo (14px, 700) + badge de status + badge de
  categoria se houver (Menor, Repique de Bossa).
- **Segunda linha:** apelido em dourado bold + badge de instrumento (neutro).
- Borda esquerda de 3px na cor do status.
- Quem não tem apelido não mostra nada ali — sem buraco na diagramação.

**O apelido é essencial numa bateria** — tem gente que ninguém conhece pelo
nome. Mas o nome completo é o principal, então ele é o título. O que muda em
relação a hoje é só a **posição**: hoje o apelido fica pendurado no fim do nome,
cai num ponto diferente em cada linha e desaparece quando o nome é comprido.
Movido para o começo da segunda linha, fica sempre na mesma coluna.

Em ficha, exportação e documento, o nome completo continua sendo o título.

### Status

São 8: Ativos, Desligados, Menores, Não Desfila, Pendentes, Rejeitados,
Repique de Bossa, Suspensos. Cores na seção 6 do guia — usar aquelas.

- **O badge de status fica em toda linha.** (Eu tinha proposto removê-lo, por
  ter assumido que a aba Ritmista só continha ativos. Está errado.)
- Menor e Repique de Bossa são **categoria**: aparecem junto do status, não no
  lugar dele.
- **Chip de status filtra no clique.** Abrir em "Ativos", não com os 8
  pré-marcados — 8 marcados equivale a nenhum filtro, e a lista abre mostrando
  desligados e rejeitados junto de quem está ativo.
- Só Pendente mostra botão de ação na linha (Ativar / Rejeitar).

### Filtro de instrumento

Chip com contagem, filtrando no clique. Sem dropdown, sem os 11 checkboxes
pré-marcados, sem botão "Aplicar".

### Abas — NÃO REMOVER

**Ritmista / Diretoria / Convidados** dividem toda lista de pessoas do sistema.
Já removi por engano uma vez. O total de 229 na entrega de figurino é a soma
das três: 210 + 18 + 1.

### Menu lateral agrupado

Os 9 itens de "Mais" saem do submenu e viram três blocos com rótulo:

- **Cadastros** — Ritmistas, Diretoria, Dados da Escola
- **Operação** — Lista de Presença, Entrega de Figurino, Histórico
- **Ajustes** — Configurações, Permissões, Comercial

Sem clique extra e sem empurrar o Super Admin para fora da vista.

---

## Etapa 2 — Ficha da pessoa

Referência: `Ritmistas e Ficha - Proposta.dc.html`, bloco 1c.

- Nome completo é o título (é cadastro, não operação).
- Três números no topo respondem "vale convocar?": presença 12 meses, anos de
  bateria, tamanho de camisa.
- Pendência de figurino aparece com o botão de resolver ali mesmo.
- Seção de declaração do responsável usa o toggle e o título
  "DECLARAÇÃO DO RESPONSÁVEL" (seção 6b do guia) — nunca "MENOR DE IDADE".

---

## Etapa 3 — Presença e Entrega (juntas)

São **a mesma tela com verbo diferente**: lista de gente, uma marcação por
pessoa, QR como atalho. Implementar como um componente com dois verbos, não
duas telas. Dobro de ganho por uma implementação.

Referência: `Tela de Operacao - Proposta.dc.html`.

- **Escanear QR é a ação dominante** — botão de 54px fixo no rodapé no celular.
  É assim que 230 pessoas passam. A lista é o plano B (quem esqueceu o celular).
- O topo mostra **progresso** ("127 de 230 presentes") em vez de dois totais
  iguais. Hoje "230 TOTAL / 230 FALTAM" mostra o mesmo número duas vezes antes
  de começar.
- **Chips de "quem ainda falta" por naipe** — é o que dá para resolver no meio
  do ensaio ("faltam 4 caixas" é acionável; uma lista alfabética de 230 não é).
- **Estado padrão não ganha tinta.** "Não registrado" repetido 230 vezes
  desapareceu; só quem passou fica marcado, com hora.
- Ação é **botão de 40px**, não selo cinza. "Desfazer" em vez de um segundo
  toque que desmarca sem avisar.
- Na Entrega, o **tamanho fica em bloco escuro colado no botão** — legível a um
  braço de distância, no caminho do olho até o toque.
- Ciclo do evento como passo explícito ("Chamada aberta às 16h04" →
  "Encerrar chamada"), não dois toggles soltos no meio da tela.
- As três abas valem aqui também: a entrega é por Ritmista / Diretoria /
  Convidados, e dentro de cada uma, por instrumento.
- Lista aberta ordena **por quem falta mais**; naipes completos vão para o fim,
  colapsados num contador.

---

## Etapa 4 — Visão Geral

**Por último entre as principais**, porque é espelho: resume o que as outras
telas produzem. Se vier antes, você mexe nela duas vezes.

Referência: `Visao Geral - Proposta.dc.html`.

- Quatro números em linha no lugar de oito cards.
- **Cards de acordeão fechados passam a resumir**: barra de progresso, o número
  que dói e uma linha de diagnóstico ("Caixa não recebeu nada"). Hoje o fechado
  mostra só título e dois números, e parece card que não carregou — o que é
  exatamente o que os esqueletos da Camada 0 vão evitar.
- Abertos, ordenam por quem falta mais, não alfabético.
- Zero e "sem mudança" recuam para cinza; número que importa é tinta escura.
- Pendência de aprovação vira chamada de ação no topo + contador no menu, não
  um "+3" solto embaixo de um card.

---

## Etapa 5 — Telas restantes

Dados da Escola, Configurações, Permissões, Histórico, Comercial.
Nenhuma foi desenhada ainda. São de consulta e ajuste, risco menor.

Uma observação sobre Dados da Escola, já que é onde as cores nascem:

**A secundária da Imperatriz é `#FFFFFF`.** Não escolher a cor de detalhe por
posição no slot — escolher **por contraste** contra a primária. Na Imperatriz
isso pula o branco e cai no `#C9A84C`. A carteirinha já faz isso ("última cor
cadastrada que não seja branca"); o painel precisa da mesma regra.

---

## Respostas aos 4 pontos abertos (`tumtu-regras-abertas-design.md`)

**1. Tela montada por completo × revelar aos poucos.**
Concordo em mudar, e é exatamente a Camada 0. As duas tentativas rejeitadas
falharam por motivos diferentes do conteúdo progressivo em si: o spinner
boiando num espaço vazio não diz o que vem, e o overlay preto tira da tela o
que já estava desenhado. O esqueleto resolve as duas: ocupa a forma exata do
conteúdo que vem e não apaga nada. A regra que substitui a atual:
**nunca tirar da tela o que já está desenhado; nunca mostrar um sinal que não
tenha a forma do que está chegando.**

**2. Hierarquia dos botões.**
Manter fundo sólido = ação principal. O problema hoje não é o estilo, é a
**quantidade**: na tela de Ritmistas, "Copiar" (dourado sólido) e
"+ Cadastrar Ritmista" (dourado sólido) competem como se as duas fossem a ação
principal — e "Copiar" é ação de uma seção auxiliar. Proposta:

- **Um único botão sólido por tela.** Se aparecer um segundo, ele é de outro
  nível e deve descer.
- Três níveis em vez de dois: **sólido** (ação principal da tela) → **borda**
  (ação alternativa de peso comparável) → **texto sem caixa** (ação de seção
  auxiliar, tipo "Copiar", "Limpar", "Exportar"). Hoje o segundo nível está
  fazendo o trabalho de dois, e é por isso que as telas parecem ter muitos
  botões de igual importância.
- Destrutivo continua contorno terracota, nunca sólido (regra do guia).

**3. Seções auxiliares "simples".**
Concordo com o princípio, com um ajuste de definição: **simples é menos
recursos visuais, não menos informação.** "Vagas por Instrumento" com uma barra
por naipe é mais simples de ler que a mesma seção com dois números soltos —
a barra substitui a conta que a pessoa faz de cabeça. O que deve sair da seção
auxiliar é o que compete por atenção: chip colorido, card dentro de card,
borda de destaque, número em cor. Barra cinza com número em tinta escura não
compete com nada.

**4. O card do ritmista é o foco.**
Concordo, e isso tem duas consequências práticas que valem mais que o
princípio:

- **A borda esquerda colorida deve ser exclusiva do card de ritmista.** É o que
  dá a ele o peso visual de "elemento principal". Nenhuma seção auxiliar deve
  usar o mesmo recurso.
- **Os riscos dourados horizontais sob cada rótulo de seção deveriam sair.**
  Eles aparecem em toda tela, fazem o trabalho que o próprio rótulo já faz, e
  gastam o dourado — que é o recurso mais forte da paleta — em decoração. Com
  eles fora, o dourado do apelido e do item ativo do menu voltam a ter peso.

---


Estão em conflito entre o guia e as propostas. Enquanto não decidir, o guia
vale.

1. **Cor da escola no conteúdo.** O guia (seção 3) sobrescreve `--cor-destaque`
   por escola — "verde da Swing como ação principal" — ou seja, a cor da escola
   **entra** nos botões. As propostas fazem o contrário: cor da escola só no
   header, logo e sidebar; conteúdo neutro; status com cor fixa em toda escola.
   O argumento a favor do conteúdo neutro é que o app funciona igual para
   qualquer escola sem revisão tela por tela — e que numa escola vermelha o
   terracota de "pendente" viraria a cor da casa. Se o guia vencer, os botões
   pretos das telas de operação viram dourado/cor-da-escola.

2. **Dourado sobre fundo claro.** O guia pede apelido em `#D4AF37` bold. Sobre
   branco isso dá ~1.9:1 de contraste. Nas propostas usei `#a8862a`, que lê
   como dourado e passa em texto pequeno. É a única divergência que apliquei
   sem esperar decisão — se não puder, volto para `#D4AF37`.

3. **Contradição interna do guia:** o CSS do badge Menor é azul translúcido
   (`#eff6ff` / `#1a5fa8`, atualizado em 25/ago), mas o checklist da seção 12
   ainda pede "azul sólido escuro `#1a5fa8`". Alinhar os dois.

4. **Terracota em barra de progresso.** O guia proíbe terracota como fundo
   sólido em botão principal. As propostas usam `#7c2d12` preenchendo barras de
   progresso de pendência. Confirmar se a proibição vale só para botão.

---

## Ainda sem resposta (bloqueiam a Etapa 1)

1. **Não Desfila** é status excludente ou categoria? Não tem badge definido no
   guia. Se for categoria, precisa de cor própria.
2. **Repique de Bossa** é categoria (tratei como sim, junto do status) ou
   status excludente?
3. **Quais status entram na chamada e na entrega de figurino?** Ou seja: quem
   aparece na lista de presença e quem recebe camisa.
4. Ritmistas deve abrir em "Ativos" (proposto) ou em outro conjunto?
