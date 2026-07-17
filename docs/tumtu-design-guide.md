# TumTu — Guia de Design do Sistema
## Referência obrigatória para o Claude Code antes de qualquer alteração visual

---

## 1. O QUE É O TUMTU

TumTu é um sistema SaaS de gestão de baterias de escola de samba.
O nome vem do som cantarolado do surdo de bateria ("TUM-TU, TUM-TU..."), a batida grave-leve dos dois surdos de marcação (primeira e segunda) conversando entre si — mantém uma leve ligação sonora com o nome anterior do projeto ("Tutti"), sem depender dele.

**Marca:** TumTu — os dois T's (1ª e 4ª letra: T**um**T**u**) sempre em dourado #D4AF37, peso 800. Risco fino terracota #7c2d12 sob o "m" de "Tum" (detalhe discreto, referência ao M de Márcia).
**Slogan:** Gestão de Bateria (nunca usar "Sistema de Gestão da Bateria")

---

## 2. REGRA FUNDAMENTAL — TUMTU vs. ESCOLA

Esta é a regra mais importante do sistema. Toda decisão visual parte daqui.

| O que é TUMTU (fixo, sempre igual) | O que é da ESCOLA (variável, vem do config) |
|---|---|
| Marca "TumTu" | Nome da escola |
| Paleta base (#12101a, #D4AF37) | Nome da bateria |
| Fonte Plus Jakarta Sans | Logo da escola |
| Estrutura de layout | Cor primária da escola |
| QR code, carteirinha (estrutura) | Instagram da bateria |
| Rodapé "TumTu" na carteirinha | Nome do mestre |
| Header escuro no painel | Temporada atual |

**NUNCA colocar dados da Swing da Leopoldina, Imperatriz Leopoldinense
ou qualquer escola específica como valor fixo no código.**

Todos os dados de escola vêm de `config-escola.js`.
Se um campo estiver vazio, o espaço fica vazio — nunca preenche com placeholder de escola real.

---

## 3. PALETA DE CORES

### Paleta base do TumTu (padrão — sem escola configurada)

```css
:root {
  --cor-fundo-escuro:    #12101a;  /* header, fundo de telas escuras */
  --cor-fundo-medio:     #1e1b2e;  /* backgrounds secundários */
  --cor-fundo-claro:     #f7f6fb;  /* fundo do painel admin */
  --cor-superficie:      #ffffff;  /* cards e formulários */
  --cor-destaque:        #D4AF37;  /* dourado — botões, links, bordas */
  --cor-destaque-hover:  #B8922A;  /* hover do dourado */
  --cor-texto-principal: #12101a;  /* títulos e corpo */
  --cor-texto-secundario:#5a5770;  /* labels, metadados */
  --cor-texto-muted:     #8b88a0;  /* placeholders, hints */
  --cor-texto-claro:     #ffffff;  /* texto sobre fundo escuro */
  --cor-borda:           #e8e6f0;  /* bordas de cards e inputs */
}
```

### Segunda cor de identidade — Terracota

```css
--cor-terracota: #7c2d12;       /* terracota — segunda cor de identidade */
--cor-terracota-hover: #5a1e0a; /* hover do terracota */
```

**Onde o terracota aparece:**
- Botão "Rejeitar" — contorno terracota, fundo transparente
- Botão "Desativar" (Super Admin) — contorno terracota, fundo transparente
- Detalhes de identidade da marca (futuro)
- **NUNCA** como fundo sólido em botão principal

### Regras de uso do dourado

- **Fundo escuro** → dourado pode ser protagonista (botões, títulos, destaques)
- **Fundo claro** → dourado só em detalhes finos (linhas divisórias, links secundários, foco de input, apelidos)
- **NUNCA** usar dourado como cor de fundo em área grande sobre fundo claro

### Override por escola

```css
[data-tema="swing-da-leopoldina"] {
  --cor-destaque:       #2d6b2d;   /* verde da Swing como ação principal */
  --cor-destaque-hover: #1f4d1f;
  --cor-fundo-escuro:   #1a2e1a;
  --cor-fundo-claro:    #f0f7f0;
}
```

---

## 4. TIPOGRAFIA

**Fonte única:** Plus Jakarta Sans (Google Fonts)
- Importar no `<head>` de todos os HTMLs:
  `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">`

### Hierarquia tipográfica

| Elemento | Tamanho | Peso | Cor |
|---|---|---|---|
| Marca TumTu (header) | 20px | 800 | branco + T's dourados |
| Título de página | 24px | 800 | --cor-texto-principal |
| Título de seção | 11px | 700 | --cor-texto-secundario (uppercase, letter-spacing) |
| Nome do ritmista (card) | 16px | 700 | --cor-texto-principal |
| Corpo / labels | 13-14px | 400-500 | --cor-texto-principal |
| Metadados / hints | 12px | 400 | --cor-texto-muted |
| Botão | 12-13px | 700 | depende do botão |

---

## 5. COMPONENTES — BOTÕES

### Botão primário (ação principal)
```css
.btn-primario {
  background: var(--cor-destaque);
  color: var(--cor-texto-principal); /* texto escuro sobre dourado */
  border: none;
  border-radius: 10px;
  padding: 12px 20px;
  font-size: 13px;
  font-weight: 700;
  font-family: var(--fonte-principal);
}
.btn-primario:hover {
  background: var(--cor-destaque-hover);
}
```

### Botão secundário (ação neutra)
```css
.btn-secundario {
  background: transparent;
  color: var(--cor-texto-secundario);
  border: 1.5px solid var(--cor-borda);
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
}
```

### Botão destrutivo (suspender, desligar, rejeitar)
```css
.btn-destrutivo {
  background: transparent;
  color: #b3261e;
  border: 1.5px solid #f0c4c0;
  border-radius: 10px;
}
```

### Botão "Ativar" (aprovar ritmista)
```css
.btn-ativar {
  background: #12101a;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 700;
}
.btn-ativar:hover { background: #2a2740; }
```

### Botão "Rejeitar" e "Desativar" (terracota com contorno)
```css
.btn-rejeitar,
.btn-desativar {
  background: transparent;
  color: #7c2d12;
  border: 1.5px solid #7c2d12;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
}
.btn-rejeitar:hover,
.btn-desativar:hover { background: #fef0eb; }
```

---

## 6. COMPONENTES — BADGES DE STATUS

```css
/* Ativo */
.badge-ativo { background: #e8f5e8; color: #1f4d1f; }

/* Pendente */
.badge-pendente { background: #fff8e6; color: #9a6200; }

/* Rejeitado — CINZA, não vermelho */
.badge-rejeitado { background: #f5f5f5; color: #757575; }

/* Suspenso */
.badge-suspenso { background: #fff3e0; color: #e65100; }

/* Desligado */
.badge-desligado { background: #fde8e8; color: #b3261e; }

/* Menor de idade — AZUL SÓLIDO ESCURO, chama atenção */
.badge-menor { background: #1a5fa8; color: #ffffff; }

/* Instrumento — NEUTRO, não dourado */
.badge-instrumento {
  background: #e8e6f0;
  color: #5a5770;
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 600;
}
```

---

## 6b. COMPONENTE — TOGGLE SWITCH (Declaração do Responsável)

Usado na ficha do ritmista para registrar entrega da declaração do responsável (menores de idade).

**Estado OFF — Não entregue:**
- Track: fundo sólido vermelho `#b3261e`
- Bolinha: branca, à esquerda
- Label: "Não entregue" em `#b3261e`

**Estado ON — Entregue:**
- Track: fundo sólido verde `#1f4d1f`
- Bolinha: branca, à direita
- Label: "Entregue" em `#1f4d1f`

```css
.toggle-track {
  width: 44px; height: 24px;
  border-radius: 20px;
  background: #b3261e;
  border: 1.5px solid #b3261e;
  position: relative; cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.toggle-track.on { background: #1f4d1f; border-color: #1f4d1f; }
.toggle-thumb {
  width: 18px; height: 18px;
  border-radius: 50%; background: #ffffff;
  position: absolute; top: 2px; left: 2px;
  transition: left 0.2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.toggle-track.on .toggle-thumb { left: 22px; }
```

O título da seção é **"DECLARAÇÃO DO RESPONSÁVEL"** — nunca "MENOR DE IDADE".

---

## 7. TELAS DO SISTEMA

### 7.1 Telas mobile (ritmista): Login e Cadastro

**Quem usa:** ritmista, pelo celular
**Fundo:** `#12101a` (escuro, mesma cor do header do painel)
**Card central:** branco `#ffffff`, border-radius 20px, sombra suave
**Logo no topo do card:** marca "TumTu" em texto ("u", "m", "u" em branco; os dois T's em #D4AF37; risco terracota #7c2d12 sob o "m")
**Sem header fixo, sem rodapé**

#### Login
- CPF ou e-mail (input)
- Senha (input)
- Botão "Entrar" (primário, dourado)
- Link "Cadastre-se" (cor: #D4AF37)

#### Cadastro — campos obrigatórios
**Seção: Dados pessoais**
- Nome completo
- Apelido (opcional)
- CPF
- Data de nascimento
- Celular
- E-mail
- Instrumento (select)
- Membro desde (input type="month")

**Seção: Endereço**
- Endereço, Número, Complemento, Bairro, Cidade, Estado

**Seção: Medidas**
- Tamanho da camisa, Tamanho da fantasia, Tamanho do sapato

**Seção: Contato de emergência**
- Nome do contato
- Parentesco
- Celular do contato

**Seção: Acesso**
- Senha (mínimo 6 caracteres)
- Confirmar senha

**Botão:** "Enviar cadastro" (primário, dourado)
**Link:** "Já tem cadastro? Entrar" (cor: #D4AF37)

#### Regras visuais do formulário
- Labels em `--cor-texto-secundario`, uppercase, letter-spacing
- Linha divisória entre seções: `#D4AF37` (dourado), height 1px
- Input em foco: borda `#D4AF37`
- Inputs sem foco: borda `#e8e6f0`
- Foto: círculo com borda tracejada, ícone neutro cinza, sem cor de escola

---

### 7.2 Tela desktop (diretor): Painel administrativo

**Quem usa:** Mestre, Diretores — pelo computador
**Fundo da página:** `#f7f6fb`

#### Header (fixo no topo)
- Fundo: `#12101a`
- Esquerda: marca "TumTu" (peso 800, os dois T's em dourado) + abaixo nome da bateria (`configEscola.nomeBateria`, texto menor, cor muted)
- Direita: círculo com inicial do usuário logado + nome + cargo + botão "Sair"
- Botão "+ Cadastrar Ritmista": dourado, no header à direita (antes do perfil)

#### Totalizadores (logo abaixo do header)
- Dois cards brancos lado a lado, sombra suave
- Card 1: número grande em `--cor-destaque` + label "Ritmistas ativos"
- Card 2: número grande em `--cor-texto-principal` + label "Pendentes"
- Números calculados dinamicamente do Supabase

#### Área de conteúdo
- Título "Ritmistas" (24px, 800)
- Barra de busca (full width)
- Chips de controle de vagas por instrumento
- Filtro por instrumento (select)
- Filtros de status (chips: Todos, Pendentes, Ativos, Rejeitados, Suspensos, Desligados, Menores)
- Contador "X ritmistas encontrados"
- Lista de cards de ritmistas

#### Cards de ritmista
- Borda esquerda colorida por status (dourado = pendente, verde = ativo)
- Nome + badge de status + badge de menor (se aplicável)
- Apelido em dourado `#D4AF37`, bold, sem itálico
- Badge instrumento (neutro: fundo #e8e6f0, texto #5a5770)
- CPF, Celular, Aniversário, Desde
- Botões de ação à direita (desktop) ou menu ⋮ (mobile)

#### Aba ativa (navegação)
- Linha sob aba ativa: `#12101a` (preto) — NUNCA dourado

#### Rodapé do painel
- Esquerda: `configEscola.nomeEscola` (se vazio, não mostra nada)
- Direita: "Desenvolvido por TumTu · [ano atual]"

---

### 7.3 Carteirinha digital

> Reescrita em 17/jul/2026 direto do código (`carteirinha.html` + `styles/carteirinha-tumtu-novo.css`) — a versão anterior era de antes do redesign de 14-16/jul e estava desatualizada em quase todo ponto (dimensão do anel, tamanho da foto/logo, sistema de cor, ausência de logo de bateria separado, ausência dos botões de rodapé). Cartão vira ao tocar (frente/verso), animação 3D suave.

**Quem usa:** ritmista, Mestre e Diretor (a mesma tela, adaptando cargo/rótulo — Admin ainda não usa isso como painel principal, só o ritmista de fato).
**Dimensão fixa do cartão:** 300×540px (regra dura — nunca muda sem aprovação explícita da Márcia, mesmo que conteúdo novo não caiba; o ajuste é sempre no conteúdo). Cresce/encolhe na tela via `transform: scale()`, preservando a proporção 300:540 sempre.
**Fundo da página** (por trás do cartão, área de "cenário"): `#12101a` (escuro, marca TumTu) — não é o fundo do cartão em si.
**Fundo do cartão — frente:** sempre branco (`#ffffff`), pra qualquer escola, qualquer combinação de cor — resolve combinações de cor pesadas (ex: escola amarelo+preto) sem precisar de lógica especial por escola.
**Fundo do cartão — verso:** dinâmico, na cor da própria escola (calculado a partir de `--cor-primaria` via `color-mix()`, um véu claro que se esvai no topo entrando na cor).

#### Sistema de cor por escola (até 4 cores reais, não um tema fixo por escola)
Cada escola cadastra de 1 a 4 cores reais (`cor_primaria/secundaria/terciaria/quaternaria`, hex). O cartão usa essas cores via CSS `color-mix()` em tempo real — não existem mais "temas" fixos codificados (o antigo "Tema Swing da Leopoldina" com gradiente verde/triângulos foi substituído por esse sistema dinâmico). Sem nenhuma escola cadastrada, cai no dourado/escuro do próprio TumTu (`#12101a` + `#D4AF37`) — o TumTu é, na prática, "a escola base".
- **Anel da foto:** usa a primeira cor não-branca entre terciária → secundária → primária (pula branco de propósito — várias escolas têm a "cor 2" branca, que ficaria sem graça).
- **Textos sobre o verso (cor dinâmica):** calcula automaticamente se o fundo da escola é claro ou escuro (fórmula oficial de luminância WCAG) e troca rótulos/valores entre branco e escuro forte — garante contraste de verdade em qualquer escola, clara ou escura. Dourado (`#D4AF37`) só é usado sobre fundo escuro; em escola de cor clara, esses mesmos elementos caem pro escuro sólido (dourado sobre dourado não teria contraste nenhum).

#### Frente
- Header: nome da escola (pequeno, uppercase, cinza) + nome da bateria (dourado, 14px)
- Pílula "Ativo" (canto direito do header, com ponto verde)
- Foto do ritmista: **144px**, círculo com anel de 3px na cor dinâmica da escola (ou dourado, sem escola) + brilho difuso ao redor. Sem foto: silhueta cinza neutra.
- Rótulo do cargo abaixo da foto: "Ritmista", "Mestre"/"Mestra de Bateria" ou "Diretor"/"Diretora" (gênero autodeclarado só muda Mestre/Diretor — Ritmista nunca varia)
- Nome completo — 19px, peso 900, até 2 linhas (corta com "..." na 3ª se precisar, nunca estoura o cartão)
- Apelido — 19px, negrito, itálico, dourado `#D4AF37` entre aspas (decisão consciente da Márcia, 16/jul/2026: manteve o dourado da marca mesmo abrindo mão do contraste técnico ideal — não reabrir essa escolha sem ela pedir)
- Instrumento (só ritmista — Mestre/Diretor não têm instrumento, a linha some inteira em vez de ficar vazia)
- Linha divisória
- CPF centralizado
- Rodapé com gradiente entrando na cor da escola: "Membro desde [ano]" (esquerda) + círculo do **logo da escola**, 96px (canto inferior direito) — logo real se cadastrado, senão círculo vazio com borda dourada. NUNCA texto/sigla no lugar da logo, NUNCA "TumTu" nesse círculo (esse círculo é sempre da escola).

#### Verso
- Header: nome da bateria (título) + nome da escola (subtítulo) + círculo do **logo da bateria** (88px, separado do logo da escola da frente — pode ser diferente)
- QR code (aponta pra página pública de emergência, `qr.html?id=`) com rótulo "QR de emergência"
- Bloco "Mestre de Bateria" / "Mestre**s** de Bateria" (plural automático se a bateria tiver mais de um Mestre aprovado) com o(s) nome(s) — busca em tempo real na tabela de vínculos, não é mais texto fixo digitado
- "Válida até" + "Temporada" lado a lado, com linha divisória vertical
- Rodapé: Instagram da bateria (esquerda, com @) + marca "T" monograma TumTu (direita, discreta — não é mais o texto "TumTu" por extenso)

#### Botões abaixo do cartão (rodapé da tela, fora do cartão em si)
- **"Meu Perfil"** (dourado, ação principal) — abre o motor único de edição de ficha
- **"Trocar de Bateria"** (borda, secundário) — só aparece pra quem tem 2+ vínculos aprovados em baterias diferentes
- Topo da tela (fora do cartão): logo "TumTu" + botão "Sair"

#### Carregando
Enquanto a carteirinha busca os próprios dados, decodifica a foto e aplica a cor da escola, a tela mostra só um spinner dourado (anel giratório de 56px, com brilho/glow dourado ao redor — duas camadas de `drop-shadow`) — sem logo, sem texto, mesmo padrão usado em `login.html`. Referência: Netflix/Disney+, símbolo universal de espera que não precisa de mais nada junto. O cartão só aparece na tela quando estiver 100% pronto — nunca em partes, nunca com foto/cor "estalando" depois de já visível (decisão de 17/jul/2026, ver `tumtu-documentacao-tecnica.md` seção 24.9).

**Histórico da mesma tarde (17/jul/2026) até chegar nesse formato:** logo+spinner pequeno+texto "Carregando..." (original) → animação dos dois círculos da marca "batendo" num ritmo de tambor (testada e revertida — no celular a espera real era rápida demais pro movimento comunicar algo antes de sumir) → spinner clássico de volta, mas sem tirar a inconsistência de ter logo em algumas telas e não em outras → decisão final: spinner sozinho e maior em toda tela de carregando, sem logo nem texto, resolve a inconsistência e fica mais parecido com apps grandes.

---

## 8. LOGO DA ESCOLA/BATERIA — REGRAS

> Atualizado 17/jul/2026: desde o redesign de 14-16/jul, a carteirinha usa **dois** logos independentes — o logo da escola (frente, 96px) e o logo da bateria (verso, 88px), que podem ser diferentes. Antes deste doc só falava de um "logo da escola" genérico.

1. Círculos de logo são SEMPRE da escola/bateria, nunca do TumTu
2. Se o logo não estiver cadastrado → círculo vazio com borda dourada `#D4AF37`, sem texto, sem ícone
3. Se o logo existir → upload real de arquivo (base64, mesmo padrão da foto do ritmista, sem precisar de storage externo) dentro do círculo, object-fit: cover
4. NUNCA colocar sigla de texto no lugar da logo — círculo vazio com borda ou logo real, nunca as duas letras da escola escritas
5. A marca "TumTu" em texto/símbolo aparece apenas:
   - Header do painel administrativo e das telas de login/cadastro/carteirinha (símbolo + nome)
   - Rodapé do verso da carteirinha, como monograma discreto ("T" com risco terracota) — não é mais o texto "TumTu" por extenso

---

## 9. RODAPÉ — REGRAS

### Painel administrativo
- Esquerda: `configEscola.nomeEscola` → se vazio, não renderiza nada
- Direita: "Desenvolvido por TumTu · [ano]"

### Carteirinha (verso)
- Esquerda: Instagram da bateria (com @) → sem cadastro, cai no padrão `@tumtu.app`
- Direita: monograma "T" + risco terracota (não é mais o texto "TumTu" por extenso)

### Login e Cadastro
- Sem rodapé

---

## 10. PERFIS DE USUÁRIO

| Perfil | Acesso | Tela principal |
|---|---|---|
| Super Admin | Tudo — configura escolas e planos | (a criar) |
| Admin (Mestre ou Diretor) | Vê todos os ritmistas da bateria e aprova cadastros. Em "Meu Perfil", vê e edita somente os próprios dados pessoais | admin.html |
| Ritmista | Vê só os próprios dados e carteirinha | carteirinha.html |

> ⚠️ **Regra de proteção (03/jul/2026):** nenhuma tela do sistema — hoje ou futura — deve oferecer ação de apagar uma conta de Super Admin, mesmo que no futuro existam vários Super Admins cadastrados. Evita "lockout" (ninguém acima do Super Admin pode restaurar o acesso se essa conta for apagada por engano). Não se aplica a Admin ou Ritmista, que sempre têm alguém acima capaz de corrigir um erro.

**Login:** único para todos os perfis (login.html). O sistema redireciona para a tela certa após autenticação. Qualquer perfil pode se logar usando CPF ou e-mail.

> ✅ **Resolvido em 02/jul/2026:** a linha "Login separado para diretor" da seção 11 estava desatualizada e foi superada pela decisão abaixo. Não existe login separado por perfil — o que existe é um **cadastro por link fixo** para Mestre e Diretor (diferente do cadastro público do Ritmista), mas o login continua sendo o mesmo formulário único para todos.

**Fluxo de onboarding (revisado em 03/jul/2026):**
1. Super Admin cria a escola/bateria — o sistema já disponibiliza os links fixos de cadastro (Mestre, Diretor, Ritmista) daquela bateria
2. Super Admin copia e envia o link de Mestre → Mestre se autocadastra (cargo e bateria travados pelo link) → status "pendente" → Super Admin aprova
3. Mestre (já ativo) ou Super Admin copia e envia o link de Diretor da bateria (o mesmo link pode ir pro grupo inteiro da diretoria) → cada Diretor se autocadastra → Mestre ou Super Admin aprova
4. Ritmistas se cadastram via link fixo público da bateria → Admin (Mestre ou Diretor) aprova
5. Quando não há WhatsApp/celular disponível: Super Admin cadastra Mestre ou Diretor diretamente (sem link), e o cadastro já nasce ativo

Os links de cadastro **nunca expiram e podem ser usados por quantas pessoas diferentes for preciso** — não são convites de uso único, são links fixos por bateria e cargo. Não há limite de quantos Mestres, Diretores ou Ritmistas uma bateria pode ter; a aprovação é a única barreira.

**Cargo × nível de acesso:** `cargo` (Mestre de Bateria / Diretor) é só o título exibido na carteirinha. Separado dele existe o campo **nível de acesso**, hoje com um único valor ("total") atribuído a qualquer Admin — é o que permite, no MVP, que Mestre e Diretor enxerguem e façam exatamente as mesmas coisas, exceto por uma regra pontual: **só quem tem `cargo = Mestre` pode visualizar/copiar o link de cadastro de Diretor e aprovar o cadastro de um Diretor.** O Super Admin pode fazer ambas as coisas também, sempre, como rede de segurança (mesmo princípio do "Acessar como Admin").

---

## 11. PENDÊNCIAS REGISTRADAS

| Item | Prioridade | Status |
|---|---|---|
| ~~Login separado para diretor~~ | — | Superado — não existe login separado (ver seção 10) |
| Sistema de link fixo por bateria para cadastro de Mestre, Diretor e Ritmista, + cadastro manual sem link | Alta | ✅ Implementado (03/jul/2026) |
| Cadastro do Admin (Mestre/Diretor) via autocadastro, substituindo "completar perfil no 1º login" | Alta | ✅ Implementado (03/jul/2026) |
| Campo `nível de acesso` separado de `cargo` no modelo de dados | Alta | ✅ Implementado (03/jul/2026) |
| Tela de aprovação de Diretor pelo Mestre (e pelo Super Admin) | Alta | ✅ Implementado (03/jul/2026) |
| Senha com hash — e depois migrada para Supabase Auth real (nunca mais texto puro nem hash no front) | Alta | ✅ Implementado (05/jul/2026) |
| RLS (Row Level Security) ligado no banco, com políticas por perfil/bateria — reforça no backend as mesmas regras que já existiam só na tela | Alta | ✅ Implementado (05/jul/2026) |
| Confirmação de consentimento no cadastro manual (LGPD) — checkbox obrigatório, validado no backend também | Alta | ✅ Implementado (05/jul/2026) |
| **Revisão de fluxos de edição de dados e visibilidade de telas por perfil (Super Admin / Admin / Ritmista)** | Alta | **✅ Implementado (05/jul/2026) — carteirinha mostra o(s) Mestre(s) reais da bateria; Mestre edita Diretor da própria bateria, Diretor só edita a si mesmo, Ritmista não edita nada (nem a si mesmo); Super Admin ganhou tela própria de "Meu Perfil". Ver `tumtu-documentacao-tecnica.md` seções 10-12** |
| **Transformar o TumTu em PWA (instalável, sem loja, sem custo)** | **Alta** | **✅ Implementado (05/jul/2026) — manifest, service worker e ícone placeholder. Ver `tumtu-documentacao-tecnica.md`. App em loja (App Store/Google Play) continua pausado até haver orçamento** |
| Formulário multi-step no cadastro | Média | Planejado para depois |
| Tela do Super Admin | Média | Não implementado |
| QR code real (não decorativo) | Baixa | Planejado |
| Salvar carteirinha como imagem | Baixa | Planejado |
| Ativação em lote de ritmistas | Baixa | Planejado |

---

## 12. CHECKLIST — ANTES DE QUALQUER ALTERAÇÃO VISUAL

O Claude Code deve verificar antes de mexer em qualquer tela:

- [ ] Estou usando `var(--cor-destaque)` e não uma cor hex fixa?
- [ ] Estou usando `configEscola.nomeBateria` e não "Swing da Leopoldina" fixo?
- [ ] Estou usando `configEscola.nomeEscola` e não "Imperatriz Leopoldinense" fixo?
- [ ] O círculo de logo está vazio (borda dourada sem conteúdo) quando não há logo configurada?
- [ ] A marca "TumTu" aparece só no header do painel e no rodapé da carteirinha?
- [ ] Os badges de instrumento estão neutros (fundo #e8e6f0, texto #5a5770)?
- [ ] O botão "Ativar" está preto `#12101a`?
- [ ] O botão "Rejeitar" e "Desativar" estão com contorno terracota `#7c2d12`?
- [ ] Os apelidos dos ritmistas estão em dourado `#D4AF37`, bold, sem itálico?
- [ ] A aba ativa tem linha preta `#12101a`, não dourada?
- [ ] O badge "Menor de idade" está em azul sólido escuro `#1a5fa8`, não lilás?
- [ ] O badge "Rejeitado" está em cinza `#757575`, não vermelho?
- [ ] O badge "Desligado" está em vermelho suave `#b3261e`?
- [ ] A seção de declaração do responsável usa o título "DECLARAÇÃO DO RESPONSÁVEL" e o toggle switch (OFF vermelho sólido `#b3261e`, ON verde sólido `#1f4d1f`)?
- [ ] A fonte usada é Plus Jakarta Sans em todos os elementos?
- [ ] As telas de login/cadastro têm fundo escuro #12101a?
- [ ] O campo de login aceita CPF ou e-mail, para qualquer perfil?
