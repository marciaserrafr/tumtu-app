# Tutti — Escopo do MVP
## Documento oficial de produto

---

## O que é o Tutti

Sistema SaaS de gestão de baterias de escola de samba.
O ritmista se cadastra, o Diretor/Mestre aprova, e o ritmista recebe a carteirinha digital.

**Marca:** TuTTi — "todos juntos", o momento em que toda a bateria toca em conjunto.

---

## Fluxo principal

```
Ritmista se cadastra → Diretor/Mestre aprova → Ritmista recebe a carteirinha
```

---

## Perfis de usuário

| Perfil | Quem é | Carteirinha |
|---|---|---|
| Super Admin | Márcia — gerencia todo o sistema | Não tem |
| Admin (Mestre + todos os Diretores) | Gerencia a bateria | Sim — exibe cargo real (Mestre de Bateria ou Diretor) |
| Ritmista | Se cadastra e visualiza a própria carteirinha | Sim — exibe "Ritmista" |

**Nota:** Por enquanto todos os Mestres e Diretores têm o mesmo perfil "Admin". Perfis granulares (Diretor de Naipe, Diretor ajudante) ficam para depois. Todos os Admins veem todos os ritmistas da bateria; em "Meu Perfil", cada Admin vê e edita somente os próprios dados pessoais.

---

## Fluxo de cadastro do Admin (Mestre/Diretor) — revisado 03/jul/2026

Substitui o modelo anterior ("Super Admin cria acesso básico → Admin completa depois") e também a versão intermediária de "convite por token" (02/jul/2026). Agora Mestre e Diretor se autocadastram uma única vez, como o Ritmista, usando um **link fixo e permanente por bateria** — sem tela de "complete seu perfil" depois do primeiro login, e sem precisar gerar um link novo pra cada pessoa.

**Passo 1 — Super Admin visualiza o link de Mestre:**
- No painel do Super Admin, dentro da bateria criada, uma seção "Links de cadastro" mostra o link fixo de Mestre daquela bateria (ele já existe, não precisa ser "gerado")
- Super Admin copia e envia o mesmo link ao(s) futuro(s) Mestre(s) pelo WhatsApp da diretoria — pode reenviar esse mesmo link quantas vezes precisar, pra pessoas diferentes

**Passo 2 — Mestre se autocadastra:**
- Abre o link
- Cargo e bateria já vêm preenchidos e travados pelo link (via parâmetros na URL) — o Mestre não escolhe isso
- Preenche o cadastro completo de uma vez: dados pessoais, endereço, medidas, foto, contato de emergência, senha própria (mín. 6 caracteres)
- Cadastro fica com status "pendente"

**Passo 3 — Super Admin aprova o Mestre:**
- Mestre passa a "ativo", consegue logar e entrar no painel
- Não há limite de quantos Mestres podem ser aprovados na mesma bateria

**Passo 4 — Link de Diretor:**
- Mestre (já ativo) ou Super Admin visualiza e copia o link fixo de Diretor da bateria (mesmo mecanismo do Passo 1 — nada é "gerado", só exibido)
- Esse **mesmo link** pode ser enviado de uma vez só pro grupo de WhatsApp da diretoria — cada Diretor abre e se cadastra (Passo 2, cargo = "Diretor")
- Mestre ou Super Admin aprova cada Diretor (Passo 3) — o Diretor sozinho não aprova outro Diretor

**Passo 5 — Edição posterior:**
- No painel existe área "Meu perfil" para o Admin (Mestre ou Diretor) atualizar os próprios dados quando quiser

**Casos sem WhatsApp/celular:** o Super Admin cadastra o Mestre ou Diretor pelo fluxo único "Cadastrar Usuário" (escolhe bateria + cargo, preenche o formulário em nome da pessoa) — sem link. Nesse caso o cadastro já nasce com status "ativo", porque quem preencheu já é a pessoa de confiança validando na hora (mesma lógica do cadastro manual de Ritmista, ver abaixo).

---

## Funcionalidades do MVP

### Super Admin
- Cadastrar escolas de samba (nome + logo)
- Cadastrar baterias (nome + logo)
- Visualizar e copiar o link fixo de cadastro de Mestre e aprovar o cadastro do Mestre
- Visualizar e copiar o link fixo de cadastro de Diretor e aprovar o cadastro do Diretor (mesma permissão do Mestre, como rede de segurança)
- "Cadastrar Usuário": fluxo único para cadastrar manualmente Ritmista, Mestre ou Diretor (escolhe bateria + cargo), para quem não tem WhatsApp/celular
- Personalizar identidade visual da escola (cores, logo)
- Ativar e desativar escolas ou baterias
- Editar dados de qualquer ritmista

### Diretor / Mestre
- Visualizar cadastros recebidos (Admins e Ritmistas pendentes)
- Aprovar ou reprovar ritmistas
- **Somente Mestre:** visualizar e copiar o link fixo de cadastro de Diretor e aprovar cadastro de Diretor da própria bateria
- Editar informações dos ritmistas
- Consultar todos os ritmistas
- Filtrar por instrumento, nome, CPF, apelido e diretor responsável
- Exportar lista de ritmistas com tamanhos de camisa, fantasia e sapato (Excel)
- Cadastrar ritmista manualmente em nome de quem não tem WhatsApp/celular

### Ritmista
- Fazer o cadastro completo (autocadastro público, via link fixo da bateria)
- Visualizar a própria carteirinha virtual
- Apresentar a carteirinha quando solicitado (abre o app e mostra a tela)

---

## Telas do MVP

| Tela | Perfil | Status |
|---|---|---|
| Login (único para todos) | Todos | Existe — ajustar |
| Cadastro (formulário único, reutilizado nos 3 modos abaixo) | Ritmista / Admin / Super Admin | Existe — ajustar |
| ↳ modo link fixo (`?bateria=&cargo=`) | Admin (Mestre/Diretor) | **Novo — substitui "Completar perfil"** |
| ↳ modo público (`?bateria=`, sem cargo) | Ritmista | Existe — ajustar (precisa passar a receber `bateria` na URL) |
| ↳ modo manual ("Cadastrar Usuário") | Super Admin (todos) / Mestre (só Ritmista) | **Novo** |
| Visualização do link fixo de cadastro (por bateria e cargo) | Super Admin (Mestre) / Super Admin ou Mestre (Diretor) | **Novo** |
| Aprovação de Admin pendente | Super Admin (Mestre) / Mestre ou Super Admin (Diretor) | **Novo** |
| ~~Completar perfil (primeiro login)~~ | ~~Admin~~ | **Removida — substituída pelo autocadastro via link fixo** |
| Carteirinha digital | Ritmista + Admin | Existe — ajustar |
| Painel Admin (Mestre/Diretor) | Admin | Existe — ajustar |
| Página do QR code | Qualquer pessoa | Implementada e validada |
| Painel do Super Admin | Super Admin | Existe — ajustar |

## Menu do painel Admin

**Visão Geral → Ritmistas → Diretoria → Vagas → Meu Perfil**

- **Visão Geral** — totalizadores (ritmistas ativos, pendentes, etc.) — primeira tela ao entrar
- **Ritmistas** — lista completa com filtros, aprovação, exportação para Excel
- **Diretoria** — lista de todos os Admins (Mestres e Diretores) da bateria
- **Vagas** — controle de vagas por instrumento
- **Meu Perfil** — dados pessoais do Admin logado. Se acessado via Super Admin, exibe mensagem neutra.

---

## Campos do cadastro do ritmista

### Dados pessoais
- Nome completo
- Apelido
- CPF
- Data de nascimento
- Celular
- E-mail
- Instrumento
- Membro desde (mês/ano)

### Contato de emergência
- Nome do contato
- Grau de parentesco
- Celular do contato

### Endereço
- Endereço, Número, Complemento, Bairro, Cidade, Estado

### Medidas
- Tamanho da camisa
- Tamanho da fantasia
- Tamanho do sapato

### Acesso
- Senha (mínimo 6 caracteres)
- Confirmar senha

---

## Página do QR code

Quando alguém escaneia o QR code da carteirinha, a página mostra:

- Nome do ritmista
- Nome do contato de emergência
- Grau de parentesco
- Telefone do contato de emergência

**Propósito:** segurança — se algo acontecer com o ritmista durante ensaio ou desfile, quem escaneia encontra imediatamente quem contatar.

---

## Carteirinha digital

### Frente
- Nome da escola + nome da bateria (variáveis do config)
- Badge de status (Ativo)
- Foto do ritmista (ou silhueta neutra)
- Ritmista / Nome / Apelido (entre aspas) / Instrumento
- Linha divisória
- CPF centralizado
- Pílula "Membro desde MM/AAAA" — canto inferior esquerdo
- Logo da escola — canto inferior direito (vazio se não configurada)

### Verso
- Nome da bateria + nome da escola (variáveis do config)
- Logo da escola — canto direito do header (vazio se não configurada)
- QR code
- Mestre de Bateria + nome (variável do config)
- Válida até + Temporada — lado a lado
- Rodapé: @instagram da bateria (variável) + marca "TuTTi"

---

## Regras importantes

1. **Ritmista não edita o próprio cadastro no MVP** — edições são feitas pelo Diretor/Mestre ou Super Admin
2. **Dados de escola são sempre variáveis** — nunca hard-coded no código
3. **Login é único** para todos os perfis — o sistema redireciona para a tela certa após autenticação
4. **Painel do Mestre e Diretor é o mesmo no MVP** — ambos com o mesmo nível de acesso ("total"). Cargo (Mestre/Diretor) e nível de acesso são campos separados no modelo de dados desde já, para permitir diferenciar o nível de acesso entre eles no futuro sem reestruturar cadastro, carteirinha ou aprovação
5. **Mestre e Diretor não recebem mais acesso pronto do Super Admin** — se autocadastram através do link fixo vinculado à bateria e ao cargo, ou são cadastrados manualmente pelo Super Admin/Mestre quando não têm WhatsApp/celular; o cadastro por link fica pendente até aprovação, o cadastro manual já nasce ativo
6. **Quem aprova quem:** Super Admin aprova o Mestre. Mestre aprova o Diretor da própria bateria. Super Admin também pode aprovar qualquer Diretor, como rede de segurança enquanto o sistema é novo
7. **Um único formulário de cadastro** — Ritmista, Mestre e Diretor usam o mesmo componente (mesmos campos), com três modos de entrada (público, via link fixo com cargo travado, manual pelo Super Admin) que só mudam o que acontece ao salvar. Nunca duplicar esse formulário em telas separadas — decisão tomada em 02/jul/2026 justamente para não virar dor de manutenção
8. **Senha em hash, nunca em texto plano** — decisão tomada em 03/jul/2026. Nenhuma tela do sistema deve exibir a senha de alguém em texto puro, nem para o Super Admin
9. **Link de cadastro é fixo e permanente por bateria** — decisão final de 03/jul/2026, substitui o conceito de "convite". Cada bateria tem, desde que é criada, um link fixo por cargo (Mestre, Diretor, Ritmista), que nunca expira, nunca "gasta" e pode ser usado por quantas pessoas diferentes for preciso (o Mestre manda o mesmo link de Diretor pra todo o grupo da diretoria, como já faz hoje no Google Forms). Não existe mais tabela de convites, token, prazo de validade nem distinção "usado"/"não usado" — a única barreira de segurança é a aprovação
10. **Sem limite de quantidade de Mestres, Diretores ou Ritmistas por bateria** — decisão final de 03/jul/2026 (uma tentativa anterior de limitar a 3 Mestres foi descartada). A aprovação (Super Admin para Mestre; Mestre ou Super Admin para Diretor; qualquer Admin para Ritmista) já é a proteção necessária

---

## Fora do MVP (para depois)

- Edição de dados pelo próprio ritmista
- Permissões granulares por perfil (Diretor de Naipe, Diretor ajudante, Admin de confiança do Mestre) — o campo `nível de acesso` já é criado no MVP (com um único valor possível, "total") justamente para não exigir migração de dados quando essa divisão for construída
- Multi-step no cadastro
- Notificações (email, WhatsApp)
- Ativação em lote de ritmistas
- Associação de ritmista a um diretor específico (Diretor de Naipe)

---

## Stack técnica

- HTML + CSS + JS puro (sem frameworks)
- Supabase (banco de dados + autenticação)
- GitHub + Vercel (deploy automático)
- Fonte: Plus Jakarta Sans (Google Fonts)
