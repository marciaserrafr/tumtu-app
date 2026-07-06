# TumTu — Prompt de Implementação: Segurança de Senha e Convites
## Contexto para o Claude Code

Decisão de arquitetura tomada em 03/jul/2026, complementar ao
`tumtu-prompt-implementacao-convite-admin.md` (fluxo de convite + autocadastro
de Admin já decidido em 02/jul/2026). Leia os três documentos de produto
(`tumtu-visao-geral.md`, `tumtu-mvp.md`, `tumtu-design-guide.md`) antes de
começar.

Este prompt resolve pendências de segurança e regras de negócio identificadas
depois do desenho do fluxo de convites:

1. Senha armazenada em texto plano
2. Convite sem prazo de validade
3. Quantidade de Mestres por bateria — **decisão final em 03/jul/2026:** uma
   bateria pode ter mais de um Mestre (pessoas diferentes), com um **limite
   de 3 Mestres ativos por bateria**. Sem restrição na geração do convite;
   o limite é checado só na aprovação (ou no cadastro manual, que já nasce
   ativo). A Fase C abaixo detalha isso.

Rode as fases abaixo em commits separados, nessa ordem.

---

## FASE A — Senha com hash

1. Adicionar a biblioteca `bcryptjs` ao projeto (via CDN, já que o stack é
   HTML/CSS/JS puro sem bundler — ex:
   `<script src="https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js"></script>`).

2. **No cadastro** (nos três modos: público, convite, manual — lembrando que
   é um único componente de formulário, ver princípio no prompt anterior):
   antes de salvar no banco, gerar o hash da senha digitada
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

## FASE B — Expiração de convite

1. Na tabela `convites`, adicionar o campo `expira_em` (timestamp).

2. Ao gerar qualquer convite (Mestre ou Diretor, por Super Admin ou Mestre):
   preencher `expira_em` = data de criação + 7 dias corridos. Deixe esse
   número (7) como uma constante nomeada fácil de achar e mudar
   (ex: `DIAS_VALIDADE_CONVITE = 7`), a Márcia pode querer ajustar esse
   prazo depois sem depender de você reescrever a lógica.

3. Ao abrir a tela de cadastro via `?token=...`, além de checar `usado =
   true`, checar também se `agora > expira_em`. Se estiver expirado, mostrar
   mensagem clara e diferente da de "já usado": "Este convite expirou. Peça
   para gerar um novo." — não deixa prosseguir em nenhum dos dois casos.

4. Não é necessário implementar nenhuma notificação automática de
   expiração (e-mail, WhatsApp) — fora de escopo aqui.

---

## FASE C — Convite de Mestre (correção: baterias podem ter mais de um Mestre, com limite de 3)

**Atenção: esta fase muda em relação ao que foi decidido antes.** A premissa
original era "só pode existir um Mestre por bateria" — isso está incorreto.
Algumas baterias têm mais de um Mestre (duas ou até três pessoas diferentes,
mesmo cargo — casos com 3 existem, mas são raríssimos). A regra final é:
**sem restrição na geração de convite, com limite de 3 Mestres ativos por
bateria, checado na aprovação.**

1. **Convite de Mestre se comporta exatamente como convite de Diretor**:
   pode existir qualquer quantidade de convites de Mestre pendentes
   (`usado = false`, não expirados) para a mesma bateria ao mesmo tempo. Não
   crie nenhuma checagem de "já existe um convite ativo" para `tipo = mestre`,
   nem nenhum limite na hora de gerar o link.

2. `cargo = Mestre` não é único por bateria no modelo de dados — pode haver
   mais de um Admin ativo com `cargo = Mestre` para a mesma `bateria_id`. Não
   adicione nenhuma constraint de unicidade nesse sentido.

3. **Limite de 3 Mestres ativos por bateria — checagem na aprovação, não no
   convite:**
   - Antes de aprovar um Admin com `tipo = mestre` (seja pelo Super Admin
     aprovando um cadastro vindo de convite, seja pelo cadastro manual
     "Cadastrar Usuário" com cargo = Mestre, que já nasce ativo direto), o
     sistema deve contar quantos Admins com `cargo = Mestre` e `status =
     ativo` já existem para aquela `bateria_id`.
   - Se já houver 3, bloquear a ação (tanto o botão "Aprovar" quanto o envio
     do formulário de cadastro manual) e mostrar mensagem clara: "Esta
     bateria já tem o máximo de 3 Mestres ativos. Rejeite ou desative um
     Mestre existente antes de aprovar um novo."
   - Essa validação deve existir tanto no front (desabilitar o botão/mostrar
     aviso) quanto no back (não confiar só na interface).
   - Rejeitar um cadastro pendente de Mestre nunca é bloqueado por esse
     limite — só a aprovação/ativação é.

4. Nenhum impacto nas regras já implementadas: qualquer Admin com
   `cargo = Mestre` daquela bateria (não importa quantos existam, até o
   limite de 3) pode gerar convite de Diretor e aprovar cadastro de Diretor
   da própria bateria.

5. **Não implementar nesta fase:** qualquer lógica de "Mestre principal"
   para exibição na carteirinha (campo `mestreDeBateria` do
   `config-escola.js`, usado no verso da carteirinha) — quando há mais de um
   Mestre, o que aparece ali ainda não foi decidido. Fica registrado como
   pendência futura, não é para resolver agora.

---

## Observação para a próxima sessão de arquitetura

A Márcia sinalizou que, depois desta implementação, o próximo assunto a
fechar é uma revisão completa de:
- todos os fluxos de **edição de dados/cadastros** (quem pode editar o quê,
  de quem); e
- **quais telas cada perfil pode visualizar** (Super Admin, Admin, Ritmista).

Não adiante essa discussão neste prompt — é assunto de uma conversa de
arquitetura separada, ainda não desenhada.
