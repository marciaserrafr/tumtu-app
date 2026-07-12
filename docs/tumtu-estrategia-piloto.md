# TumTu — Estratégia de Piloto (Carteirinha Beta)

> Documento separado da documentação principal do produto.
> O produto principal é o TumTu completo (sistema de gestão de baterias).
> Este documento registra a estratégia de entrada no mercado via carteirinha digital gratuita.

---

## 1. Visão geral

A carteirinha digital é a porta de entrada do TumTu — não um produto separado.

O objetivo do piloto beta é criar vínculo direto com o ritmista — o público mais importante e mais ignorado pelas ferramentas de gestão existentes. Todo sistema do mercado é feito para o Mestre e o Diretor. O TumTu começa pelo ritmista.

A carteirinha é gratuita para o ritmista. A escola já cobra muito dele (presença, dedicação, tempo). Dar a carteirinha de graça é um posicionamento estratégico, não uma concessão.

---

## 2. O que este piloto é e o que não é

**É:**
- Um experimento real com ritmistas reais
- A prova de conceito do TumTu com o público principal
- A base de dados inicial do sistema
- O argumento tangível para apresentar ao Mestre/Diretor depois

**Não é:**
- Um produto separado do TumTu
- Uma fonte de receita neste momento
- Um sistema com Mestre ou Diretor operando
- Um piloto com escola parceira formal

---

## 3. Operação — quem faz o quê

Neste piloto, a Márcia opera tudo como Super Admin.

**Decisão revista em 12/jul/2026 — sem importação de planilha do Forms, e sem envio individual de link pra cada ritmista.** O link fixo de cadastro (já existente, por bateria) é **público dentro do grupo** — a Márcia manda o link uma vez pro Mestre, que posta no grupo de WhatsApp dos ritmistas da bateria. Qualquer ritmista do grupo entra e se cadastra sozinho. **O ritmista preenche o cadastro inteiro do zero, do próprio punho, exatamente como no fluxo que já existe hoje** — nenhum dado é gravado no sistema antes da pessoa digitar. Isso resolve de vez a dúvida de LGPD que existia na primeira versão deste plano (não tem mais janela onde o CPF de alguém está no banco sem ela saber).

**Envio individual pelo WhatsApp só acontece para papéis únicos/poucos por bateria** — o link de cadastro do Mestre e o(s) link(s) de Diretor — não para a lista inteira de ritmistas.

**Fluxo de entrada do ritmista:**

1. A Márcia manda o link de cadastro da bateria (papel Ritmista) pro Mestre
2. O Mestre posta o link no grupo de WhatsApp dos ritmistas
3. O ritmista acessa, completa o cadastro sozinho (fluxo já existente) e fica com status **Pendente**
4. A Márcia revisa e aprova — status muda pra **Aprovado** ("Ativo" na linguagem do piloto)
5. O ritmista acessa a carteirinha digital

**Fluxo de entrada do Mestre/Diretor:** a Márcia manda o link de cadastro correspondente (papel Mestre ou Diretor) individualmente, pelo WhatsApp — só esses dois papéis, poucos por bateria, valem o envio direto.

**Quem aprova:** só a Márcia (Super Admin), mesmo para cadastros de Mestre/Diretor — ver seção 6 abaixo sobre por quê o Mestre não vai aprovar ninguém nesta fase.

---

## 4. Status do ritmista no piloto

Não foi criado nenhum status novo — o piloto usa exatamente os status que já existem no sistema (`pendente`/`aprovado`/etc.). Sem importação de planilha, não existe mais o caso "cadastro incompleto pré-preenchido" que motivava um status "Incompleto" — a pessoa só existe no sistema quando ela mesma preenche o próprio cadastro.

Não há cobrança neste piloto. O status Pendente aguarda revisão da Márcia, não confirmação de pagamento.

---

## 5. ~~Campos importados do Forms~~ (removido em 12/jul/2026)

Seção obsoleta — não há mais importação de planilha, ver seção 3.

---

## 6. Mestre e Diretor "congelados" durante o piloto

**Decisão de 12/jul/2026:** durante o piloto, Mestre e Diretor de uma bateria **podem se cadastrar e logar normalmente**, mas devem ver **só a própria carteirinha** — nada de painel administrativo. Quem aprova todo mundo (Ritmista, Mestre, Diretor) é só a Márcia como Super Admin. A ideia é "congelar" a atuação do Mestre/Diretor por enquanto, sem impedir que a conta dele já exista pronta pra quando a bateria virar cliente de verdade do sistema completo — nesse momento, é só "descongelar" e ele passa a usar o painel normalmente, sem nenhuma migração de dados.

**Como isso será implementado (arquitetura confirmada, ainda não codificado):** uma trava por bateria (`modo_piloto`) que muda só o redirecionamento pós-login — Mestre/Diretor de uma bateria com a trava ligada caem na carteirinha em vez do painel de admin, exatamente como um Ritmista. Não mexe em permissão de banco (RLS) nem no painel em si — é reversível a qualquer momento, sem migração.

---

## 7. Aba Beta no super-admin

Simplificada em 12/jul/2026 (sem importação de planilha):

- Lista de ritmistas por bateria com status (Pendente / Aprovado)
- Aprovação manual pela Márcia
- Contador de carteirinhas ativas por bateria e temporada

---

## 8. Carteirinha digital — visual

### Princípio

Toda escola terá a mesma estrutura de carteirinha. O que varia são as cores e o logo. Nenhum CSS personalizado vindo de fora — o piloto usa um formato base configurável.

### Fundo

**Sempre branco** — para todas as escolas, independente de suas cores. Resolve o problema de combinações pesadas (ex: São Clemente amarelo e preto, Unidos da Tijuca azul e amarelo).

### Cores

Cada escola tem obrigatoriamente **2 cores**, podendo ter **3**.

O dourado TumTu (#D4AF37) está sempre presente nos detalhes — independente de a escola ter 2 ou 3 cores.

| Escola com 2 cores | Escola com 3 cores |
|---|---|
| Cor 1 + Cor 2 da escola nos elementos | Cor 1 + Cor 2 + Cor 3 da escola nos elementos |
| Dourado TumTu nos detalhes | Dourado TumTu nos detalhes |

Isso gera duas variações de layout da carteirinha — uma para 2 cores e outra para 3. A definição de onde cada cor é aplicada (header, anel da foto, rodapé, elementos decorativos etc.) será trabalhada com apoio de skill de design/UX em sessão dedicada, depois confirmada pelo Claude Design.

### Carteirinha base TumTu

Quando nenhuma escola está cadastrada, a carteirinha nasce com as cores TumTu (#12101a + #D4AF37). É como se o TumTu fosse uma "escola" com suas próprias cores. Alterar para as cores da escola é sempre uma ação explícita do Super Admin.

### O que é cadastrado por escola/bateria

- Nome da escola
- Nome da bateria
- Logo da escola (real ou círculo vazio com borda dourada)
- Logo da bateria (se houver separado)
- Cor 1, Cor 2, Cor 3 (opcional)

Esses dados alimentam o `config-escola.js` — nunca ficam hard-coded no código.

### Logo da escola na carteirinha

- **Frente:** canto inferior direito — círculo com logo real, ou círculo vazio com borda dourada se não configurada
- **Verso:** canto direito do header — mesma regra
- Logo deve ter destaque visual adequado — tamanho que permita reconhecimento, sem dominar o layout
- NUNCA colocar sigla de texto no lugar da logo — o círculo ou tem a imagem real ou fica vazio com borda dourada

---

## 9. Receita

Neste piloto, **não há cobrança ao ritmista.**

A questão de monetização da carteirinha poderá ser revisitada no próximo ano, com base no aprendizado do piloto. A decisão foi tomada por princípio: o ritmista já contribui muito com a escola sem remuneração — cobrar pela carteirinha seria transferir custo para quem menos deve arcar com ele.

A receita do TumTu virá do sistema de gestão completo, cobrado da escola/Diretoria após o período de piloto gratuito.

---

## 10. Acordo com o Mestre/Diretor (fase seguinte ao beta)

Após o piloto de carteirinha com ritmistas reais, a conversa com o Mestre/Diretor acontece com evidência concreta na mão.

**O que a Márcia oferece:**
- Sistema de gestão completo (TumTu) gratuito por 1 ano
- Ritmistas já cadastrados no sistema com carteirinha ativa

**O que a bateria oferece:**
- Autorização para uso como bateria piloto
- Cooperação durante o período de testes

O acordo é com o Mestre ou Diretor — não com a escola como instituição. A conversa começa de forma informal, como parceria entre pessoas do meio.

---

## 11. Precificação futura do sistema completo

Após o primeiro ano de uso real, a conversa de precificação do sistema começa — com dados reais de uso para embasar o valor. O decisor de pagamento nessa fase é o Mestre/Diretor ou a escola, não o ritmista.

**Decisão:** não discutir precificação do sistema antes de ter pelo menos 1 ano de uso real. Infraestrutura atual (Supabase free tier) não gera custo que justifique pressão de preço na fase piloto.

---

## 12. O que este modelo constrói

- Base real de ritmistas no sistema
- Vínculo direto com o público principal da bateria
- Prova de conceito viva para apresentar ao Mestre/Diretor
- Dados reais para embasar decisões de produto
- Argumento concreto para conversas com baterias parceiras

Os dados dos ritmistas do piloto já entram nas mesmas tabelas do Supabase do TumTu completo. Não há migração futura — quando a bateria entrar no sistema completo, os ritmistas já estão lá.

---

## 13. O que este modelo não é

- Não é um produto separado do TumTu
- Não é uma fonte de receita neste momento
- Não substitui o sistema de gestão completo como produto principal
- A carteirinha não será vendida isoladamente para qualquer bateria — só para baterias que a Márcia quer como clientes do TumTu completo

---

## 14. 🚧 Problema crítico descoberto em 12/jul/2026 — ritmista em mais de uma bateria

**Bloqueia o início do envio de links pelo WhatsApp até ser resolvido.**

A Márcia percebeu (conversando com um amigo, fora de uma sessão de trabalho) que nunca discutimos o caso de uma pessoa que desfila em mais de uma bateria — o próprio caso dela. Ela avalia que isso é **comum**, não raro ("raro é ter um ritmista que desfile em uma escola só").

**Testado e confirmado em 12/jul/2026:** hoje, se uma pessoa já cadastrada em uma bateria tenta se cadastrar de novo em outra bateria com o mesmo e-mail, o Supabase Auth recusa na hora (`user_already_exists`, erro 422) — a segunda bateria simplesmente não consegue completar o cadastro.

**Causa raiz:** o desenho atual junta duas coisas numa linha só da tabela `ritmistas` — quem é a pessoa (nome, CPF, endereço, contato de emergência) e o vínculo dela com uma bateria específica (qual bateria, qual cargo, qual instrumento, status de aprovação). Cada conta de login (`auth_user_id`) só pode estar ligada a uma linha — logo, o sistema hoje assume "1 pessoa = 1 bateria" sem ter sido essa a intenção original.

**Decisão da Márcia (12/jul/2026): resolver certo agora, antes de começar o piloto de verdade**, mesmo sendo uma mudança grande — não vale a pena mandar links por WhatsApp com um problema de arquitetura conhecido embaixo.

**Direção acordada** (arquitetura completa sendo desenhada num plano técnico à parte, ainda não implementado):
- Separar "pessoa" (dados que não mudam entre baterias — nome, CPF, endereço, contato de emergência, foto, medidas) de "vínculo" (dados que variam por bateria — cargo, status, instrumento, data que entrou naquela bateria específica). Uma pessoa passa a poder ter vários vínculos, um por bateria, todos ligados ao mesmo login.
- **Login, "esqueci minha senha" e a edição de dados próprios continuam exatamente como estão** — são coisas da pessoa, não da bateria, não precisam de nenhum retrabalho.
- Ao logar, se a pessoa só tem um vínculo (caso mais comum), cai direto na carteirinha, sem fricção. Se tiver mais de um, escolhe qual bateria/carteirinha quer ver antes.

Ver plano técnico detalhado (fases, ordem de execução, o que muda em cada tela) assim que estiver pronto — referência a adicionar aqui quando o plano for salvo.
