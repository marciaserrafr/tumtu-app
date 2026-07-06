# TumTu — Sistema de Gestão de Ritmistas

## Quem está construindo

**Márcia Serra**, empreendedora, não desenvolvedora. Construindo com Claude Code de forma incremental. Perfil: detalhista com UX e visual, prefere ver antes de aprovar, não gosta de surpresas.

---

## O que é o produto

Sistema web de gestão de ritmistas para escolas de samba. Desenvolvido inicialmente para o G.R.E.S. Swing da Leopoldina, com visão SaaS multi-escola — qualquer bateria do Brasil pode contratar e usar.

**Marca:** TumTu (os dois T's — 1ª e 4ª letra — em destaque dourado: T**um**T**u**)

---

## Stack técnica

- HTML + JS puro (sem frameworks)
- Supabase (banco de dados + auth)
- GitHub + Vercel (deploy automático no push para `main`)

---

## Identidade visual

**Paleta base (tema TumTu):**
| Token | Valor | Uso |
|-------|-------|-----|
| `--cor-fundo-escuro` | `#12101a` | Header, fundo de carteirinha, fundo de login |
| `--cor-fundo-medio` | `#1e1b2e` | Backgrounds secundários escuros |
| `--cor-fundo-claro` | `#f7f6fb` | Fundo do painel admin |
| `--cor-destaque` | `#D4AF37` | Dourado carnaval — botões primários, links, bordas de destaque |
| `--cor-destaque-hover` | `#B8922A` | Hover do dourado |
| `--cor-texto-destaque` | `#12101a` | Texto sobre botão dourado |
| `--cor-superficie` | `#ffffff` | Cards |
| Fonte | Plus Jakarta Sans | Pesos 300–800 |

**Regras de marca:**
- "TumTu" (os dois T's em dourado `#D4AF37`, peso 900) aparece fixo no header do painel e no rodapé do verso da carteirinha
- Círculos de logo são **sempre** da escola — nunca colocam a marca TumTu
- Quando não há escola configurada, círculos ficam vazios (borda dourada sem conteúdo)

**Override por escola (`[data-tema="nome-da-escola"]` em `styles/tokens.css`):**
- Swing da Leopoldina: verde `#2d6b2d` como destaque, fundo escuro `#1a2e1a`

---

## Configuração de escola

Arquivo: **`config-escola.js`** — preenchido pelo Super Admin.

```js
const configEscola = {
  nomeEscola:       "",   // ex: "G.R.E.S. Imperatriz Leopoldinense"
  nomeBateria:      "",   // ex: "Swing da Leopoldina"
  logoEscola:       null, // URL da logo; null = espaço reservado vazio
  instagramBateria: "",   // ex: "@swingdaleopoldina"
  corDestaque:      null, // null = dourado padrão TumTu
  corPrimaria:      null, // null = escuro padrão TumTu
  mestreDeBateria:  "",
  temporadaAtual:   "",   // ex: "Carnaval 2027"
};
```

---

## Telas existentes

### `login.html` — Login do ritmista
- Fundo escuro `#12101a`, card branco centralizado
- CPF + senha → verifica no Supabase → redireciona para carteirinha
- Cadastro pendente: bloqueia com aviso

### `index.html` — Cadastro do ritmista
- Fundo escuro `#12101a`, card branco centralizado
- Campos: nome, apelido, CPF, nascimento, celular, e-mail, instrumento, endereço completo, tamanho camisa/fantasia/sapato, senha
- Envia com status `pendente` — aguarda aprovação do diretor

### `admin.html` — Painel do Diretor
- Header fixo escuro `#12101a` com marca TumTu + nome da bateria (do config)
- **Totalizadores**: dois cards — "Ritmistas ativos" (número em dourado) e "Pendentes"
- **Botão "+ Cadastrar Ritmista"** em dourado
- **Barra de busca** por nome, apelido ou CPF (normaliza acentos)
- **Controle de vagas** por instrumento: chips com ocupação (ex: 3/30), alerta amarelo (≥ 90%), alerta vermelho (acima do limite ou sem limite definido)
- **Multi-select de instrumento** + filtros de status (Todos, Pendentes, Ativos, Rejeitados, Suspensos, Desligados, Menores)
- **Cards de ritmistas**: nome, badge de status, apelido, instrumento, CPF, celular, aniversário (🎂 no mês atual), "Desde: mm/aaaa"
  - Desktop: botões de ação empilhados à direita (Ativar, Rejeitar, Instrumento, Suspender, Desligar, Cadastro)
  - Mobile: menu ⋮ no canto do card
- **Botão Ativar**: cor vinda de `configEscola.corDestaque` (dourado TumTu se não configurado)
- **Modal Cadastro**: ficha completa do ritmista
- **Controle de menores**: flag automática por nascimento, controle de entrega de declaração do responsável
- Rodapé com nome da escola (do config)

### `carteirinha.html` — Carteirinha digital do ritmista
- Fundo escuro `#12101a`, carteirinha 3D com flip ao toque
- **Frente:**
  - Header: nome da escola + nome da bateria (do config)
  - Foto do ritmista (ou silhueta placeholder)
  - Nome, apelido, instrumento, CPF
  - Canto inferior esquerdo: pílula "Membro desde mm/aaaa"
  - Canto inferior direito: círculo com logo da escola (vazio se não configurada)
- **Verso:**
  - Header: nome da bateria + nome da escola (do config) + círculo com logo da escola
  - QR code (decorativo por enquanto)
  - Nome do mestre de bateria (do config)
  - "Válida até" + "Temporada" lado a lado
  - Rodapé: `@instagram` (do config) + marca "TumTu" à direita
- Botões: Salvar e Compartilhar

---

## Arquitetura de arquivos

```
ritmistas-app/
├── index.html              # Cadastro do ritmista
├── login.html              # Login do ritmista
├── admin.html              # Painel do diretor
├── carteirinha.html        # Carteirinha digital
├── config-escola.js        # Configuração da escola (editado pelo Super Admin)
├── carteirinha-tumtu.css   # CSS da carteirinha (classes .c-*)
├── carteirinha-swing.css   # CSS arquivado do tema Swing (classes .f-* e .b-*)
├── styles/
│   ├── tokens.css          # CSS variables: :root (TumTu) + overrides por escola
│   └── components.css      # Componentes reutilizáveis: .btn-primario, .campo, etc.
```

---

## Funcionalidades pendentes (já decididas)

- [ ] Tela de login do **diretor** (separada do login do ritmista)
- [ ] Notificação de aprovação de cadastro (e-mail, push ou WhatsApp)
- [ ] Ativação em lote de ritmistas pendentes
- [ ] Gestão de instrumentos: inventário, status (ok / manutenção / quebrado), associação a ritmista
- [ ] Tela de Super Admin para preencher `configEscola` via interface
- [ ] Salvar carteirinha como imagem (botão "Salvar" hoje mostra alert)
- [ ] QR code real para validação da carteirinha

---

## Banco de dados (Supabase)

Tabela principal: `ritmistas`

| Campo | Tipo | Obs |
|-------|------|-----|
| `nome` | text | |
| `apelido` | text | opcional |
| `cpf` | text | |
| `senha` | text | plaintext por enquanto |
| `nascimento` | date | usado para flag de menor de idade |
| `celular` | text | |
| `email` | text | |
| `instrumento` | text | |
| `membro_desde` | text | formato `YYYY-MM` |
| `status` | text | `pendente` / `aprovado` / `rejeitado` / `suspenso` / `desligado` |
| `foto_url` | text | URL da foto (upload externo) |
| `endereco`, `numero`, `complemento`, `bairro`, `cidade`, `estado` | text | |
| `camisa`, `fantasia`, `sapato` | text | tamanhos de vestimenta |
| `declaracao_menor` | boolean | entrega da declaração do responsável |
| `motivo_status` | text | motivo de suspensão/desligamento |
