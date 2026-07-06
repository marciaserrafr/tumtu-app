# TumTu — Visão Geral do Projeto

> Documento vivo. Atualizar sempre que uma decisão importante for tomada.
> Última atualização: 05/jul/2026

---

> ⚠️ **Mudança de nome (05/jul/2026): Tutti → TumTu.** Motivo: já existem muitas marcas registradas como "Tutti", incluindo domínio; domínio `tumtu.com.br` já foi adquirido por Márcia. Este documento já reflete o novo nome; o código e as telas do sistema ainda usam "Tutti" — a renomeação (incluindo redesenho do logo, já que o "TuTTi" com duplo-T dourado centralizado não existe do mesmo jeito em "TumTu") fica para uma sessão dedicada. Ver `tumtu-documentacao-tecnica.md` para detalhes.

## O que é

TumTu é um SaaS para gestão de baterias de escola de samba: cadastro de ritmistas, carteirinha digital, controle de permissões por perfil. Nasceu de uma dor real: a falta de carteirinha digital na Swing da Leopoldina, bateria da G.R.E.S. Imperatriz Leopoldinense, onde Márcia toca. Objetivo original da carteirinha digital: dar acesso gratuito a ritmistas em outras escolas de samba além da própria — não só resolver a questão da Swing/Imperatriz.

Projeto pessoal, primeiro produto de software, desenvolvido inteiramente por Márcia (produto, UX e implementação técnica via Claude Code). Piloto direcionado à Swing da Leopoldina, oferecido de graça nesta fase inicial.

**Nome:** TumTu — vem do som cantarolado do surdo de bateria ("TUM-TU, TUM-TU..."), a batida grave-leve dos dois surdos de marcação (primeira e segunda) conversando entre si. Mantém uma leve ligação sonora com o nome anterior do projeto ("Tutti"), sem depender dele. Logotipo: "TumTu" com os dois T's (1ª e 4ª letra) em dourado `#D4AF37`, restante em branco, e um risco fino em terracota `#7c2d12` sob o "m" de "Tum" — referência discreta ao M de Márcia.

**Visão de negócio:** SaaS multi-escola. Cada escola de samba terá identidade visual própria, configurável via CSS variables e `data-tema`.

**Distribuição / futuro "app" (decisão de 03/jul/2026):** o projeto não pode ter custo algum por enquanto — isso é uma condição inegociável pra Márcia continuar o projeto. Por isso:
- **App em loja (App Store / Google Play) está pausado**, não descartado — só volta a ser cogitado quando houver orçamento (taxa anual de US$ 99 na Apple, taxa única de US$ 25 no Google, fora o trabalho técnico de empacotar o app).
- **PWA (Progressive Web App) — ✅ implementado em 05/jul/2026**, justamente por não ter custo nenhum: o TumTu (que já é web puro) agora é instalável direto do navegador, com ícone na tela do celular e abrindo em tela cheia, sem depender de loja nem de taxa. As telas principais continuam abrindo mesmo com internet instável ou momentaneamente offline (os dados que vêm do banco, como a lista de ritmistas, só atualizam com conexão). Reaproveitou a stack atual, não foi reescrita do projeto. **Continua fora da Google Play e da App Store** — quem quiser o app precisa instalar pelo link do site, não por busca na loja.

**Concorrência:** "Carna.app", lançado por um mestre de bateria conhecido de Márcia — coincidência, não cópia. Diferencial do TumTu: foco específico em bateria, não na escola de samba como um todo.

---

## Escopo do MVP

### Perfis de usuário

| Perfil | Quem é | Carteirinha |
|---|---|---|
| Super Admin | Márcia — gerencia todo o sistema | Não tem |
| Admin (Mestre + todos os Diretores) | Gerencia a bateria | Sim — exibe cargo real (Mestre de Bateria ou Diretor) |
| Ritmista | Se cadastra e visualiza a própria carteirinha | Sim — exibe "Ritmista" |

> **Nota:** Por enquanto Mestre e todos os tipos de Diretor têm o mesmo perfil "Admin". Perfis granulares (Diretor de Naipe, Diretor assistente) ficam para depois do MVP. Todos os Admins veem todos os ritmistas da bateria; em "Meu Perfil", cada Admin vê e edita somente os próprios dados pessoais.

> **Decisão de modelagem (02/jul/2026) — cargo ≠ nível de acesso:** `cargo` (Mestre de Bateria / Diretor) é só o título que aparece na carteirinha e não muda. Separado dele, existe um campo **nível de acesso**, que hoje só tem um valor possível ("total") e é atribuído a qualquer Admin, seja Mestre ou Diretor — por isso ambos continuam enxergando e fazendo tudo o mesmo, sem divisão de perfil ainda. Guardar esse campo separado desde já é o que vai permitir, no futuro, dar nível de acesso "total" a um Diretor de confiança e nível "padrão" (restrito) ao Diretor comum, sem reescrever a lógica de cadastro, carteirinha ou aprovação — só passa a existir um segundo valor possível para o campo. Essa é a base para o desejo real da Márcia de, no futuro, ter 4 perfis (Super Admin, Admin de confiança do Mestre, Diretor padrão, Ritmista) sem precisar migrar dados.
>
> **Quem aprova quem:** Super Admin aprova o Mestre (não tem outro Admin acima dele numa bateria nova). O Mestre aprova os Diretores da própria bateria. Super Admin também pode aprovar qualquer Diretor — ele é superset de tudo, sempre, pelo mesmo princípio já usado no "Acessar como Admin": serve de rede de segurança enquanto o sistema é novo e pode dar algo errado.

### Fluxo de onboarding (revisado — decisão de 03/jul/2026)

```
Super Admin cria escola/bateria
→ sistema já disponibiliza 3 links fixos e permanentes daquela bateria:
  link de Mestre, link de Diretor, link de Ritmista
→ Super Admin copia o link de Mestre e envia pelo WhatsApp da diretoria
→ Mestre abre o link → faz o cadastro completo (mesmo formulário do ritmista,
  com cargo e bateria já travados pelo link) → senha própria → status "pendente"
→ Super Admin aprova o Mestre → Mestre fica ativo, entra no painel
→ Mestre (ou Super Admin) copia o link de Diretor e manda no grupo da diretoria
→ Cada Diretor abre o mesmo link → cadastro completo → status "pendente"
→ Mestre (ou Super Admin) aprova cada Diretor → Diretor fica ativo
→ Ritmistas usam o link público da bateria (mesmo mecanismo) → Admin aprova
```

**Sem acesso a WhatsApp/celular:** o Super Admin pode cadastrar um Mestre ou Diretor diretamente, preenchendo o formulário em nome da pessoa — exatamente como já faz hoje para Ritmista. Nesse caso o cadastro nasce direto com `status = ativo`, porque quem preencheu já é a própria pessoa de confiança fazendo a validação na hora.

**Não existe mais** o fluxo de "Super Admin cria acesso básico + Admin completa depois no primeiro login". Mestre e Diretor se cadastram por conta própria, uma vez só, como o Ritmista — evita a experiência ruim de entrar no sistema com cadastro pela metade e poder empurrar isso com a barriga.

**Link de cadastro por bateria (conceito revisado em 03/jul/2026 — substitui "convite"):** cada bateria tem, desde o momento em que é criada, três links fixos e permanentes — um por cargo (Mestre, Diretor, Ritmista) — no formato `tumtu.com.br/cadastro?bateria=<id>&cargo=<mestre|diretor>` (o link de Ritmista não precisa de `cargo`, é o padrão). Esses links **nunca expiram, nunca "gastam" e podem ser usados por quantas pessoas diferentes for necessário** — o Mestre manda o mesmo link de Diretor pra todo o grupo da diretoria, do jeito que já faz hoje com o Google Forms, sem precisar gerar um link por pessoa. A tela do Super Admin (e do Mestre, para o link de Diretor) só **exibe** esse link com um botão "copiar" — não existe mais ação de "gerar convite", porque o link já existe sempre. Não há mais tabela de convites, token, prazo de validade ou distinção entre "usado"/"não usado": a única barreira de segurança real é a aprovação, que continua existindo do mesmo jeito para os três perfis.

**Sem limite de quantidade:** não existe restrição de quantos Mestres, Diretores ou Ritmistas uma bateria pode ter — a aprovação (Super Admin para Mestre; Mestre ou Super Admin para Diretor; qualquer Admin para Ritmista) é a única barreira, não uma contagem automática.

Login único para todos os perfis; redirecionamento por perfil após login. Qualquer usuário — Super Admin, Admin ou Ritmista — pode se logar usando CPF ou e-mail.

### Botão "Acessar como Admin"

No painel do Super Admin, dentro de cada escola, há um botão "Acessar como Admin" que abre o painel administrativo em nova aba com um banner discreto — evita a necessidade de múltiplos logins/senhas.

### Menu do painel Admin

**Visão Geral → Ritmistas → Diretoria → Vagas → Meu Perfil**

- **Visão Geral:** totalizadores (ritmistas ativos, pendentes, etc.)
- **Ritmistas:** lista completa com filtros, aprovação, exportação para Excel
- **Diretoria:** lista de todos os Admins (Mestres e Diretores) da bateria
- **Vagas:** controle de vagas por instrumento
- **Meu Perfil:** dados pessoais do Admin logado — se acessado via Super Admin, exibe mensagem neutra

### Regras importantes

- Ritmista **não edita** o próprio cadastro no MVP — edições passam por Admin ou Super Admin. (Futuro: liberar campos como "apelido"; travar outros, como tamanho de fantasia após confecção.)
- Mestre e Diretor se autocadastram via link fixo de cadastro da bateria (ou são cadastrados manualmente pelo Super Admin/Mestre, sem link, quando a pessoa não tem WhatsApp/celular) — não existe mais "Super Admin cria acesso básico e Admin completa depois".
- **Cadastro:** CPF **e** e-mail são os dois obrigatórios (exceto "Não tenho CPF", que troca por documento estrangeiro — e-mail continua obrigatório sempre). No **login**, é CPF **ou** e-mail — regras diferentes por design.
- **Cadastro manual exige confirmação de consentimento** (decisão de 05/jul/2026, ver seção Jurídico/LGPD abaixo): quem cadastra em nome de outra pessoa precisa confirmar que ela está ciente e autorizou.
- **Segurança (decisão de 02/jul/2026, migrada para autenticação real em 05/jul/2026):** login usa Supabase Auth de verdade (não mais comparação manual de senha), e o banco tem RLS (Row Level Security) ligado, reforçando no backend as mesmas regras de permissão que antes só existiam na tela. Detalhamento completo em `tumtu-documentacao-tecnica.md`.

### Funcionalidades do MVP por perfil

**Super Admin:**
- Cadastro de escola (nome, logo, identidade visual)
- Cadastro de bateria (nome, logo, mestre, Instagram)
- Visualizar e copiar o link fixo de cadastro de Mestre e de Diretor (qualquer bateria) e aprovar esses cadastros
- "Cadastrar Usuário": fluxo único para cadastrar manualmente Ritmista, Mestre ou Diretor (escolhe bateria + cargo num seletor), para quem não tem WhatsApp/celular
- Ativar/desativar escolas e baterias
- Acessar painel Admin de qualquer escola via "Acessar como Admin"

**Admin (Mestre + Diretores):**
- Aprovar/rejeitar cadastros de ritmistas
- **Somente Mestre:** visualizar e copiar o link fixo de cadastro de Diretor da própria bateria e aprovar esse cadastro
- Cadastrar ritmista manualmente em nome de quem não tem celular
- Editar dados dos ritmistas
- Filtrar por instrumento, nome, CPF, apelido
- Exportar lista com tamanhos de camisa/fantasia/sapato para Excel
- Gerenciar vagas por instrumento
- Visualizar Diretoria (lista de Admins)
- Editar o próprio perfil em "Meu Perfil"

**Ritmista:**
- Fazer o cadastro completo
- Visualizar a própria carteirinha
- Apresentar a carteirinha quando solicitado

### Campos do cadastro (Ritmista e Admin)

**Dados pessoais:** nome completo, apelido, CPF, data de nascimento, celular, e-mail, instrumento, membro desde (mês/ano)

**Contato de emergência:** nome, parentesco, celular ← importante para segurança em ensaios/desfiles

**Endereço:** rua, número, complemento, bairro, cidade, estado

**Medidas:** tamanho de camisa, fantasia, sapato

**Acesso:** senha (mínimo 6 caracteres)

### Pendências de implementação

- Sistema de permissões granulares (Diretor de Naipe, Diretor assistente) — pós-MVP
- Formulário multi-step no cadastro — pós-MVP
- Edição de dados pelo próprio ritmista — pós-MVP (campos a definir)
- Notificações (e-mail, WhatsApp) — pós-MVP

---

## Identidade Visual

**Fonte:** Plus Jakarta Sans (única, via Google Fonts).

**Paleta base:**

| Uso | Cor |
|---|---|
| Fundo escuro | `#12101a` |
| Fundo claro | `#f7f6fb` |
| Texto principal | `#12101a` |
| Texto secundário | `#5a5770` |
| Borda | `#e8e6f0` |
| Accent dourado | `#D4AF37` |
| Accent dourado (hover) | `#B8922A` |
| Terracota (2ª cor de identidade) | `#7c2d12` |

**Regra de uso do dourado:** protagonista só em fundo escuro (ex: carteirinha). Em fundo claro, fica restrito a detalhes finos (divisórias, links secundários) — a cor principal da escola assume botões/ações em fundo claro.

**Onde o terracota aparece:** botão "Rejeitar", botão "Desativar", botão "Acessar como Admin" (sólido). Contorno terracota para ações destrutivas/secundárias.

**Badges de instrumento** (Tamborim, Caixa, Chocalho etc.): neutros — fundo `#e8e6f0`, texto `#5a5770`. São informação, não ação.

**Status badges:**

| Status | Cor |
|---|---|
| Ativo | verde claro |
| Pendente | âmbar |
| Suspenso | laranja |
| Rejeitado | cinza |
| Desligado | vermelho suave |
| Menor de idade | azul escuro sólido `#1a5fa8`, texto branco |

> ⚠️ **Atenção de nomenclatura:** a seção do cadastro relacionada a menores é chamada **"Declaração do Responsável"** — nunca "Menor de idade" na UI. O nome "Menor de idade" vale só para o badge de status acima.

**Apelidos:** dourado `#D4AF37`, negrito, sem itálico.

**Abas ativas:** linha preta `#12101a`, não dourada.

**Toggle "Declaração do Responsável":** OFF = vermelho sólido `#b3261e` (não entregue), ON = verde sólido `#1f4d1f` (entregue).

**Botão "Ativar":** provisoriamente quase-preto `#12101a`. Revisão completa de cores fica para o final do projeto.

---

## Carteirinha Digital

Duas versões em paralelo, mesma estrutura de campos:

**Frente:** header (escola/bateria + status) → foto 114px com anel dourado → cargo / Nome / "Apelido" (entre aspas) / Instrumento → linha divisória → CPF centralizado → pílula "Membro desde MM/AAAA" (esquerda) → logo da escola (direita, vazio se não configurada).

**Verso:** header (bateria + escola + logo) → QR code (mostra contato de emergência: nome, parentesco, telefone — ferramenta de segurança em ensaios/desfiles) → Mestre de Bateria + nome → "Válida até" e "Temporada" lado a lado com linha divisória vertical → rodapé com Instagram + marca "TumTu" (sem "por", sem duplicar marca na tela).

**Campo "cargo" na carteirinha:**
- Ritmista → exibe "Ritmista"
- Admin com cargo Mestre → exibe "Mestre de Bateria"
- Admin com cargo Diretor → exibe "Diretor"

**Tema TumTu (base):** fundo `#12101a` sólido, triângulos dourados entrelaçados nos dois cantos inferiores + sutil no canto superior direito.

**Tema Swing da Leopoldina:** gradiente verde original, triângulo único no canto inferior esquerdo.

Dados da escola (nome, bateria, logo, Instagram) sempre vêm de `config-escola.js` — **nunca hardcoded**.

CSS: `carteirinha-tumtu.css` e `carteirinha-swing.css`.

---

## Stack técnico

HTML/CSS/JS puro, sem framework, com Supabase como banco de dados/backend. Deploy via GitHub/Vercel. CSS com variáveis (`data-tema`). Desenvolvido inteiramente por Márcia (produto, UX e implementação técnica) com apoio do Claude Code. **PWA implementado (05/jul/2026)** — instalável direto do navegador, sem loja e sem custo. Detalhes em `tumtu-documentacao-tecnica.md`.

---

## Jurídico / Modelo de negócio (em pausa)

TumTu é oferecido de graça à Swing/Imperatriz nesta fase. Márcia quer se resguardar legalmente caso o escopo cresça e seja necessário cobrar no futuro.

Estrutura discutida: *Termo de Cessão de Uso Gratuito de Software / Acordo de Colaboração*, cobrindo: escopo atual, gratuidade condicionada, propriedade intelectual (código + marca "TumTu"), responsabilidades LGPD (escola = controladora, Márcia = operadora), ausência de SLA, cláusula de rescisão/transição para modelo pago, vigência revisável. **Nenhuma minuta criada ainda.**

**Decisão de 05/jul/2026 — não contratar advogado ainda:** Márcia decidiu conscientemente não contratar advogado agora, pois o projeto ainda é pré-receita, sem CNPJ, e todo dado no sistema é fake. Como mitigação proporcional a este estágio, o cadastro manual passou a exigir confirmação de consentimento de quem preenche em nome de outra pessoa (ver `tumtu-mvp.md`, regra 8, e `tumtu-documentacao-tecnica.md`). **Gatilho para revisitar a contratação de advogado:** a primeira vez que uma pessoa real, de fora do círculo direto da Márcia, digitar dado pessoal real no sistema — o mesmo gatilho que já indicava a necessidade de montar um ambiente de staging separado da produção.
