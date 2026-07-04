# Tutti — Guia de Design do Sistema
## Referência obrigatória para o Claude Code antes de qualquer alteração visual

---

## 1. O QUE É O TUTTI

Tutti é um sistema SaaS de gestão de baterias de escola de samba.
O nome vem do italiano: "todos juntos" — o momento em que toda a bateria toca em conjunto.

**Marca:** TuTTi — os dois T's centrais sempre em dourado #D4AF37, peso 800.
**Slogan:** Gestão de Bateria (nunca usar "Sistema de Gestão da Bateria")

---

## 2. REGRA FUNDAMENTAL — TUTTI vs. ESCOLA

Esta é a regra mais importante do sistema. Toda decisão visual parte daqui.

| O que é TUTTI (fixo, sempre igual) | O que é da ESCOLA (variável, vem do config) |
|---|---|
| Marca "TuTTi" | Nome da escola |
| Paleta base (#12101a, #D4AF37) | Nome da bateria |
| Fonte Plus Jakarta Sans | Logo da escola |
| Estrutura de layout | Cor primária da escola |
| QR code, carteirinha (estrutura) | Instagram da bateria |
| Rodapé "TuTTi" na carteirinha | Nome do mestre |
| Header escuro no painel | Temporada atual |

**NUNCA colocar dados da Swing da Leopoldina, Imperatriz Leopoldinense
ou qualquer escola específica como valor fixo no código.**

Todos os dados de escola vêm de `config-escola.js`.
Se um campo estiver vazio, o espaço fica vazio — nunca preenche com placeholder de escola real.

---

## 3. PALETA DE CORES

### Paleta base do Tutti (padrão — sem escola configurada)

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
| Marca TuTTi (header) | 20px | 800 | branco + TT dourado |
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
**Logo no topo do card:** marca "TuTTi" em texto (Tu em branco, TT em #D4AF37, i em branco)
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
- Esquerda: marca "TuTTi" (peso 800, TT em dourado) + abaixo nome da bateria (`configEscola.nomeBateria`, texto menor, cor muted)
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
- Direita: "Desenvolvido por TuTTi · [ano atual]"

---

### 7.3 Carteirinha digital

**Quem usa:** ritmista (mobile) e diretores
**Fundo da página:** `#12101a`

#### Frente
- Header: `configEscola.nomeEscola` (pequeno, uppercase) + `configEscola.nomeBateria` (dourado, 14px)
- Badge "Ativo" (canto direito do header)
- Foto 114px com anel dourado (ou silhueta neutra cinza #5a5770)
- Label "RITMISTA" (uppercase, muted)
- Nome completo (branco, 16px, 800)
- Apelido (dourado, itálico, entre aspas)
- Instrumento (muted)
- Linha divisória (rgba branco 0.08)
- CPF centralizado
- Pílula "Membro desde MM/AAAA" (canto inferior esquerdo, fundo escuro semitransparente, borda dourada)
- Círculo logo da escola (canto inferior direito) — SE `configEscola.logoEscola` existir, mostra a imagem. SE não existir, círculo vazio com borda dourada. NUNCA colocar "TuTTi" aqui.

#### Verso
- Header: `configEscola.nomeBateria` (dourado) + `configEscola.nomeEscola` (muted)
- Círculo logo da escola (canto direito do header) — mesma regra: logo real ou vazio
- QR code (branco, borda dourada suave)
- Label "VALIDAÇÃO DIGITAL"
- Label "MESTRE DE BATERIA" + `configEscola.mestreDeBateria`
- "Válida até" + "Temporada" lado a lado com linha divisória vertical
- Rodapé: `configEscola.instagramBateria` (esquerda) + "TuTTi" texto simples (direita, sem círculo)

#### Tema Tutti (sem escola configurada)
- Fundo: #12101a sólido
- Triângulos dourados entrelaçados: canto inferior esquerdo (maior), canto inferior direito (menor), canto superior direito (sutil)

#### Tema Swing da Leopoldina
- Fundo: gradiente verde #1e3a20 → #0d1f10
- Triângulo único no canto inferior esquerdo
- Logo SL na frente, logo IL no verso

---

## 8. LOGO DA ESCOLA — REGRAS

1. Círculos de logo são SEMPRE da escola, nunca do Tutti
2. Se `configEscola.logoEscola` for null → círculo vazio com borda dourada `#D4AF37`, sem texto, sem ícone
3. Se `configEscola.logoEscola` existir → `<img>` dentro do círculo, object-fit: cover
4. A marca "TuTTi" em texto aparece apenas:
   - Header do painel administrativo (nome do produto)
   - Rodapé do verso da carteirinha (assinatura discreta)

---

## 9. RODAPÉ — REGRAS

### Painel administrativo
- Esquerda: `configEscola.nomeEscola` → se vazio, não renderiza nada
- Direita: "Desenvolvido por TuTTi · [ano]"

### Carteirinha (verso)
- Esquerda: `configEscola.instagramBateria` → se vazio, não renderiza nada
- Direita: "TuTTi" (texto simples, sem círculo, sem "por")

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
| Sistema de link fixo por bateria para cadastro de Mestre, Diretor e Ritmista, + cadastro manual sem link | Alta | Não implementado — decisão final em 03/jul/2026 (substitui o modelo anterior de "convite" com token/expiração) |
| Cadastro do Admin (Mestre/Diretor) via autocadastro, substituindo "completar perfil no 1º login" | Alta | Não implementado |
| Campo `nível de acesso` separado de `cargo` no modelo de dados | Alta | Não implementado — base para perfis granulares futuros |
| Tela de aprovação de Diretor pelo Mestre (e pelo Super Admin) | Alta | Não implementado |
| Senha com hash (bcrypt), em vez de texto plano | Alta | Em implementação — prompt criado em 03/jul/2026 |
| **Revisão de fluxos de edição de dados e visibilidade de telas por perfil (Super Admin / Admin / Ritmista)** | Alta | **Pendente — combinado para a próxima sessão (a partir de 03/jul/2026). Inclui decidir o que exibir no campo "Mestre de Bateria" do verso da carteirinha quando a bateria tem mais de um Mestre — hoje `config-escola.js` só prevê um nome fixo** |
| **Transformar o Tutti em PWA (instalável, sem loja, sem custo)** | **Alta** | **Pendente — condição importante para a continuidade do projeto (03/jul/2026). App em loja (App Store/Google Play) fica pausado até haver orçamento; não descartado, só não é prioridade agora** |
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
- [ ] A marca "TuTTi" aparece só no header do painel e no rodapé da carteirinha?
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
