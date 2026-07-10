# TumTu — Prompt de Implementação: Cadastro de Admin por Convite
## Contexto para o Claude Code

Decisão de arquitetura tomada em 02/jul/2026, documentada em `tumtu-visao-geral.md`,
`tumtu-mvp.md` e `tumtu-design-guide.md` (seções atualizadas: Onboarding, Perfis de
Usuário, Fluxo de cadastro do Admin). Leia esses três arquivos antes de começar
qualquer fase abaixo.

**Resumo da mudança:** hoje o Super Admin cria o acesso do Admin (Mestre/Diretor)
manualmente com senha = CPF, e o Admin completa o cadastro num segundo momento,
depois do primeiro login. Isso vai ser substituído por um fluxo de **convite por
link + autocadastro + aprovação**, no mesmo espírito do cadastro do Ritmista.
Não há código curto nem qualquer mudança na tela de login — quem não recebe o
link pelo WhatsApp é cadastrado manualmente pelo Super Admin (para os três
perfis: Ritmista, Mestre ou Diretor), entrando direto como ativo.

Recomendo rodar as 4 fases abaixo em conversas/commits separados, nessa ordem,
revisando o resultado de cada uma antes de seguir para a próxima.

---

## PRINCÍPIO OBRIGATÓRIO — Um único formulário de cadastro

Ritmista, Mestre e Diretor têm exatamente os mesmos campos (dados pessoais,
endereço, medidas, contato de emergência, acesso). Por isso, **deve existir
um único componente de formulário de cadastro no código**, reutilizado nos
três pontos de entrada abaixo — nunca três arquivos/telas com o mesmo
conteúdo duplicado:

1. **Cadastro público do Ritmista** — hoje já existe (`cadastro.html`).
2. **Cadastro via convite** (Mestre/Diretor) — mesma tela/componente do item 1,
   só que carregada com `?token=...`. Quando há token, o componente busca o
   convite, trava os campos `cargo` e `bateria` (exibidos como texto, não como
   input) e, ao salvar, aplica `status = pendente` + marca o convite como usado.
3. **Cadastro manual pelo Super Admin** ("Cadastrar Usuário") — mesmo
   componente, chamado a partir do painel em vez de uma URL pública. O Super
   Admin escolhe bateria + cargo antes de abrir o formulário; ao salvar,
   aplica `status = ativo` direto, sem convite.

Ou seja: **um só formulário, três formas de chegar nele, três comportamentos
diferentes só no que acontece ao salvar** (público → pendente; convite →
pendente + marca convite usado; manual → ativo direto). Qualquer mudança de
campo (adicionar, remover, validar diferente) deve ser feita em um lugar só.
Se em algum momento perceber que vai precisar duplicar HTML/JS do formulário
para atender um desses três casos, pare e resolva com parâmetros/condicionais
dentro do mesmo componente, não copiando o arquivo.

---

## FASE 1 — Modelo de dados

Não mexer em nenhuma tela ainda. Só modelo de dados.

1. Na tabela de Admins (Mestre/Diretor), adicionar:
   - `nivel_acesso` (texto/enum) — hoje só existe o valor `"total"`. Todo Admin
     (Mestre ou Diretor) recebe `"total"` por padrão. Este campo é **separado**
     do campo `cargo` (que continua sendo só "Mestre de Bateria" ou "Diretor",
     usado na carteirinha). Não crie lógica condicional em cima de `nivel_acesso`
     ainda além do necessário para a Fase 3 — é só para não termos que migrar
     dados quando o sistema de perfis granulares for construído no futuro.
   - `status` (se ainda não existir para Admin): `pendente`, `ativo`, `rejeitado`
     — mesmo padrão já usado para Ritmista.
   - `aprovado_por` (referência a quem aprovou: id de Super Admin ou de outro Admin) —
     campo simples de auditoria, sem tela dedicada a exibir isso ainda.

2. Criar tabela `convites`:
   - `id`
   - `tipo` (`mestre` | `diretor`)
   - `bateria_id` (referência à bateria à qual o convite pertence)
   - `cargo` (o cargo que será atribuído a quem usar o convite: "Mestre de Bateria"
     ou "Diretor" — travado, não editável pelo formulário de cadastro)
   - `token` (string longa, usada na URL do link, ex: `/cadastro-admin?token=...`)
   - `usado` (boolean, default false)
   - `usado_por` (referência ao Admin criado a partir desse convite, quando `usado = true`)
   - `criado_por` (id de quem gerou: Super Admin ou Mestre)
   - `criado_em`

   O convite é entregue só por link (copiado e enviado pelo WhatsApp) — não há
   código curto digitável nem qualquer mudança na tela de login. Quem não tem
   como usar o link é cadastrado manualmente (ver Fase 4), não por uma segunda
   via de convite.

   Não implemente expiração de convite nesta fase — deixe simples (convite válido
   até ser usado). Se quiser sugerir expiração como melhoria futura, anote como
   comentário no código, não implemente.

3. Não altere ainda nenhuma tela de cadastro, login ou painel. Fase só de schema.

---

## FASE 2 — Geração de convite e autocadastro do Admin

1. **Painel do Super Admin**, dentro de cada bateria: botão "Convidar Mestre".
   Ao clicar, gera um registro em `convites` (`tipo = mestre`, `cargo = "Mestre
   de Bateria"`, `bateria_id` = a bateria atual) e mostra na tela:
   - o link completo (com botão "copiar link")
   - texto de apoio: "Envie este link para o Mestre pelo WhatsApp da diretoria."

2. **Painel do Admin (visível apenas para quem tem `cargo = Mestre`)**: mesmo
   botão "Convidar Diretor", mesma lógica, mas `tipo = diretor`, `cargo =
   "Diretor"`, `bateria_id` = a bateria do próprio Mestre logado. Diretor não
   vê esse botão.

   O **Super Admin também deve conseguir gerar convite de Diretor** para
   qualquer bateria, a partir do próprio painel — mesma permissão do Mestre,
   como redundância.

3. **Cadastro via convite usa o mesmo componente de formulário do Ritmista**
   (ver "Princípio obrigatório" no topo deste documento) — não crie uma tela
   nova do zero. Ajustes necessários nesse componente para suportar o modo
   "convite":
   - Quando a URL tiver `?token=...`, o componente busca o convite. Se não
     existir ou já estiver `usado = true`, mostra mensagem de erro clara
     ("Este convite já foi usado ou não é válido") e não deixa prosseguir.
   - Nesse modo, cargo e bateria vêm do convite e **não aparecem como campo
     editável** — podem aparecer como texto informativo no topo do formulário
     ("Cadastro de Mestre da bateria [nome]"), mas travados.
   - Campos do formulário continuam os mesmos de sempre (nome completo,
     apelido, CPF, data de nascimento, celular, e-mail, instrumento, membro
     desde, endereço completo, medidas, contato de emergência, senha +
     confirmar senha) — nada de campo extra específico de Admin.
   - Ao enviar nesse modo: cria o registro com `status = pendente`,
     `nivel_acesso = total` (se for Admin), marca o convite como `usado =
     true` e `usado_por = <id criado>`.
   - Mostra tela de confirmação: "Cadastro enviado! Aguarde a aprovação para
     acessar o painel."

4. **Remover** a tela/fluxo de "Complete seu perfil" que hoje aparece no
   primeiro login do Admin. Login de Admin com `status = pendente` deve
   mostrar mensagem ("Seu cadastro está em análise") em vez de deixar entrar
   ou redirecionar para completar cadastro.

---

## FASE 3 — Aprovação

1. **Painel do Super Admin:** lista de Admins com `status = pendente`,
   separando visualmente Mestres de Diretores. Botões "Aprovar" / "Rejeitar"
   para qualquer um dos dois, de qualquer bateria.

2. **Painel do Admin, aba "Diretoria":** hoje é só uma lista. Adicionar, ali
   mesmo, os Diretores com `status = pendente` da própria bateria, com botões
   "Aprovar" / "Rejeitar" — **visíveis apenas para quem tem `cargo = Mestre`**.
   Um Diretor logado não deve ver esses botões (só a lista, como já é hoje).

3. Regra de autorização a implementar (backend, não só esconder botão no
   front): só pode aprovar/rejeitar um Admin com `tipo = diretor` quem for
   Super Admin OU for Admin com `cargo = Mestre` da mesma `bateria_id`. Só
   Super Admin pode aprovar/rejeitar um Admin com `tipo = mestre`.

4. Ao aprovar: `status = ativo`, `aprovado_por = <id de quem aprovou>`. Ao
   rejeitar: `status = rejeitado` (mesmo padrão já usado para Ritmista
   rejeitado — não apagar o registro).

---

## FASE 4 — Cadastro manual (sem convite) e ajustes finos

1. **Cadastro manual pelo Super Admin** — decisão fechada em 02/jul/2026: um
   único fluxo, "Cadastrar Usuário", em vez de um botão por cargo — pensando
   em cargos futuros (Diretor de Naipe, etc.), um cargo novo deve virar só
   uma opção a mais no seletor, não um botão/tela nova.
   - Botão único no painel do Super Admin: "Cadastrar Usuário".
   - Ao clicar: (1) escolhe a `bateria_id` (obrigatório nos três casos, já
     que o Super Admin cuida de mais de uma escola); (2) escolhe o cargo num
     seletor: Ritmista, Mestre de Bateria ou Diretor.
   - O formulário que aparece em seguida é o **mesmo componente único** do
     Ritmista/convite (ver "Princípio obrigatório" no topo deste documento),
     só que aberto num terceiro modo, "manual" — nenhum formulário novo é
     criado.
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
