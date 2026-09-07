    // ── MEU PERFIL (aba) ──────────────────────────────────────────────────────

    async function iniciarMeuPerfilAba() {
        document.getElementById('mpSuperAdminAviso').style.display = 'none';
        document.getElementById('fp-container-meuperfil').style.display = 'block';

        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        if (!u) return;

        await fpMontar(document.getElementById('fp-container-meuperfil'));
        // Mesmo ajuste de iniciarMeuPerfilSaAba (Super Admin) -- ver comentário lá.
        fpIniciar(u, u.perfil, u.pessoa_id, { aoSalvar: (novosDados) => renderizarAvatarHeader(novosDados) });

        // "Ver carteirinha" -- mesmo padrão da ficha de Ritmista/Diretoria,
        // pedido da Márcia, 20/ago/2026: "é praticamente o mesmo modelo de
        // formulário, já ficaria como padrão". Só quem está Ativo tem
        // carteirinha pra ver.
        document.getElementById('fp-container-meuperfil').querySelector('#fp-ver-carteirinha').innerHTML =
            u.status === 'aprovado'
                ? `<button class="btn-ficha btn-ficha-carteirinha" onclick="abrirCarteirinha(${u.id})">Ver carteirinha ↗</button>`
                : '';
    }

    // ── DIRETORIA ─────────────────────────────────────────────────────────────
    let diretoriaCarregada = false;
    let listaDiretoriaAtual = [];
    let _ultimoRawLeveDiretoria = null; // {bateriaId, raw} -- mesmo raciocínio de _ultimoRawLeveRitmistas
    // Busca + Filtros (Cargo/Status) -- padronizado com Ritmistas,
    // 20/ago/2026. Cargo faz o papel de "Instrumento" (tudo marcado por
    // padrão, estilo Excel); Status também nasce tudo marcado (29/ago/2026,
    // reverte o padrão "Ativos + Pendentes" de 18/ago/2026, pedido dela).
    let filtroCargoDiretoriaSelecionados = ['mestre', 'diretor', 'apoio'];
    let filtroStatusDiretoriaSelecionados = ['aprovado', 'desligado', 'pendente', 'rejeitado', 'suspenso'];

    // Busca + Filtros de Convidados Especiais -- mesmo padrão de Diretoria,
    // 31/ago/2026 (pedido dela: mesma estética das 3 telas). "Tipo de
    // Convidado" faz o papel de Cargo (sem Mestre -- não existe "Convidado
    // do Mestre", ver gruposExtraDoPublico). Sem "Menores"/"Não Desfila"/
    // "Repique de Bossa" no Status -- conceitos exclusivos de Ritmista
    // normal, mesmo conjunto de 5 status já usado em BADGE_STATUS_CONVIDADO_ESPECIAL.
    let filtroTipoConvidadoSelecionados = ['ritmista', 'diretor', 'apoio'];
    let filtroStatusConvidadoSelecionados = ['aprovado', 'desligado', 'pendente', 'rejeitado', 'suspenso'];

    function toggleTipoConvidadoSelect() {
        const dd = document.getElementById('tipoConvidadoSelectDropdown');
        const arrow = document.getElementById('tipoConvidadoSelectArrow');
        const aberto = dd.style.display !== 'none';
        dd.style.display = aberto ? 'none' : 'block';
        arrow.textContent = aberto ? '▼' : '▲';
    }
    function toggleMarcarTudoTipoConvidado() {
        const marcados = document.querySelectorAll('#tipoConvidadoSelectDropdown input[type=checkbox]:checked').length;
        const novoEstado = marcados === 0;
        document.querySelectorAll('#tipoConvidadoSelectDropdown input[type=checkbox]').forEach(c => c.checked = novoEstado);
        onChangeTipoConvidado();
    }
    function onChangeTipoConvidado() {
        const checks = document.querySelectorAll('#tipoConvidadoSelectDropdown input[type=checkbox]:checked');
        filtroTipoConvidadoSelecionados = Array.from(checks).map(c => c.value);
        const total = document.querySelectorAll('#tipoConvidadoSelectDropdown input[type=checkbox]').length;
        const label = document.getElementById('tipoConvidadoSelectLabel');
        if (filtroTipoConvidadoSelecionados.length === total) {
            label.textContent = 'Todos - Convidados';
        } else if (filtroTipoConvidadoSelecionados.length === 0) {
            label.textContent = 'Nenhum tipo';
        } else {
            label.textContent = filtroTipoConvidadoSelecionados.map(v => LABEL_PERFIL_CONVIDADO_ESPECIAL[v]).join(', ');
        }
        document.getElementById('tipoConvidadoSelectTrigger').classList.toggle('ativo', filtroTipoConvidadoSelecionados.length > 0 && filtroTipoConvidadoSelecionados.length < total);
        const marcarTudoEl = document.getElementById('tipoConvidadoMarcarTudoLink');
        if (marcarTudoEl) marcarTudoEl.textContent = filtroTipoConvidadoSelecionados.length === 0 ? 'Marcar todos' : 'Limpar';
    }
    function aplicarFiltroTipoConvidado() { toggleTipoConvidadoSelect(); aplicarFiltrosConvidadosEspeciais(); }

    function toggleStatusConvidadoSelect() {
        const dd = document.getElementById('statusConvidadoSelectDropdown');
        const arrow = document.getElementById('statusConvidadoSelectArrow');
        const aberto = dd.style.display !== 'none';
        dd.style.display = aberto ? 'none' : 'block';
        arrow.textContent = aberto ? '▼' : '▲';
    }
    function toggleMarcarTudoStatusConvidado() {
        const marcados = document.querySelectorAll('#statusConvidadoSelectDropdown input[type=checkbox]:checked').length;
        const novoEstado = marcados === 0;
        document.querySelectorAll('#statusConvidadoSelectDropdown input[type=checkbox]').forEach(c => c.checked = novoEstado);
        onChangeStatusConvidado();
    }
    function onChangeStatusConvidado() {
        const checks = document.querySelectorAll('#statusConvidadoSelectDropdown input[type=checkbox]:checked');
        filtroStatusConvidadoSelecionados = Array.from(checks).map(c => c.value);
        const total = document.querySelectorAll('#statusConvidadoSelectDropdown input[type=checkbox]').length;
        const label = document.getElementById('statusConvidadoSelectLabel');
        if (filtroStatusConvidadoSelecionados.length === total) {
            label.textContent = 'Todos os status';
        } else if (filtroStatusConvidadoSelecionados.length === 0) {
            label.textContent = 'Nenhum status';
        } else {
            label.textContent = filtroStatusConvidadoSelecionados.map(v => LABELS_STATUS_FILTRO[v]).join(', ');
        }
        document.getElementById('statusConvidadoSelectTrigger').classList.toggle('ativo', filtroStatusConvidadoSelecionados.length > 0 && filtroStatusConvidadoSelecionados.length < total);
        const marcarTudoEl = document.getElementById('statusConvidadoMarcarTudoLink');
        if (marcarTudoEl) marcarTudoEl.textContent = filtroStatusConvidadoSelecionados.length === 0 ? 'Marcar todos' : 'Limpar';
    }
    function aplicarFiltroStatusConvidado() { toggleStatusConvidadoSelect(); aplicarFiltrosConvidadosEspeciais(); }

    // "Limpar" a busca (06/set/2026, mesmo padrão de Ritmistas/Diretoria).
    function limparBuscaConvidados() {
        document.getElementById('campoBuscaConvidadoEspecial').value = '';
        aplicarFiltrosConvidadosEspeciais();
    }

    function aplicarFiltrosConvidadosEspeciais() {
        let lista = (convidadosEspeciaisCache || []).filter(r => {
            const tipoOk = filtroTipoConvidadoSelecionados.includes(r.perfil);
            const statusOk = filtroStatusConvidadoSelecionados.includes(r.status);
            return tipoOk && statusOk;
        });
        const busca = semAcento(document.getElementById('campoBuscaConvidadoEspecial')?.value || '');
        if (busca) {
            lista = lista.filter(r => semAcento(r.nome).includes(busca) || semAcento(r.apelido).includes(busca));
        }
        renderizarConvidadosEspeciais(lista);
    }

    async function carregarDiretoria(leve = false) {
        if (diretoriaCarregada) return;
        const bateriaId = bateriaIdContexto();
        const lista = document.getElementById('listaDiretoria');
        // Só mostra o spinner por cima da lista vazia -- na segunda chamada
        // de carregarDiretoriaComFotos() (leve -> completa, só pra buscar
        // foto por trás) a lista já tem conteúdo real na tela; sobrescrever
        // com spinner de novo causava um pisca-pisca sem necessidade.
        if (!listaDiretoriaAtual.length) {
            lista.innerHTML = '<div style="text-align:center;padding:6px 20px;"><svg class="spinner-mini" viewBox="0 0 56 56" role="status" aria-label="Carregando"><use href="#tt-spinner-caminho"></use></svg></div>';
        }

        if (!bateriaId) { renderizarDiretoria([]); diretoriaCarregada = true; return; }
        const select = COLUNAS_RITMISTAS_SEM_FOTO; // 06/set/2026: nunca mais '*' -- ver comentário em preencherFotosRitmistasEmSegundoPlano()
        // eh_convidado=eq.false (31/ago/2026): mesmo raciocínio de carregarRitmistas() -- Convidado Especial - Diretor/Apoio tem fila própria.
        const url = `${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?perfil=in.(mestre,diretor,apoio)&bateria_id=eq.${bateriaId}&eh_convidado=eq.false&order=perfil.asc,nome.asc&select=${select}`;

        const res = await fetch(url, {
            headers: authHeaders
        });
        const novosAdmins = (await res.json()) || [];
        // Mesma rede de segurança de carregarRitmistas() -- um erro do
        // banco (ex: 500) vem como objeto, não lista; sem essa checagem,
        // listaDiretoriaAtual ficava corrompida pra sempre.
        if (!Array.isArray(novosAdmins)) {
            console.error('carregarDiretoria: resposta inesperada do banco (não é uma lista) -- mantendo a lista anterior:', novosAdmins);
            diretoriaCarregada = true;
            return;
        }
        // Mesmo raciocínio de carregarRitmistas() (05/set/2026) -- a
        // atualização automática de 30s redesenhava a lista de Diretoria
        // inteira mesmo sem nada ter mudado, travando o navegador por um
        // instante e fazendo cliques parecerem "não funcionar". Só pra
        // passada "leve": se o retorno bruto do banco é idêntico ao da
        // última vez, nada mudou, não redesenha nada.
        if (leve) {
            const rawAtual = JSON.stringify(novosAdmins);
            if (_ultimoRawLeveDiretoria && _ultimoRawLeveDiretoria.bateriaId === bateriaId && _ultimoRawLeveDiretoria.raw === rawAtual) { diretoriaCarregada = true; return; }
            _ultimoRawLeveDiretoria = { bateriaId, raw: rawAtual };
        }
        listaDiretoriaAtual = reaproveitarFotosCache(novosAdmins, listaDiretoriaAtual);
        aplicarFiltrosDiretoria();
        atualizarTotalizadoresDiretoria();
        atualizarBadgesNav();
        // Aniversariantes do mês (Visão Geral) inclui Diretoria -- essa busca
        // roda em paralelo com carregarRitmistas(), então precisa re-render
        // aqui pra não ficar faltando gente até a próxima troca de aba.
        if (document.getElementById('vg-aniversariantes')) renderizarVisaoGeral();
        diretoriaCarregada = true;
        // Sem await de propósito (06/set/2026) -- mesmo raciocínio de
        // carregarRitmistas(): a busca principal acima nunca mais traz
        // foto, então toda chamada precisa disparar isso.
        preencherFotosDiretoriaEmSegundoPlano();
    }

    // Mesmo raciocínio de preencherFotosRitmistasEmSegundoPlano() logo
    // acima -- achado real, 05/set/2026.
    async function preencherFotosDiretoriaEmSegundoPlano() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) return;
        const LOTE = 30;
        let offset = 0;
        while (true) {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?perfil=in.(mestre,diretor,apoio)&bateria_id=eq.${bateriaId}&eh_convidado=eq.false&order=perfil.asc,nome.asc&select=id,foto_url&limit=${LOTE}&offset=${offset}`, {
                headers: authHeaders
            });
            const lote = await res.json();
            if (!Array.isArray(lote) || lote.length === 0) break;
            const fotosPorId = {};
            lote.forEach(p => { if (p.foto_url) fotosPorId[p.id] = p.foto_url; });
            let mudou = false;
            listaDiretoriaAtual.forEach(p => { if (fotosPorId[p.id] && p.foto_url !== fotosPorId[p.id]) { p.foto_url = fotosPorId[p.id]; mudou = true; } });
            if (mudou) aplicarFiltrosDiretoria();
            if (lote.length < LOTE) break;
            offset += LOTE;
            await new Promise(r => setTimeout(r, 0));
        }
    }

    function toggleCargoSelect() {
        const dd = document.getElementById('cargoSelectDropdown');
        const arrow = document.getElementById('cargoSelectArrow');
        const aberto = dd.style.display !== 'none';
        dd.style.display = aberto ? 'none' : 'block';
        arrow.textContent = aberto ? '▼' : '▲';
    }
    function toggleMarcarTudoCargo() {
        const marcados = document.querySelectorAll('#cargoSelectDropdown input[type=checkbox]:checked').length;
        const novoEstado = marcados === 0;
        document.querySelectorAll('#cargoSelectDropdown input[type=checkbox]').forEach(c => c.checked = novoEstado);
        onChangeCargo();
    }
    function onChangeCargo() {
        const checks = document.querySelectorAll('#cargoSelectDropdown input[type=checkbox]:checked');
        filtroCargoDiretoriaSelecionados = Array.from(checks).map(c => c.value);
        const total = document.querySelectorAll('#cargoSelectDropdown input[type=checkbox]').length;
        const labelsCargo = { mestre: 'Mestres', diretor: 'Diretores de Bateria', apoio: 'Diretores (Apoio)' };
        const label = document.getElementById('cargoSelectLabel');
        if (filtroCargoDiretoriaSelecionados.length === total) {
            label.textContent = 'Todos - Diretoria';
        } else if (filtroCargoDiretoriaSelecionados.length === 0) {
            label.textContent = 'Nenhum cargo';
        } else {
            label.textContent = filtroCargoDiretoriaSelecionados.map(v => labelsCargo[v]).join(', ');
        }
        document.getElementById('cargoSelectTrigger').classList.toggle('ativo', filtroCargoDiretoriaSelecionados.length > 0 && filtroCargoDiretoriaSelecionados.length < total);
        const marcarTudoEl = document.getElementById('cargoMarcarTudoLink');
        if (marcarTudoEl) marcarTudoEl.textContent = filtroCargoDiretoriaSelecionados.length === 0 ? 'Marcar todos' : 'Limpar';
    }

    function toggleStatusDiretoriaSelect() {
        const dd = document.getElementById('statusDiretoriaSelectDropdown');
        const arrow = document.getElementById('statusDiretoriaSelectArrow');
        const aberto = dd.style.display !== 'none';
        dd.style.display = aberto ? 'none' : 'block';
        arrow.textContent = aberto ? '▼' : '▲';
    }
    function toggleMarcarTudoStatusDiretoria() {
        const marcados = document.querySelectorAll('#statusDiretoriaSelectDropdown input[type=checkbox]:checked').length;
        const novoEstado = marcados === 0;
        document.querySelectorAll('#statusDiretoriaSelectDropdown input[type=checkbox]').forEach(c => c.checked = novoEstado);
        onChangeStatusDiretoria();
    }
    function onChangeStatusDiretoria() {
        const checks = document.querySelectorAll('#statusDiretoriaSelectDropdown input[type=checkbox]:checked');
        filtroStatusDiretoriaSelecionados = Array.from(checks).map(c => c.value);
        const total = document.querySelectorAll('#statusDiretoriaSelectDropdown input[type=checkbox]').length;
        const labels = LABELS_STATUS_FILTRO;
        const label = document.getElementById('statusDiretoriaSelectLabel');
        if (filtroStatusDiretoriaSelecionados.length === total) {
            label.textContent = 'Todos os status';
        } else if (filtroStatusDiretoriaSelecionados.length === 0) {
            label.textContent = 'Nenhum status';
        } else {
            label.textContent = filtroStatusDiretoriaSelecionados.map(v => labels[v]).join(', ');
        }
        document.getElementById('statusDiretoriaSelectTrigger').classList.toggle('ativo', filtroStatusDiretoriaSelecionados.length > 0 && filtroStatusDiretoriaSelecionados.length < total);
        const marcarTudoEl = document.getElementById('statusDiretoriaMarcarTudoLink');
        if (marcarTudoEl) marcarTudoEl.textContent = filtroStatusDiretoriaSelecionados.length === 0 ? 'Marcar todos' : 'Limpar';
    }

    // "Limpar" a busca (06/set/2026, mesmo padrão de Ritmistas/Convidados).
    function limparBuscaDiretoria() {
        document.getElementById('campoBuscaDiretoria').value = '';
        aplicarFiltrosDiretoria();
    }

    function aplicarFiltrosDiretoria() {
        let lista = (listaDiretoriaAtual || []).filter(a => {
            const cargoOk = filtroCargoDiretoriaSelecionados.includes(a.perfil);
            const statusOk = filtroStatusDiretoriaSelecionados.includes(a.status);
            return cargoOk && statusOk;
        });
        const busca = semAcento(document.getElementById('campoBuscaDiretoria')?.value || '');
        if (busca) {
            const buscaCpf = busca.replace(/\D/g,'');
            lista = lista.filter(a =>
                semAcento(a.nome).includes(busca) ||
                semAcento(a.apelido).includes(busca) ||
                (buscaCpf.length > 0 && (a.cpf || '').replace(/\D/g,'').includes(buscaCpf))
            );
        }
        renderizarDiretoria(lista);
    }

    // Mesma carregarDiretoria(), mas força ignorar o cache (diretoriaCarregada)
    // -- usada depois de qualquer ação que muda status (Suspender/Desligar/
    // Reativar), senão a lista fica presa no estado antigo em tela.
    function recarregarDiretoria() {
        diretoriaCarregada = false;
        return carregarDiretoria(true);
    }

    function renderizarDiretoria(admins) {
        const lista = document.getElementById('listaDiretoria');
        if (!admins || admins.length === 0) {
            lista.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">👤</div>Nenhum membro da diretoria encontrado.</div>';
            return;
        }
        // Aprovar/rejeitar Mestre ou Diretor pendente exige a capacidade
        // aprovar_acessos -- não é mais "só quem é Mestre" hardcoded (pedido
        // da Márcia, 19/ago/2026: quer poder criar um "Diretor Admin" com
        // mais poder que os outros Diretores). Super Admin sempre pode.
        const podeAprovar = a => tenhoCapacidade('aprovar_acessos');

        const cardHTML = a => {
            const inicial = (a.nome || 'A')[0].toUpperCase();
            const fotoHtml = a.foto_url
                ? `<img src="${a.foto_url}">`
                : inicial;
            const cargo = labelPerfilSA(a.perfil, a.genero);
            // Mesmos ícones de aniversário/estrangeiro do card de Ritmistas --
            // pedido da Márcia, 21/ago/2026: "diretoria" pra ela é o módulo
            // inteiro (Mestre, Diretor e Apoio), não só uma parte dele.
            const nascDateA = a.nascimento ? new Date(a.nascimento + 'T00:00:00') : null;
            const aniversarioMesA = nascDateA && (nascDateA.getMonth() + 1) === (new Date().getMonth() + 1);

            const badgeStatus = {
                pendente:  `<span class="badge badge-pendente">Pendente</span>`,
                aprovado:  `<span class="badge badge-aprovado">Ativo</span>`,
                suspenso:  `<span class="badge badge-suspenso">Suspenso</span>`,
                desligado: `<span class="badge badge-desligado">Desligado</span>`,
                rejeitado: `<span class="badge badge-rejeitado">Rejeitado</span>`,
            }[a.status] || '';

            // Mesmo ajuste de alinhamento de Ritmistas, 20/ago/2026: botões
            // antes do badge, badge + seta sempre por último.
            const acoesExtras = (a.status === 'pendente' && podeAprovar(a))
                ? `<button class="btn-card-acao btn-card-ativar" onclick="event.stopPropagation();aprovarDiretor(${a.id})">Aprovar</button>
                   <button class="btn-card-acao btn-card-rejeitar" onclick="event.stopPropagation();rejeitarDiretor(${a.id})">Rejeitar</button>`
                : '';
            const direita = `${acoesExtras}${badgeStatus}<span class="card-chevron">›</span>`;

            // Selo de Naipe só pra Diretor (é atributo dele, ver
            // fpResolverSeloNaipe em ficha-perfil.js) -- só no painel, nunca
            // na carteirinha (decisão da Márcia, 21/ago/2026).
            const seloNaipe = (a.perfil === 'diretor' && tenhoCapacidade('ver_naipe')) ? fpResolverSeloNaipe(a.naipe) : null;

            return `
            <div class="card-ritmista ${a.status}" onclick="abrirFichaAdmin(${a.id})">
                <div class="card-foto">${fotoHtml}</div>
                <div class="card-esquerda">
                    <div class="card-linha1">
                        <span class="card-nome">${a.nome || '—'}</span>
                        ${a.apelido ? `<span class="card-apelido-inline">${a.apelido}</span>` : ''}
                        ${a.nacionalidade && a.nacionalidade !== 'Brasileira' ? `<span title="${a.nacionalidade}" style="font-size:14px;flex-shrink:0;">🌍</span>` : ''}
                        ${aniversarioMesA ? '<span title="Aniversário este mês" style="flex-shrink:0;">🎂</span>' : ''}
                    </div>
                    <div class="card-linha2">
                        <span class="dir-badge-cargo">${cargo}</span>
                        ${seloNaipe ? `<span class="pill-instrumento">🥁 ${seloNaipe}</span>` : ''}
                        ${a.eh_admin_bateria && tenhoCapacidade('ver_admin_bateria') ? `<span class="dir-badge-admin">Admin</span>` : ''}
                    </div>
                </div>
                <div class="card-direita">${direita}</div>
            </div>`;
        };

        // Mesma separação já usada no Super Admin (aba Acessos) -- Mestres
        // primeiro, Diretores depois, cada um com seu título de seção.
        // Dentro de cada seção, pendente sobe pro topo (27/ago/2026, pedido
        // dela -- vinha só em ordem alfabética, então um pendente podia
        // ficar escondido no meio da lista, sem chamar atenção pra aprovar).
        const pendentePrimeiro = (a, b) => (a.status === 'pendente' ? 0 : 1) - (b.status === 'pendente' ? 0 : 1);
        const mestres = admins.filter(a => a.perfil === 'mestre').sort(pendentePrimeiro);
        const diretores = admins.filter(a => a.perfil === 'diretor').sort(pendentePrimeiro);
        const apoios = admins.filter(a => a.perfil === 'apoio').sort(pendentePrimeiro);
        // Contador ao lado do título de cada seção (27/ago/2026, pedido dela)
        // -- mesmo estilo já aprovado hoje pro contador de status em
        // Ritmistas: número dourado, sem fundo.
        const tituloSecaoComContador = (rotulo, qtd) => `<div class="secao-titulo" style="display:flex;justify-content:space-between;align-items:center;"><span>${rotulo}</span><span style="color:#D4AF37;font-weight:800;font-size:14px;letter-spacing:normal;">${qtd}</span></div>`;
        let html = '';
        if (mestres.length) html += tituloSecaoComContador('Mestres', mestres.length) + mestres.map(cardHTML).join('');
        if (diretores.length) html += tituloSecaoComContador('Diretores de Bateria', diretores.length) + diretores.map(cardHTML).join('');
        if (apoios.length) html += tituloSecaoComContador('Diretores (Apoio)', apoios.length) + apoios.map(cardHTML).join('');
        lista.innerHTML = html;

        // Guarda admins para uso no modal
        window._adminsCache = admins;
    }

    async function aprovarDiretor(id) {
        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ status: 'aprovado', aprovado_por: u ? u.pessoa_id : null, motivo_status: null })
        });
        notificarAprovacao(id);
        diretoriaCarregada = false;
        await carregarDiretoria(true);
    }

    async function rejeitarDiretor(id) {
        await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ status: 'rejeitado' })
        });
        notificarAprovacao(id, 'rejeitado');
        diretoriaCarregada = false;
        await carregarDiretoria(true);
    }

    async function abrirFichaAdmin(id) {
        const admins = window._adminsCache || [];
        const a = admins.find(x => x.id === id);
        if (!a) return;

        const usuarioAtual = JSON.parse(localStorage.getItem('ritmista') || 'null');
        await fpMontar(document.getElementById('fp-container-admin'));
        fpIniciar(a, usuarioAtual ? usuarioAtual.perfil : null, usuarioAtual ? usuarioAtual.pessoa_id : null, { aoSalvar: () => { diretoriaCarregada = false; carregarDiretoria(); } });

        // Resumo + atalho de Permissões dentro da ficha -- pedido da
        // Márcia, 22/ago/2026. Continua isolado por capacidade (só quem tem
        // ver_permissoes enxerga isso aqui também, mesma trava de sempre):
        // ter acesso pra ver/aprovar Diretoria não dá acesso a permissão de
        // ninguém. Abre o MESMO editor da aba "Permissões" (não duplica
        // lógica) -- ver fpIrParaPermissoesDeFicha.
        const extraAdmin = document.querySelector('#fp-container-admin #fp-extra-conteudo');
        if (extraAdmin) {
            extraAdmin.innerHTML = tenhoCapacidade('ver_permissoes') ? `
                <div class="ficha-secao">
                    <div class="ficha-secao-titulo">Permissões</div>
                    <div class="ficha-campo full">
                        <span>Nesta bateria</span>
                        <button type="button" onclick="toggleResumoPermissoesFicha()" style="background:none;border:none;padding:4px 0 2px;margin:0 0 8px;font-family:inherit;font-size:11px;font-weight:700;color:#8b88a0;cursor:pointer;text-align:left;display:flex;align-items:center;gap:4px;">
                            <span id="fp-permissoes-toggle-rotulo">Ver detalhes</span>
                            <span class="vg-secao-seta" id="fp-permissoes-toggle-seta" style="font-size:12px;">›</span>
                        </button>
                        <div id="fp-permissoes-detalhe" style="display:none;font-size:13px;line-height:1.6;">${permissoesResumoDetalhado(a)}</div>
                    </div>
                    <button type="button" class="btn-ficha" style="margin-top:8px;" onclick="fpIrParaPermissoesDeFicha(${a.id})">Editar permissões</button>
                </div>` : '';
        }

        // Botões de ação de status + Ver carteirinha + Fechar -- mesmo
        // padrão de abrirCadastro() (Ritmistas), pedido da Márcia,
        // 20/ago/2026: Diretoria nunca teve Suspender/Desligar em lugar
        // nenhum da tela, só Aprovar/Rejeitar (pendente). Reaproveita os
        // mesmos modais de motivo (abrirModalSuspender/abrirModalDesligar),
        // só passando o rótulo certo e qual lista recarregar depois.
        const rotulo = a.perfil === 'mestre' ? (a.genero === 'feminino' ? 'Mestra' : 'Mestre')
            : a.perfil === 'diretor' ? (a.genero === 'feminino' ? 'Diretora de Bateria' : 'Diretor de Bateria') : 'Diretor';
        const nomeEscapado = (a.nome || '').replace(/'/g, "\\'");
        // Reforma de Permissões (27-28/ago/2026): mesma gate por capacidade
        // específica já aplicada em abrirCadastro() (Ritmistas).
        let btns = '';
        if (a.status === 'pendente') {
            if (tenhoCapacidade('aprovar_acessos'))
                btns += `<button class="btn-ficha btn-ficha-ativar" onclick="fecharModalAdmin();aprovarDiretor(${a.id})">Aprovar</button>`;
            if (tenhoCapacidade('rejeitar_acessos'))
                btns += `<button class="btn-ficha btn-ficha-rejeitar" onclick="fecharModalAdmin();rejeitarDiretor(${a.id})">Rejeitar</button>`;
        } else if (a.status === 'aprovado') {
            if (tenhoCapacidade('suspender_acessos'))
                btns += `<button class="btn-ficha btn-ficha-suspender" onclick="fecharModalAdmin();abrirModalSuspender(${a.id},'${nomeEscapado}','${rotulo}',recarregarDiretoria)">Suspender</button>`;
            if (tenhoCapacidade('desligar_acessos'))
                btns += `<button class="btn-ficha btn-ficha-desligar" onclick="fecharModalAdmin();abrirModalDesligar(${a.id},'${nomeEscapado}','${rotulo}',recarregarDiretoria)">Desligar</button>`;
        } else if (a.status === 'suspenso') {
            if (tenhoCapacidade('reativar_acessos'))
                btns += `<button class="btn-ficha btn-ficha-reativar" onclick="fecharModalAdmin();atualizarStatus(${a.id},'aprovado',null,recarregarDiretoria,'reativado')">Reativar</button>`;
            if (tenhoCapacidade('desligar_acessos'))
                btns += `<button class="btn-ficha btn-ficha-desligar" onclick="fecharModalAdmin();abrirModalDesligar(${a.id},'${nomeEscapado}','${rotulo}',recarregarDiretoria)">Desligar</button>`;
        } else {
            if (tenhoCapacidade('reativar_acessos'))
                btns += `<button class="btn-ficha btn-ficha-reativar" onclick="fecharModalAdmin();atualizarStatus(${a.id},'aprovado',null,recarregarDiretoria,'reativado')">Reativar</button>`;
        }
        btns += `<button class="btn-ficha" onclick="fecharModalAdmin()">Fechar</button>`;
        document.querySelector('#fp-container-admin #fp-acoes-extra').innerHTML = btns;

        // "Ver carteirinha" fica fixo no fim do conteúdo (não na barra
        // flutuante) -- mesmo ajuste feito em abrirCadastro() (Ritmistas).
        // Só aparece pra quem está Ativo -- suspenso/rejeitado/desligado/
        // pendente não tem carteirinha (achado da Márcia, 20/ago/2026).
        document.querySelector('#fp-container-admin #fp-ver-carteirinha').innerHTML =
            (a.status === 'aprovado' && tenhoCapacidade('ver_carteirinha_outros'))
                ? `<button class="btn-ficha btn-ficha-carteirinha" onclick="abrirCarteirinha(${a.id})">Ver carteirinha ↗</button>`
                : '';

        // Só edita dados de quem está ativo/suspenso (mesma regra do Ritmista)
        // -- Super Admin sempre passa direto (03/set/2026, ver justificativa
        // em abrirCadastro).
        if (a.status !== 'aprovado' && a.status !== 'suspenso' && !souSuperAdmin) {
            document.getElementById('fp-container-admin').querySelector('#fp-btn-editar').style.display = 'none';
        }

        document.getElementById('modalAdmin').style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function fecharModalAdmin() {
        document.getElementById('modalAdmin').style.display = 'none';
        document.body.style.overflow = '';
    }

    function abrirCarteirinha(id) {
        window.open(`carteirinha.html?id=${id}`, '_blank');
    }

    // ── TROCAR ABA (atualizado) ───────────────────────────────────────────────
    async function trocarAba(aba, btn) {
        // Reforço na tela (a segurança de verdade é o RLS -- mesmo se alguém
        // forçar isso via console, os dados não carregam) -- evita cair numa
        // aba vazia/quebrada que a pessoa não tem capacidade pra ver.
        if (!podeVerAba(aba)) return;
        // Desliga a câmera do leitor de QR se a pessoa trocar de aba com o
        // scanner aberto -- sem isso, a câmera ficaria ligada em segundo
        // plano (idempotente, não faz nada se já estava fechada).
        fecharScannerPresenca();
        fecharQrEvento();
        fecharQrFigurino();

        // O BOTÃO acende na hora, antes de qualquer busca no banco --
        // separado de propósito do painel de conteúdo (mais abaixo), que
        // continua só aparecendo quando estiver pronto. Achado dela,
        // 05/set/2026: numa conexão lenta, o botão ficava sem nenhuma
        // resposta visual até os dados chegarem (podendo levar vários
        // segundos) -- parecia que o clique não tinha registrado, e ela
        // clicava de novo. Isso não viola a regra de "nunca revelar tela
        // pela metade" (01/set/2026, comentário original abaixo): o
        // destaque é só do BOTÃO em si, não do painel.
        document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('ativa'));
        document.querySelectorAll('.aba-sub-btn').forEach(b => b.classList.remove('ativa'));
        // Navegar pra uma aba de verdade (não um item do submenu "Mais",
        // que chama isso com btn=null) fecha o acordeão -- só fica aberto
        // enquanto a pessoa estiver navegando dentro dele mesmo.
        if (btn && btn.id !== 'btnMais') {
            const submenuMais = document.getElementById('abaMaisSubmenu');
            const btnMais = document.getElementById('btnMais');
            if (submenuMais) submenuMais.classList.remove('aberto');
            if (btnMais) btnMais.classList.remove('aberto');
        }
        if (btn) btn.classList.add('ativa');

        // A partir daqui vai tudo dentro de um try/catch (06/set/2026) --
        // achado dela ao vivo: trocar de aba "não fazia nada" em momentos
        // imprevisíveis, sem nenhum aviso (ex: de Diretoria pra Visão
        // Geral). Se algo falhar no meio do caminho, a função parava
        // silenciosamente bem aqui -- o botão acendia (linha de cima) mas
        // o painel nunca trocava, e ninguém via o motivo. Agora pelo menos
        // fica registrado (logErroCliente) pra investigar com dado real.
        try {
        // Busca os dados ANTES de revelar o painel novo -- só pras abas que
        // fazem busca de verdade (Figurino/Presença/Histórico/Convidados).
        // Fica no painel atual, sem nada "carregando", até a aba nova
        // estar pronta pra aparecer já montada. Achado dela, 01/set/2026,
        // reportado de novo mesmo depois da 1ª correção (que só reordenou
        // por DENTRO dessas funções, sem perceber que o título de cada
        // painel é HTML fixo, revelado por ESTA função antes delas rodarem)
        // -- "Entrega de Figurino continua mostrando o título e depois o
        // card". NÃO mexe nas outras abas (Diretoria em especial) -- ver
        // aviso de 27/ago/2026 logo abaixo, área de risco já documentada.
        if (aba === 'figurino') await iniciarFigurinoTab();
        else if (aba === 'presenca') await iniciarPresencaTab();
        else if (aba === 'historico') await carregarHistoricoEscolaSA();
        else if (aba === 'extras') await iniciarConvidadosAba();

        window.scrollTo(0, 0);
        document.querySelectorAll('#mainEscola .painel').forEach(p => p.classList.remove('ativo'));
        document.getElementById('painel-' + aba).classList.add('ativo');
        salvarEstadoNavegacao(souSuperAdmin ? 'sa-escola' : 'mestre-diretor', aba, souSuperAdmin ? escolaSelecionadaId : null);

        // Tentativa de 27/ago/2026 de recarregar Visão Geral/Ritmistas ao
        // entrar na aba (sem esperar os 30s do auto-refresh) REVERTIDA no
        // mesmo dia -- depois de publicada, apareceram 3 problemas
        // estranhos em sequência (filtro "travando", confusão ao trocar
        // de escola, fotos parando de aparecer) todos girando em torno
        // dessa área. Sem ferramenta de navegador pra confirmar a causa
        // exata, mais seguro voltar ao comportamento antigo (só o
        // auto-refresh de 30s atualiza sozinho) do que manter algo
        // suspeito no ar. Não retomar sem investigar com calma, com
        // ferramenta de teste disponível.
        if (aba === 'diretoria') carregarDiretoria();
        if (aba === 'meu-perfil') iniciarMeuPerfilAba();
        if (aba === 'configuracoes') iniciarConfiguracoesAba();
        if (aba === 'dados-escola') renderizarDadosEscolaTab(false);
        if (aba === 'dados-bateria') renderizarDadosBateriaTab(false);
        if (aba === 'comercial') renderizarComercialTab();
        if (aba === 'permissoes') { permissoesPessoaEditando = null; voltarPermissoesLista(); renderizarEditorPermissoesPessoa(); carregarPermissoesEscola(); }
        if (aba === 'administrativo') renderizarAdministrativoLista();
        } catch (err) {
            console.error('trocarAba falhou:', err);
            logErroCliente('trocarAba:' + aba, err);
        }
    }
