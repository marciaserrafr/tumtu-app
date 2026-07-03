# Prompt para o Claude Code — Cadastro completo do Admin (Mestre/Diretor)

Leia o arquivo `tutti-design-guide.md` e `tutti-mvp.md` antes de começar.

---

Preciso implementar o fluxo de cadastro completo para o perfil Admin (Mestre e Diretor). Hoje o Super Admin só cadastra nome, apelido, CPF, senha, cargo e bateria. Preciso expandir isso em duas etapas.

## Etapa 1 — Expandir tabela no Supabase

Na tabela de usuários Admin (seja `admins`, `diretores` ou como estiver nomeada), adiciona as colunas que ainda não existem:

- `foto_url` (text)
- `email` (text)
- `celular` (text)
- `data_nascimento` (date)
- `endereco` (text)
- `numero` (text)
- `complemento` (text)
- `bairro` (text)
- `cidade` (text)
- `estado` (text)
- `camisa` (text)
- `fantasia` (text)
- `sapato` (text)
- `emergencia_nome` (text)
- `emergencia_parentesco` (text)
- `emergencia_celular` (text)
- `cadastro_completo` (boolean, default false)

## Etapa 2 — Tela "Complete seu perfil"

Cria uma tela `completar-perfil.html` (ou modal, se preferir) que aparece quando o Admin faz login e `cadastro_completo = false`.

**Campos da tela:**
- Foto (upload)
- Email
- Celular
- Data de nascimento
- Endereço completo (rua, número, complemento, bairro, cidade, estado)
- Medidas: camisa, fantasia, sapato
- Contato de emergência: nome, parentesco, celular

**Botão:** "Salvar e entrar no painel"

Ao salvar: atualiza os dados no Supabase, muda `cadastro_completo = true` e redireciona para `admin.html`.

**Visual:** mesmo padrão do cadastro do ritmista — fundo escuro `#12101a`, card branco centralizado, marca TuTTi no topo, linhas divisórias douradas entre seções.

## Etapa 3 — Área "Meu perfil" no painel Admin

No `admin.html`, adiciona um link "Meu perfil" no header (ao lado do nome do usuário logado) que abre um modal com os dados do Admin para edição.

O modal deve mostrar todos os campos acima já preenchidos, com botão "Salvar alterações".

## Etapa 4 — Carteirinha do Admin

A carteirinha do Admin usa a mesma estrutura da carteirinha do ritmista, com uma diferença:

- O campo "Ritmista" é substituído pelo cargo real da pessoa:
  - Se `cargo = 'mestre'` → exibe "Mestre de Bateria"
  - Se `cargo = 'diretor'` → exibe "Diretor"

Todos os outros campos são iguais: nome, apelido, instrumento (se tiver), CPF, membro desde, QR code, etc.

---
