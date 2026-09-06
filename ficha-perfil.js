// ── FICHA DE PERFIL — motor único de edição ──────────────────────────────
// Implementa a matriz de permissões aprovada em 06/jul/2026 (ver
// tumtu-documentacao-tecnica.md, seção 11). Usado por admin.html (Meu
// Perfil + ficha de Ritmista na Diretoria), super-admin.html (Meu Perfil)
// e carteirinha.html (perfil do Ritmista). Depende de SUPABASE_URL,
// SUPABASE_KEY e do client `sb` já existirem globalmente na página que o
// incluir.

// Botão de mostrar/ocultar senha — mesmo padrão (ícone, função) já usado em
// login.html/cadastro.html/redefinir-senha.html, duplicado aqui pra não criar
// dependência entre arquivos (mesmo critério já usado nesse projeto pra
// funções pequenas de UI repetidas).
const FP_ICONE_OLHO_ABERTO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const FP_ICONE_OLHO_FECHADO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.13 9.13 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function fpToggleSenha(id, btn) {
    const input = fpEl(id);
    const visivel = input.type === 'text';
    input.type = visivel ? 'password' : 'text';
    btn.setAttribute('aria-pressed', String(!visivel));
    btn.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
    btn.innerHTML = (visivel ? FP_ICONE_OLHO_ABERTO : FP_ICONE_OLHO_FECHADO).replace('<svg', '<svg aria-hidden="true"');
}

const FP_CAMPOS = [
    { id: 'fp-apelido',              col: 'apelido' },
    { id: 'fp-nome',                 col: 'nome' },
    { id: 'fp-genero',               col: 'genero' },
    { id: 'fp-genero-personalizado', col: 'genero_personalizado' },
    { id: 'fp-nacionalidade',        col: 'nacionalidade' },
    { id: 'fp-cpf',                  col: 'cpf' },
    { id: 'fp-nascimento',           col: 'nascimento', tipo: 'data' },
    { id: 'fp-responsavel-nome',     col: 'responsavel_nome' },
    { id: 'fp-responsavel-cpf',      col: 'responsavel_cpf' },
    { id: 'fp-responsavel-celular',  col: 'responsavel_celular' },
    { id: 'fp-celular',              col: 'celular' },
    { id: 'fp-email',                col: 'email' },
    { id: 'fp-membro-desde',         col: 'membro_desde' },
    { id: 'fp-endereco',             col: 'endereco' },
    { id: 'fp-numero',               col: 'numero' },
    { id: 'fp-complemento',          col: 'complemento' },
    { id: 'fp-bairro',               col: 'bairro' },
    { id: 'fp-cidade',               col: 'cidade' },
    { id: 'fp-estado',               col: 'estado' },
    { id: 'fp-pais',                 col: 'pais' },
    { id: 'fp-tipo-sanguineo',       col: 'tipo_sanguineo' },
    { id: 'fp-emergencia-nome',      col: 'emergencia_nome' },
    { id: 'fp-emergencia-parentesco',col: 'emergencia_parentesco' },
    { id: 'fp-emergencia-celular',   col: 'emergencia_celular' },
    { id: 'fp-observacoes',          col: 'observacoes' },
];

// Mesmos campos obrigatórios de cadastro.html (input[required]) --
// achado real dela, 25/ago/2026: cadastro trava esses campos em branco,
// mas editar (Meu Perfil/Admin/Super Admin) não travava NENHUM deles
// (só Medida, corrigida mais cedo na mesma sessão) -- dava pra apagar
// Nome, CPF, Endereço etc. e salvar em branco sem aviso nenhum. CPF,
// Instrumento e Responsável ficam de fora daqui por serem condicionais
// (checados à parte em fpSalvar -- CPF exceto quem usa Documento,
// Instrumento só Ritmista, Responsável só quem é menor de idade hoje).
// Apelido/Complemento/Bairro/Tipo sanguíneo continuam opcionais nos dois
// lugares, sem mudança.
const FP_CAMPOS_OBRIGATORIOS = new Set([
    'nome', 'nacionalidade', 'nascimento', 'celular', 'email',
    'endereco', 'numero', 'cidade', 'estado', 'pais',
    'emergencia_nome', 'emergencia_parentesco', 'emergencia_celular',
]);

let fpPartialHtml = null;
let fpFotoBase64 = null;
// Posição da foto dentro da moldura (equivalente a object-position, em
// porcentagem 0-100) -- arrastável em modo de edição (ver fpConfigurarDragFoto).
// Reseta pra 50/50 (centro) sempre que uma foto NOVA é escolhida.
let fpFotoPosX = 50;
let fpFotoPosY = 50;
// Depois de um arrasto de verdade (não só um toque parado), o navegador
// ainda dispara um "click" no soltar -- sem essa trava, todo arrasto
// reabriria o seletor de arquivo por engano logo em seguida.
let fpArrastoRecente = false;
let fpEstado = { container: null, alvo: null, meuPerfil: null, minhaPessoaId: null, autoedicao: false, editaveis: new Set(), aoSalvar: null };

// Cada coluna editável mora em "pessoas" (dado da pessoa, não muda entre baterias)
// ou "vinculos" (dado do vínculo com uma bateria específica) — usado por fpSalvar()
// pra saber em qual tabela gravar cada campo.
const FP_CAMPO_TABELA = {
    membro_desde: 'vinculos', bateria_instrumento_id: 'vinculos',
    naipe: 'vinculos', repique_bossa: 'vinculos', observacoes: 'vinculos',
    eh_admin_bateria: 'vinculos',
};

// Naipe (Diretor) guarda os instrumentos marcados como array de nomes --
// aqui só resolve pra um selo único, seguindo a regra combinada com a
// Márcia em 21/ago/2026: Primeira+Segunda vira "Surdo de Marcação",
// qualquer combinação de 2+ variantes de Repique vira só "Repique", uma
// opção sozinha (inclusive "Especiais") mostra o nome literal. Mesma lógica
// estendida em 25/ago/2026 pra Caixa de 12"/14" virarem só "Caixa".
const FP_NAIPE_SURDO_MARCACAO = ['Surdo de Primeira', 'Surdo de Segunda'];
const FP_NAIPE_REPIQUE = ['Repique', 'Repique Mor', 'Repique de Bossa'];
const FP_NAIPE_CAIXA = ['Caixa de 12"', 'Caixa de 14"'];
function fpResolverSeloNaipe(naipe) {
    const lista = Array.isArray(naipe) ? naipe.filter(Boolean) : [];
    if (lista.length === 0) return null;
    if (lista.length === 1) return lista[0];
    if (lista.length >= 2 && lista.every(n => FP_NAIPE_SURDO_MARCACAO.includes(n))) return 'Surdo de Marcação';
    if (lista.length >= 2 && lista.every(n => FP_NAIPE_REPIQUE.includes(n))) return 'Repique';
    if (lista.length >= 2 && lista.every(n => FP_NAIPE_CAIXA.includes(n))) return 'Caixa';
    return lista.join(', ');
}
function fpTabelaDoCampo(col) {
    return FP_CAMPO_TABELA[col] || 'pessoas';
}

// admin.html pode ter mais de um container com a partial injetada ao mesmo
// tempo (Meu Perfil + ficha da Diretoria + ficha do Ritmista), todos com os
// mesmos ids — por isso toda busca de elemento é escopada ao container ativo,
// nunca document.getElementById direto.
function fpEl(id) {
    return fpEstado.container ? fpEstado.container.querySelector('#' + id) : null;
}

// Tabela A (autoedição) + Tabela B (editando outra pessoa) — fonte única.
// ehConvidado (31/ago/2026): Convidado Especial (vinculos.eh_convidado=true)
// tem capacidade PRÓPRIA (editar_convidados_especiais) pra edição por
// Diretoria -- gerenciar esse grupo pequeno não deve exigir as capacidades
// granulares normais de Ritmistas/Diretoria (editar_instrumento_ritmista
// etc.). Autoedição e Super Admin não mudam -- ramos abaixo, inalterados.
function fpCamposEditaveis(atorPerfil, autoedicao, alvoPerfil, ehConvidado) {
    if (atorPerfil === 'super_admin') {
        return new Set(FP_CAMPOS.map(c => c.col).concat(['foto_url', 'bateria_instrumento_id', 'naipe', 'repique_bossa', 'medidas', 'eh_admin_bateria']));
    }

    if (!autoedicao && ehConvidado && (atorPerfil === 'diretor' || atorPerfil === 'mestre' || atorPerfil === 'apoio')) {
        const campos = new Set();
        if (typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_convidados_especiais')) {
            if (alvoPerfil === 'ritmista') { campos.add('bateria_instrumento_id'); campos.add('medidas'); }
        }
        return campos;
    }

    if (autoedicao) {
        const base = ['foto_url', 'nome', 'apelido', 'genero', 'genero_personalizado', 'celular', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'pais', 'emergencia_nome', 'emergencia_parentesco', 'emergencia_celular'];
        // Editar a própria Medida (31/ago/2026) virou capacidade própria
        // (editar_propria_medida) -- pedido dela: "NINGUÉM MAIS NA VIDA VAI
        // PODER EDITAR MEDIDA" sem permissão explícita, nem o Mestre. Antes
        // era liberado sem trava nenhuma pra Mestre/Diretor/Apoio. Ritmista
        // NUNCA passa por aqui pra medidas -- continua no mecanismo à parte
        // (ritmista_pode_editar_medidas, ver fpAplicarPermissaoRitmistaMedidas),
        // intocado por essa mudança. Convidado (01/set/2026) também nunca
        // passa por aqui -- vira genérico da bateria inteira, sem depender
        // de capacidade por pessoa (ver fpAplicarPermissaoConvidadoMedidas).
        if (!ehConvidado && (atorPerfil === 'diretor' || atorPerfil === 'mestre' || atorPerfil === 'apoio') && typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_propria_medida')) {
            base.push('medidas');
        }
        // Naipe é atributo só de Diretor -- autoeditado por enquanto (não
        // existe ainda uma capacidade "editar outro Mestre/Diretor/Apoio"
        // no sistema pra liberar isso pra outra pessoa também).
        if (atorPerfil === 'diretor') base.push('naipe');
        return new Set(base);
    }

    if ((atorPerfil === 'diretor' || atorPerfil === 'mestre' || atorPerfil === 'apoio') && (alvoPerfil === 'diretor' || alvoPerfil === 'mestre' || alvoPerfil === 'apoio')) {
        // Naipe que lidera, editando OUTRO Diretor (30/ago/2026) -- capacidade
        // própria (editar_naipe), agora com trava real no trigger
        // aplicar_matriz_edicao_vinculos. A própria pessoa sempre edita o
        // próprio naipe (ramo de autoedição acima), isso nunca muda.
        // Medida de outra pessoa da Diretoria (31/ago/2026) -- capacidade
        // nova (editar_medidas_diretoria), não existia NADA antes pra isso
        // (editar_medidas_ritmista é só pra alvo Ritmista, ramo abaixo).
        const campos = new Set();
        if (alvoPerfil === 'diretor' && typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_naipe')) campos.add('naipe');
        if (typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_medidas_diretoria')) campos.add('medidas');
        // "Admin desta bateria" (04/set/2026) -- mesmo padrão de Naipe logo
        // acima: capacidade própria (editar_admin_bateria), nunca autoeditado
        // (ninguém se marca Admin sozinho).
        if (alvoPerfil === 'diretor' && typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_admin_bateria')) campos.add('eh_admin_bateria');
        return campos;
    }

    if ((atorPerfil === 'diretor' || atorPerfil === 'mestre' || atorPerfil === 'apoio') && alvoPerfil === 'ritmista') {
        // Repique de Bossa saiu daqui em 26/ago/2026 -- campo delicado,
        // ganhou capacidade própria (editar_repique_bossa), conferida à
        // parte em fpAplicarPermissaoRepiqueBossa (nem quem já edita
        // Ritmistas normalmente tem acesso por padrão).
        // Reforma de Permissões (27-28/ago/2026): "editar_ritmistas" virou
        // duas capacidades separadas -- instrumento e medidas, cada uma só
        // aparece editável se a pessoa tiver a capacidade correspondente
        // (antes o botão aparecia pra qualquer Diretoria e o banco revertia
        // em silêncio quem não tinha permissão de verdade).
        const campos = new Set();
        if (typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_instrumento_ritmista')) campos.add('bateria_instrumento_id');
        if (typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_medidas_ritmista')) campos.add('medidas');
        if (typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_observacoes')) campos.add('observacoes');
        // Declaração/Desfile ficam FORA do fluxo Editar/Salvar de propósito
        // (28/ago/2026, pedido dela) -- continuam clique-instantâneo, só que
        // agora nunca reabrem a ficha inteira (ver fpRenderToggleDeclaracao/
        // fpRenderToggleNaoDesfila) -- não entram em `editaveis`.
        return campos;
    }

    return new Set();
}

async function fpMontar(containerEl) {
    if (!fpPartialHtml) {
        const res = await fetch('ficha-perfil.partial.html?v=34');
        fpPartialHtml = await res.text();
    }
    containerEl.innerHTML = fpPartialHtml;
    fpEstado.container = containerEl;
}

function fpFormatarData(iso) {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

const FP_GENERO_LABEL = { masculino: 'Masculino', feminino: 'Feminino', personalizado: 'Prefiro me identificar como...', nao_informado: 'Prefiro não informar' };

// Gênero só muda o rótulo de Mestre/Diretor (Mestra/Diretora) — Ritmista nunca varia.
// Sem gênero informado (personalizado/não informado/vazio) cai no masculino como padrão neutro.
function fpCargoLabel(perfil, genero) {
    if (perfil === 'mestre') return genero === 'feminino' ? 'Mestra de Bateria' : 'Mestre de Bateria';
    if (perfil === 'diretor') return genero === 'feminino' ? 'Diretora de Bateria' : 'Diretor de Bateria';
    // Antes caía no "Ritmista" do fallback abaixo -- bug real achado
    // 24/ago/2026 junto com a renomeação (Diretor -> Diretor de Bateria,
    // Apoio -> Diretor) -- abrir a ficha de um Apoio sempre mostrou o
    // cargo errado.
    if (perfil === 'apoio') return genero === 'feminino' ? 'Diretora (Apoio)' : 'Diretor (Apoio)';
    if (perfil === 'super_admin') return 'Super Admin';
    return 'Ritmista';
}

// Data de nascimento como texto com máscara, no lugar do <input type="date">
// nativo — mesma correção aplicada em cadastro.html (16/jul/2026): o nativo
// estourava a margem em alguns navegadores/ambientes, e a Márcia preferiu de
// qualquer forma (funções duplicadas aqui, não compartilhadas num arquivo
// comum — mesmo critério já usado em outras funções pequenas de UI).
function fpMascaraData(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 8) v = v.slice(0, 8);
    v = v.replace(/^(\d{2})(\d)/, '$1/$2');
    v = v.replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
    input.value = v;
}

// Máscara de CPF/Celular e maiúscula automática de nome/endereço --
// mesmas funções já usadas em cadastro.html, duplicadas aqui (não
// compartilhadas num arquivo comum, mesmo critério de fpMascaraData
// acima). Achado dela, 25/ago/2026: essas "ajudas" só existiam no
// cadastro novo -- editar um cadastro já existente (Meu Perfil, ou o
// Admin editando a ficha de alguém) nunca teve nenhuma delas, em
// nenhum campo. "Apelido" continua de fora de propósito (abreviações
// tipo "LC" -- mesma exceção do cadastro).
function fpMascaraCPF(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = v;
}
function fpMascaraCelular(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.replace(/^(\d{2})(\d)/, '($1) $2');
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
    input.value = v;
}
const FP_PREPOSICOES_MINUSCULAS = new Set(['de', 'da', 'do', 'dos', 'das']);
function fpCorrigirCapitalizacao(texto) {
    return texto.trim().toLowerCase().split(/\s+/).map((palavra, i) => {
        if (i > 0 && FP_PREPOSICOES_MINUSCULAS.has(palavra)) return palavra;
        return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    }).join(' ');
}
function fpAplicarCapitalizacao(campo) {
    if (!campo.value.trim()) return;
    campo.value = fpCorrigirCapitalizacao(campo.value);
}
// Nome completo tem uma exceção, pedido dela 25/ago/2026: nomes
// estrangeiros podem ter uma grafia própria (maiúscula/minúscula fora
// do padrão), e ela quer poder digitar do jeito certo quando for o
// caso -- mas só o Super Admin ganha esse escape, todo mundo mais
// (a própria pessoa editando o próprio nome) continua com a ajuda.
function fpAplicarCapitalizacaoNome(campo) {
    if (fpEstado.meuPerfil === 'super_admin') return;
    fpAplicarCapitalizacao(campo);
}

function fpDataParaISO(str) {
    const m = (str || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dia, mes, ano] = m;
    const d = new Date(`${ano}-${mes}-${dia}T00:00:00`);
    const valida = d.getFullYear() === Number(ano) && (d.getMonth() + 1) === Number(mes) && d.getDate() === Number(dia);
    return valida ? `${ano}-${mes}-${dia}` : null;
}

function fpISOparaData(iso) {
    const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Mesma regra/número já usado em cadastro.html (verificarMenorIdade,
// 17/ago/2026) -- duplicada aqui em vez de compartilhada num arquivo
// comum, mesmo critério já usado em outras funções pequenas repetidas
// deste arquivo.
const FP_IDADE_MAIOR = 18;
// Idade máxima plausível pro alerta de nascimento digitado errado (mesma
// regra e mesmo motivo de cadastro.html, 03/set/2026).
const FP_IDADE_MAXIMA = 100;
function fpApenasDigitos(valor) {
    return (valor || '').replace(/\D/g, '');
}
// Celular (11 dígitos, começa com 9 depois do DDD) OU fixo (10 dígitos,
// não começa com 9) -- regra refinada 03/set/2026, achado dela: número
// fixo de verdade (comum em contato de emergência de gente mais velha)
// não devia ser tratado como erro só por ter 10 dígitos. Mas um número
// que começa com 9 e tem só 10 dígitos continua errado -- só pode faltar
// um dígito de um celular truncado, nunca é fixo de verdade.
function fpTelefoneValido(valor) {
    const d = fpApenasDigitos(valor);
    if (d.length === 11 && d[2] === '9') return true;
    if (d.length === 10 && d[2] !== '9') return true;
    return false;
}
function fpEhMenorIdade(nascimentoISO) {
    if (!nascimentoISO) return false;
    const nascimento = new Date(nascimentoISO + 'T00:00:00');
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const aniversarioJaPassou = (hoje.getMonth() > nascimento.getMonth())
        || (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
    if (!aniversarioJaPassou) idade--;
    return idade < FP_IDADE_MAIOR;
}

// Modal de confirmação personalizado do TumTu -- substitui o confirm()
// nativo do navegador em todo o app (03/set/2026, pedido dela: "tudo do
// TumTu é personalizado"). Compartilhado por admin.html e carteirinha.html
// (mesmo critério de fpPodeDescartar logo abaixo). Retorna uma Promise que
// resolve true (confirmou) ou false (cancelou/clicou fora).
function tumtuConfirmar(mensagem, opcoes) {
    opcoes = opcoes || {};
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'tumtu-confirm-overlay';
        const box = document.createElement('div');
        box.className = 'tumtu-confirm-box';
        const texto = document.createElement('p');
        texto.className = 'tumtu-confirm-texto';
        texto.textContent = mensagem;
        const acoes = document.createElement('div');
        acoes.className = 'tumtu-confirm-acoes';
        const btnCancelar = document.createElement('button');
        btnCancelar.type = 'button';
        btnCancelar.className = 'btn-ficha';
        btnCancelar.textContent = opcoes.textoCancelar || 'Cancelar';
        const btnConfirmar = document.createElement('button');
        btnConfirmar.type = 'button';
        btnConfirmar.className = 'btn-ficha btn-ficha-danger';
        btnConfirmar.textContent = opcoes.textoConfirmar || 'Confirmar';
        acoes.appendChild(btnCancelar);
        acoes.appendChild(btnConfirmar);
        box.appendChild(texto);
        box.appendChild(acoes);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        function fechar(resultado) { overlay.remove(); resolve(resultado); }
        btnCancelar.addEventListener('click', () => fechar(false));
        btnConfirmar.addEventListener('click', () => fechar(true));
        overlay.addEventListener('click', e => { if (e.target === overlay) fechar(false); });
        btnConfirmar.focus();
    });
}

// Confirma antes de descartar edição não salva (03/set/2026, pedido dela).
// true = pode fechar/cancelar sem perguntar (nada mudou, ou a pessoa
// confirmou que quer descartar mesmo). false = ficar onde está.
async function fpPodeDescartar() {
    if (!fpEstado.sujo) return true;
    return await tumtuConfirmar('Você tem alterações não salvas. Quer mesmo sair sem salvar?', { textoConfirmar: 'Sair sem salvar' });
}

// Aviso de dado próprio incompleto ao logar (03/set/2026, pedido dela
// depois de achar erros reais no banco). Escopo de propósito: só os 2
// campos que a própria pessoa já consegue editar hoje (celular,
// emergencia_celular) -- CPF/nascimento/CPF do responsável continuam
// travados pra autoedição (CPF é a âncora de identidade do sistema),
// destravar esses fica pra uma mudança de banco separada, mais cuidadosa.
function fpProblemasDadosProprios(pessoa) {
    if (!pessoa) return [];
    const problemas = [];
    const ehBrasileira = pessoa.nacionalidade === 'Brasileira' || !pessoa.nacionalidade;
    if (ehBrasileira) {
        if (pessoa.celular && fpApenasDigitos(pessoa.celular).length !== 11) {
            problemas.push({ campo: 'celular', rotulo: 'Celular' });
        }
        // Celular de EMERGÊNCIA aceita fixo também (03/set/2026, pedido
        // dela) -- pode ser o telefone de casa de alguém mais velho. Só o
        // celular da própria pessoa exige celular de verdade.
        if (pessoa.emergencia_celular && !fpTelefoneValido(pessoa.emergencia_celular)) {
            problemas.push({ campo: 'emergencia_celular', rotulo: 'Celular de emergência' });
        }
    }
    return problemas;
}

// Insere (ou remove, se não houver problema) o aviso dentro do elemento
// indicado -- cada tela (admin.html/carteirinha.html) já tem seu próprio
// container fixo pra isso, só chama essa função depois que os dados da
// pessoa terminam de carregar (nunca antes -- mesma regra de "tela sempre
// completa" do resto do app). Cobre TODOS os campos (03/set/2026, pedido
// dela: "todo usuário que tiver com algum erro, quando logar vai ser
// apresentada uma mensagem de alerta") -- não só celular/emergência, que
// era o escopo (errado) da primeira versão. fpProblemasFicha é a mesma
// checagem usada dentro da ficha (ver fpIniciar).
function fpRenderizarAvisoDadosProprios(pessoa, elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const problemas = (typeof fpProblemasFicha === 'function') ? fpProblemasFicha(pessoa) : [];
    if (problemas.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
    // "Fale com a Diretoria" não faz sentido pra quem já É Diretoria
    // (achado dela, 04/set/2026, olhando o aviso do Mestre Lolo) -- Mestre/
    // Diretor/Apoio caem no suporte em vez disso.
    const ehDiretoria = pessoa && ['mestre', 'diretor', 'apoio'].includes(pessoa.perfil);
    const contato = ehDiretoria ? 'fale com o suporte' : 'fale com a Diretoria';
    el.innerHTML = `⚠️ ${problemas.join(' — ')}. Toque em "Editar" no seu perfil -- se não conseguir corrigir sozinho, ${contato}.`;
    el.style.display = 'block';
}

// Declaração do Responsável / Desfile (28/ago/2026) -- clique instantâneo
// de propósito (pedido dela: "adorava" o interruptor, e ele não precisa do
// fluxo Editar/Salvar já que é uma marcação isolada). Diferente da versão
// antiga (admin.html, removida), clicar aqui NUNCA reabre a ficha inteira
// -- só atualiza a si mesmo + o selo do cabeçalho + a lista por trás
// (carregarRitmistas, se existir nessa página), preservando qualquer
// edição de outros campos em andamento (era isso que causava o Salvar
// sumir: abrirCadastro() de novo resetava a ficha pro modo de visualização).
async function fpAlternarDeclaracao() {
    if (!fpEstado.declaracaoPodeEditar || !fpEstado.vinculoIdToggles) return;
    const novoValor = !fpEstado.declaracaoValor;
    fpEstado.declaracaoValor = novoValor;
    fpRenderToggleDeclaracao();
    const headers = await fpAuthHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=eq.${fpEstado.vinculoIdToggles}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ declaracao_responsavel: novoValor }),
    });
    fpEstado.alvo.declaracao_responsavel = novoValor;
    // Não chama carregarRitmistas() aqui de propósito -- achado dela: o
    // re-render da lista inteira por trás do modal causava um piscar
    // visível a cada clique. A lista sincroniza sozinha quando a ficha
    // fecha (abrirCadastro/fecharModal) ou na próxima atualização automática.
}

function fpRenderToggleDeclaracao() {
    const area = fpEl('fp-declaracao-area');
    if (!area) return;
    const valor = fpEstado.declaracaoValor;
    const podeEditar = fpEstado.declaracaoPodeEditar;
    const trackBg = valor ? '#1f4d1f' : '#c62828';
    const thumbPos = valor ? '21px' : '3px';
    const labelColor = valor ? '#1f4d1f' : '#c62828';
    const labelText = valor ? 'Entregue' : 'Não entregue';
    area.innerHTML = `
        <div ${podeEditar ? `onclick="fpAlternarDeclaracao()"` : ''}
             style="display:inline-flex;align-items:center;gap:10px;${podeEditar ? 'cursor:pointer;' : ''}user-select:none;">
            <div style="width:44px;height:24px;border-radius:12px;background:${trackBg};
                        position:relative;transition:background 0.2s;flex-shrink:0;display:block;box-sizing:border-box;">
                <div style="position:absolute;top:3px;left:${thumbPos};
                            width:16px;height:16px;border-radius:50%;
                            background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);
                            transition:left 0.2s;"></div>
            </div>
            <span style="font-size:13px;font-weight:500;color:${labelColor};">${labelText}</span>
        </div>`;
}

// Desfile: o interruptor representa a situação normal (vai desfilar = "Ok",
// verde), não a exceção -- desligado = "Não desfila" (mesmo texto do selo
// do card em admin.html). nao_desfila continua o nome da coluna no banco,
// só a leitura visual foi invertida (pedido dela, 28/ago/2026).
async function fpAlternarNaoDesfila() {
    if (!fpEstado.naoDesfilaPodeEditar || !fpEstado.vinculoIdToggles) return;
    const novoValor = !fpEstado.naoDesfilaValor;
    fpEstado.naoDesfilaValor = novoValor;
    fpRenderToggleNaoDesfila();
    const headers = await fpAuthHeaders();
    await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=eq.${fpEstado.vinculoIdToggles}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nao_desfila: novoValor }),
    });
    fpEstado.alvo.nao_desfila = novoValor;
    // Selo do cabeçalho da ficha (fc-status-badge, montado por admin.html
    // fora do container da ficha compartilhada) -- atualiza direto, sem
    // reabrir nada, pra não ficar mostrando "Ativo" desatualizado.
    const badge = document.getElementById('fc-status-badge');
    if (badge && fpEstado.alvo.status === 'aprovado') {
        badge.innerHTML = novoValor
            ? '<span class="badge badge-nao-desfila">Não Desfila</span>'
            : '<span class="badge badge-aprovado">Ativo</span>';
    }
    // Não chama carregarRitmistas() aqui de propósito -- mesmo motivo do
    // Declaração acima: piscava a lista por trás a cada clique.
}

function fpRenderToggleNaoDesfila() {
    const area = fpEl('fp-nao-desfila-area');
    if (!area) return;
    const desfila = !fpEstado.naoDesfilaValor;
    const podeEditar = fpEstado.naoDesfilaPodeEditar;
    const trackBg = desfila ? '#2d7a4f' : '#c7d3e0';
    const thumbPos = desfila ? '21px' : '3px';
    const labelColor = desfila ? '#2d7a4f' : '#706c87';
    const labelText = desfila ? 'Desfila' : 'Não desfila';
    area.innerHTML = `
        <div ${podeEditar ? `onclick="fpAlternarNaoDesfila()"` : ''}
             style="display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;${podeEditar ? 'cursor:pointer;' : ''}user-select:none;">
            <div style="width:44px;height:24px;border-radius:12px;background:${trackBg};
                        position:relative;transition:background 0.2s;flex-shrink:0;display:block;box-sizing:border-box;">
                <div style="position:absolute;top:3px;left:${thumbPos};
                            width:16px;height:16px;border-radius:50%;
                            background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);
                            transition:left 0.2s;"></div>
            </div>
            <span style="font-size:13px;font-weight:500;color:${labelColor};">${labelText}</span>
            ${desfila ? '' : '<span style="font-size:13px;color:#706c87;">(sem fantasia)</span>'}
        </div>`;
}

// Ícone (i) de explicação — mesmo padrão usado em cadastro.html (duplicado
// aqui, não compartilhado num arquivo comum, mesmo critério já usado em
// outras funções pequenas de UI do projeto, ex: toggleSenha).
function toggleInfoCampo(btn) {
    const texto = btn.closest('.auth-form-group, .ficha-campo').querySelector('.info-campo-texto');
    const abrindo = !texto.classList.contains('visivel');
    texto.classList.toggle('visivel', abrindo);
    btn.setAttribute('aria-expanded', String(abrindo));
}

function fpIniciar(alvo, meuPerfil, minhaPessoaId, opcoes) {
    opcoes = opcoes || {};
    const autoedicao = alvo.pessoa_id === minhaPessoaId;
    const editaveis = fpCamposEditaveis(meuPerfil, autoedicao, alvo.perfil, alvo.eh_convidado === true);
    fpEstado = { container: fpEstado.container, alvo, meuPerfil, minhaPessoaId, autoedicao, editaveis, medidasRestritoAoVazio: false, aoSalvar: opcoes.aoSalvar || null, sujo: false };
    fpFotoBase64 = null;
    fpFotoPosX = alvo.foto_pos_x ?? 50;
    fpFotoPosY = alvo.foto_pos_y ?? 50;

    // Marca "alterações não salvas" (03/set/2026, pedido dela: "se ela
    // quiser fechar antes de salvar, pergunte") -- delegado no container
    // inteiro, então cobre qualquer campo de edição atual ou futuro sem
    // precisar listar cada um. Anexado só uma vez por container (ele é
    // reaproveitado entre pessoas diferentes, fpIniciar roda de novo a
    // cada abertura).
    if (fpEstado.container && !fpEstado.container.dataset.fpSujoAnexado) {
        fpEstado.container.dataset.fpSujoAnexado = '1';
        const marcarSujo = () => { fpEstado.sujo = true; };
        fpEstado.container.addEventListener('input', marcarSujo);
        fpEstado.container.addEventListener('change', marcarSujo);
    }

    const cargo = fpCargoLabel(alvo.perfil, alvo.genero);
    fpEl('fp-titulo').textContent = alvo.nome || '—';
    fpEl('fp-sub').textContent = [alvo.apelido || '', cargo].filter(Boolean).join(' · ');

    const circle = fpEl('fp-foto-circle');
    circle.innerHTML = alvo.foto_url
        ? `<img src="${alvo.foto_url}" style="width:100%;height:100%;object-fit:cover;object-position:${fpFotoPosX}% ${fpFotoPosY}%;">`
        : `<svg viewBox="0 0 24 24" width="32" height="32" fill="#c0bdd0"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    // Sempre escondido aqui (modo visualização) — só aparece dentro de
    // fpAtivarEdicao(). Antes ficava visível de cara sempre que a foto era
    // um campo editável (bug real reportado pela Márcia, 12/ago/2026: o
    // círculo/botão pareciam clicáveis o tempo todo, mas trocar a foto sem
    // clicar "Editar" antes não salvava nada — só parecia funcionar).
    fpEl('fp-foto-acao').style.display = 'none';
    circle.classList.remove('mp-foto-circle--editavel');

    FP_CAMPOS.forEach(({ id, col, tipo }) => {
        const strong = fpEl(id);
        if (!strong) return;
        const valor = alvo[col];
        strong.textContent = tipo === 'data' ? fpFormatarData(valor)
            : col === 'genero' ? (FP_GENERO_LABEL[valor] || '—')
            : (valor || '—');
    });

    // "Como se identifica" só existe pra quem escolheu "Prefiro me
    // identificar como..." no Gênero — pra todo o resto, some a linha
    // inteira em vez de mostrar um "—" solto que parecia dado faltando
    // (achado da Márcia, 14/ago/2026, mesmo critério já usado no campo
    // de Instrumento pra quem não é Ritmista).
    const campoIdentificacao = fpEl('fp-genero-personalizado');
    if (campoIdentificacao) {
        campoIdentificacao.closest('.ficha-campo').style.display = alvo.genero === 'personalizado' ? '' : 'none';
    }

    if (alvo.tipo_documento && alvo.numero_documento) {
        fpEl('fp-bloco-documento').style.display = '';
        fpEl('fp-documento').textContent = `${alvo.tipo_documento}: ${alvo.numero_documento}`;
        // CPF deixa de ser obrigatório pra quem já usa Documento (Passaporte/
        // RNE) no lugar -- mesma regra de fpSalvar/cadastro.html.
        const asteriscoCpf = fpEl('fp-cpf-asterisco');
        if (asteriscoCpf) asteriscoCpf.style.display = 'none';
    } else {
        fpEl('fp-bloco-documento').style.display = 'none';
        const asteriscoCpf = fpEl('fp-cpf-asterisco');
        if (asteriscoCpf) asteriscoCpf.style.display = '';
    }

    // Responsável (nome/CPF/celular) aparece pra quem É menor de idade
    // HOJE (calculado da data de nascimento, mesma regra de
    // cadastro.html) OU já tinha esse dado salvo antes (ex: fez 18 anos
    // depois do cadastro -- o dado histórico continua visível, não some).
    // Bug real achado por ela, 25/ago/2026 ("não está aparecendo os dados
    // do responsável quando é menor de idade"): antes só aparecia se já
    // existisse dado salvo -- um menor sem essa informação preenchida
    // nunca tinha a seção revelada, nem em modo Editar, então nem o Super
    // Admin (único perfil que pode editar esses campos) conseguia
    // preencher.
    const temResponsavel = !!(alvo.responsavel_nome || alvo.responsavel_cpf || alvo.responsavel_celular);
    const ehMenorHoje = fpEhMenorIdade(alvo.nascimento);
    const mostrarResponsavel = temResponsavel || ehMenorHoje;
    fpEl('fp-bloco-responsavel-nome').style.display = mostrarResponsavel ? '' : 'none';
    fpEl('fp-bloco-responsavel-cpf').style.display = mostrarResponsavel ? '' : 'none';
    fpEl('fp-bloco-responsavel-celular').style.display = mostrarResponsavel ? '' : 'none';
    // Asterisco só quando É menor de idade hoje (obrigatório de verdade) --
    // seção pode aparecer mesmo sem ser menor (dado histórico preservado,
    // ver comentário acima), mas nesse caso não é obrigatório preencher.
    ['fp-responsavel-asterisco-1', 'fp-responsavel-asterisco-2', 'fp-responsavel-asterisco-3'].forEach(id => {
        const el = fpEl(id);
        if (el) el.style.display = ehMenorHoje ? '' : 'none';
    });

    // Dados sensíveis (Reforma de Permissões, 27-28/ago/2026, dividida em 3
    // capacidades separadas em 02/set/2026 -- antes CPF/documento/endereço/
    // contato de emergência/dados do responsável eram uma capacidade só;
    // pedido dela: "Em Dados Pessoais, seria somente os dados Pessoais...
    // Em Endereço, separaria para ver o Endereço. Contato de Emergência
    // seria para ver o Contato de Emergência"). A própria pessoa e o Super
    // Admin sempre veem os próprios/de qualquer um. Some a linha inteira
    // (nunca mostra "restrito" no lugar do dado).
    const ehRitmista = alvo.perfil === 'ritmista';
    const podeVer = (chave) => autoedicao || meuPerfil === 'super_admin' || (typeof tenhoCapacidade === 'function' && tenhoCapacidade(chave));
    const podeVerDadosPessoais = podeVer(ehRitmista ? 'ver_dados_sensiveis_ritmistas' : 'ver_dados_sensiveis_acessos');
    const podeVerEndereco = podeVer(ehRitmista ? 'ver_endereco_ritmista' : 'ver_endereco_acessos');
    const podeVerContatoEmergencia = podeVer(ehRitmista ? 'ver_contato_emergencia_ritmista' : 'ver_contato_emergencia_acessos');
    const fpEsconder = (ids) => ids.forEach(id => {
        const el = fpEl(id);
        if (!el) return;
        const bloco = el.classList.contains('ficha-campo') ? el : el.closest('.ficha-campo');
        if (bloco) bloco.style.display = 'none';
    });
    if (!podeVerDadosPessoais) {
        fpEsconder(['fp-cpf', 'fp-bloco-documento', 'fp-bloco-responsavel-nome', 'fp-bloco-responsavel-cpf', 'fp-bloco-responsavel-celular']);
    }
    if (!podeVerEndereco) {
        fpEsconder(['fp-endereco', 'fp-numero', 'fp-complemento', 'fp-bairro', 'fp-cidade', 'fp-estado', 'fp-pais']);
    }
    if (!podeVerContatoEmergencia) {
        fpEsconder(['fp-emergencia-nome', 'fp-emergencia-parentesco', 'fp-emergencia-celular']);
    }

    // Observações (28/ago/2026): campo livre exclusivo da Diretoria pra
    // EDITAR (isso nunca muda -- Ritmista nunca escreve a própria
    // Observação) -- ao contrário do bloco de dados sensíveis acima (a
    // própria pessoa sempre vê os próprios dados), aqui a própria pessoa só
    // vê se a bateria liberar "ver" (ritmista_pode_ver_observacoes, sessão
    // seguinte, mesmo padrão de Desfile/Declaração) -- checado de forma
    // assíncrona em fpAplicarPermissaoAutoedicaoToggles, já que depende de
    // buscar a configuração da bateria. Bloco inteiro (#fp-bloco-observacoes,
    // mesmo padrão de #fp-bloco-declaracao/#fp-bloco-nao-desfila) nasce
    // escondido no HTML -- corrigido em 29/ago/2026 (bug real achado por
    // ela: só o campo interno era escondido, não a seção com o título
    // "Observações", que ficava visível pra QUALQUER Ritmista mesmo com a
    // permissão desligada -- não vazava o texto da nota, mas vazava o
    // título/seção vazia).
    const podeVerObservacoes = alvo.perfil === 'ritmista' && !autoedicao && typeof tenhoCapacidade === 'function' && tenhoCapacidade('ver_observacoes');
    const blocoObservacoes = fpEl('fp-bloco-observacoes');
    if (blocoObservacoes) blocoObservacoes.style.display = podeVerObservacoes ? '' : 'none';

    // Declaração do Responsável / Desfile (28/ago/2026): exclusivo da
    // Diretoria (a própria pessoa nunca vê), FORA do fluxo Editar/Salvar de
    // propósito -- pedido dela: "adorava" o interruptor de clique
    // instantâneo, só que agora ele nunca reabre a ficha inteira (isso é
    // que causava o Salvar sumir no meio de outra edição) -- clicar só
    // atualiza a si mesmo. Ver fpRenderToggleDeclaracao/fpRenderToggleNaoDesfila.
    fpEstado.vinculoIdToggles = alvo.vinculo_id;
    const podeVerDeclaracao = alvo.perfil === 'ritmista' && !autoedicao && fpEhMenorIdade(alvo.nascimento) && typeof tenhoCapacidade === 'function' && tenhoCapacidade('ver_declaracao_responsavel');
    const blocoDeclaracao = fpEl('fp-bloco-declaracao');
    if (blocoDeclaracao) {
        blocoDeclaracao.style.display = podeVerDeclaracao ? '' : 'none';
        if (podeVerDeclaracao) {
            fpEstado.declaracaoValor = !!alvo.declaracao_responsavel;
            fpEstado.declaracaoPodeEditar = typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_declaracao_responsavel');
            fpRenderToggleDeclaracao();
        }
    }

    const podeVerNaoDesfila = alvo.perfil === 'ritmista' && !autoedicao && typeof tenhoCapacidade === 'function' && tenhoCapacidade('ver_nao_desfila');
    const blocoNaoDesfila = fpEl('fp-bloco-nao-desfila');
    if (blocoNaoDesfila) {
        blocoNaoDesfila.style.display = podeVerNaoDesfila ? '' : 'none';
        if (podeVerNaoDesfila) {
            fpEstado.naoDesfilaValor = !!alvo.nao_desfila;
            fpEstado.naoDesfilaPodeEditar = typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_nao_desfila');
            fpRenderToggleNaoDesfila();
        }
    }

    // Autoedição (Meu Perfil): o próprio Ritmista NUNCA marca Desfile/
    // Declaração (só a Diretoria decide isso), mas pode enxergar o valor
    // se a bateria liberou "ver" -- pedido dela, 28/ago/2026: "quero que
    // tenha os dois interruptores. Na hora o adm vai decidir se o ritmista
    // vai poder ver ou não." Fire-and-forget, mesmo padrão de
    // fpAplicarPermissaoRepiqueBossa -- os blocos já nasceram escondidos
    // acima (podeVerDeclaracao/podeVerNaoDesfila exigem !autoedicao).
    fpAplicarPermissaoAutoedicaoToggles(alvo);

    const campoCadastro = fpEl('fp-campo-cadastro');
    if (campoCadastro) {
        campoCadastro.style.display = alvo.created_at ? '' : 'none';
        const el = fpEl('fp-cadastro');
        if (el && alvo.created_at) el.textContent = new Date(alvo.created_at).toLocaleDateString('pt-BR');
    }

    fpEl('fp-secao-instrumento').style.display = alvo.perfil === 'ritmista' ? '' : 'none';
    fpEl('fp-instrumento').textContent = alvo.instrumento_nome || '—';

    // Medidas (Camisa/Fantasia/Calça/Sapato + qualquer tipo novo criado
    // pelo Super Admin) são renderizadas de tudo dinâmico agora -- fire-
    // and-forget, não trava o resto do render enquanto a resposta não
    // chega (23/ago/2026, reforma de medidas abertas).
    fpRenderizarMedidas(alvo);

    // Entrega de Figurinos (23/ago/2026) -- fire-and-forget, mesmo padrão de
    // fpRenderizarMedidas. Puro resumo de leitura, nunca editável aqui --
    // marcar entregue é sempre pela tela dedicada (Mais → Figurino).
    fpRenderizarEntregaFigurino(alvo);

    // Eventos (30/ago/2026) -- mesmo padrão de leitura de Entrega de
    // Figurinos, marcar presença é sempre pela tela dedicada (Mais →
    // Presença).
    fpRenderizarEventos(alvo);

    // Ritmista só ganha "Editar" de Medidas se a bateria liberou (Permissões
    // → "Permitir que o ritmista edite as medidas") E se sobrar algum campo
    // em branco pra preencher -- sem isso, fica exatamente como já era
    // (Ritmista nunca vê Medidas como editável). Fire-and-forget, roda
    // depois do resto da tela já estar pronta.
    fpAplicarPermissaoRitmistaMedidas(alvo);
    // Convidado (01/set/2026) -- mesma ideia, mas genérica pra bateria
    // inteira e pra qualquer tipo de Convidado (Ritmista/Diretor/Apoio),
    // ver fpAplicarPermissaoConvidadoMedidas.
    fpAplicarPermissaoConvidadoMedidas(alvo);

    // Repique de Bossa (26/ago/2026): campo delicado, começa sempre
    // escondido -- só aparece depois de fpAplicarPermissaoRepiqueBossa
    // confirmar que quem está olhando tem permissão de ver (nunca mostra o
    // valor real na tela antes de confirmar).
    const blocoRepiqueBossa = fpEl('fp-bloco-repique-bossa');
    if (blocoRepiqueBossa) blocoRepiqueBossa.style.display = 'none';
    fpAplicarPermissaoRepiqueBossa(alvo);

    // Naipe só existe pra Diretor. Autoedição e Super Admin sempre veem --
    // pra quem está olhando a ficha de OUTRO Diretor, passa a depender das
    // capacidades ver_naipe/editar_naipe (30/ago/2026, pedido dela: "se não
    // tiver nem visualizar é pq essa informação nem vai aparecer para a
    // pessoa" -- antes qualquer um com acesso à Diretoria via ver_acessos
    // enxergava, sem checar nada específico).
    const secaoNaipe = fpEl('fp-secao-naipe');
    if (secaoNaipe) {
        // Convidado Especial (31/ago/2026) nunca vê Naipe, nem em autoedição
        // -- não lidera naipe nenhum de verdade, campo não faz sentido pra
        // ele (achado dela: "não faz sentido").
        const podeVerNaipe = alvo.perfil === 'diretor' && alvo.eh_convidado !== true && (
            fpEstado.autoedicao || fpEstado.meuPerfil === 'super_admin' ||
            (typeof tenhoCapacidade === 'function' && (tenhoCapacidade('ver_naipe') || tenhoCapacidade('editar_naipe')))
        );
        secaoNaipe.style.display = podeVerNaipe ? '' : 'none';
        if (podeVerNaipe) fpEl('fp-naipe').textContent = fpResolverSeloNaipe(alvo.naipe) || '—';
    }

    // "Admin desta bateria" (04/set/2026) -- mesmo padrão de Naipe logo
    // acima, capacidades próprias (ver_admin_bateria/editar_admin_bateria).
    const secaoAdminBateria = fpEl('fp-secao-admin-bateria');
    if (secaoAdminBateria) {
        const podeVerAdminBateria = alvo.perfil === 'diretor' && alvo.eh_convidado !== true && (
            fpEstado.autoedicao || fpEstado.meuPerfil === 'super_admin' ||
            (typeof tenhoCapacidade === 'function' && (tenhoCapacidade('ver_admin_bateria') || tenhoCapacidade('editar_admin_bateria')))
        );
        secaoAdminBateria.style.display = podeVerAdminBateria ? '' : 'none';
        if (podeVerAdminBateria) fpEl('fp-admin-bateria').textContent = alvo.eh_admin_bateria ? 'Sim' : 'Não';
    }
    // Escondida por padrão mesmo em autoedição — só aparece dentro do modo
    // "Editar" (ver fpAtivarEdicao/fpCancelarEdicao), pra ter o mesmo
    // comportamento do resto da ficha (achado 21/jul/2026: antes ficava
    // sempre visível e pronta pra uso, diferente de todo o resto da tela,
    // que exige clicar em "Editar" primeiro — confundia).
    fpEl('fp-secao-senha').style.display = 'none';
    fpEl('fp-senha-nova').value = '';
    fpEl('fp-senha-confirmar').value = '';

    // Face ID/Digital (29/ago/2026) -- fora do fluxo Editar/Salvar (é
    // clique instantâneo, mesmo padrão de Desfile/Declaração), e só pra
    // quem está vendo o PRÓPRIO perfil, no PRÓPRIO aparelho -- não faz
    // sentido ativar isso na ficha de outra pessoa. Começa sempre escondida
    // até fpAplicarFaceId confirmar que o aparelho suporta de verdade.
    const secaoFaceId = fpEl('fp-secao-faceid');
    if (secaoFaceId) secaoFaceId.style.display = 'none';
    fpAplicarFaceId(alvo);

    const mensagem = fpEl('fp-mensagem');
    mensagem.style.display = 'none';
    mensagem.className = 'fp-mensagem';

    fpEl('fp-btn-editar').style.display = editaveis.size > 0 ? 'inline-flex' : 'none';
    fpEl('fp-btn-salvar').style.display = 'none';
    fpEl('fp-btn-cancelar').style.display = 'none';

    // Aviso de dado incompleto visível assim que a ficha ABRE (03/set/2026,
    // pedido dela: "eu não quero ter que ficar editando" -- antes só
    // aparecia se alguém tentasse Salvar). Cobre TODOS os campos (CPF,
    // nascimento, celular, celular de emergência, CPF/celular do
    // responsável), não só os que a própria pessoa consegue editar --
    // quem está vendo (Super Admin, Diretoria) só precisa olhar a ficha,
    // sem precisar clicar em Editar/Salvar antes.
    const fpProblemasView = fpProblemasFicha(alvo);
    if (fpProblemasView.length > 0) {
        mensagem.className = 'fp-mensagem erro';
        mensagem.textContent = '⚠️ ' + fpProblemasView.join(' — ');
        mensagem.style.display = 'block';
    }
}

// Junta todos os problemas de dado incompleto de UMA pessoa (CPF,
// nascimento, celular, celular de emergência, CPF/celular do responsável)
// -- usado tanto no aviso ao abrir a ficha (visão de qualquer um) quanto
// no aviso de login (fpRenderizarAvisoDadosProprios, só celular/emergência,
// os 2 que a própria pessoa consegue corrigir sozinha).
function fpProblemasFicha(p) {
    if (!p) return [];
    const msgs = [];
    if (p.cpf && fpApenasDigitos(p.cpf).length !== 11) msgs.push('CPF incompleto (confira os 11 números)');
    if (p.nascimento) {
        const d = new Date(p.nascimento + 'T00:00:00');
        if (d > new Date()) msgs.push('Nascimento no futuro');
        else {
            const limite = new Date(); limite.setFullYear(limite.getFullYear() - FP_IDADE_MAXIMA);
            if (d < limite) msgs.push('Nascimento indica mais de 100 anos');
        }
    }
    const ehBrasileira = p.nacionalidade === 'Brasileira' || !p.nacionalidade;
    if (ehBrasileira) {
        if (p.celular && fpApenasDigitos(p.celular).length !== 11) msgs.push('Celular incompleto (confira os 11 números)');
        // Emergência aceita fixo (10 dígitos, sem o 9) além de celular --
        // único campo com essa exceção (03/set/2026, pedido dela).
        if (p.emergencia_celular && !fpTelefoneValido(p.emergencia_celular)) msgs.push('Celular de emergência incompleto');
        if (p.responsavel_celular && fpApenasDigitos(p.responsavel_celular).length !== 11) msgs.push('Celular do responsável incompleto');
    }
    if (p.responsavel_cpf && fpApenasDigitos(p.responsavel_cpf).length !== 11) msgs.push('CPF do responsável incompleto');
    return msgs;
}

async function fpCarregarOpcoesInstrumento(bateriaId) {
    if (!bateriaId) return [];
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session ? sessionData.session.access_token : SUPABASE_KEY;
    const authHeaders = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    const [resBI, resCat, resNom] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/bateria_instrumentos?bateria_id=eq.${bateriaId}&ativo=eq.true`, { headers: authHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/instrumento_categorias`, { headers: authHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/instrumento_nomenclaturas`, { headers: authHeaders }),
    ]);
    const bi = await resBI.json();
    const categorias = await resCat.json();
    const nomenclaturas = await resNom.json();
    return bi.map(item => {
        const cat = categorias.find(c => c.id === item.categoria_id);
        const nom = nomenclaturas.find(n => n.id === item.nomenclatura_id);
        return { id: item.id, nome: (nom && nom.nome) || (cat && cat.nome) || '—' };
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function fpAuthHeaders() {
    return sb.auth.getSession().then(({ data }) => {
        const token = data.session ? data.session.access_token : SUPABASE_KEY;
        return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    });
}

// Medidas viraram totalmente abertas em 23/ago/2026 (mesmo padrão de
// Instrumentos: biblioteca mestre `medida_tipos` + ativação por bateria em
// `bateria_medida_tipos` + valor por pessoa em `vinculos_medidas`) -- Camisa/
// Fantasia/Calça/Sapato não são mais 4 tipos fixos no código, só os 4 que já
// vinham semeados; o Super Admin pode criar quantos tipos novos quiser
// (ex: "Vestido"), cada um sempre com sua própria escala de tamanho.

// Tipos ativos pra essa bateria, na ordem configurada -- fonte única tanto
// pro modo visualização (fpRenderizarMedidas) quanto pro modo edição
// (fpAtivarEdicao).
// perfil filtra quem preenche cada Categoria de Figurino (25/ago/2026,
// pedido dela: Calça de Diretoria usa escala numérica, diferente da de
// Ritmista -- uma categoria pode ser restrita a só alguns públicos,
// configurado em Configurações → Categoria de Figurino). Sem público salvo
// (categoria antiga, de antes dessa mudança), conta como "todo mundo vê" --
// mesmo default do banco, zero mudança de comportamento pra quem já tinha.
async function fpCarregarTiposMedidaAtivos(bateriaId, perfil, ehConvidado) {
    if (!bateriaId) return [];
    const authHeaders = await fpAuthHeaders();
    // "Sem linha ainda em bateria_medida_tipos" conta como DESLIGADO --
    // Categoria de Figurino (ex-"Medidas") deixou de ser fixa no código
    // (reforma de 22-23/ago) e passou a seguir o mesmo padrão de
    // Instrumentos: toda bateria nasce sem nenhuma categoria ativa, o
    // Diretor liga manualmente o que usa. Decisão da Márcia, 23/ago/2026.
    const [resLigados, resTipos] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/bateria_medida_tipos?bateria_id=eq.${bateriaId}&ativo=eq.true`, { headers: authHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/medida_tipos?ativo=eq.true&order=ordem`, { headers: authHeaders }),
    ]);
    const ligados = await resLigados.json();
    const tipos = await resTipos.json();
    const publicoPorTipo = {};
    ligados.forEach(d => { publicoPorTipo[d.tipo_id] = Array.isArray(d.publico) ? d.publico : ['ritmista', 'mestre', 'diretor', 'apoio', 'extra']; });
    const ligadosIds = new Set(ligados.map(d => d.tipo_id));
    // Convidado Especial (31/ago/2026): mesmo filtro extra do cadastro
    // (cadastro.html) -- reaproveita o checkbox "Convidados" de Categoria
    // de Figurino, senão a ficha mostraria de volta uma Medida que o
    // cadastro dele nunca perguntou.
    return tipos.filter(t => ligadosIds.has(t.id) && (!perfil || publicoPorTipo[t.id].includes(perfil)) && (!ehConvidado || publicoPorTipo[t.id].includes('extra')));
}

// Valores já preenchidos pra essa pessoa/vínculo, indexados por tipo_id.
async function fpCarregarValoresMedidaPessoa(vinculoId) {
    if (!vinculoId) return {};
    const authHeaders = await fpAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vinculos_medidas?vinculo_id=eq.${vinculoId}`, { headers: authHeaders });
    const linhas = res.ok ? await res.json() : [];
    const porTipo = {};
    linhas.forEach(l => { porTipo[l.tipo_id] = l.valor; });
    return porTipo;
}

// Tamanhos disponíveis (ordenados) por tipo, só os ativados pra essa bateria.
async function fpCarregarOpcoesMedidasPorTipo(bateriaId) {
    if (!bateriaId) return {};
    const authHeaders = await fpAuthHeaders();
    const [resBM, resTam] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/bateria_medidas?bateria_id=eq.${bateriaId}&ativo=eq.true`, { headers: authHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/medida_tamanhos?order=ordem`, { headers: authHeaders }),
    ]);
    const bm = await resBM.json();
    const tamanhos = await resTam.json();
    const porTipo = {};
    bm.map(item => tamanhos.find(t => t.id === item.tamanho_id)).filter(Boolean).forEach(t => {
        if (!porTipo[t.tipo_id]) porTipo[t.tipo_id] = [];
        porTipo[t.tipo_id].push(t);
    });
    Object.keys(porTipo).forEach(tipoId => porTipo[tipoId].sort((a, b) => a.ordem - b.ordem));
    return porTipo;
}

// Desenha a grade inteira de Medidas (modo visualização) -- um
// ".ficha-campo" por tipo ativo na bateria, na ordem configurada. Sem
// nenhum tipo ativo (ou sem vínculo, ex: Super Admin sem escola), some a
// seção inteira em vez de mostrar um título "Medidas" vazio.
async function fpRenderizarMedidas(alvo) {
    const grid = fpEl('fp-medidas-grid');
    const secao = fpEl('fp-secao-medidas');
    if (!grid || !secao) return;
    if (!alvo.vinculo_id) { secao.style.display = 'none'; return; }

    // Mostra a seção já ocupando o espaço dela, com um "Carregando...",
    // em vez de ficar escondida até os dados chegarem -- evita a seção
    // "estourar" de repente e empurrar o resto da ficha pra baixo (a
    // pulada notada por ela, 28/ago/2026).
    secao.style.display = '';
    grid.innerHTML = '<span style="color:#9993ab;font-size:13px;">Carregando...</span>';

    const [tipos, valores] = await Promise.all([
        fpCarregarTiposMedidaAtivos(alvo.bateria_id, alvo.perfil, alvo.eh_convidado === true),
        fpCarregarValoresMedidaPessoa(alvo.vinculo_id),
    ]);

    if (tipos.length === 0) { secao.style.display = 'none'; return; }

    grid.innerHTML = tipos.map(t => `
        <div class="ficha-campo">
            <span>${t.nome}</span>
            <strong id="fp-medida-${t.id}">${valores[t.id] || '—'}</strong>
            <select id="fp-medida-${t.id}-edit" class="fc-input" data-tipo-id="${t.id}" style="display:none"></select>
        </div>`).join('');
}

// Entrega de Figurinos: puro resumo de leitura -- Figurino nunca tem
// tamanho próprio (usa o do Figurino Pai, mostrado só na tela dedicada de
// entrega), aqui só entregue/não entregue por peça ativa da bateria.
async function fpRenderizarEntregaFigurino(alvo) {
    const grid = fpEl('fp-entrega-figurino-grid');
    const secao = fpEl('fp-secao-entrega-figurino');
    if (!grid || !secao) return;
    if (!alvo.vinculo_id) { secao.style.display = 'none'; return; }

    // Mesma correção da pulada aplicada em fpRenderizarMedidas acima --
    // reserva o espaço da seção desde já, com "Carregando...".
    secao.style.display = '';
    grid.innerHTML = '<span style="color:#9993ab;font-size:13px;">Carregando...</span>';

    // Peça pode cobrir mais de um público ao mesmo tempo (27/ago/2026).
    // Público/Incluir Convidados moram na linha da bateria desde 31/ago/2026
    // (não mais no item global) -- busca todo item ativo da bateria e filtra
    // pelo publico de CADA linha, não mais por um publico global único.
    const publico = alvo.perfil;
    const authHeaders = await fpAuthHeaders();
    const [resAtivos, resMestre, resEntregas] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?bateria_id=eq.${alvo.bateria_id}&ativo=eq.true`, { headers: authHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/figurino_itens_mestre?ativo=eq.true&order=ordem`, { headers: authHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/figurino_entregas?vinculo_id=eq.${alvo.vinculo_id}`, { headers: authHeaders }),
    ]);
    const ativos = resAtivos.ok ? await resAtivos.json() : [];
    const mestre = resMestre.ok ? await resMestre.json() : [];
    const entregas = resEntregas.ok ? await resEntregas.json() : [];
    // Guarda entrega_finalizada por item, não só o id -- precisa pra decidir
    // entre "Não entregue" (a entrega dessa peça já foi encerrada, é um fato)
    // e "Entrega ainda não registrada" (ainda não encerrou, não afirma nada
    // -- pedido dela, 30/ago/2026, mesmo raciocínio aplicado a Eventos).
    const finalizadaPorItem = {};
    // Só entra na ficha quem já teve a entrega INICIADA (achado dela,
    // 30/ago/2026: peça que nem começou a ser entregue não deveria
    // aparecer -- só polui, sem nada de útil pra mostrar ainda).
    const iniciadaPorItem = {};
    // Sem valor ainda em bateria_figurino_itens.publico = todos os 4
    // públicos (mesmo fallback usado em admin.html).
    const publicoPorItem = {};
    ativos.forEach(a => {
        finalizadaPorItem[a.figurino_item_mestre_id] = !!a.entrega_finalizada;
        iniciadaPorItem[a.figurino_item_mestre_id] = !!a.mostra_visao_geral;
        publicoPorItem[a.figurino_item_mestre_id] = Array.isArray(a.publico) ? a.publico : ['ritmista', 'mestre', 'diretor', 'apoio'];
    });
    const itens = mestre.filter(m => iniciadaPorItem[m.id] && (publicoPorItem[m.id] || []).includes(publico));
    if (itens.length === 0) { secao.style.display = 'none'; return; }
    const entregaPorItem = {};
    entregas.forEach(e => { entregaPorItem[e.figurino_item_id] = !!e.entregue_em; });
    // Mesmo padrão visual de Medidas (label em cima, valor embaixo) -- não
    // mais linha própria lado a lado (achado dela, 30/ago/2026: com o texto
    // "Não entregue" a fonte grande do valor ficava desproporcional ao lado
    // do rótulo pequeno). Sem ".full", os itens fluem lado a lado na grade
    // conforme mais peças forem cadastradas, igual qualquer outro campo.
    grid.innerHTML = itens.map(it => {
        const entregue = entregaPorItem[it.id];
        const texto = entregue ? '✓ Entregue' : (finalizadaPorItem[it.id] ? 'Não entregue' : 'Pendente');
        return `
        <div class="ficha-campo">
            <span>${it.nome}</span>
            <strong class="${entregue ? 'ficha-valor-entregue' : 'ficha-valor-pendente'}">${texto}</strong>
        </div>`;
    }).join('');
}

// Eventos: mesmo padrão de leitura de fpRenderizarEntregaFigurino -- nunca
// editável aqui, marcar presença é sempre pela tela dedicada (Mais →
// Presença). Diferente de Figurino, mostra a seção mesmo sem nenhum evento
// (texto explícito "Nenhum evento registrado ainda."), a pedido dela --
// sumir sem explicação deixaria parecendo que a seção nem existe.
async function fpRenderizarEventos(alvo) {
    const grid = fpEl('fp-eventos-grid');
    const secao = fpEl('fp-secao-eventos');
    if (!grid || !secao) return;
    if (!alvo.vinculo_id) { secao.style.display = 'none'; return; }

    secao.style.display = '';
    grid.innerHTML = '<span style="color:#9993ab;font-size:13px;">Carregando...</span>';

    const authHeaders = await fpAuthHeaders();
    // Só entra na ficha quem já teve o evento INICIADO (achado dela,
    // 30/ago/2026: evento que nem começou não deveria aparecer -- só polui,
    // sem nada de útil pra mostrar ainda -- mesmo raciocínio aplicado a
    // Figurino/mostra_visao_geral).
    const [resEventos, resPresencas] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/eventos?bateria_id=eq.${alvo.bateria_id}&iniciado=eq.true&select=id,nome,data,finalizado,perfis_diretoria_inclusos&order=data.desc`, { headers: authHeaders }),
        fetch(`${SUPABASE_URL}/rest/v1/evento_presencas?vinculo_id=eq.${alvo.vinculo_id}`, { headers: authHeaders }),
    ]);
    const todosEventos = resEventos.ok ? await resEventos.json() : [];
    const presencas = resPresencas.ok ? await resPresencas.json() : [];
    // Ritmista participa de todo evento da bateria; Diretoria só dos que
    // incluem o cargo dela -- mesma lógica de "publico" já usada em Figurino.
    const eventos = todosEventos.filter(ev => alvo.perfil === 'ritmista' || (ev.perfis_diretoria_inclusos || []).includes(alvo.perfil));
    if (eventos.length === 0) {
        grid.innerHTML = '<span style="color:#9993ab;font-size:13px;">Nenhum evento registrado ainda.</span>';
        return;
    }
    const presentePorEvento = new Set(presencas.map(p => p.evento_id));
    grid.innerHTML = eventos.map(ev => {
        const presente = presentePorEvento.has(ev.id);
        const texto = presente ? '✓ Presente' : (ev.finalizado ? 'Faltou' : 'Pendente');
        return `
        <div class="ficha-campo">
            <span>${ev.nome}${ev.data ? ' · ' + fpFormatarData(ev.data) : ''}</span>
            <strong class="${presente ? 'ficha-valor-entregue' : 'ficha-valor-pendente'}">${texto}</strong>
        </div>`;
    }).join('');
}

// Resolve a pendência antiga: Ritmista pode preencher (nunca editar de
// novo) campo de Medida em branco, só se a bateria tiver isso ligado em
// Permissões. Roda depois do render normal (fpIniciar já mostrou a tela) --
// se der certo, libera o botão "Editar" que antes ficava escondido pro
// Ritmista.
async function fpAplicarPermissaoRitmistaMedidas(alvo) {
    // eh_convidado (01/set/2026): Convidado-Ritmista sai daqui e passa a
    // depender só do interruptor genérico de Convidados (ver
    // fpAplicarPermissaoConvidadoMedidas) -- antes ficava sem querer preso
    // ao mesmo interruptor do Ritmista de verdade.
    if (!fpEstado.autoedicao || alvo.perfil !== 'ritmista' || alvo.eh_convidado === true || !alvo.bateria_id || !alvo.vinculo_id) return;
    const authHeaders = await fpAuthHeaders();
    const resBateria = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${alvo.bateria_id}&select=ritmista_pode_editar_medidas`, { headers: authHeaders });
    const bateriaRows = resBateria.ok ? await resBateria.json() : [];
    if (!(bateriaRows[0] && bateriaRows[0].ritmista_pode_editar_medidas)) return;
    const [tipos, valores] = await Promise.all([
        fpCarregarTiposMedidaAtivos(alvo.bateria_id, alvo.perfil, alvo.eh_convidado === true),
        fpCarregarValoresMedidaPessoa(alvo.vinculo_id),
    ]);
    const temAlgumEmBranco = tipos.some(t => !valores[t.id]);
    if (!temAlgumEmBranco) return;
    if (fpEstado.alvo !== alvo) return; // a pessoa já trocou de ficha antes disso terminar
    fpEstado.editaveis.add('medidas');
    fpEstado.medidasRestritoAoVazio = true;
    if (fpEl('fp-btn-salvar').style.display !== 'inline-flex') fpEl('fp-btn-editar').style.display = 'inline-flex';
}

// Convidado (01/set/2026, corrigido -- antes era capacidade por pessoa,
// achado dela: tinha que ser genérico pra bateria inteira, igual Ritmistas,
// nunca uma lista de gente em Permissões). Vale pra qualquer tipo de
// Convidado (Ritmista, Diretor de Bateria ou Apoio) -- ao contrário de
// fpAplicarPermissaoRitmistaMedidas, não exige campo em branco: sempre foi
// assim pra Mestre/Diretor/Apoio de verdade também (editar_propria_medida),
// então Convidado segue o mesmo comportamento.
async function fpAplicarPermissaoConvidadoMedidas(alvo) {
    if (!fpEstado.autoedicao || alvo.eh_convidado !== true || !alvo.bateria_id) return;
    const authHeaders = await fpAuthHeaders();
    const resBateria = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${alvo.bateria_id}&select=convidado_pode_editar_medida`, { headers: authHeaders });
    const bateriaRows = resBateria.ok ? await resBateria.json() : [];
    if (!(bateriaRows[0] && bateriaRows[0].convidado_pode_editar_medida)) return;
    if (fpEstado.alvo !== alvo) return; // a pessoa já trocou de ficha antes disso terminar
    fpEstado.editaveis.add('medidas');
    if (fpEl('fp-btn-salvar').style.display !== 'inline-flex') fpEl('fp-btn-editar').style.display = 'inline-flex';
}

// Repique de Bossa (26/ago/2026) -- campo delicado, pedido dela: "impacta
// muito na vaidade das pessoas". Fica escondido por padrão (ver fpIniciar)
// e só é revelado aqui, depois de confirmar permissão -- nunca antes.
// Autoedição depende de dois interruptores independentes da bateria
// (Permissões → Ritmistas: "ver" e "marcar" o próprio Repique de Bossa);
// Diretoria (Mestre/Diretor/Apoio) depende das capacidades por pessoa
// ver_repique_bossa/editar_repique_bossa -- ninguém tem acesso até a
// Márcia liberar, nem quem já edita Ritmistas normalmente (editar_ritmistas
// não dá esse acesso mais).
async function fpAplicarPermissaoRepiqueBossa(alvo) {
    const bloco = fpEl('fp-bloco-repique-bossa');
    if (!bloco) return;
    const ehRepiqueVariante = alvo.instrumento_nome === 'Repique' || alvo.instrumento_nome === 'Repique Mor';
    if (alvo.perfil !== 'ritmista' || !ehRepiqueVariante || !alvo.bateria_id) return;

    let podeVer = false;
    let podeMarcar = false;

    if (fpEstado.autoedicao) {
        const authHeaders = await fpAuthHeaders();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${alvo.bateria_id}&select=ritmista_pode_ver_repique_bossa,ritmista_pode_marcar_repique_bossa`, { headers: authHeaders });
        const rows = res.ok ? await res.json() : [];
        podeVer = !!(rows[0] && rows[0].ritmista_pode_ver_repique_bossa);
        podeMarcar = !!(rows[0] && rows[0].ritmista_pode_marcar_repique_bossa);
    } else {
        podeVer = typeof tenhoCapacidade === 'function' && tenhoCapacidade('ver_repique_bossa');
        podeMarcar = typeof tenhoCapacidade === 'function' && tenhoCapacidade('editar_repique_bossa');
    }
    podeVer = podeVer || podeMarcar; // quem pode marcar precisa ver o valor atual pra marcar

    if (fpEstado.alvo !== alvo) return; // a pessoa já trocou de ficha antes disso terminar
    if (!podeVer) return;

    bloco.style.display = '';
    fpEl('fp-repique-bossa').textContent = alvo.repique_bossa ? 'Sim' : 'Não';
    if (podeMarcar) {
        fpEstado.editaveis.add('repique_bossa');
        if (fpEstado.autoedicao && fpEl('fp-btn-salvar').style.display !== 'inline-flex') {
            fpEl('fp-btn-editar').style.display = 'inline-flex';
        }
    }
}

// Desfile/Declaração no Meu Perfil (28/ago/2026, sessão seguinte): o
// próprio Ritmista nunca marca (podeEditar sempre false aqui) -- só
// aparece se a bateria ligou "Permitir que o ritmista veja o próprio X"
// em Permissões → Ritmistas, mesmo padrão de dois interruptores por
// bateria já usado em Repique de Bossa.
async function fpAplicarPermissaoAutoedicaoToggles(alvo) {
    if (!fpEstado.autoedicao || alvo.perfil !== 'ritmista' || !alvo.bateria_id) return;
    const authHeaders = await fpAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${alvo.bateria_id}&select=ritmista_pode_ver_desfile,ritmista_pode_ver_declaracao_responsavel,ritmista_pode_ver_observacoes`, { headers: authHeaders });
    const rows = res.ok ? await res.json() : [];
    const bateria = rows[0] || {};
    if (fpEstado.alvo !== alvo) return; // a pessoa já trocou de ficha antes disso terminar

    // Observações (sessão seguinte, 28/ago/2026) -- continua fora de
    // `editaveis` mesmo revelada (Ritmista só VÊ, nunca ganha o "Editar"
    // desse campo em autoedição, ver fpCamposEditaveis). Bloco inteiro
    // (#fp-bloco-observacoes) -- ver comentário 29/ago/2026 acima, mesmo
    // bug corrigido nos dois lugares.
    if (bateria.ritmista_pode_ver_observacoes) {
        const blocoObs = fpEl('fp-bloco-observacoes');
        if (blocoObs) blocoObs.style.display = '';
    }

    if (fpEhMenorIdade(alvo.nascimento) && bateria.ritmista_pode_ver_declaracao_responsavel) {
        const blocoDeclaracao = fpEl('fp-bloco-declaracao');
        if (blocoDeclaracao) {
            blocoDeclaracao.style.display = '';
            fpEstado.declaracaoValor = !!alvo.declaracao_responsavel;
            fpEstado.declaracaoPodeEditar = false;
            fpRenderToggleDeclaracao();
        }
    }
    if (bateria.ritmista_pode_ver_desfile) {
        const blocoNaoDesfila = fpEl('fp-bloco-nao-desfila');
        if (blocoNaoDesfila) {
            blocoNaoDesfila.style.display = '';
            fpEstado.naoDesfilaValor = !!alvo.nao_desfila;
            fpEstado.naoDesfilaPodeEditar = false;
            fpRenderToggleNaoDesfila();
        }
    }
}

async function fpAtivarEdicao() {
    FP_CAMPOS.forEach(({ id, col, tipo }) => {
        const strong = fpEl(id);
        const input = fpEl(id + '-edit');
        if (!strong || !input || !fpEstado.editaveis.has(col)) return;
        const valorAtual = fpEstado.alvo[col];
        // Valor salvo antigo, de antes da lista fechada existir (ex:
        // "Esposa" num <select> que hoje só oferece "Cônjuge/Companheiro(a)")
        // -- preserva como opção extra, senão o <select> cai em branco e
        // Salvar sem mexer no campo apaga o dado sem avisar.
        if (input.tagName === 'SELECT' && valorAtual && !Array.from(input.options).some(o => o.value === valorAtual)) {
            input.add(new Option(valorAtual, valorAtual, true, true));
        }
        input.value = tipo === 'data' ? fpISOparaData(valorAtual) : (valorAtual || '');
        strong.style.display = 'none';
        input.style.display = 'block';
    });

    if (fpEstado.editaveis.has('tipo_documento')) {
        fpEl('fp-tipo-documento-edit').value = fpEstado.alvo.tipo_documento || '';
        fpEl('fp-numero-documento-edit').value = fpEstado.alvo.numero_documento || '';
        fpEl('fp-documento').style.display = 'none';
        fpEl('fp-tipo-documento-edit').style.display = 'block';
        fpEl('fp-numero-documento-edit').style.display = 'block';
    }

    if (fpEstado.editaveis.has('bateria_instrumento_id')) {
        const select = fpEl('fp-instrumento-edit');
        const opcoes = await fpCarregarOpcoesInstrumento(fpEstado.alvo.bateria_id);
        select.innerHTML = '<option value="">Selecione</option>' + opcoes.map(o =>
            `<option value="${o.id}" ${o.id === fpEstado.alvo.bateria_instrumento_id ? 'selected' : ''}>${o.nome}</option>`
        ).join('');
        fpEl('fp-instrumento').style.display = 'none';
        select.style.display = 'block';
    }

    if (fpEstado.editaveis.has('repique_bossa')) {
        fpEl('fp-repique-bossa-edit').checked = !!fpEstado.alvo.repique_bossa;
        fpEl('fp-repique-bossa').style.display = 'none';
        fpEl('fp-repique-bossa-edit').closest('label').style.display = 'flex';
    }

    if (fpEstado.editaveis.has('eh_admin_bateria')) {
        fpEl('fp-admin-bateria-edit').checked = !!fpEstado.alvo.eh_admin_bateria;
        fpEl('fp-admin-bateria').style.display = 'none';
        fpEl('fp-admin-bateria-edit').closest('label').style.display = 'flex';
    }

    if (fpEstado.editaveis.has('naipe')) {
        const container = fpEl('fp-naipe-edit');
        const opcoesInstrumento = await fpCarregarOpcoesInstrumento(fpEstado.alvo.bateria_id);
        const nomes = Array.from(new Set(opcoesInstrumento.map(o => o.nome)));
        nomes.push('Repique de Bossa', 'Especiais');
        const selecionados = new Set(Array.isArray(fpEstado.alvo.naipe) ? fpEstado.alvo.naipe : []);
        container.innerHTML = nomes.map(n => `
            <label style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                <input type="checkbox" class="fp-naipe-check" value="${n}" ${selecionados.has(n) ? 'checked' : ''} style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;">
                <span style="font-size:13px;">${n}</span>
            </label>`).join('');
        fpEl('fp-naipe').style.display = 'none';
        container.style.display = 'block';
    }

    if (fpEstado.editaveis.has('medidas')) {
        const [tipos, opcoesPorTipo, valores] = await Promise.all([
            fpCarregarTiposMedidaAtivos(fpEstado.alvo.bateria_id, fpEstado.alvo.perfil, fpEstado.alvo.eh_convidado === true),
            fpCarregarOpcoesMedidasPorTipo(fpEstado.alvo.bateria_id),
            fpCarregarValoresMedidaPessoa(fpEstado.alvo.vinculo_id),
        ]);
        tipos.forEach(t => {
            const strong = fpEl(`fp-medida-${t.id}`);
            const select = fpEl(`fp-medida-${t.id}-edit`);
            if (!strong || !select) return;
            const valorAtual = valores[t.id];
            // Ritmista com a permissão restrita só edita o que está em
            // branco -- campo já preenchido nem vira <select>, fica do
            // jeito que estava (mesma trava que existe no banco).
            if (fpEstado.medidasRestritoAoVazio && valorAtual) return;
            const opcoes = opcoesPorTipo[t.id] || [];
            select.innerHTML = '<option value="">Selecione</option>' + opcoes.map(o =>
                `<option value="${o.nome}" ${o.nome === valorAtual ? 'selected' : ''}>${o.nome}</option>`
            ).join('');
            // "Tradicional" (Camisa/Fantasia/Calça/Sapato) é obrigatória,
            // "Especial" não -- mesmo critério já usado em cadastro.html.
            // Guardado aqui pra fpSalvar() conferir antes de gravar (pedido
            // dela, 25/ago/2026: nunca deixar salvar com medida obrigatória
            // em branco).
            select.dataset.obrigatoria = t.grupo !== 'especial' ? '1' : '';
            select.classList.remove('campo-invalido');
            select.onchange = () => select.classList.remove('campo-invalido');
            strong.style.display = 'none';
            select.style.display = 'block';
        });
    }

    if (fpEstado.autoedicao) fpEl('fp-secao-senha').style.display = '';

    if (fpEstado.editaveis.has('foto_url')) {
        fpEl('fp-foto-acao').style.display = 'block';
        fpEl('fp-foto-circle').classList.add('mp-foto-circle--editavel');
        fpConfigurarDragFoto();
    }

    fpEl('fp-btn-editar').style.display = 'none';
    fpEl('fp-btn-salvar').style.display = 'inline-flex';
    fpEl('fp-btn-cancelar').style.display = 'inline-flex';
    // "Fechar" (ou os botões extras de admin, tipo Ativar/Rejeitar) somem
    // durante a edição -- fazem parte da tela de visualização, não da
    // barra de Salvar/Cancelar, e só apertavam a fileira de botões
    // flutuante sem necessidade (achado da Márcia, 15/ago/2026).
    const acoesExtra = fpEl('fp-acoes-extra');
    if (acoesExtra) acoesExtra.style.display = 'none';

    // Realça de cara o campo com dado incompleto (03/set/2026) -- só na
    // própria autoedição, sem esperar uma tentativa de Salvar. Mesmo texto
    // de erro do fpSalvar, mesma classe visual (.campo-invalido).
    if (fpEstado.autoedicao) {
        const problemas = fpProblemasDadosProprios(fpEstado.alvo);
        if (problemas.length > 0) {
            const msg = fpEl('fp-mensagem');
            if (msg) {
                msg.className = 'fp-mensagem erro';
                msg.textContent = problemas.map(p => p.rotulo).join(' e ') + ' incompleto — confira se digitou os 11 números, com DDD.';
                msg.style.display = 'block';
            }
            let primeiroCampo = null;
            problemas.forEach(p => {
                const campo = fpEl('fp-' + p.campo.replace(/_/g, '-') + '-edit');
                if (campo) { campo.classList.add('campo-invalido'); if (!primeiroCampo) primeiroCampo = campo; }
            });
            if (primeiroCampo) primeiroCampo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

async function fpCancelarEdicao() {
    if (!(await fpPodeDescartar())) return;
    fpEstado.sujo = false;
    FP_CAMPOS.forEach(({ id, col }) => {
        const strong = fpEl(id);
        const input = fpEl(id + '-edit');
        if (!strong || !input || !fpEstado.editaveis.has(col)) return;
        strong.style.display = '';
        input.style.display = 'none';
    });
    if (fpEstado.editaveis.has('tipo_documento')) {
        fpEl('fp-documento').style.display = '';
        fpEl('fp-tipo-documento-edit').style.display = 'none';
        fpEl('fp-numero-documento-edit').style.display = 'none';
    }
    if (fpEstado.editaveis.has('bateria_instrumento_id')) {
        fpEl('fp-instrumento').style.display = '';
        fpEl('fp-instrumento-edit').style.display = 'none';
    }
    if (fpEstado.editaveis.has('repique_bossa')) {
        fpEl('fp-repique-bossa').style.display = '';
        fpEl('fp-repique-bossa-edit').closest('label').style.display = 'none';
    }
    if (fpEstado.editaveis.has('eh_admin_bateria')) {
        fpEl('fp-admin-bateria').style.display = '';
        fpEl('fp-admin-bateria-edit').closest('label').style.display = 'none';
    }
    if (fpEstado.editaveis.has('naipe')) {
        fpEl('fp-naipe').style.display = '';
        fpEl('fp-naipe-edit').style.display = 'none';
    }
    if (fpEstado.editaveis.has('medidas')) {
        fpEstado.container.querySelectorAll('#fp-medidas-grid select').forEach(select => {
            const strong = fpEl(select.id.replace('-edit', ''));
            if (strong) strong.style.display = '';
            select.style.display = 'none';
        });
    }
    fpEl('fp-secao-senha').style.display = 'none';
    fpEl('fp-senha-nova').value = '';
    fpEl('fp-senha-confirmar').value = '';
    fpFotoBase64 = null;
    fpFotoPosX = fpEstado.alvo.foto_pos_x ?? 50;
    fpFotoPosY = fpEstado.alvo.foto_pos_y ?? 50;
    // Some junto com o resto — se a pessoa trocou a foto (ou só arrastou
    // pra reposicionar) e cancelou, a prévia (só visual, nunca tinha sido
    // salva) volta pra foto e posição de verdade.
    const circleCancelar = fpEl('fp-foto-circle');
    circleCancelar.innerHTML = fpEstado.alvo.foto_url
        ? `<img src="${fpEstado.alvo.foto_url}" style="width:100%;height:100%;object-fit:cover;object-position:${fpFotoPosX}% ${fpFotoPosY}%;">`
        : `<svg viewBox="0 0 24 24" width="32" height="32" fill="#c0bdd0"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    circleCancelar.classList.remove('mp-foto-circle--editavel');
    fpEl('fp-foto-acao').style.display = 'none';
    fpEl('fp-btn-editar').style.display = 'inline-flex';
    fpEl('fp-btn-salvar').style.display = 'none';
    fpEl('fp-btn-cancelar').style.display = 'none';
    // "Fechar" (ou os botões extras de admin) voltam junto com o resto da
    // tela de visualização — ver fpAtivarEdicao.
    const acoesExtra = fpEl('fp-acoes-extra');
    if (acoesExtra) acoesExtra.style.display = 'flex';
}

// Clicar na foto (ou no botão "Trocar foto") só abre o seletor de arquivo
// depois de "Editar" — antes disso, escolher uma foto parecia funcionar
// (mostrava prévia) mas nunca era salva de verdade, sem nenhum aviso pra
// pessoa (bug relatado pela Márcia, 12/ago/2026).
// Entre 14/ago e 15/ago/2026, clicar na foto fora do modo de edição
// chegou a entrar direto em edição (de tudo, não só da foto), pra evitar
// rolar até o botão "Editar" lá embaixo. Revertido em 15/ago/2026: depois
// que os botões Editar/Salvar/Cancelar viraram flutuantes (sempre
// visíveis, sem precisar rolar), esse atalho ficou redundante e só
// confundia — clicar na foto entrava em edição da ficha inteira sem
// avisar. Agora clicar na foto fora da edição não faz nada; o clique só
// tem efeito depois de "Editar" (mesmo padrão de todo o resto da ficha).
async function fpAbrirSeletorFoto() {
    if (fpArrastoRecente) { fpArrastoRecente = false; return false; }
    if (fpEl('fp-btn-salvar').style.display === 'inline-flex') {
        fpEl('fp-input-foto').click();
    }
    return false;
}

// Antes cortava um quadrado central logo no upload, descartando o resto
// da foto pra sempre — sem imagem sobrando, "arrastar pra reposicionar"
// não tinha o que fazer (achado real, 14/ago/2026, relato da Márcia de
// foto não caber direito). Agora só redimensiona (mantendo a foto
// inteira) e deixa o recorte/posição por conta do CSS na hora de exibir
// (object-fit + object-position), que dá pra arrastar depois.
function fpPreviewFoto(input) {
    if (!input.files || !input.files[0]) return;
    // Mesma correção de cadastro.html (04/set/2026, suporte real): sem isso,
    // uma foto que o navegador não consiga ler (HEIC de iPhone, arquivo
    // corrompido) falhava em silêncio -- a pessoa escolhia a foto, nada
    // acontecia na tela, sem nenhum aviso do motivo.
    const reader = new FileReader();
    reader.onerror = function () {
        if (typeof mostrarToast === 'function') mostrarToast('Não consegui ler esse arquivo — tente escolher a foto de novo ou tire uma nova.', 'erro');
    };
    reader.onload = function (e) {
        const img = new Image();
        img.onerror = function () {
            if (typeof mostrarToast === 'function') mostrarToast('Essa foto não pôde ser aberta (formato não reconhecido) — tente outra foto ou tire uma nova.', 'erro');
        };
        img.onload = function () {
            const MAX = 1000;
            const escala = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.round(img.width * escala);
            const h = Math.round(img.height * escala);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            fpFotoBase64 = canvas.toDataURL('image/jpeg', 0.8);
            fpFotoPosX = 50;
            fpFotoPosY = 50;
            fpEl('fp-foto-circle').innerHTML = `<img src="${fpFotoBase64}" style="width:100%;height:100%;object-fit:cover;object-position:50% 50%;">`;
            fpConfigurarDragFoto();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

// Arrastar a foto dentro da moldura pra escolher qual parte aparece —
// mesma ideia de reposicionar foto de capa do Facebook/LinkedIn. Calcula
// o quanto a imagem "sobra" além da moldura em cada eixo (só existe
// sobra se a proporção da foto for diferente da moldura) e converte o
// arrasto em porcentagem de object-position, then salvo pelo fpSalvar()
// junto com o resto da ficha.
function fpConfigurarDragFoto() {
    const circle = fpEl('fp-foto-circle');
    if (!circle || circle.dataset.dragConfigurado) return;
    circle.dataset.dragConfigurado = '1';

    let arrastando = false;
    let inicioX = 0, inicioY = 0, posInicialX = 50, posInicialY = 50, moveuBastante = false;

    function comecar(clientX, clientY) {
        const img = circle.querySelector('img');
        if (!circle.classList.contains('mp-foto-circle--editavel') || !img) return false;
        arrastando = true;
        moveuBastante = false;
        inicioX = clientX; inicioY = clientY;
        posInicialX = fpFotoPosX; posInicialY = fpFotoPosY;
        return true;
    }

    function mover(clientX, clientY) {
        if (!arrastando) return;
        const img = circle.querySelector('img');
        if (!img || !img.naturalWidth) return;
        const dxTotal = clientX - inicioX, dyTotal = clientY - inicioY;
        if (Math.abs(dxTotal) > 4 || Math.abs(dyTotal) > 4) moveuBastante = true;
        const rect = circle.getBoundingClientRect();
        const escala = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        const overflowX = img.naturalWidth * escala - rect.width;
        const overflowY = img.naturalHeight * escala - rect.height;
        fpFotoPosX = overflowX > 0 ? Math.min(100, Math.max(0, posInicialX - (dxTotal / overflowX) * 100)) : posInicialX;
        fpFotoPosY = overflowY > 0 ? Math.min(100, Math.max(0, posInicialY - (dyTotal / overflowY) * 100)) : posInicialY;
        img.style.objectPosition = `${fpFotoPosX}% ${fpFotoPosY}%`;
    }

    function soltar() {
        if (arrastando && moveuBastante) fpArrastoRecente = true;
        arrastando = false;
    }

    circle.addEventListener('pointerdown', (e) => {
        if (comecar(e.clientX, e.clientY)) { circle.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    circle.addEventListener('pointermove', (e) => mover(e.clientX, e.clientY));
    circle.addEventListener('pointerup', soltar);
    circle.addEventListener('pointercancel', soltar);
}

async function fpSalvar() {
    const payloadPessoa = {};
    const payloadVinculo = {};
    let dataInvalida = false;
    // Nascimento entra no laço antes de Responsável (mesma ordem de
    // FP_CAMPOS), então esse valor já está atualizado quando a checagem de
    // Responsável (logo abaixo) precisar dele pra saber se a pessoa é menor
    // HOJE, com o valor que está sendo salvo agora -- não o antigo.
    let nascimentoAtualISO = fpEstado.alvo.nascimento || null;
    const camposInvalidos = [];
    FP_CAMPOS.forEach(({ id, col, tipo }) => {
        if (!fpEstado.editaveis.has(col)) return;
        const input = fpEl(id + '-edit');
        if (!input) return;
        input.classList.remove('campo-invalido');
        const alvoPayload = fpTabelaDoCampo(col) === 'vinculos' ? payloadVinculo : payloadPessoa;
        if (tipo === 'data') {
            const bruto = input.value.trim();
            if (!bruto) {
                alvoPayload[col] = null;
                nascimentoAtualISO = null;
                if (FP_CAMPOS_OBRIGATORIOS.has(col)) camposInvalidos.push(input);
                return;
            }
            const iso = fpDataParaISO(bruto);
            if (!iso) { dataInvalida = true; return; }
            alvoPayload[col] = iso;
            if (col === 'nascimento') nascimentoAtualISO = iso;
            return;
        }
        const valor = input.value.trim();
        alvoPayload[col] = valor || null;
        // Responsável só é obrigatório pra quem É menor de idade com a data
        // que está sendo salva agora -- mesma regra usada pra mostrar/
        // esconder a seção (fpEhMenorIdade).
        const ehResponsavel = col === 'responsavel_nome' || col === 'responsavel_cpf' || col === 'responsavel_celular';
        const obrigatorio = FP_CAMPOS_OBRIGATORIOS.has(col) || (ehResponsavel && fpEhMenorIdade(nascimentoAtualISO));
        if (obrigatorio && !valor) camposInvalidos.push(input);
    });
    if (dataInvalida) {
        const msg = fpEl('fp-mensagem');
        if (msg) {
            msg.className = 'fp-mensagem erro';
            msg.textContent = 'Data de nascimento inválida — confira dia, mês e ano.';
            msg.style.display = 'block';
        }
        return;
    }
    if (fpEstado.editaveis.has('tipo_documento')) {
        payloadPessoa.tipo_documento = fpEl('fp-tipo-documento-edit').value.trim() || null;
        payloadPessoa.numero_documento = fpEl('fp-numero-documento-edit').value.trim() || null;
    }
    // CPF é obrigatório, EXCETO pra quem já usa Documento (Passaporte/RNE)
    // no lugar -- mesma regra de cadastro.html (toggleSemCpf). Documento em
    // si não é editável na ficha hoje (nem chega a ser criado esse par de
    // campos aqui), então essa exceção só existe pra não travar quem já
    // veio assim do cadastro.
    if (fpEstado.editaveis.has('cpf')) {
        const cpfInput = fpEl('fp-cpf-edit');
        const temDocumento = !!(fpEstado.alvo.tipo_documento && fpEstado.alvo.numero_documento);
        if (cpfInput && !temDocumento && !cpfInput.value.trim()) camposInvalidos.push(cpfInput);
    }
    if (fpEstado.editaveis.has('bateria_instrumento_id')) {
        const selectInstrumento = fpEl('fp-instrumento-edit');
        const val = selectInstrumento.value;
        payloadVinculo.bateria_instrumento_id = val ? Number(val) : null;
        // Instrumento só é obrigatório pra Ritmista -- mesma regra de
        // cadastro.html (campo nem existe pra Mestre/Diretor/Apoio).
        if (fpEstado.alvo.perfil === 'ritmista' && !val) camposInvalidos.push(selectInstrumento);
    }
    if (camposInvalidos.length > 0) {
        const msg = fpEl('fp-mensagem');
        if (msg) {
            msg.className = 'fp-mensagem erro';
            msg.textContent = 'Preencha os campos obrigatórios em destaque antes de salvar.';
            msg.style.display = 'block';
            camposInvalidos[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        camposInvalidos.forEach(input => input.classList.add('campo-invalido'));
        return;
    }

    // Nascimento implausível (03/set/2026, mesma regra de cadastro.html) --
    // futuro ou mais de 100 anos atrás. nascimentoAtualISO já reflete o
    // valor que está sendo salvo agora (calculado no laço acima).
    if (nascimentoAtualISO) {
        const dataNascimentoAtual = new Date(nascimentoAtualISO + 'T00:00:00');
        const campoNascimentoEdit = fpEl('fp-nascimento-edit');
        const fpMostrarErroTexto = (texto) => {
            const msg = fpEl('fp-mensagem');
            if (msg) {
                msg.className = 'fp-mensagem erro';
                msg.textContent = texto;
                msg.style.display = 'block';
            }
            if (campoNascimentoEdit) { campoNascimentoEdit.classList.add('campo-invalido'); campoNascimentoEdit.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        };
        if (dataNascimentoAtual > new Date()) {
            fpMostrarErroTexto('Essa data de nascimento está no futuro — confira e corrija.');
            return;
        }
        const fpLimiteIdadeMaxima = new Date();
        fpLimiteIdadeMaxima.setFullYear(fpLimiteIdadeMaxima.getFullYear() - FP_IDADE_MAXIMA);
        if (dataNascimentoAtual < fpLimiteIdadeMaxima) {
            fpMostrarErroTexto('Essa data indica mais de 100 anos de idade — confira se foi digitada certa.');
            return;
        }
    }

    // CPF (pessoa e responsável) incompleto -- achado real, 03/set/2026.
    // Lê o valor ATUAL (dado salvo, não o campo de digitação) quando o
    // campo está travado pra edição (autoedição não edita CPF -- ele nunca
    // chega a ser preenchido no input, ficaria sempre vazio e a checagem
    // nunca disparava -- bug real achado testando com ela, 03/set/2026).
    // Só quando o campo É editável é que o valor do input manda, porque aí
    // reflete o que está prestes a ser salvo.
    const fpCpfAtual = fpEstado.editaveis.has('cpf') && fpEl('fp-cpf-edit')
        ? fpEl('fp-cpf-edit').value.trim()
        : (fpEstado.alvo.cpf || '');
    const fpResponsavelCpfAtual = fpEstado.editaveis.has('responsavel_cpf') && fpEl('fp-responsavel-cpf-edit')
        ? fpEl('fp-responsavel-cpf-edit').value.trim()
        : (fpEstado.alvo.responsavel_cpf || '');
    const fpCamposCpf = [
        { valor: fpCpfAtual, el: fpEl('fp-cpf-edit') || fpEl('fp-cpf') },
        { valor: fpResponsavelCpfAtual, el: fpEl('fp-responsavel-cpf-edit') || fpEl('fp-responsavel-cpf') },
    ].filter(c => c.el);
    for (const { valor, el } of fpCamposCpf) {
        if (valor && fpApenasDigitos(valor).length !== 11) {
            const msg = fpEl('fp-mensagem');
            if (msg) {
                msg.className = 'fp-mensagem erro';
                msg.textContent = 'CPF incompleto — confira se digitou os 11 números.';
                msg.style.display = 'block';
            }
            el.classList.add('campo-invalido');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    }

    // Celular (pessoa, responsável e emergência) incompleto -- achados
    // reais, 03/set/2026. Só pra quem é Brasileira -- pedido dela: número
    // de fora do Brasil não segue esse padrão, fica livre pra Estrangeira.
    const fpNacionalidadeAtual = payloadPessoa.hasOwnProperty('nacionalidade') ? payloadPessoa.nacionalidade : fpEstado.alvo.nacionalidade;
    if (fpNacionalidadeAtual === 'Brasileira' || !fpNacionalidadeAtual) {
        // Mesmo cuidado do CPF acima: responsavel_celular é travado pra
        // quem não é Super Admin (edição própria inclusa) -- lê o dado
        // salvo nesse caso, não o campo de digitação (que ficaria vazio).
        const fpCelularAtual = fpEstado.editaveis.has('celular') && fpEl('fp-celular-edit')
            ? fpEl('fp-celular-edit').value.trim() : (fpEstado.alvo.celular || '');
        const fpResponsavelCelularAtual = fpEstado.editaveis.has('responsavel_celular') && fpEl('fp-responsavel-celular-edit')
            ? fpEl('fp-responsavel-celular-edit').value.trim() : (fpEstado.alvo.responsavel_celular || '');
        const fpEmergenciaCelularAtual = fpEstado.editaveis.has('emergencia_celular') && fpEl('fp-emergencia-celular-edit')
            ? fpEl('fp-emergencia-celular-edit').value.trim() : (fpEstado.alvo.emergencia_celular || '');
        // Emergência aceita fixo (10 dígitos, sem o 9) além de celular --
        // único dos 3 com essa exceção (03/set/2026, pedido dela: pode ser
        // o telefone de casa de alguém mais velho). Celular da pessoa e do
        // responsável continuam exigindo celular de verdade.
        const fpCamposCelular = [
            { valor: fpCelularAtual, el: fpEl('fp-celular-edit') || fpEl('fp-celular'), aceitaFixo: false },
            { valor: fpResponsavelCelularAtual, el: fpEl('fp-responsavel-celular-edit') || fpEl('fp-responsavel-celular'), aceitaFixo: false },
            { valor: fpEmergenciaCelularAtual, el: fpEl('fp-emergencia-celular-edit') || fpEl('fp-emergencia-celular'), aceitaFixo: true },
        ].filter(c => c.el);
        for (const { valor, el, aceitaFixo } of fpCamposCelular) {
            const valido = aceitaFixo ? fpTelefoneValido(valor) : (fpApenasDigitos(valor).length === 11);
            if (valor && !valido) {
                const msg = fpEl('fp-mensagem');
                if (msg) {
                    msg.className = 'fp-mensagem erro';
                    msg.textContent = aceitaFixo
                        ? 'Celular de emergência incompleto — confira o número (celular com 11 dígitos, ou fixo com 10).'
                        : 'Celular incompleto — confira se digitou os 11 números, com DDD.';
                    msg.style.display = 'block';
                }
                el.classList.add('campo-invalido');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }
    }
    if (fpEstado.editaveis.has('repique_bossa')) {
        payloadVinculo.repique_bossa = fpEl('fp-repique-bossa-edit').checked;
    }
    if (fpEstado.editaveis.has('eh_admin_bateria')) {
        payloadVinculo.eh_admin_bateria = fpEl('fp-admin-bateria-edit').checked;
    }
    if (fpEstado.editaveis.has('naipe')) {
        payloadVinculo.naipe = Array.from(fpEstado.container.querySelectorAll('.fp-naipe-check:checked')).map(el => el.value);
    }
    let valoresMedida = null;
    if (fpEstado.editaveis.has('medidas')) {
        valoresMedida = Array.from(fpEstado.container.querySelectorAll('#fp-medidas-grid select')).map(select => ({
            tipoId: Number(select.dataset.tipoId),
            valor: select.value.trim(),
            obrigatoria: select.dataset.obrigatoria === '1',
            select,
        }));
    }
    // Medida "tradicional" (Camisa/Fantasia/Calça/Sapato) obrigatória em
    // branco trava o Salvar -- pedido dela, 25/ago/2026: "quando a pessoa
    // clicar em editar, vai ter que preencher de qualquer maneira". Mesmo
    // padrão visual de erro já usado pra data de nascimento inválida.
    if (valoresMedida) {
        const faltando = valoresMedida.filter(v => v.obrigatoria && !v.valor);
        if (faltando.length > 0) {
            const msg = fpEl('fp-mensagem');
            if (msg) {
                msg.className = 'fp-mensagem erro';
                msg.textContent = 'Preencha todas as medidas obrigatórias antes de salvar.';
                msg.style.display = 'block';
                msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            faltando.forEach(v => v.select.classList.add('campo-invalido'));
            return;
        }
    }
    if (fpFotoBase64 && fpEstado.editaveis.has('foto_url')) payloadPessoa.foto_url = fpFotoBase64;
    // Posição vale mesmo sem trocar a foto (só arrastar a existente já
    // conta) — envia sempre que a foto for editável e a posição mudou.
    if (fpEstado.editaveis.has('foto_url') && (fpFotoPosX !== (fpEstado.alvo.foto_pos_x ?? 50) || fpFotoPosY !== (fpEstado.alvo.foto_pos_y ?? 50))) {
        payloadPessoa.foto_pos_x = fpFotoPosX;
        payloadPessoa.foto_pos_y = fpFotoPosY;
    }

    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session ? sessionData.session.access_token : SUPABASE_KEY;
    const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation',
    };

    let ok = true;
    if (Object.keys(payloadPessoa).length > 0) {
        const resPessoa = await fetch(`${SUPABASE_URL}/rest/v1/pessoas?id=eq.${fpEstado.alvo.pessoa_id}`, {
            method: 'PATCH', headers, body: JSON.stringify(payloadPessoa),
        });
        ok = ok && resPessoa.ok;
    }
    if (ok && Object.keys(payloadVinculo).length > 0 && fpEstado.alvo.vinculo_id) {
        const resVinculo = await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=eq.${fpEstado.alvo.vinculo_id}`, {
            method: 'PATCH', headers, body: JSON.stringify(payloadVinculo),
        });
        ok = ok && resVinculo.ok;
    }
    if (ok && valoresMedida && fpEstado.alvo.vinculo_id) {
        const vinculoId = fpEstado.alvo.vinculo_id;
        const comValor = valoresMedida.filter(v => v.valor);
        const semValor = valoresMedida.filter(v => !v.valor);
        if (comValor.length > 0) {
            const resUpsert = await fetch(`${SUPABASE_URL}/rest/v1/vinculos_medidas?on_conflict=vinculo_id,tipo_id`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify(comValor.map(v => ({ vinculo_id: vinculoId, tipo_id: v.tipoId, valor: v.valor }))),
            });
            ok = ok && resUpsert.ok;
        }
        // Campo deixado em branco de propósito -- remove a linha em vez de
        // guardar valor vazio (mesma ideia de "nunca sobra dado morto",
        // consistente com o resto da ficha usando null pra campo apagado).
        for (const v of semValor) {
            const resDelete = await fetch(`${SUPABASE_URL}/rest/v1/vinculos_medidas?vinculo_id=eq.${vinculoId}&tipo_id=eq.${v.tipoId}`, {
                method: 'DELETE', headers,
            });
            ok = ok && resDelete.ok;
        }
    }

    const mensagem = fpEl('fp-mensagem');
    if (ok) {
        // Busca fresca pra já vir com instrumento_nome resolvido — Super Admin sem
        // vínculo busca direto em "pessoas"; todo o resto busca na view de sempre.
        let novosDados;
        if (fpEstado.alvo.super_admin) {
            const resFresco = await fetch(`${SUPABASE_URL}/rest/v1/pessoas?id=eq.${fpEstado.alvo.pessoa_id}`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
            });
            const frescos = await resFresco.json();
            novosDados = (frescos && frescos[0])
                ? { ...frescos[0], id: frescos[0].id, pessoa_id: frescos[0].id, super_admin: true, perfil: 'super_admin' }
                : { ...fpEstado.alvo, ...payloadPessoa };
        } else {
            const resFresco = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?id=eq.${fpEstado.alvo.vinculo_id}`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
            });
            const frescos = await resFresco.json();
            novosDados = (frescos && frescos[0]) ? frescos[0] : { ...fpEstado.alvo, ...payloadPessoa, ...payloadVinculo };
        }
        if (fpEstado.autoedicao) {
            localStorage.setItem('ritmista', JSON.stringify(novosDados));
        }
        // Salvou com sucesso -- não é mais "não salvo", senão a chamada
        // interna de fpCancelarEdicao() logo abaixo perguntaria à toa se
        // quer descartar o que acabou de salvar.
        fpEstado.sujo = false;
        fpCancelarEdicao();
        // Bug real, 06/set/2026 (achado dela: "não dá a mensagem que foi
        // salvo"): a mensagem de sucesso era escrita ANTES de fpIniciar()
        // rodar de novo -- fpIniciar sempre reseta #fp-mensagem pra escondida
        // logo no início (pra começar limpa em qualquer abertura de ficha),
        // então a confirmação nunca chegava a aparecer de verdade, apagada
        // no mesmo instante em que era criada. Corrigido escrevendo a
        // mensagem DEPOIS de fpIniciar() terminar -- se ainda sobrar algum
        // outro dado incompleto na ficha, fpIniciar já mostrou o aviso
        // correspondente; "sucesso" só sobrescreve quando não há mais nada
        // pendente.
        fpIniciar(novosDados, fpEstado.meuPerfil, fpEstado.minhaPessoaId, { aoSalvar: fpEstado.aoSalvar });
        if (fpProblemasFicha(novosDados).length === 0) {
            const mensagemPosSalvar = fpEl('fp-mensagem');
            mensagemPosSalvar.className = 'fp-mensagem sucesso';
            mensagemPosSalvar.textContent = 'Dados atualizados com sucesso!';
            mensagemPosSalvar.style.display = 'block';
        }
        if (fpEstado.aoSalvar) fpEstado.aoSalvar(novosDados);
    } else {
        mensagem.className = 'fp-mensagem erro';
        mensagem.textContent = 'Erro ao salvar. Tente novamente.';
        mensagem.style.display = 'block';
    }
}

// Face ID / Digital (29/ago/2026) -- interruptor de clique instantâneo,
// mesmo padrão de Desfile/Declaração (fora do fluxo Editar/Salvar). Só
// aparece em autoedição (Meu Perfil) e só se o navegador/aparelho de quem
// está olhando realmente suportar biometria de verdade -- ver faceid.js.
// Não é capacidade nem coluna no banco: mora inteiro em localStorage deste
// aparelho, por isso nunca aparece na ficha de outra pessoa (Admin/Super
// Admin editando um Ritmista, por exemplo) -- não faria sentido ativar
// Face ID no aparelho de quem está gerenciando, só no da própria pessoa.
async function fpAplicarFaceId(alvo) {
    const secao = fpEl('fp-secao-faceid');
    if (!secao) return;
    if (!fpEstado.autoedicao || typeof faceIdSuportado !== 'function' || !faceIdSuportado()) return;
    const disponivel = await faceIdDisponivelNesteAparelho();
    if (fpEstado.alvo !== alvo) return; // a pessoa já trocou de ficha antes disso terminar
    if (!disponivel) return;
    secao.style.display = '';
    fpRenderToggleFaceId();
}

function fpRenderToggleFaceId() {
    const area = fpEl('fp-faceid-area');
    if (!area) return;
    const ativo = faceIdAtivo(fpEstado.alvo.pessoa_id);
    const trackBg = ativo ? '#2d7a4f' : '#c7d3e0';
    const thumbPos = ativo ? '21px' : '3px';
    const labelColor = ativo ? '#2d7a4f' : '#706c87';
    const labelText = ativo ? 'Ativado' : 'Desativado';
    area.innerHTML = `
        <div onclick="fpAlternarFaceId()"
             style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;user-select:none;">
            <div style="width:44px;height:24px;border-radius:12px;background:${trackBg};
                        position:relative;transition:background 0.2s;flex-shrink:0;display:block;box-sizing:border-box;">
                <div style="position:absolute;top:3px;left:${thumbPos};
                            width:16px;height:16px;border-radius:50%;
                            background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);
                            transition:left 0.2s;"></div>
            </div>
            <span style="font-size:13px;font-weight:500;color:${labelColor};">${labelText}</span>
        </div>`;
}

// Ativar aciona o prompt de Face ID/digital do próprio aparelho na hora
// (ver faceIdAtivar) -- desativar não precisa de confirmação nenhuma, só
// apaga a credencial local, mesma assimetria de outros interruptores do
// projeto (ligar pede confirmação, desligar não).
async function fpAlternarFaceId() {
    const pessoaId = fpEstado.alvo.pessoa_id;
    const nome = fpEstado.alvo.nome;
    if (faceIdAtivo(pessoaId)) {
        faceIdDesativar(pessoaId);
        fpRenderToggleFaceId();
        return;
    }
    try {
        await faceIdAtivar(pessoaId, nome);
        fpRenderToggleFaceId();
    } catch (e) {
        const mensagem = fpEl('fp-mensagem');
        if (mensagem) {
            mensagem.className = 'fp-mensagem erro';
            mensagem.textContent = 'Não deu pra ativar o Face ID/digital agora. Tente de novo.';
            mensagem.style.display = 'block';
            mensagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

async function fpAlterarSenha() {
    const nova = fpEl('fp-senha-nova').value;
    const confirmar = fpEl('fp-senha-confirmar').value;
    const mensagem = fpEl('fp-mensagem');

    // Mensagem mora lá em cima (perto do título) mas "Alterar senha" fica lá
    // embaixo, no fim da ficha — sem rolar até ela, a pessoa não tem como
    // saber se a senha mudou ou não (achado 20/jul/2026, depois de a Márcia
    // trocar a senha, não ver confirmação nenhuma e ficar sem saber se
    // funcionou). Mesma correção de rolagem já aplicada em outras mensagens
    // do projeto (ver cadastro.html, mostrarMensagem).
    function mostrarMensagemSenha(texto, tipo) {
        mensagem.className = 'fp-mensagem ' + tipo;
        mensagem.textContent = texto;
        mensagem.style.display = 'block';
        mensagem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (!nova || nova.length < 6) {
        mostrarMensagemSenha('A senha precisa ter no mínimo 6 caracteres.', 'erro');
        return;
    }
    if (nova !== confirmar) {
        mostrarMensagemSenha('As senhas não coincidem.', 'erro');
        return;
    }

    const { error } = await sb.auth.updateUser({ password: nova });
    if (error) {
        mostrarMensagemSenha('Não foi possível alterar a senha. Tente novamente.', 'erro');
    } else {
        mostrarMensagemSenha('Senha alterada com sucesso!', 'sucesso');
        // Volta a ficha inteira pro modo visualização (não só limpa os
        // campos de senha) — mesmo comportamento de "Salvar" no resto da
        // ficha, pra não deixar a seção de senha aberta depois de concluída.
        fpCancelarEdicao();
    }
}

// E-mail de suporte (config-suporte.js) ainda não preenchido pela Márcia
// em produção — enquanto estiver vazio, avisa em vez de abrir um link quebrado.
function fpAbrirSuporte() {
    const link = typeof linkSuporteEmail === 'function' ? linkSuporteEmail('Ajuda com o TumTu') : null;
    if (link) {
        window.location.href = link;
    } else {
        const mensagem = fpEl('fp-mensagem');
        if (mensagem) {
            mensagem.className = 'fp-mensagem aviso';
            mensagem.textContent = 'O suporte ainda está sendo configurado — volte em breve.';
            mensagem.style.display = 'block';
        }
    }
    return false;
}
