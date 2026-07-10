# TumTu — Prompt de Implementação: Cadastro por Link Fixo + Segurança de Senha
## Contexto para o Claude Code

**Este prompt substitui integralmente dois prompts anteriores:**
`tumtu-prompt-implementacao-convite-admin.md` (02/jul/2026) e
`tumtu-prompt-implementacao-seguranca-convites.md` (03/jul/2026, nunca chegou
a ser executado). Ignore os dois — este documento é a versão final e
consolidada de tudo que foi decidido sobre cadastro de Admin, links e senha.

**Leia antes de começar:** `tumtu-visao-geral.md`, `tumtu-mvp.md` e
`tumtu-design-guide.md` (seções sobre Onboarding, Perfis de Usuário e Fluxo
de cadastro do Admin) — todos atualizados em 03/jul/2026 com o modelo final.

---

## SE VOCÊ JÁ IMPLEMENTOU ALGO DO PROMPT ANTERIOR, LEIA ISTO PRIMEIRO

O prompt anterior (`tumtu-prompt-implementacao-convite-admin.md`) descrevia um
modelo de **convite por token de uso único** (botão "Convidar Mestre" /
"Convidar Diretor" que gerava um link novo, descartável, por pessoa). **Esse
modelo foi abandonado.** Se você já implementou parte dele (tabela `convites`,
botões que geram token, tela de cadastro validando `?token=`), é necessário
desfazer:

- **Apague a tabela `convites`** (ou deixe de usá-la — não é mais necessária).
- **Troque os botões "Convidar Mestre" / "Convidar Diretor"** de uma ação que
  *gera* algo para uma tela que *exibe* um link fixo já existente (ver Fase 2).
- **Troque a validação de `?token=...`** na tela de cadastro por validação de
  `?bateria=...&cargo=...` (ver Fase 2).

O motivo da mudança: o modelo de token de uso único obrigava o Mestre a gerar
um link novo pra cada Diretor que ele quisesse convidar — na prática, as
diretorias de bateria já usam um único link de Google Forms pra chamar todo
mundo do grupo de uma vez, e o modelo anterior ia piorar esse processo, não
melhorar.

---

## PRINCÍPIO OBRIGATÓRIO — Um único formulário de cadastro

Ritmista, Mestre e Diretor têm exatamente os mesmos campos (dados pessoais,
endereço, medidas, contato de emergência, acesso). Por isso, **deve existir
um único componente de formulário de cadastro no código**, reutilizado nos
três pontos de entrada abaixo — nunca três arquivos/telas com o mesmo
conteúdo duplicado:

1. **Cadastro via link fixo público** (`?bateria=<id>`, sem `cargo`) — modo
   Ritmista. Hoje já existe como `cadastro.html`, mas precisa passar a exigir
   e ler o parâmetro `bateria` (ver Fase 2, isso corrige um problema real:
   hoje o cadastro público não sabe pra qual bateria a pessoa está se
   cadastrando, porque só existe uma bateria rodando).
2. **Cadastro via link fixo de Admin** (`?bateria=<id>&cargo=mestre` ou
   `?bateria=<id>&cargo=diretor`) — mesma tela/componente do item 1, só que
   com `cargo` também presente na URL. Quando há `cargo`, o componente trava
   os campos `cargo` e `bateria` (exibidos como texto, não como input) e, ao
   salvar, aplica `status = pendente`.
3. **Cadastro manual pelo Super Admin** ("Cadastrar Usuário") — mesmo
   componente, chamado a partir do painel em vez de uma URL pública. O Super
   Admin escolhe bateria + cargo antes de abrir o formulário; ao salvar,
   aplica `status = ativo` direto, sem link.

Ou seja: **um só formulário, três formas de chegar nele, três comportamentos
diferentes só no que acontece ao salvar** (público → pendente; link de Admin
→ pendente; manual → ativo direto). Qualquer mudança de campo (adicionar,
remover, validar diferente) deve ser feita em um lugar só. Se em algum
momento perceber que vai precisar duplicar HTML/JS do formulário para
atender um desses três casos, pare e resolva com parâmetros/condicionais
dentro do mesmo componente, não copiando o arquivo.

---

## FASE 1 — Modelo de dados

Não mexer em nenhuma tela ainda. Só modelo de dados.

1. Na tabela de Admins (Mestre/Diretor), adicionar (se ainda não existir):
   - `nivel_acesso` (texto/enum) — hoje só existe o valor `"total"`. Todo Admin
     (Mestre ou Diretor) recebe `"total"` por padrão. Este campo é **separado**
     do campo `cargo` (que continua sendo só "Mestre de Bateria" ou "Diretor",
     usado na carteirinha). Não crie lógica condicional em cima de
     `nivel_acesso` ainda além do necessário para a Fase 3 — é só para não
     termos que migrar dados quando o sistema de perfis granulares for
     construído no futuro.
   - `status`: `pendente`, `ativo`, `rejeitado` — mesmo padrão já usado para
     Ritmista.
   - `aprovado_por` (referência a quem aprovou: id de Super Admin ou de outro
     Admin) — campo simples de auditoria, sem tela dedicada a exibir isso
     ainda.

2. **Não é necessário criar tabela de convites.** Não há token, não há
   expiração, não há distinção "usado"/"não usado". O link de cadastro é
   construído em tempo real a partir do `id` da bateria (que já existe) mais
   o `cargo` desejado — não precisa ser persistido em lugar nenhum.

3. **Sem limite de quantidade** de Mestres, Diretores ou Ritmistas por
   bateria. Não crie nenhuma constraint de unicidade ou contagem — a
   aprovação (Fase 3) já é a única barreira necessária.

4. Confirme que a tabela de Ritmistas tem uma referência a `bateria_id` (para
   o cadastro público passar a gravar isso — hoje, rodando só com uma
   bateria, pode não ter sido necessário até agora).

---

## FASE 2 — Links fixos por bateria e autocadastro

1. **Painel do Super Admin**, dentro de cada bateria: seção "Links de
   cadastro" mostrando três links, cada um com botão "copiar":
   - Link de Ritmista: `.../cadastro.html?bateria=<id_da_bateria>`
   - Link de Mestre: `.../cadastro.html?bateria=<id_da_bateria>&cargo=mestre`
   - Link de Diretor: `.../cadastro.html?bateria=<id_da_bateria>&cargo=diretor`

   Esses links **já existem no momento em que a bateria é criada** — não há
   ação de "gerar". A tela só constrói a URL a partir do id da bateria e
   exibe. Texto de apoio: "Envie este link pelo WhatsApp — pode mandar pra
   quantas pessoas quiser, ele não expira e não é de uso único."

2. **Painel do Admin (visível apenas para quem tem `cargo = Mestre`)**: a
   mesma seção mostrando o link de Diretor da própria bateria (com botão
   copiar). Diretor não vê essa seção.

   O **Super Admin também deve conseguir ver o link de Diretor** de qualquer
   bateria, a partir do próprio painel — mesma permissão do Mestre, como
   redundância.

3. **Cadastro via link usa o mesmo componente de formulário do Ritmista**
   (ver "Princípio obrigatório" no topo deste documento). Ajustes necessários
   nesse componente:
   - Ler os parâmetros `bateria` (sempre obrigatório) e `cargo` (opcional —
     ausente = Ritmista) da URL.
   - Se `bateria` não corresponder a nenhuma bateria existente, mostrar erro
     claro ("Link inválido") e não deixar prosseguir.
   - Se `cargo` estiver presente (`mestre` ou `diretor`), travar esse campo e
     o campo bateria como texto informativo no topo do formulário ("Cadastro
     de Mestre da bateria [nome]"), não editáveis.
   - Campos do formulário continuam os mesmos de sempre (nome completo,
     apelido, CPF, data de nascimento, celular, e-mail, instrumento, membro
     desde, endereço completo, medidas, contato de emergência, senha +
     confirmar senha) — nada de campo extra específico de Admin.
   - Ao enviar: cria o registro com `bateria_id` preenchido, `status =
     pendente`, e `nivel_acesso = total` se for Admin (Mestre ou Diretor).
   - Mostra tela de confirmação: "Cadastro enviado! Aguarde a aprovação para
     acessar o painel/carteirinha."

4. **Remover** a tela/fluxo de "Complete seu perfil" que hoje aparece no
   primeiro login do Admin. Login de Admin com `status = pendente` deve
   mostrar mensagem ("Seu cadastro está em análise") em vez de deixar entrar
   ou redirecionar para completar cadastro.

---

## FASE 3 — Aprovação

1. **Painel do Super Admin:** lista de Admins com `status = pendente`,
   separando visualmente Mestres de Diretores. Botões "Aprovar" / "Rejeitar"
   para qualquer um dos dois, de qualquer bateria. Sem limite de quantidade —
   pode aprovar quantos Mestres ou Diretores quiser pra mesma bateria.

2. **Painel do Admin, aba "Diretoria":** hoje é só uma lista. Adicionar, ali
   mesmo, os Diretores com `status = pendente` da própria bateria, com
   botões "Aprovar" / "Rejeitar" — **visíveis apenas para quem tem
   `cargo = Mestre`**. Um Diretor logado não deve ver esses botões (só a
   lista, como já é hoje).

3. Regra de autorização a implementar (backend, não só esconder botão no
   front): só pode aprovar/rejeitar um Admin com `tipo = diretor` quem for
   Super Admin OU for Admin com `cargo = Mestre` da mesma `bateria_id`. Só
   Super Admin pode aprovar/rejeitar um Admin com `tipo = mestre`.

4. Ao aprovar: `status = ativo`, `aprovado_por = <id de quem aprovou>`. Ao
   rejeitar: `status = rejeitado` (mesmo padrão já usado para Ritmista
   rejeitado — não apagar o registro).

---

## FASE 4 — Cadastro manual (sem link) e ajustes finos

1. **Cadastro manual pelo Super Admin** — um único fluxo, "Cadastrar
   Usuário", em vez de um botão por cargo — pensando em cargos futuros
   (Diretor de Naipe, etc.), um cargo novo deve virar só uma opção a mais no
   seletor, não um botão/tela nova.
   - Botão único no painel do Super Admin: "Cadastrar Usuário".
   - Ao clicar: (1) escolhe a `bateria_id`; (2) escolhe o cargo num seletor:
     Ritmista, Mestre de Bateria ou Diretor.
   - O formulário que aparece em seguida é o **mesmo componente único** do
     Ritmista/link (ver "Princípio obrigatório"), só que aberto num terceiro
     modo, "manual" — nenhum formulário novo é criado.
   - O Super Admin preenche tudo em nome da pessoa, incluindo uma senha
     inicial.
   - Nesse modo, ao salvar: `status = ativo` direto (sem passar por
     aprovação) — quem preencheu já é a pessoa de confiança validando na
     hora.
   - Quando o cargo escolhido for Mestre ou Diretor, salvar também
     `nivel_acesso = total`, como em qualquer Admin.

2. **Cadastro manual pelo Mestre** — o Mestre pode cadastrar Ritmista
   manualmente (já previsto), com o mesmo `status = ativo` direto, mesma
   lógica do item 1. Mestre não cadastra outro Admin manualmente (Mestre ou
   Diretor) — isso é exclusivo do Super Admin.

3. Revisar todos os textos e telas afetadas contra o checklist da seção 12
   do `tumtu-design-guide.md` antes de considerar a fase concluída.

4. Atualizar a página de login: **nenhuma mudança de campo ou de navegação é
   necessária** — CPF ou e-mail continuam funcionando exatamente como hoje,
   para todos os perfis. Garanta apenas que um Admin com `status = pendente`
   ou `rejeitado` recebe mensagem clara ao tentar logar, em vez de erro
   genérico de senha incorreta.

---

## FASE 5 — Senha com hash

1. Adicionar a biblioteca `bcryptjs` ao projeto (via CDN, já que o stack é
   HTML/CSS/JS puro sem bundler — ex:
   `<script src="https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js"></script>`).

2. **No cadastro** (nos três modos do formulário único: público, link de
   Admin, manual): antes de salvar no banco, gerar o hash da senha digitada
   (`bcrypt.hashSync(senha, 10)`) e salvar esse hash no campo `senha` — nunca
   a senha em texto puro.

3. **No login:** buscar o registro pelo CPF ou e-mail, pegar o hash salvo no
   campo `senha`, e comparar com `bcrypt.compareSync(senhaDigitada, hashSalvo)`.
   Nunca comparar as strings diretamente (`senhaDigitada === senhaSalva` deixa
   de existir em todo o código).

4. **Em "Meu Perfil" / troca de senha** (onde já existir essa função): mesma
   regra — gerar hash antes de salvar, nunca guardar a senha nova em texto
   puro.

5. Confira que nenhuma tela do sistema exibe a senha de alguém em texto
   puro — nem nas listagens do Super Admin, nem na exportação Excel de
   ritmistas.

6. **Usuários de teste (fake) já cadastrados:** eles têm senha em texto plano
   salva antes dessa mudança, e não vão virar hash sozinhos. Não escreva
   script de migração para eles — oriente a apagar e recriar os cadastros de
   teste depois que esta fase estiver no ar. Isso deve ser mencionado no
   commit/PR desta fase como aviso para a Márcia, não decidido por você.

7. **Nota de transparência (não implementar, só documentar em comentário):**
   hash feito no navegador (client-side) é uma melhoria grande em relação a
   texto plano, mas não é o nível mais forte possível — o ideal de longo
   prazo é migrar a autenticação para o Supabase Auth nativo ou fazer o hash
   em uma Edge Function no servidor. Deixe um comentário no código citando
   isso como melhoria futura, não é para implementar agora.

---

## Não implementar nesta rodada (fora de escopo)

- **PWA** (transformar o TumTu em app instalável) — decisão registrada como
  prioridade alta nas pendências, mas é um prompt separado, com foco em
  manifest/ícones/service worker, não misturar com este.
- **Lógica de "Mestre principal"** para exibição na carteirinha (campo
  `mestreDeBateria` do `config-escola.js`) — quando há mais de um Mestre, o
  que aparece ali ainda não foi decidido. Fica pendente.
- **Revisão de fluxos de edição de dados/cadastros e de quais telas cada
  perfil pode visualizar** (Super Admin, Admin, Ritmista) — combinado como
  pauta de uma sessão de arquitetura separada. Não adiantar esse assunto por
  conta própria.
