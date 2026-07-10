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
    { id: 'fp-nacionalidade',        col: 'nacionalidade' },
    { id: 'fp-cpf',                  col: 'cpf' },
    { id: 'fp-nascimento',           col: 'nascimento', tipo: 'data' },
    { id: 'fp-celular',              col: 'celular' },
    { id: 'fp-email',                col: 'email' },
    { id: 'fp-membro-desde',         col: 'membro_desde' },
    { id: 'fp-instrumento',          col: 'instrumento' },
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
let fpEstado = { container: null, alvo: null, meuPerfil: null, meuId: null, autoedicao: false, editaveis: new Set(), aoSalvar: null };

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
        return new Set(FP_CAMPOS.map(c => c.col).concat(['foto_url']));
    }

    if (autoedicao) {
        const base = ['foto_url', 'apelido', 'celular', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'pais', 'emergencia_nome', 'emergencia_parentesco', 'emergencia_celular'];
        if (atorPerfil === 'diretor' || atorPerfil === 'mestre') {
            base.push('tamanho_camisa', 'tamanho_fantasia', 'tamanho_calca', 'tamanho_sapato');
        }
        return new Set(base);
    }

    if ((atorPerfil === 'diretor' || atorPerfil === 'mestre') && alvoPerfil === 'ritmista') {
        return new Set(['instrumento', 'tamanho_camisa', 'tamanho_fantasia', 'tamanho_calca', 'tamanho_sapato']);
    }

    return new Set();
}

async function fpMontar(containerEl) {
    if (!fpPartialHtml) {
        const res = await fetch('ficha-perfil.partial.html?v=1');
        fpPartialHtml = await res.text();
    }
    containerEl.innerHTML = fpPartialHtml;
    fpEstado.container = containerEl;
}

function fpFormatarData(iso) {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

function fpIniciar(alvo, meuPerfil, meuId, opcoes) {
    opcoes = opcoes || {};
    const autoedicao = alvo.id === meuId;
    const editaveis = fpCamposEditaveis(meuPerfil, autoedicao, alvo.perfil);
    fpEstado = { container: fpEstado.container, alvo, meuPerfil, meuId, autoedicao, editaveis, aoSalvar: opcoes.aoSalvar || null };
    fpFotoBase64 = null;

    const cargo = alvo.perfil === 'mestre' ? 'Mestre de Bateria' : alvo.perfil === 'diretor' ? 'Diretor' : alvo.perfil === 'super_admin' ? 'Super Admin' : 'Ritmista';
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
        strong.textContent = tipo === 'data' ? fpFormatarData(valor) : (valor || '—');
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

function fpAtivarEdicao() {
    FP_CAMPOS.forEach(({ id, col, tipo }) => {
        const strong = fpEl(id);
        const input = fpEl(id + '-edit');
        if (!strong || !input || !fpEstado.editaveis.has(col)) return;
        input.value = tipo === 'data' ? (fpEstado.alvo[col] || '') : (fpEstado.alvo[col] || '');
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
    const payload = {};
    FP_CAMPOS.forEach(({ id, col }) => {
        if (!fpEstado.editaveis.has(col)) return;
        const input = fpEl(id + '-edit');
        if (input) payload[col] = input.value.trim() || null;
    });
    if (fpEstado.editaveis.has('tipo_documento')) {
        payload.tipo_documento = fpEl('fp-tipo-documento-edit').value.trim() || null;
        payload.numero_documento = fpEl('fp-numero-documento-edit').value.trim() || null;
    }
    if (fpFotoBase64 && fpEstado.editaveis.has('foto_url')) payload.foto_url = fpFotoBase64;

    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session ? sessionData.session.access_token : SUPABASE_KEY;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas?id=eq.${fpEstado.alvo.id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${token}`,
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
    });

    const mensagem = fpEl('fp-mensagem');
    if (res.ok) {
        const atualizado = await res.json();
        const novosDados = (atualizado && atualizado[0]) ? atualizado[0] : { ...fpEstado.alvo, ...payload };
        if (fpEstado.autoedicao) {
            localStorage.setItem('ritmista', JSON.stringify(novosDados));
        }
        mensagem.className = 'fp-mensagem sucesso';
        mensagem.textContent = 'Dados atualizados com sucesso!';
        mensagem.style.display = 'block';
        fpCancelarEdicao();
        fpIniciar(novosDados, fpEstado.meuPerfil, fpEstado.meuId, { aoSalvar: fpEstado.aoSalvar });
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
