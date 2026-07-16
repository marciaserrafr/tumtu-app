// ── FICHA DE PERFIL — motor único de edição ──────────────────────────────
// Implementa a matriz de permissões aprovada em 06/jul/2026 (ver
// tumtu-documentacao-tecnica.md, seção 11). Usado por admin.html (Meu
// Perfil + ficha de Ritmista na Diretoria), super-admin.html (Meu Perfil)
// e carteirinha.html (perfil do Ritmista). Depende de SUPABASE_URL,
// SUPABASE_KEY e do client `sb` já existirem globalmente na página que o
// incluir.

const FP_CAMPOS = [
    { id: 'fp-apelido',              col: 'apelido' },
    { id: 'fp-nome',                 col: 'nome' },
    { id: 'fp-genero',               col: 'genero' },
    { id: 'fp-genero-personalizado', col: 'genero_personalizado' },
    { id: 'fp-nacionalidade',        col: 'nacionalidade' },
    { id: 'fp-cpf',                  col: 'cpf' },
    { id: 'fp-nascimento',           col: 'nascimento', tipo: 'data' },
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
    { id: 'fp-camisa',               col: 'tamanho_camisa' },
    { id: 'fp-fantasia',             col: 'tamanho_fantasia' },
    { id: 'fp-calca',                col: 'tamanho_calca' },
    { id: 'fp-sapato',               col: 'tamanho_sapato' },
    { id: 'fp-tipo-sanguineo',       col: 'tipo_sanguineo' },
    { id: 'fp-emergencia-nome',      col: 'emergencia_nome' },
    { id: 'fp-emergencia-parentesco',col: 'emergencia_parentesco' },
    { id: 'fp-emergencia-celular',   col: 'emergencia_celular' },
];

let fpPartialHtml = null;
let fpFotoBase64 = null;
let fpEstado = { container: null, alvo: null, meuPerfil: null, minhaPessoaId: null, autoedicao: false, editaveis: new Set(), aoSalvar: null };

// Cada coluna editável mora em "pessoas" (dado da pessoa, não muda entre baterias)
// ou "vinculos" (dado do vínculo com uma bateria específica) — usado por fpSalvar()
// pra saber em qual tabela gravar cada campo.
const FP_CAMPO_TABELA = {
    membro_desde: 'vinculos', bateria_instrumento_id: 'vinculos',
    tamanho_camisa: 'vinculos', tamanho_fantasia: 'vinculos', tamanho_calca: 'vinculos', tamanho_sapato: 'vinculos',
};
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
function fpCamposEditaveis(atorPerfil, autoedicao, alvoPerfil) {
    if (atorPerfil === 'super_admin') {
        return new Set(FP_CAMPOS.map(c => c.col).concat(['foto_url', 'bateria_instrumento_id']));
    }

    if (autoedicao) {
        const base = ['foto_url', 'nome', 'apelido', 'genero', 'genero_personalizado', 'celular', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'pais', 'emergencia_nome', 'emergencia_parentesco', 'emergencia_celular'];
        if (atorPerfil === 'diretor' || atorPerfil === 'mestre') {
            base.push('tamanho_camisa', 'tamanho_fantasia', 'tamanho_calca', 'tamanho_sapato');
        }
        return new Set(base);
    }

    if ((atorPerfil === 'diretor' || atorPerfil === 'mestre') && alvoPerfil === 'ritmista') {
        return new Set(['bateria_instrumento_id', 'tamanho_camisa', 'tamanho_fantasia', 'tamanho_calca', 'tamanho_sapato']);
    }

    return new Set();
}

async function fpMontar(containerEl) {
    if (!fpPartialHtml) {
        const res = await fetch('ficha-perfil.partial.html?v=5');
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
    if (perfil === 'diretor') return genero === 'feminino' ? 'Diretora' : 'Diretor';
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
    const editaveis = fpCamposEditaveis(meuPerfil, autoedicao, alvo.perfil);
    fpEstado = { container: fpEstado.container, alvo, meuPerfil, minhaPessoaId, autoedicao, editaveis, aoSalvar: opcoes.aoSalvar || null };
    fpFotoBase64 = null;

    const cargo = fpCargoLabel(alvo.perfil, alvo.genero);
    fpEl('fp-titulo').textContent = alvo.nome || '—';
    fpEl('fp-sub').textContent = [alvo.apelido ? `"${alvo.apelido}"` : '', cargo].filter(Boolean).join(' · ');

    const circle = fpEl('fp-foto-circle');
    circle.innerHTML = alvo.foto_url
        ? `<img src="${alvo.foto_url}" style="width:100%;height:100%;object-fit:cover;">`
        : `<svg viewBox="0 0 24 24" width="32" height="32" fill="#c0bdd0"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    fpEl('fp-foto-acao').style.display = editaveis.has('foto_url') ? 'block' : 'none';

    FP_CAMPOS.forEach(({ id, col, tipo }) => {
        const strong = fpEl(id);
        if (!strong) return;
        const valor = alvo[col];
        strong.textContent = tipo === 'data' ? fpFormatarData(valor)
            : col === 'genero' ? (FP_GENERO_LABEL[valor] || '—')
            : (valor || '—');
    });

    if (alvo.tipo_documento && alvo.numero_documento) {
        fpEl('fp-bloco-documento').style.display = '';
        fpEl('fp-documento').textContent = `${alvo.tipo_documento}: ${alvo.numero_documento}`;
    } else {
        fpEl('fp-bloco-documento').style.display = 'none';
    }

    const campoCadastro = fpEl('fp-campo-cadastro');
    if (campoCadastro) {
        campoCadastro.style.display = alvo.created_at ? '' : 'none';
        const el = fpEl('fp-cadastro');
        if (el && alvo.created_at) el.textContent = new Date(alvo.created_at).toLocaleDateString('pt-BR');
    }

    fpEl('fp-secao-instrumento').style.display = alvo.perfil === 'ritmista' ? '' : 'none';
    fpEl('fp-instrumento').textContent = alvo.instrumento_nome || '—';
    fpEl('fp-secao-senha').style.display = autoedicao ? '' : 'none';
    fpEl('fp-senha-nova').value = '';
    fpEl('fp-senha-confirmar').value = '';

    const mensagem = fpEl('fp-mensagem');
    mensagem.style.display = 'none';
    mensagem.className = 'fp-mensagem';

    fpEl('fp-btn-editar').style.display = editaveis.size > 0 ? 'inline-flex' : 'none';
    fpEl('fp-btn-salvar').style.display = 'none';
    fpEl('fp-btn-cancelar').style.display = 'none';
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

async function fpAtivarEdicao() {
    FP_CAMPOS.forEach(({ id, col, tipo }) => {
        const strong = fpEl(id);
        const input = fpEl(id + '-edit');
        if (!strong || !input || !fpEstado.editaveis.has(col)) return;
        input.value = tipo === 'data' ? fpISOparaData(fpEstado.alvo[col]) : (fpEstado.alvo[col] || '');
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

    fpEl('fp-btn-editar').style.display = 'none';
    fpEl('fp-btn-salvar').style.display = 'inline-flex';
    fpEl('fp-btn-cancelar').style.display = 'inline-flex';
}

function fpCancelarEdicao() {
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
    fpFotoBase64 = null;
    fpEl('fp-btn-editar').style.display = 'inline-flex';
    fpEl('fp-btn-salvar').style.display = 'none';
    fpEl('fp-btn-cancelar').style.display = 'none';
}

function fpPreviewFoto(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const SIZE = 300;
            canvas.width = SIZE; canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            const side = Math.min(img.width, img.height);
            const sx = (img.width - side) / 2;
            const sy = (img.height - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
            fpFotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
            fpEl('fp-foto-circle').innerHTML = `<img src="${fpFotoBase64}" style="width:100%;height:100%;object-fit:cover;">`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

async function fpSalvar() {
    const payloadPessoa = {};
    const payloadVinculo = {};
    let dataInvalida = false;
    FP_CAMPOS.forEach(({ id, col, tipo }) => {
        if (!fpEstado.editaveis.has(col)) return;
        const input = fpEl(id + '-edit');
        if (!input) return;
        const alvoPayload = fpTabelaDoCampo(col) === 'vinculos' ? payloadVinculo : payloadPessoa;
        if (tipo === 'data') {
            const bruto = input.value.trim();
            if (!bruto) { alvoPayload[col] = null; return; }
            const iso = fpDataParaISO(bruto);
            if (!iso) { dataInvalida = true; return; }
            alvoPayload[col] = iso;
            return;
        }
        alvoPayload[col] = input.value.trim() || null;
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
    if (fpEstado.editaveis.has('bateria_instrumento_id')) {
        const val = fpEl('fp-instrumento-edit').value;
        payloadVinculo.bateria_instrumento_id = val ? Number(val) : null;
    }
    if (fpFotoBase64 && fpEstado.editaveis.has('foto_url')) payloadPessoa.foto_url = fpFotoBase64;

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
        mensagem.className = 'fp-mensagem sucesso';
        mensagem.textContent = 'Dados atualizados com sucesso!';
        mensagem.style.display = 'block';
        fpCancelarEdicao();
        fpIniciar(novosDados, fpEstado.meuPerfil, fpEstado.minhaPessoaId, { aoSalvar: fpEstado.aoSalvar });
        if (fpEstado.aoSalvar) fpEstado.aoSalvar(novosDados);
    } else {
        mensagem.className = 'fp-mensagem erro';
        mensagem.textContent = 'Erro ao salvar. Tente novamente.';
        mensagem.style.display = 'block';
    }
}

async function fpAlterarSenha() {
    const nova = fpEl('fp-senha-nova').value;
    const confirmar = fpEl('fp-senha-confirmar').value;
    const mensagem = fpEl('fp-mensagem');

    if (!nova || nova.length < 6) {
        mensagem.className = 'fp-mensagem erro';
        mensagem.textContent = 'A senha precisa ter no mínimo 6 caracteres.';
        mensagem.style.display = 'block';
        return;
    }
    if (nova !== confirmar) {
        mensagem.className = 'fp-mensagem erro';
        mensagem.textContent = 'As senhas não coincidem.';
        mensagem.style.display = 'block';
        return;
    }

    const { error } = await sb.auth.updateUser({ password: nova });
    if (error) {
        mensagem.className = 'fp-mensagem erro';
        mensagem.textContent = 'Não foi possível alterar a senha. Tente novamente.';
    } else {
        mensagem.className = 'fp-mensagem sucesso';
        mensagem.textContent = 'Senha alterada com sucesso!';
        fpEl('fp-senha-nova').value = '';
        fpEl('fp-senha-confirmar').value = '';
    }
    mensagem.style.display = 'block';
}
