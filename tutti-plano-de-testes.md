# TumTu — Plano de Testes
> Documento vivo, criado em 03/jul/2026 para abrir uma sessão dedicada a testes,
> antes de qualquer cadastro real entrar em produção.

---

## Contexto

Este documento organiza os testes necessários antes de ir para produção,
depois das mudanças de arquitetura decididas em 02–03/jul/2026 (link fixo por
bateria, aprovação, cadastro manual, senha em hash — ver
`tumtu-prompt-implementacao-cadastro-final.md`). Ele cobre quatro camadas
diferentes, cada uma com propósito e ordem de execução próprios:

1. Ambiente de teste (staging)
2. Testes automatizados (Claude Code)
3. Testes manuais da Márcia (computador + celular)
4. Testes com pessoas reais (Mestre, Diretor, Ritmista)

**Ordem recomendada:** 1 → 2 → 3 → 4, mas a etapa 1 (montar staging) só é obrigatória **antes da etapa 4** (pessoas reais testando) — enquanto os testes forem só com dado fake (escola, bateria e usuários fictícios), pode seguir em produção. Ver critério detalhado na seção 1.

---

## 1. Ambiente de teste (staging) — quando montar

**Decisão (03/jul/2026): por enquanto, continuar desenvolvendo e testando em produção.** Não é necessário montar o ambiente de staging agora.

- Hoje, todos os dados usados em teste são fake — inclusive escola e bateria (ex: "Escola Teste" / "Bateria Teste", não vinculado à Swing da Leopoldina/Imperatriz enquanto não houver decisão de parceria real). Nesse cenário, testar direto em produção é aceitável, desde que nenhum dado real (de escola, bateria ou pessoa) seja usado.
- **O ambiente de staging se torna necessário no momento em que amigos/conhecidos forem convidados a testar (Camada 4 abaixo).** A partir desse ponto, mesmo usando escola/bateria fake, essas pessoas vão digitar **dados pessoais reais delas** (CPF, celular, endereço) — isso deixa de ser "tudo fake" e passa a justificar o isolamento.

**Quando chegar a hora de montar (antes de qualquer teste com pessoa real):**
- [ ] Criar um **segundo projeto Supabase**, gratuito, dedicado a teste
  (o plano gratuito permite 2 projetos ativos ao mesmo tempo, sem custo).
- [ ] Replicar o schema (tabelas, campos) do banco de produção nesse projeto
  de teste — sem copiar dado real, só a estrutura.
- [ ] Criar um segundo deploy (branch de preview na Vercel, ou projeto
  separado) apontando para esse Supabase de teste.
- [ ] Popular esse ambiente com usuários fake (Ritmista, Mestre, Diretor,
  Super Admin) para uso nos testes das seções 2–3 antes de chamar as pessoas reais da seção 4.
- [ ] **Atenção:** projetos gratuitos do Supabase pausam sozinhos após 7 dias
  sem uso — se for testar depois de um tempo parado, "acordar" o projeto no
  painel do Supabase antes de começar.
- [ ] Definir como o time (você + testadores reais da seção 4) vai acessar
  esse ambiente — provavelmente uma URL diferente da de produção, deixada
  clara para não confundir com o sistema real.
- [ ] Pedir ao Claude Code um **script de reset do ambiente de teste** — um
  comando único que apaga os registros fake existentes e recria o conjunto
  padrão detalhado abaixo — evita limpeza manual repetitiva entre rodadas de
  teste.

### Conjunto de dados fake do reset (decidido em 03/jul/2026)

Este é o conjunto que a Márcia vai pedir ao Claude Code para criar assim que
ele terminar de implementar o `tumtu-prompt-implementacao-cadastro-final.md`
— nesse momento ainda em produção, já que continua tudo fake (ver seção 1).
O mesmo conjunto serve de referência para o script de reset do staging,
quando ele for montado mais adiante.

**Por que duas escolas, não uma:** várias regras são "por bateria" (Mestre só
aprova Diretor da própria bateria, só vê o link de Diretor da própria
bateria). Com uma escola/bateria só, nunca se testa se essa fronteira é
respeitada de verdade — por exemplo, se um Mestre da Bateria 1 consegue,
por engano, aprovar um Diretor da Bateria 2. Como cada escola tem uma
bateria, isso significa criar **2 escolas fake**, cada uma com sua bateria.

**1 Super Admin** (a própria Márcia, ou um fake dedicado a teste).

**Escola Fake 1 / Bateria Fake 1:**
| Cargo | Status | Observação |
|---|---|---|
| Mestre 1 | ativo | usado para aprovar Diretores da própria bateria |
| Mestre 2 | pendente | testa a aprovação do Mestre pelo Super Admin; também prova que a bateria aceita mais de um Mestre |
| Diretor 1 | ativo | testa permissões normais de Diretor |
| Diretor 2 | pendente | usado pelo Mestre 1 para testar aprovação |
| Diretor 3 | rejeitado | testa login bloqueado por rejeição |
| Ritmista — Tamborim | ativo | |
| Ritmista — Caixa | pendente | |
| Ritmista — Repique | rejeitado | |
| Ritmista — Cuíca | suspenso | |
| Ritmista — Surdo | desligado | |
| Ritmista — Agogô | ativo, **menor de idade** | testa o badge "Menor de idade" junto com status normal |

**Escola Fake 2 / Bateria Fake 2:**
| Cargo | Status | Observação |
|---|---|---|
| Mestre 3 | ativo | usado no teste cruzado: tentar aprovar o Diretor 2 (Bateria 1) deve ser bloqueado; aprovar o Diretor 4 (própria bateria) deve funcionar |
| Diretor 4 | pendente | usado no teste cruzado acima |
| Ritmista — Chocalho | ativo | |
| Ritmista — Reco-reco | pendente | |

**Cobertura garantida por esse conjunto:**
- Todo instrumento aparece pelo menos uma vez (Tamborim, Caixa, Repique, Cuíca, Surdo, Agogô, Chocalho, Reco-reco) — ajuste a lista para os instrumentos reais que o TumTu usa, se forem diferentes.
- Todo status de Ritmista aparece pelo menos uma vez (ativo, pendente, rejeitado, suspenso, desligado).
- Todo status de Admin aparece pelo menos uma vez (ativo, pendente, rejeitado).
- Mais de um Mestre na mesma bateria (Bateria 1).
- Teste cruzado de aprovação entre baterias diferentes (Mestre 1 não pode aprovar Diretor 4; Mestre 3 não pode aprovar Diretor 2).
- Um caso de "menor de idade" para validar o badge correspondente.

---

## 2. Testes automatizados (Claude Code)

**Objetivo:** cobrir os fluxos críticos com testes que possam rodar de novo
a cada mudança futura, pegando regressão cedo.

Peça ao Claude Code para escrever testes automatizados cobrindo, no mínimo,
os casos abaixo (agrupados pelas fases do
`tumtu-prompt-implementacao-cadastro-final.md`):

**Cadastro via link fixo:**
- [ ] Cadastro de Ritmista pelo link público da bateria → registro criado com `status = pendente`
- [ ] Cadastro de Mestre pelo link `?bateria=&cargo=mestre` → cargo e bateria vêm travados, `status = pendente`
- [ ] Cadastro de Diretor pelo link `?bateria=&cargo=diretor` → idem
- [ ] Link com `bateria` inexistente → erro claro, não deixa prosseguir
- [ ] Reenvio do mesmo link para pessoas diferentes → cada uma consegue se cadastrar (link não "gasta")

**Aprovação:**
- [ ] Super Admin aprova Mestre pendente → `status = ativo`, `aprovado_por` preenchido
- [ ] Mestre aprova Diretor pendente da própria bateria → `status = ativo`
- [ ] Diretor tenta aprovar outro Diretor → deve ser bloqueado (regra: só Mestre ou Super Admin aprovam Diretor)
- [ ] Mestre tenta aprovar Diretor de **outra** bateria → deve ser bloqueado
- [ ] Super Admin aprova Diretor de qualquer bateria → permitido (rede de segurança)
- [ ] Rejeição de cadastro pendente (Mestre, Diretor, Ritmista) → `status = rejeitado`, registro não é apagado

**Cadastro manual ("Cadastrar Usuário"):**
- [ ] Super Admin cadastra Ritmista manualmente → `status = ativo` direto
- [ ] Super Admin cadastra Mestre manualmente → `status = ativo` direto, `nivel_acesso = total`
- [ ] Super Admin cadastra Diretor manualmente → idem
- [ ] Mestre cadastra Ritmista manualmente → `status = ativo` direto
- [ ] Mestre tenta cadastrar Diretor manualmente → deve ser bloqueado (exclusivo do Super Admin)

**Login e senha:**
- [ ] Cadastro salva senha como hash (bcrypt), nunca texto puro
- [ ] Login com senha correta → sucesso
- [ ] Login com senha incorreta → falha, mensagem genérica seja qual for o motivo
- [ ] Login de Admin com `status = pendente` → mensagem "cadastro em análise", não deixa entrar
- [ ] Login de Admin com `status = rejeitado` → mensagem clara, não deixa entrar
- [ ] Login funciona tanto por CPF quanto por e-mail, nos três perfis

**Permissões e visibilidade:**
- [ ] Diretor não vê o botão/seção de link de convite de Diretor no painel
- [ ] Mestre vê o link de Diretor da própria bateria
- [ ] Super Admin vê o link de Diretor de qualquer bateria
- [ ] "Acessar como Admin" abre o painel correto sem exigir novo login

---

## 3. Testes manuais da Márcia (computador + celular)

**Objetivo:** cobrir o que teste automatizado não enxerga bem — aparência,
responsividade, sensação de uso.

Sugestão de checklist cruzando perfil × dispositivo:

| | Super Admin | Admin (Mestre) | Admin (Diretor) | Ritmista |
|---|---|---|---|---|
| **Desktop** | [ ] Painel completo, links de cadastro visíveis e copiáveis | [ ] Painel, aprovação de Diretor, link de Diretor visível | [ ] Painel, sem botão de convite/aprovação de Diretor | [ ] Cadastro público + carteirinha |
| **Celular** | [ ] Painel responsivo, cópia de link funciona no mobile | [ ] Idem | [ ] Idem | [ ] Cadastro (tela mobile já é o padrão) + carteirinha |

Pontos extras a observar no celular, já pensando no PWA futuro:
- [ ] Copiar link funciona bem no navegador mobile (Chrome/Safari)
- [ ] Formulário de cadastro não quebra em telas pequenas
- [ ] Carteirinha renderiza bem em tela de celular (é o uso real mais comum)

---

## 4. Testes com pessoas reais (Mestre, Diretor, Ritmista)

**Objetivo:** validar a experiência com quem não é técnico. Mantido enxuto,
de propósito — roteiro simples, sem jargão.

**Pré-requisito: o ambiente de staging (seção 1) precisa estar montado antes de chamar qualquer pessoa real** — a partir do momento em que alguém de fora digita dado pessoal de verdade (CPF, celular, endereço), mesmo em escola/bateria fake, deixa de fazer sentido rodar em produção.

**Observação importante:** este teste pode servir de ensaio para o requisito
futuro do Google Play (mínimo de 12 testadores reais por 14 dias, caso um dia
o TumTu vá para loja) — vale já conduzir com esse padrão em mente, mesmo que
o objetivo imediato seja só validar o MVP.

### Roteiro para um Mestre de teste
1. Você vai receber um link pelo WhatsApp. Abra ele no seu celular.
2. Preencha o cadastro com seus dados (pode usar dado real ou fictício, combine antes).
3. Crie uma senha e confirme.
4. Envie o cadastro. Você deve ver uma mensagem dizendo que está aguardando aprovação.
5. Aguarde eu (Márcia) aprovar. Tente logar de novo depois — deve funcionar.
6. Depois de aprovado: procure a seção de "Convidar Diretor" no seu painel. Me avise se achou fácil ou difícil.

### Roteiro para um Diretor de teste
1. Você vai receber o mesmo link que o Mestre vai mandar pro grupo. Abra ele.
2. Preencha o cadastro, como o Mestre fez.
3. Aguarde aprovação (pelo Mestre ou pela Márcia).
4. Depois de aprovado: veja se consegue visualizar e editar os ritmistas.

### Roteiro para um Ritmista de teste
1. Você vai receber o link público da bateria. Abra ele.
2. Preencha seu cadastro completo (dados pessoais, contato de emergência, medidas).
3. Aguarde aprovação.
4. Depois de aprovado: veja sua carteirinha digital. Ela abre bem no seu celular? O QR code aparece?

**Perguntas de feedback pra pedir a todos, no final:**
- Alguma parte do cadastro foi confusa ou grande demais?
- Você entendeu o que precisava fazer sem eu explicar por fora?
- Algo travou, deu erro, ou demorou muito?

---

## Fora de escopo deste documento

- Testes de carga/performance (não é prioridade nesta fase do projeto)
- Testes de segurança formais (pentest) — o hash de senha (Fase 5 do prompt
  de cadastro) já é o ajuste de segurança prioritário neste momento
- Automação de teste de PWA (ainda não implementado)
