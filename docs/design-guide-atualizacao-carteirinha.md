# Atualização do tumtu-design-guide.md
## Seções a substituir/adicionar — Julho 2026

> ⚠️ Este arquivo contém APENAS as seções que mudaram ou foram criadas.
> O Claude Code deve substituir as seções correspondentes no design guide original
> e adicionar a seção 7.4 após a 7.3.
> Todo o restante do documento permanece intacto.

---

## SUBSTITUIR: Seção 7.3 — Carteirinha digital

### 7.3 Carteirinha digital (revisada em 13/jul/2026)

**Quem usa:** ritmista (mobile)
**Arquivo CSS:** `carteirinha-tumtu.css` (substituir pelo `carteirinha-tumtu-novo.css`)
**Arquivo de configuração:** `config-escola.js`

#### Estrutura geral

A carteirinha tem frente e verso com animação de flip. Formato estritamente vertical (300×500px mínimo). O fundo do corpo da frente é sempre branco (ou toque suavíssimo da cor da escola) — nunca fundo escuro na frente.

O verso tem fundo na cor primária da escola com gradiente escuro.

#### Frente — elementos e regras

| Elemento | Regra |
|---|---|
| Fundo | Branco com toque suavíssimo da cor primária (via CSS var) |
| Header | Gradiente sutil da cor primária vindo do topo — sem cor chapada, sem linha de corte |
| Nome da escola | 7.5px, uppercase, muted (#8a87a0) |
| Nome da bateria | 14px, peso 900, na cor primária da escola |
| Badge "Ativo" | Pill com cor primária, border 1px, fundo 7% da cor primária |
| Foto | Círculo 104px (halo + anel + imagem). Anel usa --cor-anel definida pelo padrão da escola |
| Cargo label | 7.5px, uppercase, #9490a8 — abaixo da foto |
| Nome completo | 17px, peso 900, #0c0b14 |
| Apelido | 11px, itálico, **dourado #D4AF37** — sempre, sem exceção |
| Instrumento | 10px, #9490a8 |
| Divisor | 0.5px, gradiente transparente→#d8d5e8→transparente |
| CPF label | 7px, uppercase, #9490a8 |
| CPF valor | 13px, peso 600, #2a2838 |
| Rodapé fluido | Gradiente "poolside" — cor emerge do fundo sem caixa ou borda. Altura do gradiente: 120px. Ver nota abaixo |
| "Membro desde" label | 7px, uppercase, rgba(255,255,255,0.8) |
| Ano | 24px, peso 900 — cor definida pelo padrão da escola |
| Logo da escola | Círculo 52px, border 1px, canto inferior direito — cor da borda definida pelo padrão |
| Faixa dourada | 3px, gradiente #9a7520→#D4AF37→#f5d778→#D4AF37→#9a7520 — sempre presente |

**Nota sobre o rodapé fluido:**
O `padding-top` do `.rodape-content` deve garantir que "Membro desde" + logo nunca sejam cortados.
Fórmula: `padding-top = altura-gradiente - altura-conteúdo (~65px)`.
Com gradiente de 120px → `padding-top: 55px`.
NUNCA aumentar `padding-top` além de `altura-gradiente - 65px` ou o conteúdo será cortado.

#### Verso — elementos e regras

| Elemento | Regra |
|---|---|
| Fundo | Gradiente da cor primária (escuro) — via --verso-bg |
| Header | Gradiente rgba(0,0,0,0.22)→transparent — **sem linha de corte, sem borda** |
| Nome da bateria | 15px, peso 900, branco |
| Nome da escola | 7.5px, uppercase, rgba(255,255,255,0.5) |
| Logo da bateria | Círculo 52px, canto direito do header. Se não houver logo da bateria: usa logo da escola. Borda 1px dourado |
| QR code | Caixa branca 110×110px, border-radius 14px, sombra suave. Aponta para contato de emergência |
| Label QR | "QR DE EMERGÊNCIA" — 7px, uppercase, rgba(255,255,255,0.45) |
| Mestre(s) | Label "MESTRE DE BATERIA" ou "MESTRES DE BATERIA" (plural automático via JS) + nome(s). Separador 0.5px entre dois mestres |
| Válida até | 7px label + 13px valor em dourado #D4AF37 |
| Temporada | 7px label + 13px valor em dourado — **white-space: nowrap** ("Carnaval 2027" nunca quebra linha) |
| @instagram | 7.5px, rgba(255,255,255,0.35) — esquerda do rodapé |
| Monograma T | Letra T em dourado #D4AF37 (16px, peso 900) + risco terracota #7c2d12 (1.5px) abaixo — direita do rodapé |

#### Logo da escola e da bateria — regras unificadas

- **Frente:** logo da escola, canto inferior direito
- **Verso:** logo da bateria, canto direito do header. Se não houver logo da bateria separada, usa logo da escola
- Tamanho: 76px × 76px (revisado em 13/jul/2026 — 52px original ficava pequeno demais pra reconhecer a logo, testado com logos reais da Imperatriz e da Swing da Leopoldina), borda 1px solid, border-radius 50%
- Cor da borda: definida por `--cor-logo-borda` (ver padrões abaixo)
- Sem logo cadastrada: círculo vazio com borda — nunca texto, nunca sigla, nunca ícone TumTu
- Com logo cadastrada: `<img>` com object-fit: contain, border-radius: 50%

#### Especificação técnica do arquivo de logo (criado em 13/jul/2026)

Testado com logo real (Imperatriz Leopoldinense) dentro do círculo de 76px — apareceu um aro claro indesejado ao redor da arte. Causa: o arquivo PNG tinha margem transparente sobrando entre a arte circular e a borda do próprio arquivo (comum em export de logo), e `object-fit: contain` nunca corta a imagem — ele encolhe o arquivo inteiro (arte + sobra) pra caber no círculo do cartão, revelando essa margem.

**Padrão a pedir de quem for mandar a logo (Mestre/Diretor):**
1. PNG com **fundo transparente** — nunca JPG (não tem transparência; apareceria com fundo branco no verso escuro do cartão)
2. **Recortada rente à arte**, sem sobra de espaço ao redor
3. **Formato quadrado** (largura = altura)
4. **Mínimo recomendado: 300×300px**, pra não borrar ao ampliar

**Pendência de UX (ainda não implementada):** a Márcia quer esse texto explicativo dentro do próprio TumTu, junto ao campo de upload de logo (super-admin.html, tela de configuração de escola/bateria — tela ainda não construída) — não só documentado aqui. Objetivo: ninguém esquece o padrão porque a instrução aparece exatamente na hora de mandar o arquivo, sem depender de lembrar de consultar este documento.

#### Assinatura TumTu no verso

O monograma T (`.tumtu-mono`) substitui o wordmark completo "TumTu" no rodapé do verso.
Motivo: em tamanhos pequenos o risco terracota sob o "m" não renderiza bem. O T isolado é mais elegante e legível.

```html
<div class="tumtu-mono">
  <span class="tumtu-mono__t">T</span>
  <div class="tumtu-mono__risco"></div>
</div>
```

---

## ADICIONAR: Seção 7.4 — Sistema de cores da carteirinha por padrão de escola

### 7.4 Sistema de cores da carteirinha (criado em 13/jul/2026)

Cada escola tem um padrão de distribuição de cores na carteirinha, definido pelo número de cores oficiais e se o branco é uma delas.

O sistema usa variáveis CSS aplicadas via `config-escola.js` no elemento `.carteirinha`.

#### Padrão A — 2 cores, uma é branco
*Ex: Jacarezinho (rosa + branco), Salgueiro (vermelho + branco), Portela (azul + branco)*

O branco já é cor oficial — é o fundo. A cor primária aparece em todos os elementos coloridos. O dourado TumTu é o único detalhe de contraste.

| Elemento | Cor |
|---|---|
| Fundo da frente | Branco + toque suavíssimo da cor primária |
| Anel da foto | Cor primária |
| Nome da bateria | Cor primária |
| Rodapé fluido | Gradiente da cor primária |
| Ano "membro desde" | Branco (#fff) |
| Borda do logo | **Dourado TumTu** rgba(212,175,55,0.7) |
| Verso | Gradiente escuro da cor primária |
| Validade e Temporada | Dourado TumTu #D4AF37 |

#### Padrão B — 2 cores sem branco
*Ex: Tijuca (azul-pavão #005BAA + amarelo-ouro #FFD700), Mangueira (verde + rosa)*

O branco entra como fundo neutro. As duas cores se distribuem — cor primária domina, cor secundária cria equilíbrio.

| Elemento | Cor |
|---|---|
| Fundo da frente | Branco com toque suavíssimo da cor primária |
| Anel da foto | **Cor secundária** (contrabalança o primário) |
| Nome da bateria | Cor primária |
| Rodapé fluido | Gradiente da cor primária |
| Ano "membro desde" | **Cor secundária** |
| Borda do logo | rgba da cor secundária com 0.6 |
| Verso | Gradiente escuro da cor primária |
| Validade e Temporada | Dourado TumTu #D4AF37 |

#### Padrão C — 3 cores (inclui terceira cor além do branco)
*Ex: Imperatriz (verde #007A3D + branco + dourado #D4AF37), Mocidade (verde + dourado + branco)*

O branco é o fundo. A terceira cor ganha protagonismo nos detalhes — especialmente quando coincide com o dourado TumTu (como na Imperatriz), criando uma fusão natural entre identidade da escola e marca TumTu.

| Elemento | Cor |
|---|---|
| Fundo da frente | Branco com toque suavíssimo da cor primária |
| Anel da foto | **Terceira cor** (protagonismo) |
| Nome da bateria | Cor primária |
| Rodapé fluido | Gradiente da cor primária |
| Ano "membro desde" | **Terceira cor** |
| Borda do logo | rgba da terceira cor com 0.7 |
| Verso | Gradiente escuro da cor primária |
| Validade e Temporada | **Terceira cor** (ou dourado TumTu se coincidir) |

#### Dourado TumTu — presença fixa em TODOS os padrões

Independente do padrão (A, B ou C), o dourado TumTu (#D4AF37) está sempre presente em:
- Apelido do ritmista (itálico)
- Faixa dourada na base da frente
- Monograma T no verso
- Validade e Temporada no verso (exceto Padrão C quando a terceira cor os substitui)

#### Variáveis CSS — referência de implementação

O `config-escola.js` deve definir estas variáveis no elemento `.carteirinha` via `style`:

```javascript
// Exemplo — Tijuca (Padrão B)
carteirinha.style.setProperty('--cor-primaria', '#005BAA');
carteirinha.style.setProperty('--cor-anel-gradiente', 'linear-gradient(135deg, #FFD700, #e6c200, #FFD700)');
carteirinha.style.setProperty('--cor-halo-foto', 'rgba(255,215,0,0.10)');
carteirinha.style.setProperty('--cor-foto-bg', '#EBF3FF');
carteirinha.style.setProperty('--header-gradiente', 'linear-gradient(180deg, rgba(0,91,170,0.08) 0%, transparent 100%)');
carteirinha.style.setProperty('--cor-brilho-header', 'rgba(0,91,170,0.07)');
carteirinha.style.setProperty('--cor-pill-borda', 'rgba(0,91,170,0.20)');
carteirinha.style.setProperty('--cor-pill-bg', 'rgba(0,91,170,0.07)');
carteirinha.style.setProperty('--rodape-gradiente', 'linear-gradient(to top, rgba(0,40,100,0.95) 0%, rgba(0,60,140,0.5) 45%, rgba(0,91,170,0.15) 70%, transparent 100%)');
carteirinha.style.setProperty('--cor-ano', '#FFD700');
carteirinha.style.setProperty('--cor-logo-borda', 'rgba(255,215,0,0.6)');
carteirinha.style.setProperty('--verso-bg', 'linear-gradient(150deg, #005BAA 0%, #004080 40%, #002d5e 100%)');
```

Todas as definições de escola já estão documentadas no arquivo `carteirinha-tumtu-novo.css` (Drive).

#### Escolas mapeadas com hex oficiais (Grupo Especial 2027)

| Escola | Padrão | Cores | Hex |
|---|---|---|---|
| Unidos da Tijuca | B | Azul-pavão + Amarelo-ouro | #005BAA + #FFD700 |
| Paraíso do Tuluti | B | Azul-pavão + Amarelo-ouro | #005BAA + #FFD700 |
| Estação Primeira de Mangueira | B | Verde + Rosa | #009B3A + #FF69B4 |
| Unidos do Jacarezinho | A | Rosa + Branco | #E8427A + #FFFFFF |
| Acadêmicos do Salgueiro | A | Vermelho + Branco | #CC0000 + #FFFFFF |
| Unidos do Viradouro | A | Vermelho + Branco | #CC0000 + #FFFFFF |
| Imperatriz Leopoldinense | C | Verde + Branco + Dourado | #007A3D + #FFFFFF + #D4AF37 |
| Portela | A | Azul + Branco | #003DA5 + #FFFFFF |
| Beija-Flor de Nilópolis | A | Azul + Branco | #003DA5 + #FFFFFF |
| Unidos de Vila Isabel | A | Azul + Branco | #003DA5 + #FFFFFF |
| Mocidade Independente de Padre Miguel | C | Verde + Dourado + Branco | #006400 + #FFD700 + #FFFFFF |
| Acadêmicos do Grande Rio | C | Verde + Vermelho + Branco | #009B3A + #CC0000 + #FFFFFF |
| União de Maricá | C+ | Vermelho + Ouro + Branco + Azul | #CC0000 + #FFD700 + #FFFFFF + #003DA5 |

> ⚠️ União de Maricá tem 4 cores — padrão C+ ainda não definido. Tratar como Padrão C por ora, usando as 3 cores mais representativas.

#### Escolas mapeadas com hex oficiais (Série Ouro — Carnaval 2027)

Lista trazida pela Márcia em 13/jul/2026, "a título de conhecimento" — guardado aqui pra consulta futura (demonstrações, expansão do piloto), sem uso imediato no código ainda.

| # | Escola | Cores | Hex |
|---|---|---|---|
| 1 | São Clemente | Preto, Amarelo | #1A1A1A + #FFD700 |
| 2 | Unidos do Jacarezinho | Rosa, Branco | #E8427A + #FFFFFF |
| 3 | Unidos do Porto da Pedra | Vermelho, Branco | #CC0000 + #FFFFFF |
| 4 | Acadêmicos de Vigário Geral | Azul, Vermelho, Branco | #003DA5 + #CC0000 + #FFFFFF |
| 5 | Acadêmicos de Niterói | Azul, Branco | #003DA5 + #FFFFFF |
| 6 | União da Ilha do Governador | Azul, Vermelho, Branco | #003DA5 + #CC0000 + #FFFFFF |
| 7 | Unidos da Ponte | Azul marinho, Branco | #1B3A6B + #FFFFFF |
| 8 | Acadêmicos de Santa Cruz (campeã Série Prata) | Verde, Branco | #007A3D + #FFFFFF |
| 9 | Inocentes de Belford Roxo | Azul, Vermelho, Branco | #003DA5 + #CC0000 + #FFFFFF |
| 10 | Estácio de Sá | Vermelho, Branco | #CC0000 + #FFFFFF |
| 11 | Unidos de Padre Miguel | Verde, Dourado, Branco | #006400 + #FFD700 + #FFFFFF |
| 12 | Arranco do Engenho de Dentro | Azul, Branco | #003DA5 + #FFFFFF |
| 13 | Império Serrano | Verde, Branco | #007A3D + #FFFFFF |
| 14 | Em Cima da Hora | Azul, Branco | #003DA5 + #FFFFFF |
| 15 | Botafogo Samba Clube | Preto, Branco | #1A1A1A + #FFFFFF |
| 16 | União do Parque Acari | Rosa, Amarelo, Branco | #E8427A + #FFD700 + #FFFFFF |
| 17 | Acadêmicos de Santa Cruz (Série Prata) | Verde, Branco | #007A3D + #FFFFFF |

> Nota: linhas 8 e 17 são a mesma escola (Acadêmicos de Santa Cruz) com duas legendas diferentes na fonte original da Márcia — registrado como recebido, sem correção, até ela confirmar se é duplicidade real.
> Nota: "Unidos do Jacarezinho" aparece tanto no Grupo Especial quanto nesta lista de Série Ouro, com a mesma cor — mantido como recebido, não investiguei a causa (pode ser erro da fonte original dela).

---

## ATUALIZAR: Checklist (Seção 12) — adicionar itens da carteirinha

Adicionar ao checklist existente:

- [ ] O rodapé da carteirinha é fluido (poolside) — sem caixa, sem borda dura?
- [ ] O `padding-top` do `.rodape-content` é ≤ altura-do-gradiente - 65px para não cortar conteúdo?
- [ ] O header do verso usa gradiente rgba(0,0,0,0.22)→transparent, sem linha de corte?
- [ ] "Carnaval 2027" (e qualquer valor de Temporada) tem `white-space: nowrap`?
- [ ] O label de Mestre usa plural "MESTRES DE BATERIA" quando há 2 mestres?
- [ ] A assinatura no verso é o monograma T (não o wordmark "TumTu")?
- [ ] O risco abaixo do T é terracota #7c2d12?
- [ ] As variáveis CSS da escola estão sendo aplicadas via config-escola.js?
- [ ] O padrão de cores (A, B ou C) está correto para a escola configurada?
- [ ] "Carnaval 2027" e "31/07/2027" estão na mesma linha (não quebram)?
