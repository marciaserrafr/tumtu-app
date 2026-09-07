# TumTu — Regras abertas para revisão de design/usabilidade

> Documento pra passar pro Claude Design (ou qualquer avaliação externa de usabilidade/performance), junto com `docs/tumtu-design-guide.md`. Criado em 07/set/2026, a pedido da Márcia, separando do `CLAUDE.md` só o que é sobre usabilidade/visual/performance — sem misturar com regra de negócio, segurança ou fluxo de confiança, que não são assunto de design.

---

## O que está aberto a mudar

**1. Tela sempre montada por completo, nunca revelar aos poucos**

Hoje a regra é: nenhuma tela pode mostrar título/painel antes do conteúdo (lista, cards, números) — busca tudo primeiro, revela tudo de uma vez.

Contexto importante: essa regra nasceu depois de duas tentativas que ficaram ruins, não de um princípio geral contra conteúdo progressivo:
- Um spinner pequeno boiando dentro de um espaço vazio — pareceu quebrado.
- Um overlay preto cobrindo a tela inteira — pesado, sem necessidade aparente.

A Márcia está pensando em algo como **skeleton screen** (blocos cinza no formato exato do conteúdo final — título, linhas, cards — que "resolvem" pra virar o dado de verdade) por performance e usabilidade. Essa regra está aberta a mudar, mas o objetivo é não repetir as duas formas já testadas e rejeitadas.

**2. Hierarquia visual dos botões**

Hoje: botão de ação principal tem fundo sólido (escuro `#12101a` ou dourado `#D4AF37`); botões secundários são só borda, transparentes.

Aberto a repensar, desde que continue claro pro usuário qual botão é a ação principal da tela.

**3. Seções auxiliares devem ficar "simples"**

Hoje: sem chip, sem card aninhado, sem cor em excesso em seções secundárias (ex: "Vagas por Instrumento").

Aberto a mudar se melhorar a usabilidade.

**4. "O card do ritmista é o elemento mais importante da tela do Admin"**

Princípio de hierarquia de informação: tudo ao redor (filtros, vagas, seções extras) é secundário e deve ficar clean, sem poluir o card.

Aberto ao julgamento do Design, contanto que o ritmista continue sendo o foco visual da tela.

---

## Contexto técnico que ele precisa saber (não é preferência de design — é limitação real já comprovada)

- **`viewport-fit=cover`** (usar a área por trás do notch do iPhone) já quebrou a barra fixa de baixo do app 2-3 vezes em tentativas anteriores, por motivos técnicos diferentes cada vez. Se uma proposta depender disso, não é motivo pra descartar de cara — mas precisa de teste cuidadoso antes de aprovar, não é uma decisão só estética.
- **Performance de carregamento já teve uma rodada de melhoria real** (06/set/2026): 526KB de JavaScript que travava a pintura da tela foram extraídos pra arquivos separados com carregamento adiado, e uma fonte externa (Google Fonts) que atrasava a primeira pintura foi corrigida. Vale ele saber que isso já foi feito, pra não repetir sugestão.

---

## O que NÃO é assunto de design (fica de fora, não mandar pra ele opinar)

- Dimensão fixa da carteirinha (300×540px).
- Mestre / Diretor de Bateria / Diretor (Apoio) sempre como campos/checkboxes separados, nunca agrupados.
- Regras de segurança (RLS, permissões, auditoria).
- Regras de confiança/fluxo de trabalho (confirmar antes de publicar, nunca remover o que foi pedido sem perguntar) — isso é sobre como o trabalho é conduzido, não é uma decisão que o Design teria como opinar.
