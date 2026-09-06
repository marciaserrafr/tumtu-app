    const SUPABASE_URL = 'https://pkvzsgrkylrkyzligeim.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrdnpzZ3JreWxya3l6bGlnZWltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2Mjg0NjAsImV4cCI6MjA5ODIwNDQ2MH0.jASGzRUdZWzUwOHDww3XSDPtzw8_JU_OfTCoCpJEWBM';
    // sb declarado aqui (escopo do <script> inteiro, todas as funções do
    // arquivo fecham sobre essa variável), mas SÓ criado dentro de
    // DOMContentLoaded (06/set/2026) -- ver comentário completo junto do
    // <script src="...supabase-js" defer> no <head>: precisa que o
    // "defer" ali tenha tempo de terminar antes de chamar
    // window.supabase.createClient, senão dá erro (window.supabase ainda
    // não existiria). Mesmo padrão já usado com segurança em
    // carteirinha.html (ver `let sb;` + DOMContentLoaded lá).
    let sb;
    document.addEventListener('DOMContentLoaded', () => {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    });

    // Experimento consciente do notch, 06/set/2026 (ver comentário completo
    // junto do "@view-transition" no <style> deste arquivo): a transição
    // nativa entre páginas foi religada pra tentar fechar a fresta da
    // piscada na troca login→admin (spinner idêntico dos dois lados, então
    // deveria ficar imperceptível). Só que sozinha ela animaria QUALQUER
    // navegação saindo daqui também (logout, cadastro manual...), onde a
    // tela de saída é o painel carregado de verdade -- bem diferente do
    // spinner de destino, repetindo o mesmo tipo de bug de "página
    // fantasma" que a carteirinha já teve no passado. Este listener
    // cancela a transição toda vez que a saída é DAQUI, sem exceção --
    // login.html continua livre pra animar a entrada normalmente.
    window.addEventListener('pageswap', (event) => {
        if (event.viewTransition) event.viewTransition.skipTransition();
    });

    // Tela de carregamento "Passaporte" (05/set/2026) -- tempo mínimo de
    // exibição (~600ms) e esmaecer suave (~250ms) na saída, pedido no
    // documento de handoff do design: sem isso, em conexão rápida a batida
    // só "pisca" (não dá tempo nem de completar meio ciclo) e o
    // desaparecimento seco quebra a sensação de intenção da tela.
    let overlayCarregandoMostradoEm = performance.now(); // já visível desde o HTML puro
    function mostrarOverlayCarregando() {
        overlayCarregandoMostradoEm = performance.now();
        const el = document.getElementById('overlayCarregandoEscola');
        el.classList.remove('escondida');
    }
    function esconderOverlayCarregando() {
        // Sem esmaecer (06/set/2026, achado dela com vídeo real, quadro a
        // quadro): o esmaecer de 250ms deixava o spinner semitransparente
        // por cima da tela de verdade (já carregada por baixo) por um
        // instante -- como as cores são bem diferentes (spinner escuro,
        // conteúdo claro), isso parecia "duas telas se sobrepondo", não um
        // dissolve suave. Some na hora, sem transição -- mantém só o tempo
        // mínimo de exibição (pra não "piscar" antes de completar meio
        // ciclo da animação).
        const decorrido = performance.now() - overlayCarregandoMostradoEm;
        const espera = Math.max(0, 600 - decorrido);
        setTimeout(() => {
            document.getElementById('overlayCarregandoEscola').classList.add('escondida');
        }, espera);
    }

    const authHeaders = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
    async function iniciarSessaoAuth() {
        const { data: sessionData } = await sb.auth.getSession();
        if (sessionData.session) authHeaders['Authorization'] = `Bearer ${sessionData.session.access_token}`;
    }

    // Registro de erro real do navegador (06/set/2026) -- achado dela ao
    // vivo: trocar de aba "não faz nada" em momentos imprevisíveis, sem
    // nenhum aviso na tela. Causa provável: uma exceção no meio do caminho
    // (rede falhando, resposta inesperada) para a função de troca de aba
    // no meio, silenciosamente -- ninguém vê, o clique só "não funciona".
    // Grava aqui pra investigar depois com dado real, nunca bloqueia nem
    // atrapalha quem está usando (fire-and-forget, com try/catch próprio).
    function logErroCliente(contexto, err) {
        try {
            const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
            fetch(`${SUPABASE_URL}/rest/v1/logs_erro_cliente`, {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pessoa_id: u ? u.pessoa_id : null,
                    contexto,
                    mensagem: err && err.message ? err.message : String(err),
                    detalhe: err && err.stack ? err.stack : null,
                    user_agent: navigator.userAgent,
                }),
            }).catch(() => {});
        } catch (e) { /* nunca deixa o log quebrar a tela */ }
    }

    let todosRitmistas = [];
    let _ultimoRawLeveRitmistas = null; // {bateriaId, raw} -- ver comentário em carregarRitmistas()
    let listaFiltradaAtual = [];
    let filtroStatusSelecionados = ['aprovado', 'nao_desfila', 'desligado', 'menor', 'repique_bossa', 'pendente', 'rejeitado', 'suspenso'];
    const semAcento = s => (s||'').toLowerCase().normalize('NFD').split('').filter(c => c.charCodeAt(0) < 768 || c.charCodeAt(0) > 879).join('').trim();
    let acaoAtualId = null;

    function calcularIdade(nascimento) {
        if (!nascimento) return null;
        const hoje = new Date();
        const nasc = new Date(nascimento);
        let idade = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
        return idade;
    }

    function atualizarTotalizadores() {
        // "Não Desfila" (28/ago/2026) continua status=aprovado por baixo,
        // mas não conta como Ritmista ativo pra ela -- excluído daqui.
        const ativos = todosRitmistas.filter(r => r.status === 'aprovado' && !r.nao_desfila).length;
        const pendentes = todosRitmistas.filter(r => r.status === 'pendente').length;
        document.getElementById('totalAtivos').textContent = ativos;
        const elPendentes = document.getElementById('totalPendentes');
        elPendentes.textContent = pendentes;
        elPendentes.classList.toggle('atencao', pendentes > 0);

        // "Retrato completo" dos demais status (28/ago/2026, sessão
        // seguinte) -- ela pediu que Suspensos/Desligados/Rejeitados/Não
        // Desfila também apareçam, com peso menor mas sempre visíveis
        // (não escondidos atrás de clique).
        const susRit = todosRitmistas.filter(r => r.status === 'suspenso').length;
        const desRit = todosRitmistas.filter(r => r.status === 'desligado').length;
        const rejRit = todosRitmistas.filter(r => r.status === 'rejeitado').length;
        const ndRit = todosRitmistas.filter(r => r.status === 'aprovado' && r.nao_desfila).length;
        document.getElementById('totalSuspensos').textContent = susRit;
        document.getElementById('totalDesligados').textContent = desRit;
        document.getElementById('totalRejeitados').textContent = rejRit;
        document.getElementById('totalNaoDesfilaStatus').textContent = ndRit;
        document.getElementById('totalOutrosRitmistas').textContent = '+' + (susRit + desRit + rejRit + ndRit);
    }

    // Card à parte na Visão Geral, com a mesma contagem de Mestres/
    // Diretores/Apoio que já existe na aba Diretoria (listaDiretoriaAtual) --
    // não soma com "Ritmistas ativos" acima, pedido explícito da Márcia,
    // 21/ago/2026 ("mantém Ritmistas ativos como está, card novo separado").
    function atualizarTotalizadoresDiretoria() {
        const card = document.getElementById('totalizadoresDiretoria');
        const gradeOutros = document.getElementById('gradeStatusDiretoria');
        const linhaToggle = document.getElementById('linhaToggleDiretoria');
        const titulo = document.getElementById('vgTituloDiretoria');
        if (!card) return;
        if (!souSuperAdmin && !tenhoCapacidade('ver_acessos')) {
            card.style.display = 'none';
            if (titulo) titulo.style.display = 'none';
            if (linhaToggle) linhaToggle.style.display = 'none';
            if (gradeOutros) gradeOutros.style.display = 'none';
            return;
        }
        const ativos = (listaDiretoriaAtual || []).filter(a => a.status === 'aprovado').length;
        const pendentes = (listaDiretoriaAtual || []).filter(a => a.status === 'pendente').length;
        document.getElementById('totalDiretoriaAtivos').textContent = ativos;
        const elPendentesDiretoria = document.getElementById('totalDiretoriaPendentes');
        elPendentesDiretoria.textContent = pendentes;
        elPendentesDiretoria.classList.toggle('atencao', pendentes > 0);
        card.style.display = 'flex';
        if (titulo) titulo.style.display = 'block';
        if (linhaToggle) linhaToggle.style.display = 'flex';

        // Mesmo "retrato completo" de Ritmistas, aqui pra Diretoria -- sem
        // Não Desfila (exclusivo de Ritmista). Só atualiza os números --
        // não mexe se a grade está aberta ou fechada (isso é controlado só
        // pelo botãozinho +/-, ver toggleGradeOutros()).
        if (gradeOutros) {
            const susDir = (listaDiretoriaAtual || []).filter(a => a.status === 'suspenso').length;
            const desDir = (listaDiretoriaAtual || []).filter(a => a.status === 'desligado').length;
            const rejDir = (listaDiretoriaAtual || []).filter(a => a.status === 'rejeitado').length;
            document.getElementById('totalDiretoriaSuspensos').textContent = susDir;
            document.getElementById('totalDiretoriaDesligados').textContent = desDir;
            document.getElementById('totalDiretoriaRejeitados').textContent = rejDir;
            document.getElementById('totalOutrosDiretoria').textContent = '+' + (susDir + desDir + rejDir);
        }
    }

    // Pílula de "outros status" (28/ago/2026, sessão seguinte) -- nasce
    // sempre fechada a cada carregamento da tela, não guarda a escolha
    // (mesmo comportamento dos outros acordeões da Visão Geral).
    function toggleGradeOutros(idGrade, elPilula) {
        const grade = document.getElementById(idGrade);
        if (!grade || !elPilula) return;
        const abrindo = grade.style.display === 'none';
        grade.style.display = abrindo ? 'grid' : 'none';
        elPilula.querySelector('.grade-pilula-seta').classList.toggle('aberta', abrindo);
    }

    // Card "Convidados" na Visão Geral (31/ago/2026) -- só pra quem tem
    // ver_convidados_especiais. Antes também exigia a bateria ter carteirinha
    // ligada (convidado_tem_carteirinha) -- tirado na unificação (04/set/2026):
    // toda bateria tem Convidados de verdade agora, com ou sem carteirinha.
    function atualizarTotalizadorConvidadosEspeciais() {
        const card = document.getElementById('totalizadoresConvidadosEspeciais');
        const titulo = document.getElementById('vgTituloConvidadosEspeciais');
        if (!card) return;
        if (!souSuperAdmin && !tenhoCapacidade('ver_convidados_especiais')) { card.style.display = 'none'; if (titulo) titulo.style.display = 'none'; return; }
        const lista = convidadosEspeciaisCache || [];
        document.getElementById('totalConvidadosEspeciaisAtivos').textContent = lista.filter(r => r.status === 'aprovado').length;
        document.getElementById('totalConvidadosEspeciaisPendentes').textContent = lista.filter(r => r.status === 'pendente').length;
        card.style.display = 'grid';
        if (titulo) titulo.style.display = 'block';
    }

    // Bolinhas de aviso no menu (Ritmistas/Diretoria/"Mais") + selo no
    // ícone do app na tela inicial (02/set/2026, pedido dela: "quando tem
    // algo pendente" pro Diretor perceber sem precisar entrar em cada
    // lista pra descobrir). As 3 funções de contagem abaixo respeitam a
    // mesma capacidade/gate já usado nos cards da Visão Geral -- ninguém
    // vê número de uma lista que não teria acesso de entrar.
    function pendentesRitmistasCount() {
        return (souSuperAdmin || tenhoCapacidade('ver_ritmistas')) ? (todosRitmistas || []).filter(r => r.status === 'pendente').length : 0;
    }
    function pendentesDiretoriaCount() {
        return (souSuperAdmin || tenhoCapacidade('ver_acessos')) ? (listaDiretoriaAtual || []).filter(a => a.status === 'pendente').length : 0;
    }
    function pendentesConvidadosEspeciaisCount() {
        if (!(souSuperAdmin || tenhoCapacidade('ver_convidados_especiais'))) return 0;
        return (convidadosEspeciaisCache || []).filter(r => r.status === 'pendente').length;
    }
    function aplicarBadgeIcone(id, n) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = n > 99 ? '99+' : String(n);
        el.style.display = n > 0 ? '' : 'none';
    }
    // Selo no ícone do app na tela inicial (fora do app) -- Badging API,
    // melhor esforço: suporte inconsistente no iPhone (é PWA, não app
    // nativo -- ver CLAUDE.md), sempre funciona no Android. Nunca trava
    // nem avisa erro se o navegador não suportar -- decisão dela,
    // 02/set/2026: "se funcionar é um viva, se não funcionar não é pra
    // se chatear".
    function atualizarBadgeIconeApp(total) {
        try {
            if (total > 0 && 'setAppBadge' in navigator) navigator.setAppBadge(total).catch(() => {});
            else if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
        } catch (e) { /* silencioso de propósito */ }
    }
    function atualizarBadgesNav() {
        const rit = pendentesRitmistasCount();
        const dir = pendentesDiretoriaCount();
        const conv = pendentesConvidadosEspeciaisCount();
        aplicarBadgeIcone('abaBadgeRitmistas', rit);
        aplicarBadgeIcone('abaBadgeDiretoria', dir);
        aplicarBadgeIcone('abaBadgeMais', conv);
        // Se o submenu de "Mais" já estiver aberto (computador), atualiza o
        // número ali também -- só a lista/tela própria de "Mais" no celular
        // não precisa disso (ela já busca o número fresco toda vez que abre).
        const submenu = document.getElementById('abaMaisSubmenu');
        if (submenu && submenu.classList.contains('aberto')) renderizarMaisSubmenu();
        atualizarBadgeIconeApp(rit + dir + conv);
    }

    function bateriaIdContexto() {
        if (souSuperAdmin) return bateriaAtualData ? bateriaAtualData.id : null;
        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        return u ? u.bateria_id : null;
    }

    // Atualização automática de Ritmistas + Diretoria -- pedido dela e do
    // Diretor dela, 25/ago/2026: "toda hora é necessário atualizar a tela
    // pra ver novos ritmistas se cadastrando ou fechando e abrindo o app".
    // Recarrega sozinho a cada 30s (sem precisar apertar nada) enquanto a
    // pessoa estiver dentro de uma bateria -- atualiza as duas listas, os
    // totais e a Visão Geral junto, porque carregarRitmistas()/
    // carregarDiretoria() já cuidam disso. Pausa sozinho enquanto uma ficha
    // está aberta pra edição -- Ritmistas e Diretoria abrem modais
    // DIFERENTES (achado testando ao vivo, 25/ago/2026: #modalCadastroOverlay
    // é o da ficha de Ritmista -- o mais comum -- e #modalAdmin só o da
    // ficha de Diretoria; checar só um dos dois deixava o outro sem pausa
    // nenhuma), então os dois precisam ser checados.
    let ritmistasAutoRefreshInterval = null;
    function iniciarAutoRefreshRitmistas() {
        if (ritmistasAutoRefreshInterval) clearInterval(ritmistasAutoRefreshInterval);
        ritmistasAutoRefreshInterval = setInterval(() => {
            const modalRitmista = document.getElementById('modalCadastroOverlay');
            const modalDiretoria = document.getElementById('modalAdmin');
            const ritmistaAberto = modalRitmista && modalRitmista.classList.contains('aberto');
            const diretoriaAberta = modalDiretoria && modalDiretoria.style.display !== 'none';
            if (!ritmistaAberto && !diretoriaAberta) {
                carregarRitmistas(true);
                diretoriaCarregada = false;
                carregarDiretoria(true);
            }

            // Presença (31/ago/2026) -- se a tela de marcar presença de um
            // evento está aberta, atualiza a lista sozinha também, mesmo
            // padrão/intervalo de Ritmistas/Diretoria acima. Achado real da
            // Márcia testando ao vivo: ela escaneava o QR pela carteirinha
            // (outra sessão) e a tela de gestão não mostrava a mudança até
            // recarregar a página inteira -- o que também jogava ela de
            // volta pra tela anterior, perdendo o evento aberto. Pausa
            // enquanto tem alguma confirmação manual pendente na lista, pra
            // não sumir o "Confirma?/Sim/Cancelar" no meio do toque dela.
            const telaPresenca = document.getElementById('presenca-tela-marcar');
            if (telaPresenca && telaPresenca.style.display === 'block' && presencaEventoAtual && Object.keys(presencaConfirmando).length === 0) {
                carregarPresencaPessoas();
            }
        }, 30000);
    }

    // Colunas da view sem foto_url -- foto de cada pessoa fica guardada como
    // texto base64 gigante (achado 25/ago/2026: 174KB em média, 22MB juntando
    // todo mundo de uma bateria de 128 pessoas) direto na linha, não como link
    // pra um arquivo à parte -- então o navegador NUNCA consegue guardar isso
    // em cache sozinho, tem que baixar de novo inteiro toda vez que a lista
    // recarrega. `leve` (usado pela atualização automática de 30s, que roda
    // sozinha o tempo todo) pula a foto pra não ficar baixando 22MB repetido
    // sem necessidade -- mantém a foto já carregada de quem já estava na
    // tela (não apaga nada visível), só quem aparece pela primeira vez nessa
    // atualização de fundo fica sem foto até a próxima vez que a tela abrir
    // de verdade. Conserto definitivo (fotos pequenas de verdade) fica pra
    // depois, com mais calma -- isso aqui é só a mitigação imediata.
    const COLUNAS_RITMISTAS_SEM_FOTO = 'id,vinculo_id,pessoa_id,created_at,nome,cpf,nascimento,endereco,numero,complemento,bairro,cidade,estado,celular,apelido,email,status,tamanho_camisa,tamanho_fantasia,tamanho_sapato,declaracao_responsavel,motivo_status,motivo_instrumento,membro_desde,perfil,emergencia_nome,emergencia_parentesco,emergencia_celular,bateria_id,tipo_sanguineo,pais,nacionalidade,tamanho_calca,estrangeiro,tipo_documento,numero_documento,cadastro_completo,nivel_acesso,aprovado_por,auth_user_id,consentimento_confirmado,bateria_instrumento_id,instrumento_nome,instrumento_grupo,genero,genero_personalizado,nivel_acesso_id,foto_pos_x,foto_pos_y,capacidades,modo_carteirinha_individual,naipe,repique_bossa,restrito_ao_naipe,nao_desfila,observacoes,qr_token,responsavel_nome,responsavel_cpf,responsavel_celular,eh_admin_bateria';

    function reaproveitarFotosCache(listaNova, listaAntiga) {
        const fotosPorId = {};
        (listaAntiga || []).forEach(p => { if (p.foto_url) fotosPorId[p.id] = p.foto_url; });
        listaNova.forEach(p => { if (fotosPorId[p.id]) p.foto_url = fotosPorId[p.id]; });
        return listaNova;
    }

    // Achado dela, 25/ago/2026: recarregar a página inteira (não só a
    // atualização automática) continuava lenta -- ali sim é a primeira vez
    // de verdade, sem foto nenhuma em cache pra reaproveitar. Em vez de
    // fazer a tela inteira esperar as 22MB, mostra a lista na hora (nome,
    // status, tudo já clicável) sem foto -- cada card já cai no mesmo
    // fallback que sempre existiu pra quem não tem foto (inicial do nome)
    // -- e busca as fotos de verdade logo em seguida, silenciosamente,
    // completando os cards assim que chegam. Zero risco: não mexe em
    // nenhum dado, só na ORDEM de quando cada coisa aparece na tela.
    // (01/set/2026: o disparo dessa dupla leve->completa agora mora direto
    // nos dois lugares que entram na Visão Geral -- entrarContextoEscolaSA e
    // iniciarUsuario -- porque cada um precisa esperar só a passada "leve"
    // antes de tirar o spinner, e um wrapper só com .then() não deixava
    // esperar uma etapa sem esperar a outra também.)

    async function carregarRitmistas(leve = false) {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { todosRitmistas = []; aplicarFiltros(); atualizarTotalizadores(); atualizarBadgesNav(); renderizarVisaoGeral(); renderizarContagemInstrumentos(); renderizarControleMenores(); await Promise.all([carregarResumoEntregaFigurino(), carregarResumoEventosAtivos()]); return; }
        const select = COLUNAS_RITMISTAS_SEM_FOTO; // 06/set/2026: nunca mais '*' -- ver comentário em preencherFotosRitmistasEmSegundoPlano()
        // eh_convidado=eq.false (31/ago/2026): Convidado Especial nunca entra
        // na lista normal de Ritmistas -- tem fila e contagens 100% próprias
        // (ver carregarConvidadosEspeciais). Filtrar aqui, na origem, já
        // resolve totalizadores/Vagas/Aniversariantes/Exportar de graça,
        // porque todos leem de todosRitmistas.
        const res = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?or=(perfil.eq.ritmista,perfil.is.null)&bateria_id=eq.${bateriaId}&eh_convidado=eq.false&select=${select}&order=created_at.desc`, {
            headers: authHeaders
        });
        const novos = await res.json();
        // Rede de segurança real, 27/ago/2026: o banco respondeu com erro
        // 500 nessa consulta (achado dela, via print do Console) e a
        // resposta de erro (um objeto, não uma lista) ficou guardada em
        // todosRitmistas -- a partir daí, TODA renderização quebrava pra
        // sempre (nada nunca corrigia esse valor sozinho). Sem isso, um
        // erro passageiro do banco travava a tela até recarregar a
        // página inteira.
        if (!Array.isArray(novos)) {
            console.error('carregarRitmistas: resposta inesperada do banco (não é uma lista) -- mantendo a lista anterior:', novos);
            return;
        }
        // Achado real, 05/set/2026: a atualização automática de 30s sempre
        // redesenhava a lista inteira mesmo quando NADA tinha mudado --
        // numa bateria com 200+ pessoas isso trava o navegador por um
        // instante (~0,2s no computador, bem mais num celular), e se ela
        // clicasse bem nesse instante o clique parecia não funcionar
        // (precisava clicar de novo). Só pra passada "leve" (a que roda
        // sozinha a cada 30s): compara o retorno bruto do banco com o da
        // última vez -- se for idêntico, nada mudou, então nem vale a pena
        // redesenhar nada. Zero risco: só afeta ESSE pulo específico de
        // trabalho à toa, uma mudança real qualquer sempre muda o texto
        // recebido e continua atualizando a tela normalmente.
        if (leve) {
            const rawAtual = JSON.stringify(novos);
            if (_ultimoRawLeveRitmistas && _ultimoRawLeveRitmistas.bateriaId === bateriaId && _ultimoRawLeveRitmistas.raw === rawAtual) return;
            _ultimoRawLeveRitmistas = { bateriaId, raw: rawAtual };
        }
        todosRitmistas = reaproveitarFotosCache(novos, todosRitmistas);
        aplicarFiltros();
        atualizarTotalizadores();
        atualizarBadgesNav();
        renderizarVisaoGeral();
        renderizarContagemInstrumentos();
        renderizarControleMenores();
        // await (01/set/2026, achado da Márcia: "a tela fica montando em
        // tempo real... dá impressão de sistema amador") -- antes disparava
        // sem esperar, então os cards de Figurino/Presença na Visão Geral
        // sempre apareciam alguns instantes depois do resto da tela.
        await Promise.all([carregarResumoEntregaFigurino(), carregarResumoEventosAtivos()]);
        // Sem await de propósito (06/set/2026) -- a busca principal acima
        // nunca mais traz foto (ver COLUNAS_RITMISTAS_SEM_FOTO), então toda
        // chamada desta função precisa disparar isso pra completar as fotos
        // mais cedo ou mais tarde, não só a carga inicial de login.
        preencherFotosRitmistasEmSegundoPlano();
    }

    // Achado real, 05/set/2026: bateria com 230+ pessoas (Imperatriz) trava
    // o app por vários segundos logo depois do login -- a foto de cada
    // pessoa vem "colada" nos dados (texto base64, ~174KB em média cada,
    // ver COLUNAS_RITMISTAS_SEM_FOTO acima), então buscar todo mundo de uma
    // vez de uma bateria grande baixa dezenas de MB numa única resposta.
    // Isso travava tanto o fim do login (o spinner ficava esperando essa
    // busca terminar) quanto os cliques em botões (o navegador fica ocupado
    // processando aquele tanto de dado de uma vez). Corrigido em duas
    // frentes: (1) essa busca completa não entra mais no Promise.all que o
    // spinner espera -- só a passada "leve" (sem foto) entra ali; (2) em vez
    // de uma megabusca só, as fotos chegam aos pouquinhos (30 por vez),
    // cedendo o navegador entre cada pedaço (setTimeout 0) pra não travar
    // clique nenhum. Só atualiza foto por foto, sem mexer em mais nada.
    async function preencherFotosRitmistasEmSegundoPlano() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) return;
        const LOTE = 30;
        let offset = 0;
        while (true) {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?or=(perfil.eq.ritmista,perfil.is.null)&bateria_id=eq.${bateriaId}&eh_convidado=eq.false&select=id,foto_url&order=created_at.desc&limit=${LOTE}&offset=${offset}`, {
                headers: authHeaders
            });
            const lote = await res.json();
            if (!Array.isArray(lote) || lote.length === 0) break;
            const fotosPorId = {};
            lote.forEach(p => { if (p.foto_url) fotosPorId[p.id] = p.foto_url; });
            let mudou = false;
            todosRitmistas.forEach(p => { if (fotosPorId[p.id] && p.foto_url !== fotosPorId[p.id]) { p.foto_url = fotosPorId[p.id]; mudou = true; } });
            if (mudou) aplicarFiltros();
            if (lote.length < LOTE) break;
            offset += LOTE;
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // Mesmo raciocínio de preencherFotosRitmistasEmSegundoPlano(), só que
    // pra fila de Convidado Especial (06/set/2026 -- criada junto com a
    // correção de nunca mais buscar foto no select principal).
    async function preencherFotosConvidadosEspeciaisEmSegundoPlano() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) return;
        const LOTE = 30;
        let offset = 0;
        while (true) {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&eh_convidado=eq.true&select=id,foto_url&order=perfil.asc,nome.asc&limit=${LOTE}&offset=${offset}`, {
                headers: authHeaders
            });
            const lote = await res.json();
            if (!Array.isArray(lote) || lote.length === 0) break;
            const fotosPorId = {};
            lote.forEach(p => { if (p.foto_url) fotosPorId[p.id] = p.foto_url; });
            let mudou = false;
            convidadosEspeciaisCache.forEach(p => { if (fotosPorId[p.id] && p.foto_url !== fotosPorId[p.id]) { p.foto_url = fotosPorId[p.id]; mudou = true; } });
            if (mudou) aplicarFiltrosConvidadosEspeciais();
            if (lote.length < LOTE) break;
            offset += LOTE;
            await new Promise(r => setTimeout(r, 0));
        }
    }

    function toggleStatusSelect() {
        const dd = document.getElementById('statusSelectDropdown');
        const arrow = document.getElementById('statusSelectArrow');
        const aberto = dd.style.display !== 'none';
        dd.style.display = aberto ? 'none' : 'block';
        arrow.textContent = aberto ? '▼' : '▲';
    }

    function toggleMarcarTudoStatus() {
        const marcados = document.querySelectorAll('#statusSelectDropdown input[type=checkbox]:checked').length;
        const novoEstado = marcados === 0;
        document.querySelectorAll('#statusSelectDropdown input[type=checkbox]').forEach(c => c.checked = novoEstado);
        onChangeStatus();
    }

    function onChangeStatus() {
        const checks = document.querySelectorAll('#statusSelectDropdown input[type=checkbox]:checked');
        filtroStatusSelecionados = Array.from(checks).map(c => c.value);
        const total = document.querySelectorAll('#statusSelectDropdown input[type=checkbox]').length;
        const labels = LABELS_STATUS_FILTRO;
        const label = document.getElementById('statusSelectLabel');
        if (filtroStatusSelecionados.length === total) {
            label.textContent = 'Todos os status';
        } else if (filtroStatusSelecionados.length === 0) {
            label.textContent = 'Nenhum status';
        } else {
            label.textContent = filtroStatusSelecionados.map(v => labels[v]).join(', ');
        }
        document.getElementById('statusSelectTrigger').classList.toggle('ativo', filtroStatusSelecionados.length > 0 && filtroStatusSelecionados.length < total);
        const marcarTudoEl = document.getElementById('statusMarcarTudoLink');
        if (marcarTudoEl) marcarTudoEl.textContent = filtroStatusSelecionados.length === 0 ? 'Marcar todos' : 'Limpar';
    }

    // 27/ago/2026: ela apontou que o filtro estava aplicando sozinho a cada
    // clique na caixinha, mesmo com o botão "Aplicar" do lado -- os dois
    // caminhos chamavam a mesma função. Agora onChange* só atualiza o
    // estado/rótulo (visual); só o clique em "Aplicar" filtra de verdade
    // E fecha o dropdown -- nunca os dois ao mesmo tempo por engano.
    function fecharDropdown(ddId, arrowId) {
        const dd = document.getElementById(ddId);
        const arrow = document.getElementById(arrowId);
        if (dd) dd.style.display = 'none';
        if (arrow) arrow.textContent = '▼';
    }

    function aplicarFiltroStatus() {
        onChangeStatus();
        aplicarFiltros();
        fecharDropdown('statusSelectDropdown', 'statusSelectArrow');
    }

    function aplicarFiltroInstrumento() {
        onCheckInstrumento();
        aplicarFiltros();
        fecharDropdown('multiSelectDropdown', 'multiSelectArrow');
    }

    function aplicarFiltroCargo() {
        onChangeCargo();
        aplicarFiltrosDiretoria();
        fecharDropdown('cargoSelectDropdown', 'cargoSelectArrow');
    }

    function aplicarFiltroStatusDiretoria() {
        onChangeStatusDiretoria();
        aplicarFiltrosDiretoria();
        fecharDropdown('statusDiretoriaSelectDropdown', 'statusDiretoriaSelectArrow');
    }

    // "Não Desfila" (28/ago/2026): pra agrupamento/ordenação de seção, conta
    // como grupo próprio, nunca junto de "Ativos" -- mesmo os dois sendo
    // status='aprovado' por baixo (achado dela, print real: João das Couves
    // aparecendo dentro da seção "ATIVOS" com selo "Não Desfila" ao lado).
    function grupoStatusEfetivo(r) {
        return (r.status === 'aprovado' && r.nao_desfila) ? 'nao_desfila' : (r.status || 'pendente');
    }

    function aplicarFiltros() {
        // Estilo Excel, 20/ago/2026: cada checkbox controla exatamente o
        // que aparece -- 0 marcado num grupo = ninguém passa nesse grupo
        // (.some()/.includes() em array vazio já retornam false sozinhos,
        // sem precisar de caso especial). Ritmista sem instrumento
        // cadastrado (raro, dado antigo de antes do instrumento virar
        // obrigatório) nunca é escondido pelo filtro de instrumento --
        // não tem checkbox pra ele, então não faria sentido sumir.
        let lista = todosRitmistas.filter(r => {
            const idade = calcularIdade(r.nascimento);
            // "aprovado" (Ativos) e "nao_desfila" (Não Desfila) são
            // mutuamente exclusivos na lista, mesmo os dois sendo
            // status='aprovado' por baixo -- achado dela, 28/ago/2026:
            // marcar só "Ativos" não pode trazer quem está marcado "Não
            // Desfila" junto (e vice-versa, marcar só "Não Desfila" não
            // deveria trazer quem desfila normal).
            const statusOk = filtroStatusSelecionados.some(f => f === 'menor' ? (idade !== null && idade < 18) : f === 'repique_bossa' ? !!r.repique_bossa : f === 'nao_desfila' ? !!r.nao_desfila : f === 'aprovado' ? (r.status === 'aprovado' && !r.nao_desfila) : r.status === f);
            const instrumentoOk = !r.bateria_instrumento_id || filtroInstrumentosSelecionados.includes(r.bateria_instrumento_id);
            return statusOk && instrumentoOk;
        });

        const busca = semAcento(document.getElementById('campoBusca')?.value || '');
        if (busca) {
            const buscaCpf = busca.replace(/\D/g,'');
            lista = lista.filter(r =>
                semAcento(r.nome).includes(busca) ||
                semAcento(r.apelido).includes(busca) ||
                (buscaCpf.length > 0 && (r.cpf || '').replace(/\D/g,'').includes(buscaCpf))
            );
        }

        const ordemStatus = { pendente: 0, aprovado: 1, nao_desfila: 2, suspenso: 3, rejeitado: 4, desligado: 5 };
        lista.sort((a, b) => {
            const sa = ordemStatus[grupoStatusEfetivo(a)] ?? 6;
            const sb = ordemStatus[grupoStatusEfetivo(b)] ?? 6;
            if (sa !== sb) return sa - sb;
            return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });

        listaFiltradaAtual = lista;
        renderizar(lista);
    }

    function renderizar(lista) {
        const container = document.getElementById('listaRitmistas');
        const contadorEl = document.getElementById('contador');
        if (contadorEl) contadorEl.textContent = `${lista.length} ritmista(s) encontrado(s)`;

        if (lista.length === 0) {
            container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">👤</div>Nenhum ritmista encontrado.</div>';
            return;
        }

        const svgCheck  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2d7a4f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        const svgX      = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        const svgPause  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#d4720a"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
        const svgSlash  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9a1f1f" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
        const svgClock  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a6800" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
        const svgTriang = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#5b21b6"><path d="M12 2L1 21h22L12 2z"/><rect x="11" y="9" width="2" height="6" rx="1" fill="white"/><rect x="11" y="17" width="2" height="2" rx="1" fill="white"/></svg>';

        const cardHTML = r => {
            const idade = calcularIdade(r.nascimento);
            const menor = idade !== null && idade < 18;
            const status = r.status || 'pendente';

            const nascDate = r.nascimento ? new Date(r.nascimento + 'T00:00:00') : null;
            const aniversarioMes = nascDate && (nascDate.getMonth() + 1) === (new Date().getMonth() + 1);

            // "Não Desfila" (28/ago/2026): status técnico continua aprovado,
            // mas o selo mostra isso no lugar de "Ativo" -- exceção
            // deliberada à regra de selos somando (ver CLAUDE.md).
            const badgeStatus = (status === 'aprovado' && r.nao_desfila)
                ? `<span class="badge badge-nao-desfila">Não Desfila</span>`
                : {
                    pendente:  `<span class="badge badge-pendente">Pendente</span>`,
                    aprovado:  `<span class="badge badge-aprovado">Ativo</span>`,
                    suspenso:  `<span class="badge badge-suspenso">Suspenso</span>`,
                    desligado: `<span class="badge badge-desligado">Desligado</span>`,
                    rejeitado: `<span class="badge badge-rejeitado">Rejeitado</span>`,
                }[status] || '';

            // Botões (quando existem) vêm ANTES do badge -- badge + seta
            // ficam sempre por último, coladas na borda direita do card,
            // em qualquer status. Antes, o Pendente (badge + 2 botões)
            // deixava o badge mais "pra dentro" que os outros status (só
            // badge + seta) -- achado da Márcia, 20/ago/2026: "todos os
            // status ficam na ponta, com exceção do pendente".
            const acoesExtras = (status === 'pendente' && tenhoCapacidade('aprovar_ritmistas'))
                ? `<button class="btn-card-acao btn-card-ativar" onclick="event.stopPropagation();atualizarStatus(${r.id},'aprovado')">Ativar</button>
                   <button class="btn-card-acao btn-card-rejeitar" onclick="event.stopPropagation();atualizarStatus(${r.id},'rejeitado')">Rejeitar</button>`
                : '';
            const direita = `${acoesExtras}${badgeStatus}<span class="card-chevron">›</span>`;

            const fotoHtml = r.foto_url
                ? `<img src="${r.foto_url}" style="object-position:${r.foto_pos_x ?? 50}% ${r.foto_pos_y ?? 50}%;">`
                : (r.nome || '?')[0].toUpperCase();

            return `
            <div class="card-ritmista ${status}" onclick="abrirCadastro(${r.id})">
                <div class="card-foto">${fotoHtml}</div>
                <div class="card-esquerda">
                    <div class="card-linha1">
                        <span class="card-nome">${r.nome}</span>
                        ${r.apelido ? `<span class="card-apelido-inline">${r.apelido}</span>` : ''}
                        ${r.nacionalidade && r.nacionalidade !== 'Brasileira' ? `<span title="${r.nacionalidade}" style="font-size:14px;flex-shrink:0;">🌍</span>` : ''}
                        ${aniversarioMes ? '<span title="Aniversário este mês" style="flex-shrink:0;">🎂</span>' : ''}
                    </div>
                    <div class="card-linha2">
                        <span class="pill-instrumento">🥁 ${r.instrumento_nome || '—'}</span>
                        ${r.repique_bossa ? `<span class="badge badge-repique-bossa">Repique de Bossa</span>` : ''}
                        ${menor ? `<span class="badge badge-menor">Menor · ${idade}a</span>` : ''}
                    </div>
                </div>
                <div class="card-direita">${direita}</div>
            </div>`;
        };

        // Agrupado por status, mesmo padrão de seção usado em Diretoria
        // (Mestres/Diretores) -- pedido da Márcia, 18/ago/2026. `lista` já
        // chega ordenada por status (aplicarFiltros), então basta juntar os
        // consecutivos do mesmo grupo.
        const tituloStatus = { pendente: 'Pendentes', aprovado: 'Ativos', nao_desfila: 'Não Desfila', suspenso: 'Suspensos', rejeitado: 'Rejeitados', desligado: 'Desligados' };
        // Contador ao lado do título de cada grupo -- sempre reflete a
        // lista já filtrada (com filtro ativo ou não), pedido dela,
        // 27/ago/2026. Grupo é o efetivo (grupoStatusEfetivo), não o status
        // literal -- "Não Desfila" nunca conta como "Ativos" aqui.
        const contagemPorStatus = {};
        lista.forEach(r => { const s = grupoStatusEfetivo(r); contagemPorStatus[s] = (contagemPorStatus[s] || 0) + 1; });
        let html = '';
        let statusAnterior = null;
        lista.forEach(r => {
            const status = grupoStatusEfetivo(r);
            if (status !== statusAnterior) {
                html += `<div class="secao-titulo" style="display:flex;justify-content:space-between;align-items:center;"><span>${tituloStatus[status] || status}</span><span style="color:#D4AF37;font-weight:800;font-size:14px;letter-spacing:normal;">${contagemPorStatus[status]}</span></div>`;
                statusAnterior = status;
            }
            html += cardHTML(r);
        });
        container.innerHTML = html;
    }

    // tipoAprovacao (03/set/2026) só importa quando status==='aprovado' --
    // distingue 1a aprovação ('aprovado', padrão) de volta de suspenso/
    // desligado ('reativado'), mesmo status no banco mas e-mails diferentes
    // (ver notificarAprovacao). Quem chama com 'Reativar' na tela precisa
    // mandar explícito.
    async function atualizarStatus(id, status, motivo = null, recarregar = () => carregarRitmistas(true), tipoAprovacao = 'aprovado') {
        const body = { status };
        if (motivo !== null) body.motivo_status = motivo;
        if (status === 'aprovado') body.motivo_status = null;
        await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify(body)
        });
        if (status === 'aprovado') notificarAprovacao(id, tipoAprovacao);
        else if (status === 'rejeitado') notificarAprovacao(id, 'rejeitado');
        await recarregar();
    }

    // E-mail de "seu cadastro foi aprovado/reativado/rejeitado" -- best-effort,
    // nunca trava nem avisa erro pra quem está mexendo no status (a mudança em
    // si já aconteceu no PATCH acima; o e-mail é só um extra). Rejeitado e
    // Reativado (03/set/2026, pedido dela) reaproveitam a mesma Edge Function
    // já usada pra Aprovado -- só o "tipo" muda o texto/assunto enviado.
    // Suspenso/Desligado de propósito NÃO mandam e-mail (ver
    // docs/tumtu-historico-sessoes.md, sessão de 02/set, pro raciocínio).
    function notificarAprovacao(vinculoId, tipo = 'aprovado') {
        fetch(`${SUPABASE_URL}/functions/v1/notificar-aprovacao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ vinculo_id: vinculoId, tipo })
        })
            .then(r => r.json()).then(r => { if (!r.ok) console.warn('notificar-aprovacao:', r.error || r.aviso); })
            .catch(err => console.error('notificar-aprovacao falhou:', err));
    }

    // Declaração do Responsável / Desfile / Observações (28/ago/2026) --
    // todas viraram campo padrão da ficha (Editar → Salvar/Cancelar junto
    // com o resto), não mais botão de clique instantâneo. Clicar num desses
    // no meio de uma edição resetava a ficha inteira pro modo de
    // visualização, "sumindo" com o Salvar -- achado real dela. Ver
    // ficha-perfil.js (FP_CAMPO_TABELA/fpCamposEditaveis/fpAtivarEdicao/
    // fpSalvar) e ficha-perfil.partial.html. Visibilidade (ver_X) e
    // exclusividade da Diretoria (Ritmista nunca vê, mesmo autoedição)
    // também ficam lá, dentro de fpIniciar.

    // EXPORTAR EXCEL
    // Medidas viraram abertas (23/ago/2026) -- os campos exportáveis de
    // Medidas não são mais 4 fixos no código, são carregados de
    // medida_tipos toda vez que o modal abre (carregarGruposMedidaExport).
    // Os dois objetos abaixo são mutáveis de propósito (campos: []), pra
    // CAMPOS_EXPORTAVEIS/CAMPOS_EXPORTAVEIS_DIRETORIA (const, mas com
    // referência pro mesmo objeto) refletirem a lista atual sem precisar
    // reconstruir os arrays inteiros.
    const grupoMedidasExportRitmistas = { grupo: 'Medidas', campos: [] };
    const grupoMedidasExportDiretoria = { grupo: 'Medidas', campos: [] };
    async function carregarGruposMedidaExport() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/medida_tipos?ativo=eq.true&order=ordem`, { headers: authHeaders });
        const tipos = res.ok ? await res.json() : [];
        const campos = tipos.map(t => ({ chave: `medida_${t.id}`, label: `Tamanho: ${t.nome}` }));
        grupoMedidasExportRitmistas.campos = campos;
        grupoMedidasExportDiretoria.campos = campos;
    }
    // Valores de vinculos_medidas pra um lote de vínculos, indexados por
    // vinculo_id -> tipo_id -> valor -- usado só na hora de montar a
    // planilha (linhasExportacao), não fica em cache entre exportações.
    async function carregarValoresMedidaExport(vinculoIds) {
        const mapa = {};
        if (!vinculoIds || vinculoIds.length === 0) return mapa;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/vinculos_medidas?vinculo_id=in.(${vinculoIds.join(',')})`, { headers: authHeaders });
        const linhas = res.ok ? await res.json() : [];
        linhas.forEach(l => {
            if (!mapa[l.vinculo_id]) mapa[l.vinculo_id] = {};
            mapa[l.vinculo_id][l.tipo_id] = l.valor;
        });
        return mapa;
    }
    const CAMPOS_EXPORTAVEIS = [
        { grupo: 'Dados pessoais', campos: [
            { chave: 'nome', label: 'Nome' },
            { chave: 'apelido', label: 'Apelido' },
            { chave: 'cpf', label: 'CPF' },
            { chave: 'nascimento', label: 'Data de nascimento' },
            { chave: 'celular', label: 'Celular' },
            { chave: 'email', label: 'E-mail' },
            { chave: 'instrumento_nome', label: 'Instrumento' },
            { chave: 'membro_desde', label: 'Membro desde' },
            { chave: 'status', label: 'Status' },
        ]},
        { grupo: 'Contato de emergência', campos: [
            { chave: 'emergencia_nome', label: 'Nome do contato de emergência' },
            { chave: 'emergencia_parentesco', label: 'Parentesco do contato' },
            { chave: 'emergencia_celular', label: 'Celular do contato' },
        ]},
        { grupo: 'Endereço', campos: [
            { chave: 'endereco', label: 'Endereço' },
            { chave: 'numero', label: 'Número' },
            { chave: 'complemento', label: 'Complemento' },
            { chave: 'bairro', label: 'Bairro' },
            { chave: 'cidade', label: 'Cidade' },
            { chave: 'estado', label: 'Estado' },
        ]},
        grupoMedidasExportRitmistas,
    ];
    const LABELS_STATUS_EXPORT = { pendente: 'Pendente', aprovado: 'Ativo', suspenso: 'Suspenso', rejeitado: 'Rejeitado', desligado: 'Desligado' };
    // Mesmos rótulos do filtro de status da lista (era só um objeto solto
    // dentro de onChangeStatus()) -- reaproveitado agora também no filtro
    // "Quem exportar" do modal de Excel, pra não duplicar a lista de novo.
    const LABELS_STATUS_FILTRO = { pendente: 'Pendentes', aprovado: 'Ativos', suspenso: 'Suspensos', desligado: 'Desligados', rejeitado: 'Rejeitados', menor: 'Menores', repique_bossa: 'Repique de Bossa', nao_desfila: 'Não Desfila' };
    // Igualado ao de Ritmistas, 22/ago/2026 (achado da Márcia: os dois
    // relatórios precisam ser o mesmo formato -- só troca Instrumento por
    // Cargo). Antes só tinha Nome/Apelido/CPF/Cargo/Status, uma versão
    // antiga nunca atualizada quando o export de Ritmistas ganhou o resto
    // dos campos em 18/ago/2026 -- confirmado que Diretoria (Mestre/
    // Diretor/Apoio) também preenche todos esses dados na própria ficha.
    const CAMPOS_EXPORTAVEIS_DIRETORIA = [
        { grupo: 'Dados pessoais', campos: [
            { chave: 'nome', label: 'Nome' },
            { chave: 'apelido', label: 'Apelido' },
            { chave: 'cpf', label: 'CPF' },
            { chave: 'nascimento', label: 'Data de nascimento' },
            { chave: 'celular', label: 'Celular' },
            { chave: 'email', label: 'E-mail' },
            { chave: 'perfil', label: 'Cargo' },
            { chave: 'membro_desde', label: 'Membro desde' },
            { chave: 'status', label: 'Status' },
        ]},
        { grupo: 'Contato de emergência', campos: [
            { chave: 'emergencia_nome', label: 'Nome do contato de emergência' },
            { chave: 'emergencia_parentesco', label: 'Parentesco do contato' },
            { chave: 'emergencia_celular', label: 'Celular do contato' },
        ]},
        { grupo: 'Endereço', campos: [
            { chave: 'endereco', label: 'Endereço' },
            { chave: 'numero', label: 'Número' },
            { chave: 'complemento', label: 'Complemento' },
            { chave: 'bairro', label: 'Bairro' },
            { chave: 'cidade', label: 'Cidade' },
            { chave: 'estado', label: 'Estado' },
        ]},
        grupoMedidasExportDiretoria,
    ];
    const LABELS_PERFIL_EXPORT = { mestre: 'Mestre de Bateria', diretor: 'Diretor de Bateria', apoio: 'Diretor (Apoio)' };
    // Convidado Especial (31/ago/2026) mistura os 3 perfis numa fila só,
    // por isso tem o próprio mapa de rótulos (com Ritmista, que a
    // Diretoria normal nunca tem) -- ver labelsPerfilExportAtual().
    const LABELS_PERFIL_EXPORT_CONVIDADO_ESPECIAL = { ritmista: 'Ritmista', diretor: 'Diretor de Bateria', apoio: 'Diretor (Apoio)' };
    function labelsPerfilExportAtual() {
        return tipoExportacaoAtual === 'convidado_especial' ? LABELS_PERFIL_EXPORT_CONVIDADO_ESPECIAL : LABELS_PERFIL_EXPORT;
    }
    let tipoExportacaoAtual = 'ritmistas';
    let sheetJSCarregado = false;
    function carregarSheetJS() {
        return new Promise((resolve, reject) => {
            if (sheetJSCarregado || window.XLSX) { sheetJSCarregado = true; resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            script.onload = () => { sheetJSCarregado = true; resolve(); };
            script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de exportação.'));
            document.head.appendChild(script);
        });
    }
    // Checkbox de status/instrumento(ou cargo) pra dentro do modal (não usa
    // mais o filtro da lista lá fora, que era o único jeito de restringir o
    // export e ficava escondido demais -- achado da Márcia, 18/ago/2026).
    // Nasce marcado igual ao que já estava filtrado na lista (ponto de
    // partida familiar); se a lista não tinha filtro nenhum (= "todos"),
    // nasce tudo marcado aqui também, nunca vazio.
    // Igualado pra Diretoria em 22/ago/2026: reaproveita a mesma grade de
    // checkbox (a classe .export-instrumento-check por baixo continua com
    // esse nome só pra não duplicar toda a mecânica -- o rótulo visível já
    // vira "Cargo" pra quem usa Diretoria, ver exportSegundoFiltroLabel).
    function popularFiltrosExportacao() {
        const ehRitmistas = tipoExportacaoAtual === 'ritmistas';
        const ehConvidadoEspecial = tipoExportacaoAtual === 'convidado_especial';
        const statusesReais = ['aprovado', 'pendente', 'suspenso', 'rejeitado', 'desligado'];
        // Convidado Especial não tem filtro de lista lá fora pra herdar (a
        // fila é sempre mostrada inteira) -- nasce sempre com tudo marcado.
        const statusJaFiltrado = ehRitmistas ? filtroStatusSelecionados : ehConvidadoEspecial ? [] : filtroStatusDiretoriaSelecionados;
        const statusPre = statusJaFiltrado.length > 0 ? statusJaFiltrado : statusesReais;
        document.getElementById('exportStatusChecks').innerHTML = statusesReais.map(s => `
            <label class="exp-campo-linha">
                <input type="checkbox" class="export-status-check" value="${s}" ${statusPre.includes(s) ? 'checked' : ''} onchange="atualizarResumoExport()">
                ${LABELS_STATUS_FILTRO[s]}
            </label>`).join('');

        document.getElementById('exportSegundoFiltroLabel').textContent = ehRitmistas ? 'Instrumento' : 'Cargo';
        let opts, pre;
        if (ehRitmistas) {
            const instrumentos = instrumentosAtivosDaBateria();
            // "Sem instrumento" tirado da lista, 18/ago/2026 -- instrumento é
            // obrigatório pra todo ritmista, achado da Márcia não é um estado
            // real (só sobrava de dado de teste antigo).
            opts = instrumentos.map(i => ({ valor: String(i.id), rotulo: i.nome }));
            pre = filtroInstrumentosSelecionados.length > 0 ? filtroInstrumentosSelecionados.map(String) : opts.map(o => o.valor);
        } else {
            opts = Object.entries(labelsPerfilExportAtual()).map(([valor, rotulo]) => ({ valor, rotulo }));
            pre = ehConvidadoEspecial ? opts.map(o => o.valor) : (filtroCargoDiretoriaSelecionados.length > 0 ? filtroCargoDiretoriaSelecionados : opts.map(o => o.valor));
        }
        document.getElementById('exportInstrumentoChecks').innerHTML = opts.map(o => `
            <label class="exp-campo-linha">
                <input type="checkbox" class="export-instrumento-check" value="${o.valor}" ${pre.includes(o.valor) ? 'checked' : ''} onchange="atualizarResumoExport()">
                ${o.rotulo}
            </label>`).join('');
    }

    // Recalcula a lista a exportar a partir dos checkboxes do próprio modal
    // (status + instrumento/cargo), não mais da lista de fora. Igualado pra
    // Diretoria em 22/ago/2026 (antes só funcionava pra Ritmistas).
    function listaFiltradaExportacao() {
        const ehRitmistas = tipoExportacaoAtual === 'ritmistas';
        const statusMarcados = Array.from(document.querySelectorAll('.export-status-check:checked')).map(c => c.value);
        const segundoMarcados = Array.from(document.querySelectorAll('.export-instrumento-check:checked')).map(c => c.value);
        let lista = ehRitmistas ? todosRitmistas : tipoExportacaoAtual === 'convidado_especial' ? convidadosEspeciaisCache : listaDiretoriaAtual;
        if (statusMarcados.length > 0) lista = lista.filter(r => statusMarcados.includes(r.status || 'pendente'));
        if (segundoMarcados.length > 0) {
            lista = ehRitmistas
                ? lista.filter(r => segundoMarcados.includes(String(r.bateria_instrumento_id)))
                : lista.filter(r => segundoMarcados.includes(r.perfil));
        }
        return lista;
    }

    function atualizarResumoExport() {
        const ehRitmistas = tipoExportacaoAtual === 'ritmistas';
        const ehConvidadoEspecial = tipoExportacaoAtual === 'convidado_especial';
        const total = listaFiltradaExportacao().length;
        const singular = ehRitmistas ? 'ritmista' : ehConvidadoEspecial ? 'convidado' : 'pessoa da diretoria';
        const plural = ehRitmistas ? 'ritmistas' : ehConvidadoEspecial ? 'convidados' : 'pessoas da diretoria';
        document.getElementById('exportResumoLista').innerHTML = total === 1
            ? `<strong>1 ${singular}</strong> será exportado(a) com os filtros marcados acima.`
            : `<strong>${total} ${plural}</strong> serão exportados com os filtros marcados acima.`;
    }

    // Igualado ao formato de Ritmistas, 22/ago/2026 -- Diretoria ganha os
    // mesmos filtros ("Quem exportar") e a mesma opção de separar por
    // grupo (por cargo, no lugar de por instrumento).
    async function abrirModalExportar(tipo) {
        tipoExportacaoAtual = tipo;
        const ehRitmistas = tipo === 'ritmistas';
        const campos = ehRitmistas ? CAMPOS_EXPORTAVEIS : CAMPOS_EXPORTAVEIS_DIRETORIA;

        document.getElementById('exportTituloCustom').value = '';
        await carregarGruposMedidaExport();

        document.getElementById('exportFiltrosContainer').style.display = 'block';
        popularFiltrosExportacao();
        atualizarResumoExport();

        document.getElementById('exportFormatoContainer').style.display = 'block';
        document.querySelector('input[name="exportFormato"][value="unico"]').checked = true;
        document.getElementById('exportFormatoPorGrupoValor').value = ehRitmistas ? 'por-instrumento' : 'por-cargo';
        document.getElementById('exportFormatoPorGrupoTitulo').textContent = ehRitmistas ? 'Separado por instrumento' : 'Separado por cargo';
        document.getElementById('exportFormatoPorGrupoDesc').textContent = ehRitmistas ? 'Uma aba pra cada instrumento, no mesmo arquivo' : 'Uma aba pra cada cargo, no mesmo arquivo';

        const container = document.getElementById('exportCamposContainer');
        container.innerHTML = campos.map(grupo => `
            <div class="exp-campos-grupo-titulo">${grupo.grupo}</div>
            ${grupo.campos.map(c => `
                <label class="exp-campo-linha">
                    <input type="checkbox" class="export-campo-check" value="${c.chave}">
                    ${c.label}
                </label>
            `).join('')}
        `).join('');

        document.getElementById('modalExportarExcel').classList.add('aberto');
    }
    function exportSelecionarTodos(marcar) {
        document.querySelectorAll('.export-campo-check').forEach(c => c.checked = marcar);
    }
    // Pedido da Márcia, 18/ago/2026: com muitos instrumentos cadastrados,
    // marcar/desmarcar um por um pra filtrar só 1 ou 2 é trabalhoso -- mesmo
    // atalho "Marcar todos/Limpar" já usado em "Quais dados incluir".
    function exportSelecionarGrupo(tipo, marcar) {
        const seletor = tipo === 'status' ? '.export-status-check' : '.export-instrumento-check';
        document.querySelectorAll(seletor).forEach(c => c.checked = marcar);
        atualizarResumoExport();
    }
    // Nome de aba do Excel tem regra própria: máximo 31 caracteres, sem
    // \ / ? * [ ]. "Sem instrumento" cobre ritmista sem instrumento
    // atribuído -- nunca deixa a pessoa de fora da planilha.
    function nomeAbaExcel(texto) {
        const limpo = (texto || 'Sem instrumento').replace(/[\\/?*[\]]/g, '-');
        return limpo.slice(0, 31);
    }

    function linhasExportacao(lista, todosCampos, marcados, valoresMedidaPorVinculo) {
        return lista.map(r => {
            const linha = {};
            marcados.forEach(chave => {
                const campo = todosCampos.find(c => c.chave === chave);
                let valor;
                if (chave.startsWith('medida_')) {
                    // "Não Desfila" (28/ago/2026): sai só do pedido de
                    // fantasia -- continua aparecendo normal em Camisa/
                    // Calça/Sapato/qualquer outra medida.
                    if (r.nao_desfila && campo.label.toLowerCase().includes('fantasia')) {
                        valor = '';
                    } else {
                        const tipoId = Number(chave.slice('medida_'.length));
                        const doVinculo = valoresMedidaPorVinculo[r.id];
                        valor = (doVinculo && doVinculo[tipoId]) || '';
                    }
                } else {
                    valor = r[chave] ?? '';
                    if (chave === 'status') valor = LABELS_STATUS_EXPORT[valor] || valor;
                    if (chave === 'perfil') valor = labelsPerfilExportAtual()[valor] || valor;
                }
                linha[campo.label] = valor;
            });
            return linha;
        });
    }

    // Linha de título dentro da própria planilha (A1, em negrito) -- pedido
    // da Márcia, 18/ago/2026: "relatório de ritmistas: agogô?" -- pra ficar
    // claro o que é aquela aba mesmo se for impressa ou reaproveitada fora
    // do Excel, sem depender só do nome pequeno da aba lá embaixo. Reflete
    // também o filtro de status já aplicado na tela (ex: "Ativos"), porque
    // o pedido real do Diretor sempre envolve os dois juntos (instrumento +
    // status) -- reaproveita o mesmo texto que já aparece no filtro da
    // tela, sem duplicar a lista de rótulos.
    function planilhaComTitulo(linhas, titulo) {
        const planilha = XLSX.utils.aoa_to_sheet([[titulo]]);
        planilha['A1'].s = { font: { bold: true, sz: 13 } };
        XLSX.utils.sheet_add_json(planilha, linhas, { origin: 'A3' });
        return planilha;
    }

    // Rótulo de status a partir dos checkboxes do próprio modal (não mais
    // do filtro da lista lá fora). Com tudo marcado (as 5 opções = "todos",
    // ponto de partida padrão) não aparece nada no título -- só entra
    // quando é mesmo um recorte, senão o título ficaria enorme listando
    // as 5 opções à toa.
    function statusLabelExportacao() {
        const marcados = Array.from(document.querySelectorAll('.export-status-check:checked')).map(c => c.value);
        if (marcados.length === 0 || marcados.length === 5) return '';
        return marcados.map(s => LABELS_STATUS_FILTRO[s]).join(', ');
    }

    // Igualado pra Diretoria, 22/ago/2026 -- statusLabel e sufixo de grupo
    // (instrumento OU cargo) agora entram no título dos dois tipos.
    function tituloRelatorio(ehRitmistas, sufixoGrupo) {
        // Título livre (campo "Título do relatório") sobrescreve o
        // automático por completo -- ela pediu isso pra relatório que não
        // tem nada a ver com o filtro de status (ex: só endereço). Sufixo de
        // grupo continua entrando mesmo com título livre, só pra diferenciar
        // uma aba da outra quando exportado "separado por instrumento/cargo".
        const custom = document.getElementById('exportTituloCustom').value.trim();
        if (custom) return sufixoGrupo ? `${custom} — ${sufixoGrupo}` : custom;
        let titulo = ehRitmistas ? 'Relatório de Ritmistas' : tipoExportacaoAtual === 'convidado_especial' ? 'Relatório de Convidados' : 'Relatório de Diretoria';
        const statusLabel = statusLabelExportacao();
        if (statusLabel) titulo += ` — ${statusLabel}`;
        if (sufixoGrupo) titulo += ` — ${sufixoGrupo}`;
        return titulo;
    }

    async function confirmarExportarExcel() {
        const ehRitmistas = tipoExportacaoAtual === 'ritmistas';
        const lista = listaFiltradaExportacao();
        const campos = ehRitmistas ? CAMPOS_EXPORTAVEIS : CAMPOS_EXPORTAVEIS_DIRETORIA;
        const nomeAba = ehRitmistas ? 'Ritmistas' : tipoExportacaoAtual === 'convidado_especial' ? 'Convidados' : 'Diretoria';
        const formatoMarcado = document.querySelector('input[name="exportFormato"]:checked').value;
        const porGrupo = formatoMarcado === 'por-instrumento' || formatoMarcado === 'por-cargo';

        const marcados = Array.from(document.querySelectorAll('.export-campo-check:checked')).map(c => c.value);
        if (marcados.length === 0) { mostrarToast('Marque pelo menos um campo para exportar.', 'erro'); return; }
        if (lista.length === 0) { mostrarToast('Não há registros para exportar com os filtros marcados.', 'erro'); return; }

        const todosCampos = campos.flatMap(g => g.campos);
        const marcadosMedida = marcados.some(c => c.startsWith('medida_'));
        const valoresMedidaPorVinculo = marcadosMedida
            ? await carregarValoresMedidaExport(lista.map(r => r.id))
            : {};

        try {
            await carregarSheetJS();
        } catch (e) {
            mostrarToast('Não foi possível exportar agora — verifique sua conexão com a internet e tente de novo.', 'erro');
            return;
        }

        const livro = XLSX.utils.book_new();
        if (porGrupo) {
            // Uma aba por instrumento (Ritmistas) ou por cargo (Diretoria),
            // mesmo arquivo -- pedido real de um Diretor, 18/ago/2026, pra
            // Ritmistas; igualado pra Diretoria em 22/ago/2026.
            const grupos = {};
            lista.forEach(r => {
                const nome = ehRitmistas ? (r.instrumento_nome || 'Sem instrumento') : (labelsPerfilExportAtual()[r.perfil] || r.perfil);
                (grupos[nome] = grupos[nome] || []).push(r);
            });
            const usados = new Set();
            Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(nomeGrupo => {
                let aba = nomeAbaExcel(nomeGrupo);
                let sufixo = 2;
                while (usados.has(aba)) { aba = `${nomeAbaExcel(nomeGrupo).slice(0, 28)} (${sufixo++})`; }
                usados.add(aba);
                const linhas = linhasExportacao(grupos[nomeGrupo], todosCampos, marcados, valoresMedidaPorVinculo);
                const planilha = planilhaComTitulo(linhas, tituloRelatorio(ehRitmistas, nomeGrupo));
                XLSX.utils.book_append_sheet(livro, planilha, aba);
            });
        } else {
            const linhas = linhasExportacao(lista, todosCampos, marcados, valoresMedidaPorVinculo);
            const planilha = planilhaComTitulo(linhas, tituloRelatorio(ehRitmistas, null));
            XLSX.utils.book_append_sheet(livro, planilha, nomeAba);
        }

        const dataHoje = new Date().toISOString().slice(0, 10);
        // Nome do arquivo também segue o título livre, quando preenchido --
        // sanitizado (sem acento, só letras/números/hífen) pra funcionar em
        // qualquer sistema operacional.
        const tituloCustom = document.getElementById('exportTituloCustom').value.trim();
        const removerAcentos = new RegExp('[̀-ͯ]', 'g');
        const nomeArquivoBase = tituloCustom
            ? tituloCustom.normalize('NFD').replace(removerAcentos, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            : tipoExportacaoAtual;
        XLSX.writeFile(livro, `${nomeArquivoBase}-${dataHoje}.xlsx`);
        fecharModal('modalExportarExcel');
    }

    // MODAIS
    let acaoAtualRecarregar = () => carregarRitmistas(true);

    function abrirModalSuspender(id, nome, rotulo = 'Ritmista', recarregar = () => carregarRitmistas(true)) {
        acaoAtualId = id;
        acaoAtualRecarregar = recarregar;
        document.getElementById('modalSuspenderTitulo').textContent = `Suspender ${rotulo}`;
        document.getElementById('modalSuspenderNome').textContent = `${rotulo}: ${nome}`;
        document.getElementById('motivoSuspensao').value = '';
        document.getElementById('modalSuspender').classList.add('aberto');
    }
    function confirmarSuspender() {
        const motivo = document.getElementById('motivoSuspensao').value.trim() || null;
        fecharModal('modalSuspender');
        atualizarStatus(acaoAtualId, 'suspenso', motivo, acaoAtualRecarregar);
    }

    function abrirModalDesligar(id, nome, rotulo = 'Ritmista', recarregar = () => carregarRitmistas(true)) {
        acaoAtualId = id;
        acaoAtualRecarregar = recarregar;
        document.getElementById('modalDesligarTitulo').textContent = `Desligar ${rotulo}`;
        document.getElementById('modalDesligarNome').textContent = `${rotulo}: ${nome}`;
        document.getElementById('motivoDesligamento').value = '';
        document.getElementById('modalDesligar').classList.add('aberto');
    }
    function confirmarDesligar() {
        const motivo = document.getElementById('motivoDesligamento').value.trim() || null;
        fecharModal('modalDesligar');
        atualizarStatus(acaoAtualId, 'desligado', motivo, acaoAtualRecarregar);
    }

    async function fecharModal(id) {
        if (typeof fpPodeDescartar === 'function' && !(await fpPodeDescartar())) return;
        document.getElementById(id).classList.remove('aberto');
    }

    let fichaAtualId = null;

    async function abrirCadastro(id) {
        const r = todosRitmistas.find(x => x.id === id);
        if (!r) return;
        fichaAtualId = id;

        const idade = calcularIdade(r.nascimento);
        const status = r.status || 'pendente';

        const statusBadgeHTML = {
            pendente:  `<span class="badge badge-pendente">Pendente</span>`,
            aprovado:  `<span class="badge badge-aprovado">Ativo</span>`,
            suspenso:  `<span class="badge badge-suspenso">Suspenso</span>`,
            desligado: `<span class="badge badge-desligado">Desligado</span>`,
            rejeitado: `<span class="badge badge-rejeitado">Rejeitado</span>`,
        };
        document.getElementById('fc-status-badge').innerHTML = (status === 'aprovado' && r.nao_desfila)
            ? `<span class="badge badge-nao-desfila">Não Desfila</span>`
            : (statusBadgeHTML[status] || '');

        const meu = JSON.parse(localStorage.getItem('ritmista') || 'null');
        await fpMontar(document.getElementById('fp-container-ritmista'));
        fpIniciar(r, meu ? meu.perfil : null, meu ? meu.pessoa_id : null, { aoSalvar: () => carregarRitmistas() });

        // Declaração do Responsável / Desfile (28/ago/2026): viraram parte
        // estática da ficha compartilhada (ficha-perfil.partial.html),
        // visibilidade e valor inicial resolvidos dentro de fpIniciar (ver
        // ficha-perfil.js) -- #fp-extra-conteudo não é mais usado aqui.
        const extraConteudo = document.getElementById('fp-extra-conteudo');
        if (extraConteudo) extraConteudo.innerHTML = '';

        // Botões de ação de status + Fechar. Injetados em #fp-acoes-extra
        // (hook dentro de #fp-container-ritmista, mesmo padrão já usado em
        // carteirinha.html pro botão Fechar do Meu Perfil) -- não numa barra
        // própria separada como antes. Motivo: duas barras "sticky bottom"
        // competindo no mesmo scroll não funcionam de verdade, só a que vem
        // depois no HTML consegue flutuar -- o botão Editar (que mora dentro
        // de #fp-container-ritmista) sempre perdia essa disputa pro Fechar
        // antigo, ficando "preso" no meio do conteúdo em vez de flutuar
        // (bug relatado pela Márcia, 18/ago/2026). fpAtivarEdicao()/
        // fpCancelarEdicao() já escondem/mostram esse hook sozinhas durante
        // a edição, então também resolve Editar/Salvar/Cancelar sem
        // precisar de nenhum código extra aqui.
        // Reforma de Permissões (27-28/ago/2026): cada botão de ação de
        // status só aparece com a capacidade específica correspondente --
        // nunca aparece habilitado e falha em silêncio (regra da Márcia).
        let btns = '';
        if (status === 'pendente') {
            if (tenhoCapacidade('aprovar_ritmistas'))
                btns += `<button class="btn-ficha btn-ficha-ativar" onclick="fecharModal('modalCadastroOverlay');atualizarStatus(${r.id},'aprovado')">Ativar</button>`;
            if (tenhoCapacidade('rejeitar_ritmistas'))
                btns += `<button class="btn-ficha btn-ficha-rejeitar" onclick="fecharModal('modalCadastroOverlay');atualizarStatus(${r.id},'rejeitado')">Rejeitar</button>`;
        } else if (status === 'aprovado') {
            if (tenhoCapacidade('suspender_ritmistas'))
                btns += `<button class="btn-ficha btn-ficha-suspender" onclick="fecharModal('modalCadastroOverlay');abrirModalSuspender(${r.id},'${r.nome.replace(/'/g,"\\'")}')">Suspender</button>`;
            if (tenhoCapacidade('desligar_ritmistas'))
                btns += `<button class="btn-ficha btn-ficha-desligar" onclick="fecharModal('modalCadastroOverlay');abrirModalDesligar(${r.id},'${r.nome.replace(/'/g,"\\'")}')">Desligar</button>`;
        } else if (status === 'suspenso') {
            if (tenhoCapacidade('reativar_ritmistas'))
                btns += `<button class="btn-ficha btn-ficha-reativar" onclick="fecharModal('modalCadastroOverlay');atualizarStatus(${r.id},'aprovado',null,undefined,'reativado')">Reativar</button>`;
            if (tenhoCapacidade('desligar_ritmistas'))
                btns += `<button class="btn-ficha btn-ficha-desligar" onclick="fecharModal('modalCadastroOverlay');abrirModalDesligar(${r.id},'${r.nome.replace(/'/g,"\\'")}')">Desligar</button>`;
        } else {
            if (tenhoCapacidade('reativar_ritmistas'))
                btns += `<button class="btn-ficha btn-ficha-reativar" onclick="fecharModal('modalCadastroOverlay');atualizarStatus(${r.id},'aprovado',null,undefined,'reativado')">Reativar</button>`;
        }
        btns += `<button class="btn-ficha" onclick="fecharModal('modalCadastroOverlay')">Fechar</button>`;
        document.getElementById('fp-container-ritmista').querySelector('#fp-acoes-extra').innerHTML = btns;

        // "Ver carteirinha" fica fixo no fim do conteúdo (não na barra
        // flutuante) -- pedido da Márcia, 20/ago/2026: no celular, a barra
        // flutuante com status+carteirinha+Fechar juntos ficava apertada.
        // Só aparece pra quem está Ativo -- achado dela, 20/ago/2026:
        // quem ainda não foi aprovado não tem carteirinha nenhuma pra ver.
        document.getElementById('fp-container-ritmista').querySelector('#fp-ver-carteirinha').innerHTML =
            (status === 'aprovado' && tenhoCapacidade('ver_carteirinha_outros'))
                ? `<button class="btn-ficha btn-ficha-carteirinha" onclick="abrirCarteirinha(${r.id})">Ver carteirinha ↗</button>`
                : '';

        // Só edita dados de ritmista ativo/suspenso (regra já existia antes do
        // motor único) -- Super Admin sempre passa direto (03/set/2026,
        // pedido dela: precisa poder editar até pendente/rejeitado/desligado
        // pra corrigir dado de teste ou apoiar suporte, sem essa trava).
        if (status !== 'aprovado' && status !== 'suspenso' && !souSuperAdmin) {
            document.getElementById('fp-container-ritmista').querySelector('#fp-btn-editar').style.display = 'none';
        }

        document.getElementById('modalCadastroOverlay').classList.add('aberto');
    }

    const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    function renderizarVisaoGeral() {
        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1;
        const diaAtual = hoje.getDate();

        const tituloAnivEl = document.getElementById('vg-aniversariantes-titulo');
        if (tituloAnivEl) tituloAnivEl.textContent = `🎂 Aniversariantes do mês · ${MESES_PT[hoje.getMonth()]}`;

        // Aniversariantes do mês inclui a Diretoria inteira (Mestre/Diretor/
        // Apoio) junto com Ritmistas -- pedido da Márcia, 21/ago/2026:
        // "diretoria" pra ela é o módulo inteiro, não só uma parte. Some
        // sozinho pra quem não tem ver_acessos (listaDiretoriaAtual nunca é
        // buscada nesse caso, fica vazia).
        const todasPessoas = todosRitmistas.concat(listaDiretoriaAtual || []);
        const aniv = todasPessoas.filter(r => {
            if (!r.nascimento) return false;
            return new Date(r.nascimento + 'T00:00:00').getMonth() + 1 === mesAtual;
        }).sort((a, b) => {
            const dA = new Date(a.nascimento + 'T00:00:00').getDate();
            const dB = new Date(b.nascimento + 'T00:00:00').getDate();
            return dA - dB;
        });

        const totalAnivEl = document.getElementById('vg-aniversariantes-total');
        if (totalAnivEl) totalAnivEl.innerHTML = `<div class="total-duplo total-duplo--mini"><div class="total-duplo-item"><div class="total-duplo-numero total">${aniv.length}</div><div class="total-duplo-rotulo">Total</div></div></div>`;

        const hojeBadgeEl = document.getElementById('vg-aniversariantes-hoje-badge');
        if (hojeBadgeEl) {
            const temHoje = aniv.some(r => new Date(r.nascimento + 'T00:00:00').getDate() === diaAtual);
            hojeBadgeEl.style.display = temHoje ? '' : 'none';
        }

        const div = document.getElementById('vg-aniversariantes');
        if (aniv.length === 0) {
            div.innerHTML = '<div style="color:#bbb;font-size:13px;padding:8px 0;">Nenhum aniversariante este mês.</div>';
            return;
        }
        div.innerHTML = aniv.map(r => {
            const nasc = new Date(r.nascimento + 'T00:00:00');
            const dia = nasc.getDate();
            const diaFormatado = dia.toString().padStart(2, '0');
            const ehHoje = dia === diaAtual;
            const idade = calcularIdade(r.nascimento);
            // Pedido dela, 24/ago/2026: sempre mostrar o cargo (Ritmista/
            // Mestre/Diretor/Apoio), não só o instrumento -- antes um
            // ritmista sem instrumento aparecia só com "—", sem dizer nem
            // que era ritmista.
            const cargoAniv = r.perfil === 'mestre' ? (r.genero === 'feminino' ? 'Mestra' : 'Mestre')
                : r.perfil === 'diretor' ? (r.genero === 'feminino' ? 'Diretora de Bateria' : 'Diretor de Bateria')
                : r.perfil === 'apoio' ? (r.genero === 'feminino' ? 'Diretora (Apoio)' : 'Diretor (Apoio)') : 'Ritmista';
            const detalhe = (r.perfil === 'ritmista' && r.instrumento_nome) ? `${cargoAniv} · ${r.instrumento_nome}` : cargoAniv;
            // Dia vira o número em vez do 🎂 (26/ago/2026, pedido dela: "não
            // quero bolo no lugar do número, deixa o número") -- e quem faz
            // aniversário hoje ganha um aviso ao lado, sem trocar o número
            // por nada (ela recusou a versão que trocava por bolo).
            return `<div class="vg-aniversariante">
                <span style="font-size:15px;font-weight:800;color:#D4AF37;min-width:20px;text-align:center;">${diaFormatado}</span>
                <div>
                    <div class="vg-aniv-nome">${r.nome}${r.apelido ? ` <span style="color:#D4AF37;font-weight:400;font-style:italic;">${r.apelido}</span>` : ''}${ehHoje ? ' <span style="font-size:12px;font-weight:700;color:var(--cor-terracota);">🎉 Hoje!</span>' : ''}</div>
                    <div class="vg-aniv-detalhe">${idade} anos · ${detalhe}</div>
                </div>
            </div>`;
        }).join('');
    }

    // Quantos ritmistas ATIVOS tocam cada instrumento -- pedido da Márcia,
    // 19/ago/2026, pra ter esse número na Visão Geral sem precisar de mais
    // uma aba/menu só pra isso. Só conta status=aprovado (mesmo critério de
    // "Ritmistas ativos" no topo do painel); ordenado do instrumento com
    // mais gente pro com menos.
    // Lista completa dos instrumentos ativos da bateria -- antes só
    // aparecia quem já tinha gente cadastrada, então um naipe com ZERO
    // ritmistas simplesmente sumia da lista (achado da Márcia, 21/ago/2026:
    // "é importante que eles vejam que tem naipe que ainda não se
    // cadastrou, caso queira chamar atenção da galera"). Agora percorre
    // bateriaInstrumentosCache (todos os instrumentos ativos), não mais só
    // as chaves que aparecem na contagem de ritmistas.
    // Aviso pequeno ao lado da pílula de contagem -- compartilhado entre a
    // Visão Geral e Configurações -> Vagas de Ritmistas (21/ago/2026).
    // "Sem definição de vagas" quando o número nunca foi preenchido (vagas
    // em 0); "Faltam N" quando já tem número mas ainda não bateu; nada
    // quando completou ou excedeu -- a pílula (verde/vermelha) já avisa
    // sozinha nesses dois casos.
    function avisoVagaHtml(l) {
        if (l.semVaga) return `<span class="vg-instrumento-faltam">Sem definição de vagas</span>`;
        if (l.faltam > 0) return `<span class="vg-instrumento-faltam">${l.faltam === 1 ? 'Falta' : 'Faltam'} ${l.faltam}</span>`;
        return '';
    }

    // Total + Faltam lado a lado, mesma fonte grande, cores diferentes
    // (total dourado, faltam terracota -- mesma cor que "Pendentes" já usa)
    // -- pedido dela, 25/ago/2026. mini=true pra caber no cabeçalho fechado
    // dos cards da Visão Geral.
    function totalDuploHtml(total, faltam, mini) {
        // Singular quando falta só 1 -- pedido dela, 27/ago/2026: "Falta 1",
        // nunca "Faltam 1".
        return `<div class="total-duplo${mini ? ' total-duplo--mini' : ''}">
            <div class="total-duplo-item"><div class="total-duplo-numero total">${total}</div><div class="total-duplo-rotulo">Total</div></div>
            <div class="total-duplo-item"><div class="total-duplo-numero faltam">${faltam}</div><div class="total-duplo-rotulo">${faltam === 1 ? 'Falta' : 'Faltam'}</div></div>
        </div>`;
    }

    // Totalizador com detalhamento por grupo (29/ago/2026) -- usado por
    // Entrega de Figurino e Presença. `grupos` é uma lista já filtrada SEM
    // grupos vazios: [{ label, total, feito }], nessa ordem (Ritmistas,
    // Diretoria, Convidados -- Convidados só entra quando existe pelo menos
    // 1, pedido dela: "se não tiver convidados, eles não apareceriam").
    // Com 0 ou 1 grupo, mostra só o total simples (sem detalhamento à toa
    // -- mesma regra de antes pra peça/evento de um lado só). Com 2+
    // grupos, mostra o total geral (hero) + 1 linha por grupo (detalhe).
    // Detalhe por grupo agora é colapsável (29/ago/2026, pedido dela: "penso
    // sempre no celular... tem opção de ser fechado no celular e aberto
    // aqui [computador]?") -- o total geral (219/219) continua sempre à
    // mostra, só o detalhe por grupo (Ritmistas/Diretoria/Convidados) fica
    // atrás de uma setinha. Nasce aberto em tela larga, fechado no celular
    // (mesma régua de 600px já usada nos outros breakpoints do app) -- só
    // na PRIMEIRA vez que aquele totalizador (Figurino ou Presença, cada
    // um com seu próprio estado) é desenhado; depois disso, lembra o que a
    // pessoa escolheu enquanto a tela continuar aberta (recarregamentos
    // automáticos não fecham de volta sozinhos).
    let totalizadorDetalheAberto = {};
    function totalizadorDetalheEstaAberto(idPrefix) {
        // Nasce sempre fechado, em qualquer tamanho de tela (30/ago/2026,
        // pedido dela) -- antes abria sozinho em tela larga (>600px).
        if (!(idPrefix in totalizadorDetalheAberto)) totalizadorDetalheAberto[idPrefix] = false;
        return totalizadorDetalheAberto[idPrefix];
    }
    // Trava a largura do card na largura que ele teria ABERTO (29/ago/2026,
    // pedido dela: "não gosto da opção que quando quer ver mais ele muda de
    // largura... tem que manter a largura de quando ele já é aberto").
    // Sem número mágico chutado -- mede de verdade toda vez que os dados são
    // desenhados (abre por uma fração de segundo se estiver fechado, mede,
    // fecha de novo), então acompanha sozinho se os números ficarem maiores
    // (ex: bateria com 4 dígitos) sem eu precisar adivinhar um valor fixo.
    function travarLarguraTotalizador(cardId, idPrefix) {
        const card = document.getElementById(cardId);
        const wrap = document.getElementById(`totalizador-grupos-${idPrefix}`);
        if (!card || !wrap) return; // sem detalhe (0 ou 1 grupo) -- nada pra travar
        // Só trava a largura do CARTÃO (não mais de colunas de grade -- o
        // hero virou flex simples, sem grid, 30/ago/2026, ver totalGradeHtml
        // -- "Ver por grupo" não faz mais o número pular de coluna). Ainda
        // relevante pro cartão de Figurino (largura por conteúdo, muda se o
        // detalhe por grupo for mais largo que o hero); em Presença é
        // inofensivo, já que o bloco lá é flex:1 (largura fixa pelo pai).
        const estavaFechado = wrap.style.display === 'none';
        card.style.minWidth = '0';
        if (estavaFechado) wrap.style.display = 'block';
        card.style.minWidth = card.getBoundingClientRect().width + 'px';
        if (estavaFechado) wrap.style.display = 'none';
    }
    function toggleTotalizadorDetalhe(idPrefix) {
        const aberto = !totalizadorDetalheEstaAberto(idPrefix);
        totalizadorDetalheAberto[idPrefix] = aberto;
        const wrap = document.getElementById(`totalizador-grupos-${idPrefix}`);
        // 'block', não mais 'contents' -- as linhas (.vg-instrumento-linha)
        // saíram de dentro da grade (30/ago/2026, ver comentário em
        // totalGradeHtml), não precisam mais virar item direto de um grid pai.
        if (wrap) wrap.style.display = aberto ? 'block' : 'none';
        const seta = document.getElementById(`totalizador-toggle-seta-${idPrefix}`);
        if (seta) seta.classList.toggle('aberta', aberto);
        const rotulo = document.getElementById(`totalizador-toggle-rotulo-${idPrefix}`);
        if (rotulo) rotulo.textContent = aberto ? 'Ver menos' : 'Ver por grupo';
    }

    // Retorna { hero, detalhe } em vez de um bloco só (30/ago/2026, achado
    // dela em Presença: o detalhe por grupo ficava preso dentro da coluna
    // estreita dos números -- porque ficava dentro da MESMA grade de 2
    // colunas do hero, encolhida no fechar/travada na largura do hero no
    // abrir). Figurino e Presença agora usam o MESMO cartão de 3 blocos
    // (hero/números | interruptores | QR, classes .pres-*) -- hero vai no
    // 1º bloco, detalhe vira seção própria de largura total, embaixo dos 3.
    function totalGradeHtml(grupos, idPrefix) {
        const totalGeral = grupos.reduce((s, g) => s + g.total, 0);
        const feitoGeral = grupos.reduce((s, g) => s + g.feito, 0);
        if (grupos.length <= 1) return { hero: totalDuploHtml(totalGeral, totalGeral - feitoGeral), detalhe: '' };
        const faltamGeral = totalGeral - feitoGeral;
        const aberto = totalizadorDetalheEstaAberto(idPrefix);
        // Cada grupo = 1 linha (30/ago/2026, pedido dela: "igual Ritmistas
        // por Instrumento da Visão Geral") -- reaproveita o componente real
        // (.vg-instrumento-linha) que já existe pra exatamente esse tipo de
        // informação, em vez do grid de número grande por grupo que só o
        // total geral (topo) continua usando.
        const linhas = grupos.map(g => {
            const faltamG = g.total - g.feito;
            return `
                <div class="vg-instrumento-linha">
                    <span>${esc(g.label)}</span>
                    <span style="display:flex;align-items:center;gap:14px;">
                        ${faltamG > 0 ? `<span class="vg-instrumento-faltam">${faltamG === 1 ? 'Falta' : 'Faltam'} ${faltamG}</span>` : ''}
                        <span class="vg-instrumento-qtd">${g.feito} / ${g.total}</span>
                    </span>
                </div>`;
        }).join('');
        const hero = `<div class="pres-hero-bloco">
            <div class="pres-hero-numeros">
                <div class="celula-hero"><div class="total-duplo-numero total">${totalGeral}</div><div class="total-duplo-rotulo">Total</div></div>
                <div class="celula-hero"><div class="total-duplo-numero faltam">${faltamGeral}</div><div class="total-duplo-rotulo">${faltamGeral === 1 ? 'Falta' : 'Faltam'}</div></div>
            </div>
            <button type="button" onclick="toggleTotalizadorDetalhe('${idPrefix}')" style="background:none;border:none;padding:4px 0 2px;margin:0;font-family:inherit;font-size:11px;font-weight:700;color:#8b88a0;cursor:pointer;text-align:left;display:flex;align-items:center;gap:4px;">
                <span id="totalizador-toggle-rotulo-${idPrefix}">${aberto ? 'Ver menos' : 'Ver por grupo'}</span>
                <span class="vg-secao-seta ${aberto ? 'aberta' : ''}" id="totalizador-toggle-seta-${idPrefix}" style="font-size:12px;">›</span>
            </button>
        </div>`;
        const detalhe = `<div id="totalizador-grupos-${idPrefix}" style="display:${aberto ? 'block' : 'none'};margin-top:6px;">
            ${linhas}
        </div>`;
        return { hero, detalhe };
    }

    // Card nasce sempre ABERTO (25/ago/2026, pedido dela) -- ao contrário
    // dos outros acordeões da Visão Geral, esse é o único que ela quer
    // já visível ao entrar na tela; a pessoa pode fechar pra ver o resto
    // da tela com mais facilidade, mas ele nunca lembra esse fechamento --
    // toda vez que a tela é recarregada, volta a nascer aberto.
    let vgAniversariantesAberto = false;
    function toggleVgAniversariantesAberto() {
        vgAniversariantesAberto = !vgAniversariantesAberto;
        const div = document.getElementById('vg-aniversariantes');
        const seta = document.getElementById('vg-aniversariantes-seta');
        if (div) div.style.display = vgAniversariantesAberto ? 'block' : 'none';
        if (seta) seta.classList.toggle('aberta', vgAniversariantesAberto);
    }

    // Card fechado por padrão (25/ago/2026, pedido dela) -- só o total geral
    // na pílula do cabeçalho, clica pra abrir o detalhe por naipe.
    let vgInstrumentosAberto = false;
    let vgMenoresAberto = false;
    function toggleVgMenoresAberto() {
        vgMenoresAberto = !vgMenoresAberto;
        const div = document.getElementById('vg-menores');
        const seta = document.getElementById('vg-menores-seta');
        if (div) div.style.display = vgMenoresAberto ? 'block' : 'none';
        if (seta) seta.classList.toggle('aberta', vgMenoresAberto);
    }

    // Controle de Menores -- Declaração do Responsável (27/ago/2026, pedido
    // dela): total de menores ativos, quantos já entregaram a declaração,
    // quantos faltam, quebrado por instrumento -- mesmo padrão visual de
    // "Ritmistas por Instrumento" e do resumo de Figurino ("Falta N (X/Y)").
    function renderizarControleMenores() {
        // Rede de segurança (27/ago/2026, depois de um susto real em
        // produção): qualquer erro aqui dentro NUNCA pode travar as
        // chamadas seguintes de carregarRitmistas() (Figurino, etc.) --
        // fica só registrado no console, o card de Menores simplesmente
        // não aparece nesse ciclo, e o resto da tela continua funcionando.
        try {
            const card = document.getElementById('vg-menores-card');
            const div = document.getElementById('vg-menores');
            if (!card || !div) return;
            const menores = todosRitmistas.filter(r => {
                if (r.status !== 'aprovado') return false;
                const idade = calcularIdade(r.nascimento);
                return idade !== null && idade < 18;
            });
            if (menores.length === 0) { card.style.display = 'none'; return; }
            card.style.display = '';
            const totalEl = document.getElementById('vg-menores-total');
            if (totalEl) {
                const entreguesGeral = menores.filter(r => r.declaracao_responsavel).length;
                totalEl.innerHTML = totalDuploHtml(menores.length, menores.length - entreguesGeral, true);
            }
            const porInstrumento = {};
            menores.forEach(r => {
                const chave = r.bateria_instrumento_id || 'sem-instrumento';
                if (!porInstrumento[chave]) porInstrumento[chave] = { entregues: 0, total: 0 };
                porInstrumento[chave].total++;
                if (r.declaracao_responsavel) porInstrumento[chave].entregues++;
            });
            const linhas = Object.keys(porInstrumento).map(chave => {
                const bi = (bateriaInstrumentosCache || []).find(b => String(b.id) === chave);
                const nome = bi ? nomeExibicaoBateriaInstrumento(bi) : 'Sem instrumento';
                return { nome, ...porInstrumento[chave] };
            }).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
            div.innerHTML = linhas.map(l => {
                const faltam = l.total - l.entregues;
                return `
                <div class="vg-instrumento-linha">
                    <span>${esc(l.nome)}</span>
                    <span style="display:flex;align-items:center;gap:14px;">
                        ${faltam > 0 ? `<span class="vg-instrumento-faltam">${faltam === 1 ? 'Falta' : 'Faltam'} ${faltam}</span>` : ''}
                        <span class="vg-instrumento-qtd${faltam === 0 ? ' completo' : ''}">${l.entregues} / ${l.total}</span>
                    </span>
                </div>`;
            }).join('');
        } catch (erro) {
            console.error('renderizarControleMenores falhou:', erro);
        }
    }
    function toggleVgInstrumentosAberto() {
        vgInstrumentosAberto = !vgInstrumentosAberto;
        const div = document.getElementById('vg-instrumentos');
        const seta = document.getElementById('vg-instrumentos-seta');
        if (div) div.style.display = vgInstrumentosAberto ? 'block' : 'none';
        if (seta) seta.classList.toggle('aberta', vgInstrumentosAberto);
    }

    function renderizarContagemInstrumentos() {
        const div = document.getElementById('vg-instrumentos');
        if (!div) return;
        // "Não Desfila" não ocupa vaga -- a vaga do instrumento dela libera
        // pra outra pessoa (pedido dela, 28/ago/2026).
        const ativos = todosRitmistas.filter(r => r.status === 'aprovado' && !r.nao_desfila);
        const contagem = {};
        ativos.forEach(r => {
            const chave = r.bateria_instrumento_id || 'sem-instrumento';
            contagem[chave] = (contagem[chave] || 0) + 1;
        });
        // Mesma trava de vaga já usada em Configurações -> Vagas de
        // Ritmistas (bateriaInstrumentosCache[].vagas). Pedido da Márcia,
        // 19/ago/2026: sem vaga cadastrada mostra "N / -" (não "N / 0",
        // que parecia capacidade zero) e fica VERMELHO de propósito --
        // pressiona quem gerencia a preencher a vaga, mesmo vermelho de
        // quando excede. Verde só quando bate certinho no número (mesmo
        // do badge "Ativo"). Aviso ao lado da pílula (21/ago/2026): "Sem
        // definição de vagas" quando ninguém preencheu o número ainda, ou
        // "Faltam N" quando já tem número definido mas não bateu -- ver
        // avisoVagaHtml().
        const linhas = (bateriaInstrumentosCache || []).filter(bi => bi.ativo).map(bi => {
            const qtd = contagem[String(bi.id)] || 0;
            const nome = nomeExibicaoBateriaInstrumento(bi);
            const vagas = bi.vagas || 0;
            const semVaga = vagas === 0;
            const faltam = (!semVaga && qtd < vagas) ? (vagas - qtd) : 0;
            return { nome, qtd, vagas, semVaga, excedeu: !semVaga && qtd > vagas, completo: !semVaga && qtd === vagas, faltam, mostrarAviso: true };
        });
        // Ordem alfabética (27/ago/2026, pedido dela: "não tem mistério") --
        // antes vinha sem nenhum order-by no banco, ou seja, sem critério
        // nenhum (a ordem "física" que o Postgres decidia guardar as linhas).
        linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        // Ritmista sem instrumento atribuído (raro, dado antigo) só entra
        // na lista se existir de verdade -- não é um naipe de bateria, não
        // faz sentido mostrar "0" fixo pra ele, nem aviso de vaga nenhum.
        if (contagem['sem-instrumento']) {
            linhas.push({ nome: 'Sem instrumento', qtd: contagem['sem-instrumento'], vagas: 0, semVaga: true, excedeu: false, completo: false, faltam: 0, mostrarAviso: false });
        }
        // Total geral, mostrado sempre (mesmo com o card fechado) -- soma
        // ativos de todos os naipes / soma só das vagas que já têm número
        // definido (naipe sem vaga não entra na soma, mesmo critério de "-"
        // usado linha a linha).
        const totalEl = document.getElementById('vg-instrumentos-total');
        if (totalEl) {
            const totalQtd = linhas.reduce((s, l) => s + l.qtd, 0);
            const linhasComVaga = linhas.filter(l => !l.semVaga);
            const totalVagas = linhasComVaga.reduce((s, l) => s + l.vagas, 0);
            // Total = vaga definida (ou, sem nenhuma vaga configurada, o
            // total de gente ativa); Faltam = quanto falta pra bater a vaga,
            // nunca negativo (25/ago/2026, mesmo padrão de totalDuploHtml).
            const totalGeral = linhasComVaga.length > 0 ? totalVagas : totalQtd;
            const faltamGeral = linhasComVaga.length > 0 ? Math.max(0, totalVagas - totalQtd) : 0;
            totalEl.innerHTML = totalDuploHtml(totalGeral, faltamGeral, true);
        }
        if (linhas.length === 0) {
            div.innerHTML = '<div style="color:#bbb;font-size:13px;padding:8px 0;">Nenhum instrumento ativo cadastrado.</div>';
            return;
        }
        div.innerHTML = linhas.map(l => `
            <div class="vg-instrumento-linha">
                <span>${esc(l.nome)}</span>
                <span style="display:flex;align-items:center;gap:14px;">
                    ${l.mostrarAviso ? avisoVagaHtml(l) : ''}
                    <span class="vg-instrumento-qtd${(l.excedeu || l.semVaga) ? ' excedeu' : l.completo ? ' completo' : ''}">${l.qtd} / ${l.semVaga ? '-' : l.vagas}</span>
                </span>
            </div>`).join('');
    }

    // Resumo de entrega de Figurino na Visão Geral -- pedido da Márcia,
    // 24/ago/2026: "não tem como ficar todos lá", e ativar a peça em
    // Configurações (com antecedência) não quer dizer que ela deve
    // aparecer aqui. Só entra quem está ativo pra essa bateria E com
    // "Entrega Iniciada" ligado E "Entrega Finalizada" desligado
    // (ver toggleMostraVisaoGeral/toggleEntregaFinalizada, na tela Mais →
    // Entrega de Figurino) -- card inteiro some quando não sobra nenhum.
    // Peça de Ritmista quebra por instrumento (mesmo desenho de
    // "Ritmistas por Instrumento", mas o denominador aqui é gente ativa
    // daquele naipe, não vaga configurada); peça de Mestre/Diretor/Apoio
    // mostra só o total, sem naipe (não existe naipe pra Diretoria).
    async function carregarResumoEntregaFigurino() {
        const card = document.getElementById('vg-figurino-card');
        if (!card) return;
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { card.style.display = 'none'; return; }
        const resAtivos = await fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?bateria_id=eq.${bateriaId}&ativo=eq.true&mostra_visao_geral=eq.true&entrega_finalizada=eq.false&select=id,figurino_item_mestre_id,publico,inclui_extras,item:figurino_itens_mestre(id,nome)`, { headers: authHeaders });
        const ativos = resAtivos.ok ? await resAtivos.json() : [];
        if (ativos.length === 0) { card.style.display = 'none'; document.getElementById('vg-figurino').innerHTML = ''; return; }
        const itemIds = ativos.map(a => a.figurino_item_mestre_id);
        // Público/Incluir Convidados agora moram na linha da bateria, não no
        // item global (31/ago/2026) -- monta o objeto "pronto pra uso" aqui.
        const itens = ativos.filter(a => a.item).map(a => ({ id: a.figurino_item_mestre_id, nome: a.item.nome, publico: publicoFigurinoBateria(a), inclui_extras: !!a.inclui_extras }));
        if (itens.length === 0) { card.style.display = 'none'; return; }
        const perfis = [...new Set(itens.flatMap(i => i.publico))];
        // "Incluir Extras" (25/ago/2026) soma junto o lado certo de Extras
        // no resumo, mesma lógica de carregarEntregasFigurino. eh_convidado=
        // eq.false (31/ago/2026): idem, Convidado Especial nunca some
        // escondido dentro de Ritmistas/Diretoria.
        const precisaExtras = itens.some(i => i.inclui_extras);
        const especial = modoConvidadosEspecial();
        const buscas = [
            fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&status=eq.aprovado&eh_convidado=eq.false&perfil=in.(${perfis.join(',')})&select=id,perfil,instrumento_nome`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/figurino_entregas?figurino_item_id=in.(${itemIds.join(',')})&entregue_em=not.is.null&vinculo_id=not.is.null&select=vinculo_id,figurino_item_id`, { headers: authHeaders }),
        ];
        if (precisaExtras) {
            if (especial) {
                // Convidado Especial é vínculo de verdade -- entrega dele já
                // vem na busca de figurino_entregas por vinculo_id acima,
                // não precisa de busca própria (diferente do Convidado
                // Simples, que usa extra_id numa tabela separada).
                buscas.push(fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&status=eq.aprovado&eh_convidado=eq.true&select=id,perfil`, { headers: authHeaders }));
            } else {
                buscas.push(
                    fetch(`${SUPABASE_URL}/rest/v1/extras?bateria_id=eq.${bateriaId}&select=id,grupo`, { headers: authHeaders }),
                    fetch(`${SUPABASE_URL}/rest/v1/figurino_entregas?figurino_item_id=in.(${itemIds.join(',')})&entregue_em=not.is.null&extra_id=not.is.null&select=extra_id,figurino_item_id`, { headers: authHeaders }),
                );
            }
        }
        const [resPessoas, resEntregas, ...resto] = await Promise.all(buscas);
        const pessoas = resPessoas.ok ? await resPessoas.json() : [];
        const entregas = resEntregas.ok ? await resEntregas.json() : [];
        let extras = [], extrasEntregas = [];
        if (precisaExtras && especial) {
            const [resConvidados] = resto;
            const convidados = (resConvidados && resConvidados.ok) ? await resConvidados.json() : [];
            // Normaliza pro mesmo formato {id, grupo} do Convidado Simples,
            // pra renderizarResumoEntregaFigurino não precisar saber a
            // diferença (perfil vira grupo).
            extras = convidados.map(c => ({ id: c.id, grupo: c.perfil }));
        } else if (precisaExtras) {
            const [resExtras, resExtrasEntregas] = resto;
            extras = (resExtras && resExtras.ok) ? await resExtras.json() : [];
            extrasEntregas = (resExtrasEntregas && resExtrasEntregas.ok) ? await resExtrasEntregas.json() : [];
        }
        card.style.display = 'block';
        renderizarResumoEntregaFigurino(itens, pessoas, entregas, extras, extrasEntregas, especial);
    }

    // Cada peça, dentro do card, é seu próprio acordeão fechado/aberto
    // (25/ago/2026) -- guarda o último resultado carregado pra reabrir/
    // fechar sem precisar buscar de novo no banco.
    let vgFigurinoAbertos = new Set();
    let vgFigurinoUltimoRender = null;
    function toggleVgFigurinoAberto(itemId) {
        if (vgFigurinoAbertos.has(itemId)) vgFigurinoAbertos.delete(itemId);
        else vgFigurinoAbertos.add(itemId);
        if (vgFigurinoUltimoRender) renderizarResumoEntregaFigurino(...vgFigurinoUltimoRender);
    }

    function renderizarResumoEntregaFigurino(itens, pessoas, entregas, extras, extrasEntregas, especial) {
        vgFigurinoUltimoRender = [itens, pessoas, entregas, extras, extrasEntregas, especial];
        const div = document.getElementById('vg-figurino');
        if (!div) return;
        const entreguesPorItem = {};
        entregas.forEach(e => {
            if (!entreguesPorItem[e.figurino_item_id]) entreguesPorItem[e.figurino_item_id] = new Set();
            entreguesPorItem[e.figurino_item_id].add(e.vinculo_id);
        });
        // Convidado Especial é vínculo de verdade -- entrega dele já está
        // em entreguesPorItem acima (mesmo formato de Ritmistas/Diretoria).
        // extrasEntreguesPorItem só existe pro Convidado Simples (extra_id).
        const extrasEntreguesPorItem = {};
        if (!especial) {
            (extrasEntregas || []).forEach(e => {
                if (!extrasEntreguesPorItem[e.figurino_item_id]) extrasEntreguesPorItem[e.figurino_item_id] = new Set();
                extrasEntreguesPorItem[e.figurino_item_id].add(e.extra_id);
            });
        }
        const linhaHtml = (nome, entregues, total, ehGrupo) => {
            const faltam = total - entregues;
            return `
            <div class="vg-instrumento-linha${ehGrupo ? ' vg-instrumento-linha--grupo' : ''}">
                <span class="vg-instrumento-linha-nome">${ehGrupo ? '<sup class="vg-instrumento-linha-asterisco">*</sup>' : ''}${esc(nome)}</span>
                <span style="display:flex;align-items:center;gap:14px;">
                    ${faltam > 0 ? `<span class="vg-instrumento-faltam">${faltam === 1 ? 'Falta' : 'Faltam'} ${faltam}</span>` : ''}
                    <span class="vg-instrumento-qtd${faltam === 0 ? ' completo' : ''}">${entregues} / ${total}</span>
                </span>
            </div>`;
        };
        const itensOrdenados = [...itens].sort((a, b) =>
            ORDEM_PUBLICO_FIGURINO.indexOf(a.publico[0]) - ORDEM_PUBLICO_FIGURINO.indexOf(b.publico[0]) || a.nome.localeCompare(b.nome, 'pt-BR'));
        div.innerHTML = itensOrdenados.map((item, idx) => {
            const entreguesSet = entreguesPorItem[item.id] || new Set();
            // Peça agora pode cobrir Ritmista(s) E Diretoria (Mestre/Diretor/
            // Apoio) ao mesmo tempo (27/ago/2026) -- mostra os dois blocos
            // juntos quando isso acontecer, cada um com seu próprio total.
            const pessoasAlvo = pessoas.filter(p => item.publico.includes(p.perfil));
            const pessoasRitmista = pessoasAlvo.filter(p => p.perfil === 'ritmista');
            const pessoasDiretoria = pessoasAlvo.filter(p => p.perfil !== 'ritmista');
            let corpoHtml = '';
            let totalGeral = 0, entreguesGeral = 0;
            if (pessoasRitmista.length > 0) {
                const porInstrumento = {};
                pessoasRitmista.forEach(p => {
                    const chave = p.instrumento_nome || 'Sem instrumento';
                    if (!porInstrumento[chave]) porInstrumento[chave] = { total: 0, entregues: 0 };
                    porInstrumento[chave].total++;
                    if (entreguesSet.has(p.id)) porInstrumento[chave].entregues++;
                });
                const linhas = Object.entries(porInstrumento).map(([nome, v]) => ({ nome, ...v, faltam: v.total - v.entregues }))
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
                corpoHtml += linhas.map(l => linhaHtml(l.nome, l.entregues, l.total)).join('');
                linhas.forEach(l => { totalGeral += l.total; entreguesGeral += l.entregues; });
            }
            if (pessoasDiretoria.length > 0) {
                // Rótulo genérico "Diretoria" em vez do cargo específico
                // (Mestres/Diretores de Bateria/Diretores) -- pedido dela,
                // 27/ago/2026, pra bater com a separação Ritmistas/Diretoria
                // usada no resto da Visão Geral (Convidados).
                const entregues = pessoasDiretoria.filter(p => entreguesSet.has(p.id)).length;
                corpoHtml += linhaHtml('Diretoria', entregues, pessoasDiretoria.length, true);
                totalGeral += pessoasDiretoria.length; entreguesGeral += entregues;
            }
            if (item.inclui_extras) {
                const grupos = gruposExtraDoPublico(item.publico);
                const extrasAlvo = (extras || []).filter(e => grupos.includes(e.grupo));
                const extrasEntreguesSet = extrasEntreguesPorItem[item.id] || new Set();
                // Contagem única "Convidados" (30/ago/2026, pedido dela) --
                // antes separava "Convidados - Ritmistas"/"Convidados -
                // Diretoria" em 2 linhas; agora soma os dois num só total.
                if (extrasAlvo.length > 0) {
                    const entreguesExtras = extrasAlvo.filter(e => especial ? entreguesSet.has(e.id) : extrasEntreguesSet.has(e.id)).length;
                    corpoHtml += linhaHtml('Convidados', entreguesExtras, extrasAlvo.length, true);
                    totalGeral += extrasAlvo.length; entreguesGeral += entreguesExtras;
                }
            }
            if (!corpoHtml) corpoHtml = `<div style="color:#bbb;font-size:13px;padding:4px 0 9px;">Ninguém em ${item.publico.map(p => LABEL_PUBLICO_FIGURINO[p]).join(' / ').toLowerCase()} ainda.</div>`;
            const aberto = vgFigurinoAbertos.has(item.id);
            return `
            <div style="${idx === 0 ? '' : 'margin-top:16px;'}">
                <div class="vg-secao-titulo vg-secao-titulo--clicavel" style="margin-bottom:${aberto ? '8px' : '0'};" onclick="toggleVgFigurinoAberto(${item.id})">
                    <span class="vg-figurino-peca-titulo">${esc(item.nome)}</span>
                    <span class="vg-secao-resumo">
                        ${totalDuploHtml(totalGeral, totalGeral - entreguesGeral, true)}
                        <span class="vg-secao-seta${aberto ? ' aberta' : ''}">›</span>
                    </span>
                </div>
                ${aberto ? corpoHtml : ''}
            </div>`;
        }).join('');
    }

    // Resumo de Presença na Visão Geral -- mesmo padrão de
    // carregarResumoEntregaFigurino/renderizarResumoEntregaFigurino
    // (30/ago/2026), só trocando "peça" por "evento" e figurino_entregas
    // por evento_presencas. Cada evento ativo (iniciado=true,
    // finalizado=false) pode ter um conjunto diferente de perfis de
    // diretoria (evento.perfis_diretoria_inclusos) -- busca pessoas pela
    // UNIÃO de todos os perfis envolvidos (mesma ideia do union de
    // publico em Figurino), filtra por evento na hora de desenhar.
    async function carregarResumoEventosAtivos() {
        const card = document.getElementById('vg-eventos-card');
        if (!card) return;
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { card.style.display = 'none'; return; }
        const resAtivos = await fetch(`${SUPABASE_URL}/rest/v1/eventos?bateria_id=eq.${bateriaId}&iniciado=eq.true&finalizado=eq.false&select=id,nome,perfis_diretoria_inclusos,inclui_extras`, { headers: authHeaders });
        const eventos = resAtivos.ok ? await resAtivos.json() : [];
        if (eventos.length === 0) { card.style.display = 'none'; document.getElementById('vg-eventos').innerHTML = ''; return; }
        const eventoIds = eventos.map(e => e.id);
        const perfis = [...new Set(['ritmista', ...eventos.flatMap(e => e.perfis_diretoria_inclusos || [])])];
        const precisaExtras = eventos.some(e => e.inclui_extras);
        const buscas = [
            fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&status=eq.aprovado&perfil=in.(${perfis.join(',')})&select=id,perfil,instrumento_nome`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/evento_presencas?evento_id=in.(${eventoIds.join(',')})&vinculo_id=not.is.null&select=vinculo_id,evento_id`, { headers: authHeaders }),
        ];
        if (precisaExtras) {
            buscas.push(
                fetch(`${SUPABASE_URL}/rest/v1/extras?bateria_id=eq.${bateriaId}&select=id,grupo`, { headers: authHeaders }),
                fetch(`${SUPABASE_URL}/rest/v1/evento_presencas?evento_id=in.(${eventoIds.join(',')})&extra_id=not.is.null&select=extra_id,evento_id`, { headers: authHeaders }),
            );
        }
        const [resPessoas, resPresencas, resExtras, resExtrasPresencas] = await Promise.all(buscas);
        const pessoas = resPessoas.ok ? await resPessoas.json() : [];
        const presencas = resPresencas.ok ? await resPresencas.json() : [];
        const extras = (precisaExtras && resExtras && resExtras.ok) ? await resExtras.json() : [];
        const extrasPresencas = (precisaExtras && resExtrasPresencas && resExtrasPresencas.ok) ? await resExtrasPresencas.json() : [];
        card.style.display = 'block';
        renderizarResumoEventosAtivos(eventos, pessoas, presencas, extras, extrasPresencas);
    }

    let vgEventosAbertos = new Set();
    let vgEventosUltimoRender = null;
    function toggleVgEventoAberto(eventoId) {
        if (vgEventosAbertos.has(eventoId)) vgEventosAbertos.delete(eventoId);
        else vgEventosAbertos.add(eventoId);
        if (vgEventosUltimoRender) renderizarResumoEventosAtivos(...vgEventosUltimoRender);
    }

    function renderizarResumoEventosAtivos(eventos, pessoas, presencas, extras, extrasPresencas) {
        vgEventosUltimoRender = [eventos, pessoas, presencas, extras, extrasPresencas];
        const div = document.getElementById('vg-eventos');
        if (!div) return;
        const presentesPorEvento = {};
        presencas.forEach(p => {
            if (!presentesPorEvento[p.evento_id]) presentesPorEvento[p.evento_id] = new Set();
            presentesPorEvento[p.evento_id].add(p.vinculo_id);
        });
        const extrasPresentesPorEvento = {};
        (extrasPresencas || []).forEach(p => {
            if (!extrasPresentesPorEvento[p.evento_id]) extrasPresentesPorEvento[p.evento_id] = new Set();
            extrasPresentesPorEvento[p.evento_id].add(p.extra_id);
        });
        const linhaHtml = (nome, presentes, total, ehGrupo) => {
            const faltam = total - presentes;
            return `
            <div class="vg-instrumento-linha${ehGrupo ? ' vg-instrumento-linha--grupo' : ''}">
                <span class="vg-instrumento-linha-nome">${ehGrupo ? '<sup class="vg-instrumento-linha-asterisco">*</sup>' : ''}${esc(nome)}</span>
                <span style="display:flex;align-items:center;gap:14px;">
                    ${faltam > 0 ? `<span class="vg-instrumento-faltam">${faltam === 1 ? 'Falta' : 'Faltam'} ${faltam}</span>` : ''}
                    <span class="vg-instrumento-qtd${faltam === 0 ? ' completo' : ''}">${presentes} / ${total}</span>
                </span>
            </div>`;
        };
        const eventosOrdenados = [...eventos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        div.innerHTML = eventosOrdenados.map((evento, idx) => {
            const presentesSet = presentesPorEvento[evento.id] || new Set();
            const perfisDiretoria = evento.perfis_diretoria_inclusos || [];
            const pessoasAlvo = pessoas.filter(p => p.perfil === 'ritmista' || perfisDiretoria.includes(p.perfil));
            const pessoasRitmista = pessoasAlvo.filter(p => p.perfil === 'ritmista');
            const pessoasDiretoria = pessoasAlvo.filter(p => p.perfil !== 'ritmista');
            let corpoHtml = '';
            let totalGeral = 0, presentesGeral = 0;
            if (pessoasRitmista.length > 0) {
                const porInstrumento = {};
                pessoasRitmista.forEach(p => {
                    const chave = p.instrumento_nome || 'Sem instrumento';
                    if (!porInstrumento[chave]) porInstrumento[chave] = { total: 0, presentes: 0 };
                    porInstrumento[chave].total++;
                    if (presentesSet.has(p.id)) porInstrumento[chave].presentes++;
                });
                const linhas = Object.entries(porInstrumento).map(([nome, v]) => ({ nome, ...v }))
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
                corpoHtml += linhas.map(l => linhaHtml(l.nome, l.presentes, l.total)).join('');
                linhas.forEach(l => { totalGeral += l.total; presentesGeral += l.presentes; });
            }
            if (pessoasDiretoria.length > 0) {
                const presentes = pessoasDiretoria.filter(p => presentesSet.has(p.id)).length;
                corpoHtml += linhaHtml('Diretoria', presentes, pessoasDiretoria.length, true);
                totalGeral += pessoasDiretoria.length; presentesGeral += presentes;
            }
            if (evento.inclui_extras) {
                const grupos = gruposExtraDoPublico(['ritmista', ...perfisDiretoria]);
                const extrasAlvo = (extras || []).filter(e => grupos.includes(e.grupo));
                const extrasPresentesSet = extrasPresentesPorEvento[evento.id] || new Set();
                if (extrasAlvo.length > 0) {
                    const presentesExtras = extrasAlvo.filter(e => extrasPresentesSet.has(e.id)).length;
                    corpoHtml += linhaHtml('Convidados', presentesExtras, extrasAlvo.length, true);
                    totalGeral += extrasAlvo.length; presentesGeral += presentesExtras;
                }
            }
            if (!corpoHtml) corpoHtml = `<div style="color:#bbb;font-size:13px;padding:4px 0 9px;">Ninguém pra registrar presença ainda.</div>`;
            const aberto = vgEventosAbertos.has(evento.id);
            return `
            <div style="${idx === 0 ? '' : 'margin-top:16px;'}">
                <div class="vg-secao-titulo vg-secao-titulo--clicavel" style="margin-bottom:${aberto ? '8px' : '0'};" onclick="toggleVgEventoAberto(${evento.id})">
                    <span class="vg-figurino-peca-titulo">${esc(evento.nome)}</span>
                    <span class="vg-secao-resumo">
                        ${totalDuploHtml(totalGeral, totalGeral - presentesGeral, true)}
                        <span class="vg-secao-seta${aberto ? ' aberta' : ''}">›</span>
                    </span>
                </div>
                ${aberto ? corpoHtml : ''}
            </div>`;
        }).join('');
    }

    // Fechar modal clicando fora -- se for a ficha de perfil com edição
    // não salva, confirma antes (03/set/2026, pedido dela). Um único
    // fpEstado global cobre qualquer modal, já que só uma ficha fica
    // aberta/em edição por vez.
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', async e => {
            if (e.target !== overlay) return;
            if (typeof fpPodeDescartar === 'function' && !(await fpPodeDescartar())) return;
            overlay.classList.remove('aberto');
        });
    });

    async function sair() {
        await sb.auth.signOut();
        localStorage.removeItem('ritmista');
        localStorage.removeItem('tumtu_admin_estado');
        window.location.href = 'login';
    }

    // Reaproveita a sessão já aberta (sem pedir senha de novo) -- mesmo
    // caminho já usado pelo Ritmista em carteirinha.html.
    function trocarBateriaAdmin() {
        window.location.href = 'login?trocar=1';
    }

    function irParaCadastroManualRitmista() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { mostrarToast('Bateria não encontrada para este usuário.', 'erro'); return; }
        window.location.href = `cadastro?modo=manual&cargo=ritmista&bateria_id=${bateriaId}`;
    }
    function irParaCadastroManualDiretoria(cargo) {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { mostrarToast('Bateria não encontrada para este usuário.', 'erro'); return; }
        window.location.href = `cadastro?modo=manual&cargo=${cargo}&bateria_id=${bateriaId}`;
    }
    // Convidado "sem carteirinha" (04/set/2026) -- cargo aqui é só o "Tipo de
    // Convidado" (ritmista/diretor/apoio), nunca o cargo real de Diretoria.
    function irParaCadastroManualConvidado(cargo) {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { mostrarToast('Bateria não encontrada para este usuário.', 'erro'); return; }
        window.location.href = `cadastro?modo=manual&cargo=${cargo}&bateria_id=${bateriaId}&convidado_especial=1`;
    }


    let bibliotecaInstrumentos = []; // categorias da biblioteca mestre, cada uma com .nomenclaturas
    let bateriaInstrumentosCache = []; // linhas de bateria_instrumentos da bateria atual
    let filtroInstrumentosSelecionados = []; // agora guarda bateria_instrumento_id (número), não mais texto
    let bibliotecaMedidas = []; // medida_tamanhos, biblioteca mestre
    let bibliotecaMedidaTipos = []; // medida_tipos, biblioteca mestre -- abertos (23/ago/2026): não são mais 4 fixos no código. Rótulo na tela é "Categoria de Figurino", nome da tabela continua medida_tipos.
    let bateriaMedidasCache = []; // linhas de bateria_medidas da bateria atual
    let bateriaMedidaTiposCache = []; // linhas de bateria_medida_tipos -- liga/desliga a Categoria de Figurino inteira (Camisa/Fantasia/Calça/Sapato + qualquer categoria nova). Nasce DESLIGADA (23/ago/2026, decisão da Márcia -- deixou de ser fixo no código, então não faz mais sentido nascer ligada, mesmo padrão de Instrumentos).
    let bibliotecaFigurino = []; // figurino_itens_mestre, lista mestre de peças (Camisa da Final...), cadastrada pelo Super Admin
    let bateriaFigurinoCache = []; // linhas de bateria_figurino_itens -- liga/desliga cada peça da lista mestre pra essa bateria. Nasce DESLIGADA (sem linha = inativo).

    async function carregarBibliotecaInstrumentos() {
        const [resCat, resNom] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/instrumento_categorias?order=ordem`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/instrumento_nomenclaturas?order=ordem`, { headers: authHeaders })
        ]);
        const categorias = await resCat.json();
        const nomenclaturas = await resNom.json();
        bibliotecaInstrumentos = (categorias || []).map(c => ({
            ...c,
            nomenclaturas: (nomenclaturas || []).filter(n => n.categoria_id === c.id)
        }));
    }

    async function carregarBateriaInstrumentos() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { bateriaInstrumentosCache = []; return; }
        const res = await fetch(`${SUPABASE_URL}/rest/v1/bateria_instrumentos?bateria_id=eq.${bateriaId}`, { headers: authHeaders });
        bateriaInstrumentosCache = await res.json();
    }

    function nomeExibicaoBateriaInstrumento(bi) {
        const cat = bibliotecaInstrumentos.find(c => c.id === bi.categoria_id);
        const nom = cat ? cat.nomenclaturas.find(n => n.id === bi.nomenclatura_id) : null;
        return (nom && nom.nome) || (cat && cat.nome) || '—';
    }

    function instrumentosAtivosDaBateria() {
        return bateriaInstrumentosCache
            .filter(bi => bi.ativo)
            .map(bi => ({ id: bi.id, nome: nomeExibicaoBateriaInstrumento(bi) }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    // Desfaz qualquer tema de escola aplicado no header (fundo, logo, cores de
    // texto) -- devolve tudo ao padrão TumTu. Precisa existir separado de
    // aplicarConfigEscola() porque o Super Admin pode voltar da tela de uma
    // escola (tema aplicado) pro próprio painel (Dashboard/Escolas/Config/
    // Privacidade), onde NUNCA deve sobrar tema de escola nenhuma -- achado
    // real da Márcia, 19/ago/2026: header ficava preso na cor/logo da última
    // escola visitada mesmo depois de voltar pro Super Admin.
    function resetTemaHeaderPadrao() {
        const header = document.getElementById('pageHeader');
        const marca = document.getElementById('headerMarca');
        const headerEsquerda = document.querySelector('.header-esquerda');
        if (header) header.style.background = '';
        if (marca) {
            marca.innerHTML = '<span class="tt-t">T</span>u<span class="tt-m">m</span><span class="tt-t">T</span>u';
            marca.style.color = '';
            marca.style.textShadow = '';
        }
        if (headerEsquerda) headerEsquerda.classList.remove('com-logo-escola');
        const badge = document.getElementById('headerBateria');
        if (badge) { badge.style.color = ''; badge.style.textShadow = ''; }
    }

    function aplicarConfigEscola() {
        const cfg = (typeof configEscola !== 'undefined') ? configEscola : {};
        // Sempre reseta primeiro -- sem isso, trocar de uma escola com tema
        // ligado pra outra sem tema (ou pro próprio painel do Super Admin)
        // deixava cor/logo "grudadas" da escola anterior.
        resetTemaHeaderPadrao();

        // Header sempre usa a sigla (nomeEscola, ex: "G.R.E.S. Imperatriz
        // Leopoldinense") -- decisão dela, 23/ago/2026: já tinha testado com
        // o Nome Curto (sem "G.R.E.S.") e achou o header com a sigla mais
        // bonito. Nome Curto continua existindo (campo em Dados da Escola,
        // configEscola.nomeEscolaCurto) só não é mais usado aqui -- ela quis
        // manter guardado pra um uso futuro ainda não definido.
        const escolaEl = document.getElementById('headerEscolaNome');
        const bateriaEl = document.getElementById('headerBateriaNome');
        if (bateriaEl) {
            const nomeEscolaExibido = cfg.nomeEscola || '';
            escolaEl.textContent = nomeEscolaExibido;
            escolaEl.style.display = nomeEscolaExibido ? '' : 'none';
            bateriaEl.textContent = cfg.nomeBateria || '';
            bateriaEl.style.display = '';
        }

        // Cor do botão Ativar (usa corDestaque da escola ou dourado TumTu)
        const cor = cfg.corDestaque || '#D4AF37';
        const textoCor = cfg.corDestaque ? '#ffffff' : '#12101a';
        document.querySelectorAll('.btn-aprovar').forEach(btn => {
            btn.style.background = cor;
            btn.style.borderColor = cor;
            btn.style.color = textoCor;
        });
        document.querySelectorAll('.btn-modal-confirmar.verde').forEach(btn => {
            btn.style.background = cor;
            btn.style.color = textoCor;
        });

        // Tema por escola no cabeçalho -- opcional, ligado por escola no Super
        // Admin (escolas.tema_personalizado_ativo). Desligado por padrão: zero
        // mudança visual. Escopo intencionalmente restrito ao header (fundo +
        // logo) -- não é repintura de tela inteira (avaliação de UX aprovada
        // pela Márcia, 18/ago/2026). Nunca roda no Super Admin -- lá a visão
        // não está presa a uma escola só.
        const header = document.getElementById('pageHeader');
        const marca = document.getElementById('headerMarca');
        const headerEsquerda = document.querySelector('.header-esquerda');
        if (header && cfg.temaPersonalizadoAtivo && cfg.corPrimariaEscola) {
            header.style.background = cfg.corPrimariaEscola;

            // Texto branco com sombra sutil é o padrão (mesma técnica de banner
            // colorido usada em muitos apps) -- funciona bem pra quase toda cor
            // de marca, sem precisar acertar o tom exato de cada escola. Só
            // troca pra texto escuro em cores CLARAMENTE claras (limiar mais
            // alto que o usado na carteirinha, de propósito -- um verde ou azul
            // médio, por exemplo, ainda lê melhor com texto branco+sombra do
            // que com texto escuro). Achado da Márcia, 18/ago/2026: a primeira
            // versão (texto escuro semi-transparente) ficou "sem graça", pouco
            // nítida, mesmo tecnicamente mudando de cor.
            const claro = corEhClara(cfg.corPrimariaEscola, 0.6);
            const corTexto = claro ? '#12101a' : '#ffffff';
            const sombra = claro ? 'none' : '0 1px 3px rgba(0,0,0,0.45)';

            if (marca && !cfg.logoEscola) { marca.style.color = corTexto; marca.style.textShadow = sombra; }
            const badge = document.getElementById('headerBateria');
            badge.style.color = corTexto;
            badge.style.textShadow = sombra;

            // "Sair" fica dourado vazado sempre, inclusive com o tema da
            // escola ligado -- pedido explícito da Márcia, 22/ago/2026,
            // revertendo a decisão de 18/ago (fundo branco sólido só nesse
            // caso). Ela optou por isso mesmo sabendo que pode perder um
            // pouco de nitidez em escolas de cor bem clara/pastel.

            // Logo GRANDE ao lado do nome da escola/bateria (não mais empilhada
            // sozinha e pequena) -- achado da Márcia, 18/ago/2026: "a logo
            // ficou muito pequena... tem que ficar sozinha e maior e ao lado
            // dela o nome da escola e da bateria". Só substitui a marca TumTu
            // se a escola tiver logo cadastrada -- sem logo ainda enviada, a
            // marca TumTu continua ali (com a cor ajustada), nunca fica vazio.
            if (marca && cfg.logoEscola) {
                const corAnel = escolherCorBordaLogo(cfg.coresEscola || []);
                marca.innerHTML = `<div class="header-marca-logo-wrap" style="box-shadow:0 0 0 2px ${corAnel};"><img src="${cfg.logoEscola}" class="header-marca-logo" alt="Logo"></div>`;
                if (headerEsquerda) headerEsquerda.classList.add('com-logo-escola');
            }
        }
        // Interruptor desligado (ou sem cor cadastrada ainda): nenhum style
        // novo é setado, o cabeçalho fica exatamente como o padrão TumTu.
    }

    // Duplicado de carteirinha.html (mesma convenção do projeto: helper
    // pequeno de UI vive em cada arquivo, não é importado -- ver
    // fpMascaraData/ficha-perfil.js vs mascaraData/cadastro.html).
    function corEhClara(hex, limiar) {
        if (!hex) return false;
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        if (full.length !== 6) return false;
        const canal = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const r = canal(parseInt(full.slice(0, 2), 16));
        const g = canal(parseInt(full.slice(2, 4), 16));
        const b = canal(parseInt(full.slice(4, 6), 16));
        const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return luminancia > (limiar ?? 0.42);
    }

    // Duplicadas de carteirinha.html -- mesma lógica de anel colorido ao
    // redor da logo (.v-logo/box-shadow), pedido da Márcia, 18/ago/2026:
    // "a logo pode ter a mesma lógica da carteirinha... borda da cor".
    function corEhBranca(hex) {
        if (!hex) return true;
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        if (full.length !== 6) return false;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return r > 240 && g > 240 && b > 240;
    }
    function escolherCorBordaLogo(cores) {
        if (!Array.isArray(cores)) return '#D4AF37';
        for (let i = cores.length - 1; i >= 1; i--) {
            if (cores[i] && !corEhBranca(cores[i])) return cores[i];
        }
        return '#D4AF37';
    }

    // Mesma chave/cache que login.html grava (prefetchConfigEscola) e
    // carteirinha.html já lê -- lida aqui SÍNCRONO, antes de qualquer fetch,
    // pra aplicar o tema no primeiro desenho da tela. Sem isso, o cabeçalho
    // sempre nascia preto/TumTu por um instante e só depois de duas idas à
    // rede (biblioteca de instrumentos + bateria + escola) trocava pra cor
    // da escola -- achado real da Márcia, 18/ago/2026 ("a tela sempre abre
    // com o header preto e depois aparece o header customizado").
    function aplicarCacheConfigEscolaAntecipado(bateriaId) {
        if (!bateriaId) return;
        try {
            const raw = localStorage.getItem(`tumtu_cfg_${bateriaId}`);
            if (!raw) return;
            const cache = JSON.parse(raw);
            configEscola.nomeEscola = cache.nomeEscola || '';
            configEscola.nomeEscolaCurto = cache.nomeEscolaCurto || '';
            configEscola.nomeBateria = cache.nomeBateria || '';
            configEscola.temaPersonalizadoAtivo = !!cache.temaPersonalizadoAtivo;
            configEscola.corPrimariaEscola = cache.corPrimaria || null;
            configEscola.logoEscola = cache.logoEscola || null;
            configEscola.coresEscola = Array.isArray(cache.cores) ? cache.cores : [];
            aplicarConfigEscola();
        } catch (e) {
            // Sem cache não quebra nada -- carregarNomeEscolaBateria() busca de verdade a seguir.
        }
    }

    // Bolinha de conta no cabeçalho -- foto real se tiver (mesmo campo usado
    // na ficha/carteirinha), senão iniciais do nome. Cores fixas (fundo
    // escuro + borda dourada), não muda com o tema da escola.
    function renderizarAvatarHeader(usuario) {
        const el = document.getElementById('headerAvatarWrap');
        if (!el) return;
        if (usuario.foto_url) {
            el.innerHTML = `<img src="${usuario.foto_url}" alt="">`;
            return;
        }
        const partes = (usuario.nome || '').trim().split(/\s+/).filter(Boolean);
        const iniciais = partes.length > 1 ? (partes[0][0] + partes[partes.length - 1][0]) : (partes[0] ? partes[0][0] : '?');
        el.textContent = iniciais.toUpperCase();
    }

    async function iniciarUsuario() {
        const usuario = JSON.parse(localStorage.getItem('ritmista') || 'null');
        if (!usuario) { window.location.href = 'login'; return; }

        // Super Admin: sem bateria própria, sem trava de modo_piloto -- cai na
        // barra lateral (Dashboard/Escolas/Configurações/Privacidade), nunca
        // no contexto de uma escola até escolher uma em "Escolas".
        if (usuario.perfil === 'super_admin') {
            souSuperAdmin = true;
            renderizarAvatarHeader({ nome: usuario.nome || 'Super Admin', foto_url: usuario.foto_url });
            document.getElementById('headerAvatarWrap').onclick = abrirMeuPerfilSA;
            ajustarAlturaHeaderAdmin();
            // Mesmo spinner das outras transições de tela hoje -- sem isso,
            // o Dashboard nascia com o título "Baterias" sozinho na tela
            // (é texto fixo no HTML, os números/lista vêm depois, via
            // rede) antes de preencher de verdade. Achado da Márcia,
            // 19/ago/2026: "aparece Bateria escrito e depois é que muda
            // pro dashboard".
            mostrarOverlayCarregando();
            mostrarShellSA();
            // Volta pro mesmo lugar de antes de atualizar a página -- achado
            // da Márcia, 20/ago/2026: "sempre que eu atualizo a página, ela
            // me leva para o dashboard... isso é um bug sério". Se a escola
            // salva não existe mais (ex: apagada), cai no dashboard normal.
            const estadoSalvo = lerEstadoNavegacaoSalvo();
            if (estadoSalvo && estadoSalvo.contexto === 'sa-escola' && estadoSalvo.escolaId) {
                await entrarContextoEscolaSA(estadoSalvo.escolaId);
                if (escolaAtualData) {
                    trocarAba(estadoSalvo.aba || 'visao', document.querySelector(`.aba-btn[data-aba="${estadoSalvo.aba || 'visao'}"]`));
                } else {
                    mostrarShellSA();
                    await trocarSaAba('dashboard', document.querySelector('.sa-sidebar-item[data-sa="dashboard"]'));
                }
            } else if (estadoSalvo && estadoSalvo.contexto === 'sa-shell' && estadoSalvo.aba) {
                await trocarSaAba(estadoSalvo.aba, document.querySelector(`.sa-sidebar-item[data-sa="${estadoSalvo.aba}"]`));
            } else {
                await trocarSaAba('dashboard', document.querySelector('.sa-sidebar-item[data-sa="dashboard"]'));
            }
            esconderOverlayCarregando();
            return;
        }

        // Trava da fase piloto: Mestre/Diretor de bateria com modo_piloto ligado não vê o painel, mesmo digitando a URL direto.
        if (usuario.modo_piloto) { window.location.href = 'carteirinha'; return; }

        // Modo Carteirinha individual: mesma trava acima, só que por pessoa
        // em vez de por bateria inteira -- Mestre/Diretor/Apoio marcado assim
        // (aba Permissões) só vê a própria carteirinha, mesmo digitando a URL direto.
        if (usuario.modo_carteirinha_individual) { window.location.href = 'carteirinha'; return; }

        // Mesmo spinner/overlay do Super Admin entrando numa escola (ver
        // entrarContextoEscolaSA) -- rede de segurança pro caso raro do
        // cache (aplicarCacheConfigEscolaAntecipado) ainda não existir
        // (celular novo, cache limpo): sem isso, o cabeçalho ficava preto
        // durante toda a busca de instrumentos/bateria/escola e só virava a
        // cor da escola no final -- achado da Márcia, 19/ago/2026, "isso é
        // perceptível sim". Quando o cache já existe (caso comum), o
        // overlay só pisca rápido, sem custo perceptível.
        mostrarOverlayCarregando();

        aplicarCacheConfigEscolaAntecipado(usuario.bateria_id);
        renderizarAvatarHeader({ nome: usuario.nome || 'Admin', foto_url: usuario.foto_url });
        document.getElementById('headerAvatarWrap').onclick = () => trocarAba('meu-perfil', null);
        // "Trocar de Bateria" só aparece pra quem tem 2+ vínculos (mesmo
        // padrão do rodapé do Ritmista em carteirinha.html) -- achado urgente
        // da Márcia, 25/ago/2026: Mestre/Diretor com vínculo em mais de uma
        // bateria (ex: Mestre da Rocinha + Diretor da Imperatriz) ficava sem
        // NENHUM caminho de volta pra escolher a outra, exceto deslogar e
        // logar de novo -- o botão nunca tinha sido criado aqui, só em
        // carteirinha.html (Ritmista).
        if (usuario.totalVinculos > 1) {
            document.getElementById('btnTrocarBateriaNav').style.display = 'flex';
        }
        // Paraleliza os pedidos ao banco que não dependem um do outro --
        // mesmo padrão já usado em entrarContextoEscolaSA (Super Admin,
        // 25/ago/2026), só que esse caminho aqui (Mestre/Diretor comum)
        // nunca tinha recebido a mesma correção. Achado real, 05/set/2026:
        // eram 5 pedidos em fila, cada um esperando o anterior terminar sem
        // precisar -- Diretor da Rocinha reportando login/troca de aba
        // extremamente lentos, mesmo numa bateria pequena. Todos os 5 só
        // precisam do bateria_id (já sabido, veio do login), nenhum depende
        // do resultado de outro.
        const [resB] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${usuario.bateria_id}`, { headers: authHeaders }),
            carregarBibliotecaInstrumentos(),
            carregarBateriaInstrumentos(),
            carregarNomeEscolaBateria(usuario.bateria_id),
            carregarMinhasCapacidades(usuario.bateria_id),
        ]);
        construirMultiSelect();
        aplicarConfigEscola();
        // Mede a altura real do cabeçalho (depois de aplicarConfigEscola,
        // que pode aumentar essa altura com o tema/logo da escola) -- a
        // barra lateral nova (#navAbasEscola) precisa saber onde começar
        // embaixo dele. Super Admin já chamava isso pra própria barra
        // (.sa-sidebar); Mestre/Diretor nunca chamava, porque nunca teve
        // barra lateral até agora (20/ago/2026).
        ajustarAlturaHeaderAdmin();

        // Carrega bateria/escola completas -- não só o resumo de
        // carregarNomeEscolaBateria() (que só preenche configEscola pro
        // header) -- pra Dados da Escola/Dados da Bateria/Comercial
        // funcionarem pra Admin comum também, se a Márcia liberar essas
        // capacidades pra ele (antes, só Super Admin via essas abas). Esse
        // pedido (resB) já saiu junto com os outros 4 acima -- só o que
        // depende de já saber o escola_id (a busca da escola em si) espera.
        const bs = await resB.json();
        bateriaAtualData = Array.isArray(bs) && bs[0] ? bs[0] : null;
        if (bateriaAtualData && bateriaAtualData.escola_id) {
            const resE = await fetch(`${SUPABASE_URL}/rest/v1/escolas?id=eq.${bateriaAtualData.escola_id}`, { headers: authHeaders });
            const es = await resE.json();
            escolaAtualData = Array.isArray(es) && es[0] ? es[0] : null;
        }
        renderizarDadosEscolaTab();
        renderizarDadosBateriaTab();
        renderizarComercialTab();

        aplicarGatingAbas();
        aplicarGatingBotoesExportar();
        aplicarGatingNovoCadastro();
        // Precisa vir DEPOIS de carregarMinhasCapacidades -- a caixinha do
        // link decide na hora de desenhar (não com CSS depois) se mostra o
        // endereço de verdade ou o aviso mascarado (achado real, 28/ago/
        // 2026: chamar isso cedo demais deixava o link sempre mascarado
        // pra Mestre/Diretor comum, mesmo pra quem tinha a permissão).
        renderizarLinkCadastroRitmista();
        renderizarLinksCadastroDiretoria();

        document.getElementById('navAbasEscola').style.display = 'flex';
        document.getElementById('mainEscola').style.display = 'flex';
        ajustarAlturaNavMobile();
        // Espera a primeira leva de cada card terminar (ritmistas/diretoria
        // sem foto, extras, convidados) antes de tirar o spinner -- achado
        // da Márcia, 01/set/2026: a tela "montava em tempo real", cada card
        // estalando na hora que a própria busca terminava, dando impressão
        // de sistema amador. As fotos continuam chegando em segundo plano
        // depois, sem bloquear nada -- mesma otimização de sempre
        // (carregarRitmistasComFotos/carregarDiretoriaComFotos), só que
        // agora dá pra esperar só a primeira passada de cada uma.
        const cargaInicialMD = [carregarRitmistas(true)];
        // Card "Diretoria ativa" na Visão Geral (novo, 21/ago/2026) --
        // reaproveita a mesma carregarDiretoria() da aba Diretoria (fica em
        // cache pra quando ela clicar lá, sem buscar de novo). Só dispara
        // pra quem tem ver_acessos -- sem a capacidade, RLS devolveria vazio
        // e o card mostraria "0" de forma enganosa em vez de ficar escondido.
        const vejoAcessosMD = souSuperAdmin || tenhoCapacidade('ver_acessos');
        if (vejoAcessosMD) cargaInicialMD.push(carregarDiretoria(true));
        // Card "Convidados" na Visão Geral, mesmo padrão do card de Diretoria
        // acima -- achado dela, 01/set/2026: card ficava vazio até visitar a
        // aba Convidados de verdade (carregarConvidadosEspeciais() só rodava
        // lá dentro, nunca no carregamento inicial da tela).
        const vejoConvidadosMD = souSuperAdmin || tenhoCapacidade('ver_convidados_especiais');
        if (vejoConvidadosMD) cargaInicialMD.push(carregarConvidadosEspeciais(true));
        await Promise.all(cargaInicialMD);
        iniciarAutoRefreshRitmistas();
        // Fotos completas chegam depois, em segundo plano, sem travar a tela
        // nem os cliques (achado real, 05/set/2026 -- ver
        // preencherFotosRitmistasEmSegundoPlano acima).
        preencherFotosRitmistasEmSegundoPlano();
        if (vejoAcessosMD) preencherFotosDiretoriaEmSegundoPlano();
        if (vejoConvidadosMD) { convidadosEspeciaisCarregados = false; carregarConvidadosEspeciais(); }

        // Volta pra mesma aba de antes de atualizar a página (mesmo achado
        // da Márcia, 20/ago/2026, aplicado aqui também) -- "visao" já é o
        // padrão de fábrica da tela, só troca se salvou outra coisa.
        const estadoSalvoMD = lerEstadoNavegacaoSalvo();
        if (estadoSalvoMD && estadoSalvoMD.contexto === 'mestre-diretor' && estadoSalvoMD.aba && estadoSalvoMD.aba !== 'visao') {
            trocarAba(estadoSalvoMD.aba, document.querySelector(`.aba-btn[data-aba="${estadoSalvoMD.aba}"]`));
        }

        if (typeof fpRenderizarAvisoDadosProprios === 'function') fpRenderizarAvisoDadosProprios(usuario, 'avisoDadosProprios');
        esconderOverlayCarregando();
    }

    // Preenche configEscola.nomeEscola/nomeBateria com dado real -- antes desse
    // achado (17/ago/2026), esse objeto nunca era atualizado aqui, só existia
    // vazio (config-escola.js), então o cabeçalho não mostrava escola nem
    // bateria de verdade.
    let codigoConviteBateria = null;
    async function carregarNomeEscolaBateria(bateriaId) {
        if (!bateriaId) return;
        try {
            const resBateria = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${bateriaId}&select=nome,escola_id,codigo_convite`, { headers: authHeaders });
            const baterias = await resBateria.json();
            const bateria = Array.isArray(baterias) && baterias[0] ? baterias[0] : null;
            if (!bateria) return;
            configEscola.nomeBateria = bateria.nome || '';
            codigoConviteBateria = bateria.codigo_convite || bateriaId;
            if (bateria.escola_id) {
                const resEscola = await fetch(`${SUPABASE_URL}/rest/v1/escolas?id=eq.${bateria.escola_id}&select=nome,sigla,nome_curto,cor_primaria,cor_secundaria,cor_terciaria,cor_quaternaria,logo_url,tema_personalizado_ativo`, { headers: authHeaders });
                const escolas = await resEscola.json();
                const escola = Array.isArray(escolas) && escolas[0] ? escolas[0] : null;
                configEscola.nomeEscola = escola ? (escola.sigla || escola.nome || '') : '';
                configEscola.nomeEscolaCurto = escola ? (escola.nome_curto || '') : '';
                configEscola.temaPersonalizadoAtivo = !!(escola && escola.tema_personalizado_ativo);
                configEscola.corPrimariaEscola = (escola && escola.cor_primaria) || null;
                configEscola.logoEscola = (escola && escola.logo_url) || null;
                configEscola.coresEscola = escola
                    ? [escola.cor_primaria, escola.cor_secundaria, escola.cor_terciaria, escola.cor_quaternaria].filter(Boolean)
                    : [];
            }
        } catch (e) {
            // Sem dado real, header cai de volta pro vazio de fábrica -- não quebra a tela.
        }
    }

    // Links de cadastro: antes viviam numa aba própria ("Convites"), agora
    // moram dentro de Ritmistas/Diretoria (19/ago/2026 -- pedido da Márcia,
    // junto do enxugamento do menu: o link de cada cargo fica onde quem já
    // lida com aquele cargo está, em vez de numa aba isolada).
    // Título + caixa do link sempre visíveis, sem clique/seta próprios
    // (20/ago/2026, correção da Márcia: era cartão retrátil dentro de
    // outro cartão retrátil "Cadastro", exigindo dois cliques -- "é para
    // clicar uma vez no card e aparecer as duas coisas dentro... mantém
    // tudo como existe hoje, só muda o fato de ter que clicar duas
    // vezes"). Aparência do título igual à de antes (.config-item, sem a
    // seta que sugeria algo clicável); quem controla mostrar/esconder
    // agora é só o "Cadastro" por fora (toggleCadastroRitmista/
    // toggleCadastroDiretoria).
    // podeCopiar (28/ago/2026, permissão nova "Copiar Link de Cadastro"):
    // quando falso, o endereço de verdade NUNCA entra no HTML -- não é só
    // esconder visualmente, senão continuaria dando pra pegar o link
    // olhando o código da página. Mostra um aviso no lugar do campo,
    // sem input nenhum pra selecionar/copiar.
    function caixaLinkCadastro(id, titulo, linhas, podeCopiar) {
        return `
            <div class="secao-titulo" style="margin-top:4px;">${titulo}</div>
            <div style="background:#fff;border:1.5px solid #e8e6f0;border-radius:12px;padding:16px;">
                ${podeCopiar ? `<p style="font-size:13px;color:#8b88a0;margin:0 0 14px;">Envie o link por WhatsApp pra quem vai se cadastrar — pode mandar pra quantas pessoas quiser, ele não expira e não é de uso único.</p>` : ''}
                ${podeCopiar ? linhas.map((l, i) => `
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;${i > 0 ? 'margin-top:10px;' : ''}">
                    <label style="width:120px;flex-shrink:0;font-size:12px;color:#5a5770;font-weight:600;">${l.label}</label>
                    <input type="text" readonly value="${esc(l.url)}" style="flex:1;min-width:200px;padding:9px 10px;border:2px solid #e0e0e0;border-radius:8px;font-size:12px;color:#333;">
                    <button class="btn-modal-confirmar verde" onclick="copiarLinkCadastroAdmin(this)">Copiar</button>
                </div>`).join('') : `<p style="font-size:13px;color:#8b88a0;margin:0;">Link disponível — peça a alguém com mais acesso pra te enviar.</p>`}
            </div>`;
    }
    // "Cadastro" recolhido (Ritmistas/Diretoria) -- pedido da Márcia,
    // 20/ago/2026: "não vamos ficar toda hora cadastrando gente", então
    // o botão de cadastrar + o Link de cadastro só aparecem depois de
    // clicar. Mesmo padrão de seta (›/⌄) de toggleLinkCadastro acima.
    function toggleCadastroRitmista() {
        const div = document.getElementById('cadastroRitmistaConteudo');
        const seta = document.getElementById('cadastroRitmistaSeta');
        const abrindo = div.style.display === 'none';
        div.style.display = abrindo ? 'block' : 'none';
        if (seta) seta.textContent = abrindo ? '⌄' : '›';
    }
    function toggleCadastroDiretoria() {
        const div = document.getElementById('cadastroDiretoriaConteudo');
        const seta = document.getElementById('cadastroDiretoriaSeta');
        const abrindo = div.style.display === 'none';
        div.style.display = abrindo ? 'block' : 'none';
        if (seta) seta.textContent = abrindo ? '⌄' : '›';
    }
    // Mesmo padrão de Ritmistas/Diretoria, 31/ago/2026 (pedido dela: mesma
    // estética nas 3 telas).
    function toggleCadastroConvidadoEspecial() {
        const div = document.getElementById('cadastroConvidadoEspecialConteudo');
        const seta = document.getElementById('cadastroConvidadoEspecialSeta');
        const abrindo = div.style.display === 'none';
        div.style.display = abrindo ? 'block' : 'none';
        if (seta) seta.textContent = abrindo ? '⌄' : '›';
    }
    function renderizarLinkCadastroRitmista() {
        const div = document.getElementById('linkCadastroRitmista');
        if (!div) return;
        const codigo = codigoConviteBateria || bateriaIdContexto();
        if (!codigo) { div.innerHTML = ''; return; }
        const podeCopiar = souSuperAdmin || tenhoCapacidade('copiar_link_cadastro_ritmistas');
        const base = `${window.location.origin}/cadastro?bateria=${codigo}`;
        div.innerHTML = caixaLinkCadastro('linkCadastroRitmista-box', 'Link de cadastro', [{ label: 'Ritmista', url: base }], podeCopiar);
    }
    function renderizarLinksCadastroDiretoria() {
        const div = document.getElementById('linksCadastroDiretoria');
        if (!div) return;
        const codigo = codigoConviteBateria || bateriaIdContexto();
        if (!codigo) { div.innerHTML = ''; return; }
        const podeCopiar = souSuperAdmin || tenhoCapacidade('copiar_link_cadastro_diretoria');
        const base = `${window.location.origin}/cadastro?bateria=${codigo}`;
        div.innerHTML = caixaLinkCadastro('linksCadastroDiretoria-box', 'Links de cadastro', [
            { label: 'Mestre de Bateria', url: `${base}&cargo=mestre` },
            { label: 'Diretor de Bateria', url: `${base}&cargo=diretor` },
            { label: 'Diretor (Apoio)', url: `${base}&cargo=apoio` }
        ], podeCopiar);
    }

    function copiarLinkCadastroAdmin(btn) {
        const input = btn.previousElementSibling;
        input.select();
        navigator.clipboard.writeText(input.value).catch(() => {});
    }

    // Estilo Excel, 20/ago/2026 (pedido da Márcia): tudo marcado por
    // padrão -- desmarcar um item de fato tira ele da lista, em vez do
    // padrão antigo (nada marcado = mostra tudo, meio contraintuitivo).
    // "Limpar" desmarca tudo de uma vez; quando chega em zero, vira
    // "Marcar todos" (mesmo texto já usado no modal de Exportar Excel).
    function construirMultiSelect() {
        const dropdown = document.getElementById('multiSelectDropdown');
        dropdown.innerHTML = '';
        instrumentosAtivosDaBateria().forEach(inst => {
            const label = document.createElement('label');
            label.className = 'multi-select-option';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = inst.id;
            cb.checked = true;
            cb.addEventListener('change', onCheckInstrumento);
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + inst.nome));
            dropdown.appendChild(label);
        });
        const rodape = document.createElement('div');
        rodape.style.cssText = 'border-top:1px solid #eee;margin-top:6px;padding:6px 8px 2px;display:flex;justify-content:space-between;align-items:center;';
        const link = document.createElement('span');
        link.id = 'multiSelectMarcarTudo';
        link.textContent = 'Limpar';
        link.style.cssText = 'font-size:12px;color:#888;cursor:pointer;font-weight:500;';
        link.onclick = toggleMarcarTudoInstrumento;
        rodape.appendChild(link);
        // Botão "Aplicar" (27/ago/2026) -- mesma rede de segurança do
        // "Buscar": chama aplicarFiltros() por um clique explícito, não
        // só pelo onchange do checkbox (ela relatou o filtro "travando"
        // depois da 1ª tentativa).
        const btnAplicar = document.createElement('button');
        btnAplicar.type = 'button';
        btnAplicar.className = 'btn-ficha';
        btnAplicar.textContent = 'Aplicar';
        btnAplicar.style.cssText = 'padding:4px 12px;font-size:12px;';
        btnAplicar.onclick = aplicarFiltroInstrumento;
        rodape.appendChild(btnAplicar);
        dropdown.appendChild(rodape);
        filtroInstrumentosSelecionados = instrumentosAtivosDaBateria().map(i => i.id);
        const labelEl = document.getElementById('multiSelectLabel');
        if (labelEl) labelEl.textContent = 'Todos os instrumentos';
        document.getElementById('multiSelectTrigger')?.classList.remove('ativo');
    }

    function toggleMarcarTudoInstrumento() {
        const marcados = document.querySelectorAll('#multiSelectDropdown input[type=checkbox]:checked').length;
        const novoEstado = marcados === 0;
        document.querySelectorAll('#multiSelectDropdown input[type=checkbox]').forEach(c => c.checked = novoEstado);
        onCheckInstrumento();
    }

    function toggleMultiSelect() {
        const dd = document.getElementById('multiSelectDropdown');
        const arrow = document.getElementById('multiSelectArrow');
        const aberto = dd.style.display !== 'none';
        dd.style.display = aberto ? 'none' : 'block';
        arrow.textContent = aberto ? '▼' : '▲';
    }

    function onCheckInstrumento() {
        const checks = document.querySelectorAll('#multiSelectDropdown input[type=checkbox]:checked');
        filtroInstrumentosSelecionados = Array.from(checks).map(c => Number(c.value));
        const ativos = instrumentosAtivosDaBateria();
        const label = document.getElementById('multiSelectLabel');
        if (filtroInstrumentosSelecionados.length === ativos.length) {
            label.textContent = 'Todos os instrumentos';
        } else if (filtroInstrumentosSelecionados.length === 0) {
            label.textContent = 'Nenhum instrumento';
        } else {
            label.textContent = filtroInstrumentosSelecionados.map(id => (ativos.find(a => a.id === id) || {}).nome || '?').join(', ');
        }
        document.getElementById('multiSelectTrigger').classList.toggle('ativo', filtroInstrumentosSelecionados.length > 0 && filtroInstrumentosSelecionados.length < ativos.length);
        const marcarTudoEl = document.getElementById('multiSelectMarcarTudo');
        if (marcarTudoEl) marcarTudoEl.textContent = filtroInstrumentosSelecionados.length === 0 ? 'Marcar todos' : 'Limpar';
    }

    // Fecha dropdowns ao clicar fora
    document.addEventListener('click', function(e) {
        if (!document.getElementById('multiSelectWrap')?.contains(e.target)) {
            const dd = document.getElementById('multiSelectDropdown');
            if (dd) { dd.style.display = 'none'; document.getElementById('multiSelectArrow').textContent = '▼'; }
        }
        if (!document.getElementById('statusSelectWrap')?.contains(e.target)) {
            const dd = document.getElementById('statusSelectDropdown');
            if (dd) { dd.style.display = 'none'; document.getElementById('statusSelectArrow').textContent = '▼'; }
        }
        if (!document.getElementById('cargoSelectWrap')?.contains(e.target)) {
            const dd = document.getElementById('cargoSelectDropdown');
            if (dd) { dd.style.display = 'none'; document.getElementById('cargoSelectArrow').textContent = '▼'; }
        }
        if (!document.getElementById('statusDiretoriaSelectWrap')?.contains(e.target)) {
            const dd = document.getElementById('statusDiretoriaSelectDropdown');
            if (dd) { dd.style.display = 'none'; document.getElementById('statusDiretoriaSelectArrow').textContent = '▼'; }
        }
    });

    // Configurações -> capacidades de "ver" e "editar" por sub-tela (Reforma
    // de Permissões, 28/ago/2026 -- separadas depois dela pedir: "quero que
    // dê pra alguém só olhar sem poder mexer"). Quem só tem "ver" abre a
    // tela normal, mas com tudo travado/acinzentado (aplicarSomenteLeitura
    // ConfigTela) -- nunca clicável e falhando escondido.
    const CAPACIDADE_CONFIG_SUBTELA = {
        instrumentos: { ver: 'ver_instrumentos', editar: 'editar_instrumentos' },
        vagas: { ver: 'ver_vagas', editar: 'editar_vagas' },
        medidas: { ver: 'ver_medidas', editar: 'editar_medidas' },
        figurino: { ver: 'ver_figurino_bateria', editar: 'editar_figurino_bateria' },
        eventos: { ver: 'ver_eventos', editar: 'editar_eventos' },
    };
    function podeVerConfigSubtela(nome) {
        const c = CAPACIDADE_CONFIG_SUBTELA[nome];
        return !!c && (tenhoCapacidade(c.ver) || tenhoCapacidade(c.editar));
    }
    function podeEditarConfigSubtela(nome) {
        const c = CAPACIDADE_CONFIG_SUBTELA[nome];
        return !!c && tenhoCapacidade(c.editar);
    }

    function aplicarGatingConfiguracoes() {
        if (souSuperAdmin) return;
        Object.keys(CAPACIDADE_CONFIG_SUBTELA).forEach(nome => {
            const item = document.getElementById('config-item-' + nome);
            if (item) item.style.display = podeVerConfigSubtela(nome) ? '' : 'none';
        });
    }

    // Trava/destrava a sub-tela inteira pra visualização (checkbox/select/
    // input desabilitados de verdade, não só visualmente) -- mesmo padrão já
    // usado no interruptor "Ritmista edita medidas" dentro de Permissões.
    function aplicarSomenteLeituraConfigTela(nome, somenteLeitura) {
        const tela = document.getElementById('config-tela-' + nome);
        if (!tela) return;
        tela.classList.toggle('config-subtela--somente-leitura', somenteLeitura);
        tela.querySelectorAll('input, select, button').forEach(el => {
            if (el.classList.contains('btn-voltar-config')) return;
            el.disabled = somenteLeitura;
        });
    }

    // ── CONFIGURAÇÕES → INSTRUMENTOS ────────────────────────────────────
    function abrirConfigTela(nome) {
        if (!souSuperAdmin && !podeVerConfigSubtela(nome)) return;
        document.getElementById('config-lista').style.display = 'none';
        document.querySelectorAll('#painel-configuracoes .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('config-tela-' + nome).style.display = 'block';
        if (nome === 'instrumentos') renderizarConfigInstrumentos();
        if (nome === 'vagas') renderizarConfigVagas();
        if (nome === 'medidas') renderizarConfigMedidas();
        if (nome === 'figurino') renderizarConfigFigurino();
        if (nome === 'eventos') { fecharEditorEvento(); renderizarEventosLista(); }
        aplicarSomenteLeituraConfigTela(nome, !souSuperAdmin && !podeEditarConfigSubtela(nome));
    }

    function voltarConfigLista() {
        document.querySelectorAll('#painel-configuracoes .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('config-lista').style.display = 'block';
    }

    async function iniciarConfiguracoesAba() {
        voltarConfigLista();
        aplicarGatingConfiguracoes();
        // Eram 12 buscas em fila, uma esperando a outra sem necessidade
        // (nenhuma depende do resultado da outra -- só preenchem caches
        // separados, usados quando ela clica em cada sub-item) -- varredura
        // de 01/set/2026 atrás do mesmo padrão de carregamento lento.
        await Promise.all([
            bibliotecaInstrumentos.length === 0 ? carregarBibliotecaInstrumentos() : Promise.resolve(),
            carregarBateriaInstrumentos(),
            bibliotecaMedidas.length === 0 ? carregarBibliotecaMedidas() : Promise.resolve(),
            bibliotecaMedidaTipos.length === 0 ? carregarBibliotecaMedidaTipos() : Promise.resolve(),
            carregarBateriaMedidas(),
            carregarBateriaMedidaTipos(),
            bibliotecaFigurino.length === 0 ? carregarBibliotecaFigurino() : Promise.resolve(),
            carregarBateriaFigurino(),
            bibliotecaEventoTipos.length === 0 ? carregarBibliotecaEventoTipos() : Promise.resolve(),
            bibliotecaTemporadas.length === 0 ? carregarBibliotecaTemporadas() : Promise.resolve(),
            carregarEventosBateria(),
        ]);
    }

    // "Nome usado" mora na MESMA linha do título de cada grupo (Tradicionais/
    // Especiais), não solto acima da lista inteira -- achado real dela,
    // 22/ago/2026: como rótulo solto, ficava desalinhado com "Tradicionais"
    // (linhas/respiro diferentes) e "Especiais" ficava sem rótulo nenhum,
    // já que só existia 1 cabeçalho pra lista toda. Repetindo por grupo,
    // os dois sempre ficam juntos, na mesma altura.
    function renderizarConfigInstrumentos() {
        const container = document.getElementById('config-instrumentos-lista');
        const grupos = [['tradicional', 'Tradicionais'], ['especial', 'Especiais']];
        container.innerHTML = grupos.map(([chave, label]) => {
            const itens = bibliotecaInstrumentos.filter(c => c.grupo === chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
            if (itens.length === 0) return '';
            return `<div class="secao-titulo">${label}</div><div class="config-vagas-cabecalho"><span style="width:170px;text-align:center;">Nome usado</span></div>${itens.map(c => renderizarLinhaInstrumento(c)).join('')}`;
        }).join('');
    }

    // 4ª versão, 22/ago/2026: repetir "Nome usado" em toda linha (3ª
    // versão) ficou igual ao problema de Vagas -- rótulo idêntico do
    // início ao fim da lista. Achado real dela, print na mão: tira dos
    // cards, volta um cabeçalho leve único no topo (mesma receita já
    // usada em Vagas de Ritmistas -- só texto, sem caixa/fundo).
    function renderizarLinhaInstrumento(c) {
        const existente = bateriaInstrumentosCache.find(bi => bi.categoria_id === c.id);
        const ativo = !!(existente && existente.ativo);
        let nomeUsadoHtml = '';
        if (ativo && c.nomenclaturas.length > 0) {
            nomeUsadoHtml = `
                <select class="config-instrumento-nomenclatura" onchange="salvarInstrumentoBateria(${c.id}, true, this.value)">
                    ${[...c.nomenclaturas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(n => `<option value="${n.id}" ${existente && existente.nomenclatura_id === n.id ? 'selected' : ''}>${n.nome}</option>`).join('')}
                </select>`;
        } else if (ativo) {
            nomeUsadoHtml = `<span class="config-instrumento-nome-usado-fixo">${esc(c.nome)}</span>`;
        }
        return `
            <div class="item-card">
                <label class="config-instrumento-check">
                    <input type="checkbox" ${ativo ? 'checked' : ''} onchange="salvarInstrumentoBateria(${c.id}, this.checked)">
                    <span class="item-nome">${c.nome}</span>
                </label>
                ${nomeUsadoHtml}
            </div>`;
    }

    async function salvarInstrumentoBateria(categoriaId, ativo, nomenclaturaId) {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) return;
        const existente = bateriaInstrumentosCache.find(bi => bi.categoria_id === categoriaId);

        if (existente) {
            const payload = { ativo };
            if (nomenclaturaId !== undefined) payload.nomenclatura_id = nomenclaturaId ? Number(nomenclaturaId) : null;
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_instrumentos?id=eq.${existente.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify(payload)
            });
        } else {
            const cat = bibliotecaInstrumentos.find(c => c.id === categoriaId);
            const nomenclaturaPadrao = cat && cat.nomenclaturas.length > 0 ? cat.nomenclaturas[0].id : null;
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_instrumentos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ bateria_id: bateriaId, categoria_id: categoriaId, nomenclatura_id: nomenclaturaPadrao, ativo, vagas: 0 })
            });
        }
        await carregarBateriaInstrumentos();
        renderizarConfigInstrumentos();
        construirMultiSelect();
    }

    // ── CONFIGURAÇÕES → VAGAS DE RITMISTAS ──────────────────────────────
    function renderizarConfigVagas() {
        const container = document.getElementById('config-vagas-lista');
        const ativos = bateriaInstrumentosCache.filter(bi => bi.ativo);
        const totalEl = document.getElementById('config-vagas-total-numero');
        if (totalEl) totalEl.textContent = ativos.reduce((soma, bi) => soma + (bi.vagas || 0), 0);
        if (ativos.length === 0) {
            container.innerHTML = '<div class="estado-vazio">Nenhum instrumento ativo ainda. Ative instrumentos em "Instrumentos" primeiro.</div>';
            return;
        }
        const contagem = {};
        todosRitmistas.filter(r => r.status === 'aprovado' && !r.nao_desfila).forEach(r => {
            if (r.bateria_instrumento_id) contagem[r.bateria_instrumento_id] = (contagem[r.bateria_instrumento_id] || 0) + 1;
        });
        container.innerHTML = ativos
            .slice()
            .sort((a, b) => nomeExibicaoBateriaInstrumento(a).localeCompare(nomeExibicaoBateriaInstrumento(b), 'pt-BR'))
            .map(bi => {
                const atual = contagem[bi.id] || 0;
                const semVaga = !bi.vagas || bi.vagas === 0;
                const excedeu = !semVaga && atual > bi.vagas;
                const completo = !semVaga && atual === bi.vagas;
                // "Faltam N" -- mesmo sinalizador discreto da Visão Geral
                // (21/ago/2026), reaproveitado aqui: só aparece com vaga
                // definida e ainda não preenchida. Bateu o número, some --
                // a pílula verde de "completo" já avisa sozinha.
                const faltam = (!semVaga && atual < bi.vagas) ? (bi.vagas - atual) : 0;
                return `
                <div class="item-card">
                    <div class="item-info">
                        <div class="item-nome">${nomeExibicaoBateriaInstrumento(bi)}</div>
                    </div>
                    <div class="item-acoes">
                        <span style="display:flex;align-items:center;gap:14px;">
                            ${avisoVagaHtml({ semVaga, faltam })}
                            <span class="config-vaga-contagem${(excedeu || semVaga) ? ' excedeu' : completo ? ' completo' : ''}">${atual}</span>
                        </span>
                        <input type="number" min="0" class="config-vaga-input" value="${bi.vagas || 0}" onchange="salvarVaga(${bi.id}, this.value)">
                    </div>
                </div>`;
            }).join('');
    }

    async function salvarVaga(bateriaInstrumentoId, valor) {
        const vagas = parseInt(valor) || 0;
        await fetch(`${SUPABASE_URL}/rest/v1/bateria_instrumentos?id=eq.${bateriaInstrumentoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ vagas })
        });
        const item = bateriaInstrumentosCache.find(bi => bi.id === bateriaInstrumentoId);
        if (item) item.vagas = vagas;
        renderizarConfigVagas();
    }

    // ── CONFIGURAÇÕES → MEDIDAS ──────────────────────────────────────────
    // Reforma de 23/ago/2026: Camisa/Fantasia/Calça/Sapato deixaram de ser
    // 4 tipos fixos no código -- viraram biblioteca mestre (medida_tipos),
    // mesmo padrão de Instrumentos. Tudo abaixo referencia tipo_id (bigint),
    // não mais um texto fixo ('camisa'/'fantasia'/...).

    async function carregarBibliotecaMedidas() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/medida_tamanhos?order=ordem`, { headers: authHeaders });
        bibliotecaMedidas = await res.json();
    }

    async function carregarBibliotecaMedidaTipos() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/medida_tipos?ativo=eq.true&order=ordem`, { headers: authHeaders });
        bibliotecaMedidaTipos = await res.json();
    }

    async function carregarBateriaMedidas() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { bateriaMedidasCache = []; return; }
        const res = await fetch(`${SUPABASE_URL}/rest/v1/bateria_medidas?bateria_id=eq.${bateriaId}`, { headers: authHeaders });
        bateriaMedidasCache = await res.json();
    }

    // Liga/desliga o TIPO inteiro (Camisa/Fantasia/Calça/Sapato/etc) pra essa
    // bateria -- pedido da Márcia, 22/ago/2026: nem toda bateria pergunta
    // Calça, por exemplo. Diferente de bateriaMedidasCache, que liga/desliga
    // cada TAMANHO dentro de um tipo já ativo.
    async function carregarBateriaMedidaTipos() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { bateriaMedidaTiposCache = []; return; }
        const res = await fetch(`${SUPABASE_URL}/rest/v1/bateria_medida_tipos?bateria_id=eq.${bateriaId}`, { headers: authHeaders });
        bateriaMedidaTiposCache = await res.json();
    }

    async function carregarBibliotecaFigurino() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/figurino_itens_mestre?ativo=eq.true&order=ordem`, { headers: authHeaders });
        bibliotecaFigurino = res.ok ? await res.json() : [];
    }
    async function carregarBateriaFigurino() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { bateriaFigurinoCache = []; return; }
        const res = await fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?bateria_id=eq.${bateriaId}`, { headers: authHeaders });
        bateriaFigurinoCache = res.ok ? await res.json() : [];
    }

    // Redesenhado em 22/ago/2026 (2ª versão -- achado dela na 1ª: "Esta
    // bateria usa Camisa" lia como frase de formulário, amadora demais pra
    // um sistema sério). Agora é um card fechado, igual Instrumentos (só
    // checkbox + nome) -- clicar no card abre/fecha os tamanhos por dentro
    // dele, em vez de despejar tudo sempre visível embaixo. Fechado/aberto
    // é só estado de tela (medidaTiposAbertos), não precisa salvar em
    // lugar nenhum.
    let medidaTiposAbertos = new Set();
    function toggleMedidaTipoAberto(tipoId) {
        if (medidaTiposAbertos.has(tipoId)) medidaTiposAbertos.delete(tipoId);
        else medidaTiposAbertos.add(tipoId);
        renderizarConfigMedidas();
    }
    // Agrupado em Tradicionais/Especiais desde 24/ago/2026 (pedido dela) --
    // volta a fazer sentido ter título de grupo agora que "Especial" reúne
    // categorias pontuais de verdade (mais de um card por grupo), diferente
    // do card único e redundante que motivou tirar o título em 22/ago/2026.
    // Quem preenche essa Categoria de Figurino no cadastro/ficha -- pedido
    // dela, 25/ago/2026: descobriu que Calça de Diretoria usa número
    // (36/38/40...) e a de Ritmista usa P/M/G, escalas diferentes de
    // verdade. Solução: cada bateria pode restringir uma categoria a só
    // alguns públicos (checkboxes, não um valor só -- diferente do Figurino/
    // peça, que é sempre de um público único) e criar uma categoria nova só
    // pra Diretoria com a escala certa, mantendo a antiga só pra Ritmista.
    const PERFIS_PUBLICO_MEDIDA = [['ritmista', 'Ritmista'], ['mestre', 'Mestre'], ['diretor', 'Diretor de Bateria'], ['apoio', 'Diretor (Apoio)'], ['extra', 'Convidados']];
    function publicoMedidaTipo(tipoExistente) {
        if (!tipoExistente || !Array.isArray(tipoExistente.publico)) return ['ritmista', 'mestre', 'diretor', 'apoio', 'extra'];
        return tipoExistente.publico;
    }
    function cardConfigMedidaTipo(tipo) {
        const itens = bibliotecaMedidas.filter(t => t.tipo_id === tipo.id).sort((a, b) => a.ordem - b.ordem);
        if (itens.length === 0) return '';
        const tipoExistente = bateriaMedidaTiposCache.find(bmt => bmt.tipo_id === tipo.id);
        const tipoAtivo = !!(tipoExistente && tipoExistente.ativo); // sem linha = desligado, mesmo padrão de Instrumentos
        const aberto = medidaTiposAbertos.has(tipo.id);
        const publico = publicoMedidaTipo(tipoExistente);
        return `
            <div class="item-card config-medida-card">
                <div class="config-medida-header" onclick="toggleMedidaTipoAberto(${tipo.id})">
                    <label class="config-instrumento-check" onclick="event.stopPropagation()">
                        <input type="checkbox" ${tipoAtivo ? 'checked' : ''} onchange="salvarMedidaTipo(${tipo.id}, this.checked)">
                        <span class="item-nome">${tipo.nome}</span>
                    </label>
                    <span class="config-medida-seta ${aberto ? 'aberta' : ''}">›</span>
                </div>
                ${aberto ? `<div class="config-medida-tamanhos">
                    <div class="config-medida-publico">
                        <div class="config-medida-publico-label">Quem preenche esta categoria</div>
                        <div class="config-medida-publico-itens">
                            ${PERFIS_PUBLICO_MEDIDA.map(([chave, label]) => `
                                <label class="config-instrumento-check">
                                    <input type="checkbox" ${publico.includes(chave) ? 'checked' : ''} ${tipoAtivo ? '' : 'disabled'} onchange="salvarMedidaTipoPublico(${tipo.id}, '${chave}', this.checked)">
                                    <span>${label}</span>
                                </label>`).join('')}
                        </div>
                    </div>
                    ${itens.map(t => renderizarLinhaMedida(t)).join('')}
                </div>` : ''}
            </div>`;
    }
    function renderizarConfigMedidas() {
        const container = document.getElementById('config-medidas-lista');
        container.innerHTML = GRUPOS_MEDIDA_TIPO.map(([chave, label]) => {
            const tipos = bibliotecaMedidaTipos.filter(t => (t.grupo || 'tradicional') === chave && bibliotecaMedidas.some(m => m.tipo_id === t.id));
            if (tipos.length === 0) return '';
            return `<div class="secao-titulo">${label}</div>${tipos.map(cardConfigMedidaTipo).join('')}`;
        }).join('');
    }

    function renderizarLinhaMedida(t) {
        const existente = bateriaMedidasCache.find(bm => bm.tamanho_id === t.id);
        const ativo = !!(existente && existente.ativo);
        return `
            <div class="config-instrumento-linha">
                <label class="config-instrumento-check">
                    <input type="checkbox" ${ativo ? 'checked' : ''} onchange="salvarMedidaBateria(${t.id}, this.checked)">
                    <span>${t.nome}</span>
                </label>
            </div>`;
    }

    async function salvarMedidaTipo(tipoId, ativo) {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) return;
        const existente = bateriaMedidaTiposCache.find(bmt => bmt.tipo_id === tipoId);
        if (existente) {
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_medida_tipos?id=eq.${existente.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ ativo })
            });
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_medida_tipos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ bateria_id: bateriaId, tipo_id: tipoId, ativo })
            });
        }
        await carregarBateriaMedidaTipos();
        renderizarConfigMedidas();
    }

    // Só existe pra editar categoria já ativada -- checkbox de público vem
    // desabilitado quando a categoria ainda está desligada (ver
    // cardConfigMedidaTipo).
    async function salvarMedidaTipoPublico(tipoId, perfil, checked) {
        const existente = bateriaMedidaTiposCache.find(bmt => bmt.tipo_id === tipoId);
        if (!existente) return;
        const atual = publicoMedidaTipo(existente);
        const novo = checked ? [...new Set([...atual, perfil])] : atual.filter(p => p !== perfil);
        await fetch(`${SUPABASE_URL}/rest/v1/bateria_medida_tipos?id=eq.${existente.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ publico: novo })
        });
        await carregarBateriaMedidaTipos();
        renderizarConfigMedidas();
    }

    async function salvarMedidaBateria(tamanhoId, ativo) {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) return;
        const existente = bateriaMedidasCache.find(bm => bm.tamanho_id === tamanhoId);

        if (existente) {
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_medidas?id=eq.${existente.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ ativo })
            });
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_medidas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ bateria_id: bateriaId, tamanho_id: tamanhoId, ativo })
            });
        }
        await carregarBateriaMedidas();
        renderizarConfigMedidas();
    }

    // ── CONFIGURAÇÕES → FIGURINO (bateria escolhe, dentre a lista mestre,
    // quais peças usa nesta temporada) -- separado por público (Ritmistas
    // sempre antes de Diretoria, pedido dela) e depois por Categoria de
    // Figurino. Nasce tudo desligado -- mesmo padrão de Instrumentos.
    // Público de uma peça de Figurino é sempre um dos 4 valores de perfil
    // (nunca um bloco agrupado "diretoria") -- pedido da Márcia, 24/ago/2026,
    // pra preparar o sistema pra bateria que queira peça diferente por
    // Mestre/Diretor/Apoio. Ordem sempre Ritmistas primeiro.
    const LABEL_PUBLICO_FIGURINO = { ritmista: 'Ritmistas', mestre: 'Mestres', diretor: 'Diretores de Bateria', apoio: 'Diretores (Apoio)' };
    const ORDEM_PUBLICO_FIGURINO = ['ritmista', 'mestre', 'diretor', 'apoio'];
    // "Público" e "Incluir Convidados" deixaram de ser decisão global do item
    // mestre e viraram ativação POR BATERIA (31/ago/2026, pedido dela --
    // "Não tem como o Super Admin saber quem vai ter a camisa da final"),
    // mesmo padrão já usado em Categoria de Figurino/Medida
    // (publicoMedidaTipo). Sem valor ainda em bateria_figurino_itens.publico
    // = todos os 4 públicos (mesmo fallback usado lá).
    function publicoFigurinoBateria(bf) {
        if (!bf || !Array.isArray(bf.publico)) return ['ritmista', 'mestre', 'diretor', 'apoio'];
        return bf.publico;
    }
    // Junta o item global (nome/categoria) com a decisão desta bateria
    // (publico/inclui_extras) -- usado em todo lugar que precisa do item
    // "pronto pra uso" dentro de uma bateria (lista de entrega, ficha, etc.).
    function itemFigurinoComBateria(itemGlobal) {
        const bf = bateriaFigurinoCache.find(x => x.figurino_item_mestre_id === itemGlobal.id);
        return { ...itemGlobal, publico: publicoFigurinoBateria(bf), inclui_extras: !!(bf && bf.inclui_extras) };
    }
    let figurinoConfigAbertos = new Set();
    function toggleFigurinoConfigAberto(itemId) {
        if (figurinoConfigAbertos.has(itemId)) figurinoConfigAbertos.delete(itemId);
        else figurinoConfigAbertos.add(itemId);
        renderizarConfigFigurino();
    }
    function renderizarConfigFigurino() {
        const container = document.getElementById('config-figurino-lista');
        if (!container) return;
        if (bibliotecaFigurino.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">👕</div>Nenhum Figurino cadastrado na lista mestre ainda. Peça pro Super Admin cadastrar em Configurações → Figurino.</div>'; return; }
        // Agrupa por Categoria de Figurino, não mais por público (mesmo
        // achado dela na lista mestre, 27/ago/2026) -- evita a mesma peça
        // repetir numa seção pra cada público que ela cobre.
        const categoriaIds = [...new Set(bibliotecaFigurino.map(f => f.medida_tipo_id))];
        const categorias = categoriaIds.map(id => bibliotecaMedidaTipos.find(t => t.id === id)).filter(Boolean)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        container.innerHTML = categorias.map(cat => {
            const itensCat = bibliotecaFigurino.filter(f => f.medida_tipo_id === cat.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
            if (itensCat.length === 0) return '';
            return `<div class="secao-titulo">${esc(cat.nome)}</div>${itensCat.map(f => renderizarLinhaFigurinoConfig(f)).join('')}`;
        }).join('');
    }
    // Card fechado (mesmo padrão de cardConfigMedidaTipo) -- clicar abre o
    // Público/Incluir Convidados por dentro, só editável quando a peça já
    // está ativa nesta bateria.
    function renderizarLinhaFigurinoConfig(f) {
        const existente = bateriaFigurinoCache.find(bf => bf.figurino_item_mestre_id === f.id);
        const ativo = !!(existente && existente.ativo);
        const aberto = figurinoConfigAbertos.has(f.id);
        const publico = publicoFigurinoBateria(existente);
        const incluiExtras = !!(existente && existente.inclui_extras);
        return `
            <div class="item-card config-medida-card">
                <div class="config-medida-header" onclick="toggleFigurinoConfigAberto(${f.id})">
                    <label class="config-instrumento-check" onclick="event.stopPropagation()">
                        <input type="checkbox" ${ativo ? 'checked' : ''} onchange="salvarFigurinoBateria(${f.id}, this.checked)">
                        <span class="item-nome">${esc(f.nome)}</span>
                    </label>
                    <span class="config-medida-seta ${aberto ? 'aberta' : ''}">›</span>
                </div>
                ${aberto ? `<div class="config-medida-tamanhos">
                    <div class="config-medida-publico">
                        <div class="config-medida-publico-label">Público</div>
                        <div class="config-medida-publico-itens">
                            ${ORDEM_PUBLICO_FIGURINO.map(p => `
                                <label class="config-instrumento-check">
                                    <input type="checkbox" ${publico.includes(p) ? 'checked' : ''} ${ativo ? '' : 'disabled'} onchange="salvarFigurinoPublico(${f.id}, '${p}', this.checked)">
                                    <span>${LABEL_PUBLICO_FIGURINO[p]}</span>
                                </label>`).join('')}
                            <label class="config-instrumento-check">
                                <input type="checkbox" ${incluiExtras ? 'checked' : ''} ${ativo ? '' : 'disabled'} onchange="salvarFigurinoIncluiExtras(${f.id}, this.checked)">
                                <span>Convidados</span>
                            </label>
                        </div>
                    </div>
                </div>` : ''}
            </div>`;
    }
    async function salvarFigurinoBateria(figurinoItemMestreId, ativo) {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) return;
        const existente = bateriaFigurinoCache.find(bf => bf.figurino_item_mestre_id === figurinoItemMestreId);
        if (existente) {
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?id=eq.${existente.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ ativo })
            });
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ bateria_id: bateriaId, figurino_item_mestre_id: figurinoItemMestreId, ativo })
            });
        }
        await carregarBateriaFigurino();
        renderizarConfigFigurino();
    }
    // Só existe pra editar peça já ativada -- checkbox vem desabilitado
    // quando a peça ainda está desligada (ver renderizarLinhaFigurinoConfig).
    async function salvarFigurinoPublico(figurinoItemMestreId, perfil, checked) {
        const existente = bateriaFigurinoCache.find(bf => bf.figurino_item_mestre_id === figurinoItemMestreId);
        if (!existente) return;
        const atual = publicoFigurinoBateria(existente);
        const novo = checked ? [...new Set([...atual, perfil])] : atual.filter(p => p !== perfil);
        if (novo.length === 0) { mostrarToast('Mantenha pelo menos um público marcado.', 'erro'); renderizarConfigFigurino(); return; }
        await fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?id=eq.${existente.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ publico: novo })
        });
        await carregarBateriaFigurino();
        renderizarConfigFigurino();
    }
    async function salvarFigurinoIncluiExtras(figurinoItemMestreId, checked) {
        const existente = bateriaFigurinoCache.find(bf => bf.figurino_item_mestre_id === figurinoItemMestreId);
        if (!existente) return;
        await fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?id=eq.${existente.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ inclui_extras: checked })
        });
        await carregarBateriaFigurino();
        renderizarConfigFigurino();
    }

    // ══════════════════════════════════════════════════════════════════
    // FIGURINO — ENTREGA (24/ago/2026, reestruturado com lista mestre) --
    // cadastro/ativação da peça mora em Configurações → Figurino (Super
    // Admin cadastra na lista mestre, bateria liga o que usa); aqui só
    // controle de entregue/não entregue, separado por público (Ritmistas
    // sempre antes de Diretoria, decisão da Márcia -- são peças diferentes,
    // não pode misturar) e depois por Categoria de Figurino.
    // ══════════════════════════════════════════════════════════════════
    let figurinoEntregaItemAtual = null;
    let figurinoEntregaPessoasCache = [];
    // Qual "lado" a lista mostra agora -- só importa quando a peça cobre
    // Ritmista(s) E Diretoria ao mesmo tempo (27/ago/2026); nasce no lado
    // que a peça cobrir primeiro (Ritmista, se cobrir).
    let figurinoEntregaLadoAtual = 'ritmista';

    function voltarFigurinoLista() {
        fecharQrFigurino();
        document.querySelectorAll('#painel-figurino .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('figurino-lista').style.display = 'block';
    }

    async function iniciarFigurinoTab() {
        // Busca tudo ANTES de trocar a tela visível -- nenhum spinner, nenhum
        // overlay, nenhuma etapa intermediária (achado dela, 01/set/2026,
        // depois de 2 tentativas erradas): mesmo modelo de Ritmistas/
        // Diretoria, a lista só aparece quando já estiver pronta de vez.
        await Promise.all([
            bibliotecaMedidaTipos.length === 0 ? carregarBibliotecaMedidaTipos() : Promise.resolve(),
            bibliotecaFigurino.length === 0 ? carregarBibliotecaFigurino() : Promise.resolve(),
            carregarBateriaFigurino(),
        ]);
        voltarFigurinoLista();
        renderizarFigurinoLista();
    }

    function renderizarFigurinoLista() {
        const container = document.getElementById('figurino-itens-lista');
        if (!container) return;
        const ativosIds = new Set(bateriaFigurinoCache.filter(bf => bf.ativo).map(bf => bf.figurino_item_mestre_id));
        const itensAtivos = bibliotecaFigurino.filter(f => ativosIds.has(f.id)).map(itemFigurinoComBateria);
        if (itensAtivos.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">👕</div>Nenhum Figurino ativo nesta bateria ainda. Ative em Configurações → Figurino.</div>'; return; }
        // Agrupa por Categoria de Figurino, não mais por público (27/ago/2026)
        // -- senão a mesma peça (mesmo clique, mesma tela de entrega) aparecia
        // repetida uma vez por público que ela cobre.
        const categoriaIds = [...new Set(itensAtivos.map(f => f.medida_tipo_id))];
        const categorias = categoriaIds.map(id => bibliotecaMedidaTipos.find(t => t.id === id)).filter(Boolean)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        container.innerHTML = categorias.map(cat => {
            const itensCat = itensAtivos.filter(f => f.medida_tipo_id === cat.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
            if (itensCat.length === 0) return '';
            return `<div class="secao-titulo">${esc(cat.nome)}</div>` + itensCat.map(it => `
                    <div class="item-card item-card-simples" onclick="abrirEntregasFigurino(${it.id})" style="cursor:pointer;">
                        <div class="item-info"><div class="item-nome">${esc(it.nome)}</div><div class="item-detalhe">Público: ${esc(it.publico.map(p => LABEL_PUBLICO_FIGURINO[p]).concat(it.inclui_extras ? ['Convidados'] : []).join(', '))}</div></div>
                        <span class="config-item-seta">›</span>
                    </div>`).join('');
        }).join('');
    }

    // ── Tela de entregas (por Figurino) ──────────────────────────────────
    async function abrirEntregasFigurino(itemId) {
        const itemGlobal = bibliotecaFigurino.find(i => i.id === itemId);
        if (!itemGlobal) return;
        const item = itemFigurinoComBateria(itemGlobal);
        figurinoEntregaItemAtual = item;
        // Nasce no lado Ritmista se a peça cobrir Ritmista, senão Diretoria
        // -- só existe escolha de verdade quando cobre os dois (ver
        // renderizarFiltroLadoFigurino).
        figurinoEntregaLadoAtual = item.publico.includes('ritmista') ? 'ritmista' : 'diretoria';
        // Busca tudo ANTES de trocar a tela visível -- fica na lista de
        // itens, sem nada "carregando" (nem spinner, nem overlay), até a
        // tela de entregas estar pronta pra aparecer já montada de uma vez.
        // Achado dela, 01/set/2026, depois de 2 tentativas erradas (spinner
        // interno, depois overlay de tela cheia): o modelo certo é o mesmo
        // de Ritmistas/Diretoria -- nenhuma etapa intermediária visível.
        await carregarEntregasFigurino();
        document.getElementById('figurino-lista').style.display = 'none';
        document.querySelectorAll('#painel-figurino .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('figurino-tela-entregas').style.display = 'block';
        document.getElementById('figurino-entregas-titulo').textContent = item.nome;
        document.getElementById('figurino-entregas-busca').value = '';
        renderFigurinoTrilhos();
        // Botão de QR e o risquinho ao lado dele só aparecem junto (30/ago/
        // 2026, mesmo padrão de Presença) -- os interruptores continuam
        // sempre visíveis (nunca tiveram gate próprio, diferente de Presença
        // onde Iniciado/Finalizado depende de editar_eventos).
        const podeEditarFigurino = souSuperAdmin || tenhoCapacidade('editar_figurino');
        const qrBtnsFigurino = document.getElementById('figurino-qr-btns');
        if (qrBtnsFigurino) qrBtnsFigurino.style.display = podeEditarFigurino ? 'flex' : 'none';
        const divisor2Figurino = document.getElementById('figurino-divisor-2');
        if (divisor2Figurino) divisor2Figurino.style.display = podeEditarFigurino ? 'block' : 'none';
    }

    // Mesmo padrão de renderPresencaTrilhos -- reflete o estado real
    // (bateriaFigurinoCache) nos 2 interruptores (Entrega Iniciada/
    // Finalizada), sem mudar o texto do rótulo (só cor/posição).
    function renderFigurinoTrilhos() {
        const item = figurinoEntregaItemAtual;
        if (!item) return;
        const bf = bateriaFigurinoCache.find(x => x.figurino_item_mestre_id === item.id);
        const aplicar = (idTrecho, idLabel, ligado) => {
            const trecho = document.getElementById(idTrecho);
            const label = document.getElementById(idLabel);
            if (!trecho || !label) return;
            trecho.classList.toggle('on', ligado);
            trecho.classList.toggle('off', !ligado);
            label.classList.toggle('on', ligado);
            label.classList.toggle('off', !ligado);
        };
        aplicar('figurino-trilho-iniciada', 'figurino-trilho-iniciada-label', !!(bf && bf.mostra_visao_geral));
        aplicar('figurino-trilho-finalizada', 'figurino-trilho-finalizada-label', !!(bf && bf.entrega_finalizada));
    }
    function toggleMostraVisaoGeralClick() {
        const item = figurinoEntregaItemAtual;
        const bf = item && bateriaFigurinoCache.find(x => x.figurino_item_mestre_id === item.id);
        toggleMostraVisaoGeral(!(bf && bf.mostra_visao_geral));
        renderFigurinoTrilhos();
    }
    function toggleEntregaFinalizadaClick() {
        const item = figurinoEntregaItemAtual;
        const bf = item && bateriaFigurinoCache.find(x => x.figurino_item_mestre_id === item.id);
        toggleEntregaFinalizada(!(bf && bf.entrega_finalizada));
        renderFigurinoTrilhos();
    }

    // Cada valor de público mapeia direto pro mesmo grupo em extras.grupo --
    // não existe mais bloco combinado "diretoria" (27/ago/2026, peça agora
    // pode cobrir vários públicos ao mesmo tempo). "mestre" fica de fora --
    // não existe "Convidado do Mestre" ("só o Mestre que é único mesmo").
    // Só entra na conta se "Incluir Extras" estiver ligado na peça
    // (Super Admin → Configurações → Figurino).
    function gruposExtraDoPublico(publicoArray) { return publicoArray.filter(p => p !== 'mestre'); }
    // Ritmista é seu próprio "lado"; Mestre/Diretor/Apoio formam o "lado"
    // Diretoria -- usado pelo filtro de 2 opções da tela de Entrega, quando
    // a peça cobre os dois lados ao mesmo tempo.
    function ladoDoPerfil(perfil) { return perfil === 'ritmista' ? 'ritmista' : 'diretoria'; }

    // Dois interruptores independentes de bateria_figurino_itens, pedido da
    // Márcia, 24/ago/2026: ativar a peça em Configurações (com
    // antecedência) não quer dizer que ela deve aparecer na Visão Geral --
    // "Entrega Iniciada" nasce sempre desligada, a pessoa liga quando
    // quiser acompanhar. "Entrega Finalizada" marca o fim de verdade
    // (nada mais pra entregar pra ninguém) -- também esconde, mesmo com
    // "Entrega Iniciada" ligado (ver o `&&` em
    // carregarResumoEntregaFigurino). A peça sempre
    // tem uma linha em bateriaFigurinoCache nesse ponto (só chega aqui
    // vindo da lista de ativas).
    async function salvarFlagFigurinoEntrega(campo, valor) {
        const item = figurinoEntregaItemAtual;
        if (!item) return;
        const existente = bateriaFigurinoCache.find(bf => bf.figurino_item_mestre_id === item.id);
        if (!existente) return;
        existente[campo] = valor;
        // Botão de marcar entrega depende desse interruptor (04/set/2026) --
        // re-renderiza na hora, sem precisar sair e voltar da tela.
        renderizarEntregasFigurinoLista();
        await fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?id=eq.${existente.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ [campo]: valor })
        });
        carregarResumoEntregaFigurino();
    }
    function toggleMostraVisaoGeral(ligado) { salvarFlagFigurinoEntrega('mostra_visao_geral', ligado); }
    function toggleEntregaFinalizada(ligado) { salvarFlagFigurinoEntrega('entrega_finalizada', ligado); }

    async function carregarEntregasFigurino() {
        const item = figurinoEntregaItemAtual;
        if (!item) return;
        const bateriaId = bateriaIdContexto();
        const container = document.getElementById('figurino-entregas-lista');
        // Peça pode cobrir vários públicos ao mesmo tempo agora (27/ago/2026)
        // -- busca todo mundo relevante de uma vez (perfil=in.(...)); qual
        // "lado" (Ritmista/Diretoria) a lista mostra é decidido depois, na
        // renderização, pelo filtro figurinoEntregaLadoAtual.
        // eh_convidado=eq.false (31/ago/2026): Convidado Especial tem sua
        // própria conta separada abaixo, nunca some escondido dentro de
        // Ritmistas/Diretoria (mesmo raciocínio de carregarRitmistas()).
        const especial = modoConvidadosEspecial();
        const buscas = [
            fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&status=eq.aprovado&eh_convidado=eq.false&perfil=in.(${item.publico.join(',')})&order=nome&select=id,nome,apelido,perfil,instrumento_nome`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/vinculos_medidas?tipo_id=eq.${item.medida_tipo_id}`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/figurino_entregas?figurino_item_id=eq.${item.id}&vinculo_id=not.is.null`, { headers: authHeaders }),
        ];
        const gruposExtras = gruposExtraDoPublico(item.publico);
        const usaConvidados = item.inclui_extras && gruposExtras.length > 0;
        // "Convidados" pode significar 2 coisas bem diferentes por baixo,
        // dependendo do modo da bateria (mesmo gate de modoConvidadosEspecial
        // usado na aba Convidados) -- Convidado Especial é um vínculo de
        // verdade, então reaproveita vinculos_medidas/figurino_entregas.
        // vinculo_id (já buscados acima) em vez das tabelas extras/
        // extras_medidas, exclusivas do Convidado Simples.
        if (usaConvidados) {
            if (especial) {
                buscas.push(fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&status=eq.aprovado&eh_convidado=eq.true&perfil=in.(${gruposExtras.join(',')})&order=nome&select=id,nome,apelido,perfil`, { headers: authHeaders }));
            } else {
                buscas.push(
                    fetch(`${SUPABASE_URL}/rest/v1/extras?bateria_id=eq.${bateriaId}&grupo=in.(${gruposExtras.join(',')})&order=nome`, { headers: authHeaders }),
                    fetch(`${SUPABASE_URL}/rest/v1/extras_medidas?tipo_id=eq.${item.medida_tipo_id}`, { headers: authHeaders }),
                    fetch(`${SUPABASE_URL}/rest/v1/figurino_entregas?figurino_item_id=eq.${item.id}&extra_id=not.is.null`, { headers: authHeaders }),
                );
            }
        }
        const [resPessoas, resValores, resEntregas, ...resto] = await Promise.all(buscas);
        const pessoas = resPessoas.ok ? await resPessoas.json() : [];
        const valores = resValores.ok ? await resValores.json() : [];
        const entregas = resEntregas.ok ? await resEntregas.json() : [];
        const valorPorVinculo = {}; valores.forEach(v => { valorPorVinculo[v.vinculo_id] = v.valor; });
        const entregaPorVinculo = {}; entregas.forEach(e => { entregaPorVinculo[e.vinculo_id] = e; });
        const linhasPessoas = pessoas.map(p => ({
            tipo: 'vinculo', id: p.id, nome: p.nome, apelido: p.apelido, perfil: p.perfil,
            instrumento_nome: p.instrumento_nome || null,
            tamanho: valorPorVinculo[p.id] || null,
            entregue: !!(entregaPorVinculo[p.id] && entregaPorVinculo[p.id].entregue_em),
        }));
        let linhasExtras = [];
        if (usaConvidados && especial) {
            const [resConvidados] = resto;
            const convidados = resConvidados.ok ? await resConvidados.json() : [];
            // Convidado Especial é vínculo de verdade -- tamanho/entrega já
            // vieram junto em valorPorVinculo/entregaPorVinculo acima (mesma
            // tabela de todo mundo, sem busca extra).
            linhasExtras = convidados.map(c => ({
                tipo: 'extra', id: c.id, nome: c.nome, apelido: c.apelido, perfil: c.perfil,
                instrumento_nome: null,
                tamanho: valorPorVinculo[c.id] || null,
                entregue: !!(entregaPorVinculo[c.id] && entregaPorVinculo[c.id].entregue_em),
            }));
        } else if (usaConvidados) {
            const [resExtras, resExtrasValores, resExtrasEntregas] = resto;
            const extras = resExtras.ok ? await resExtras.json() : [];
            const valoresExtras = resExtrasValores.ok ? await resExtrasValores.json() : [];
            const entregasExtras = resExtrasEntregas.ok ? await resExtrasEntregas.json() : [];
            const valorPorExtra = {}; valoresExtras.forEach(v => { valorPorExtra[v.extra_id] = v.valor; });
            const entregaPorExtra = {}; entregasExtras.forEach(e => { entregaPorExtra[e.extra_id] = e; });
            // perfil recebe o próprio grupo do Convidado (ritmista/diretor/
            // apoio) -- ladoDoPerfil() trata igual ao perfil de um vínculo.
            linhasExtras = extras.map(e => ({
                tipo: 'extra', id: e.id, nome: e.nome, apelido: null, perfil: e.grupo,
                instrumento_nome: null,
                tamanho: valorPorExtra[e.id] || null,
                entregue: !!(entregaPorExtra[e.id] && entregaPorExtra[e.id].entregue_em),
            }));
        }
        figurinoEntregaPessoasCache = linhasPessoas.concat(linhasExtras);
        renderizarFiltroLadoFigurino();
        popularFiltroInstrumentoEntregasFigurino();
        renderizarEntregasFigurinoLista();
    }

    // Convidados virou uma aba própria (29/ago/2026, pedido dela: "assim
    // como tem o totalizador, tenha um lugar separado para Convidados" --
    // antes ficavam misturados dentro da aba Ritmista/Diretoria). Até 3
    // abas agora: Ritmista, Diretoria, Convidados -- só aparece a aba que
    // realmente tem gente (mesmo espírito do totalizador, que só mostra
    // linha de um grupo com total>0), e a barra de abas só aparece quando
    // sobra mais de uma.
    function renderizarFiltroLadoFigurino() {
        const el = document.getElementById('figurino-filtro-lado');
        if (!el) return;
        const item = figurinoEntregaItemAtual;
        const cobreRitmista = item.publico.includes('ritmista');
        const cobreDiretoria = item.publico.some(p => p !== 'ritmista');
        const temConvidados = figurinoEntregaPessoasCache.some(p => p.tipo === 'extra');
        const lados = [];
        if (cobreRitmista) lados.push('ritmista');
        if (cobreDiretoria) lados.push('diretoria');
        if (temConvidados) lados.push('convidados');
        if (!lados.includes(figurinoEntregaLadoAtual)) figurinoEntregaLadoAtual = lados[0] || 'ritmista';
        if (lados.length <= 1) { el.style.display = 'none'; el.innerHTML = ''; return; }
        el.style.display = '';
        const LABEL_LADO_FIGURINO = { ritmista: 'Ritmista', diretoria: 'Diretoria', convidados: 'Convidados' };
        el.innerHTML = lados.map(lado =>
            `<button type="button" class="${figurinoEntregaLadoAtual === lado ? 'ativo' : ''}" onclick="mudarLadoFigurino('${lado}')">${LABEL_LADO_FIGURINO[lado]}</button>`
        ).join('');
    }
    function mudarLadoFigurino(lado) {
        figurinoEntregaLadoAtual = lado;
        renderizarFiltroLadoFigurino();
        popularFiltroInstrumentoEntregasFigurino();
        renderizarEntregasFigurinoLista();
    }

    // Mesma pílula serve pra Ritmista/Diretoria (27/ago/2026) -- Ritmista
    // filtra por instrumento, Diretoria filtra por tipo de pessoa (Mestre/
    // Diretor de Bateria/Diretoria (Apoio)). Convidados (29/ago/2026, agora
    // aba própria) não usa esse filtro -- a divisão por Ritmista/Diretor de
    // Bateria/Diretoria (Apoio) já aparece como título de seção na lista.
    function popularFiltroInstrumentoEntregasFigurino() {
        const select = document.getElementById('figurino-entregas-filtro-instrumento');
        if (!select) return;
        const valorAtual = select.value;
        const doLado = figurinoEntregaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === figurinoEntregaLadoAtual);
        if (figurinoEntregaLadoAtual === 'ritmista') {
            const instrumentos = Array.from(new Set(doLado.map(p => p.instrumento_nome).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            select.innerHTML = '<option value="">Todos os instrumentos</option>'
                + instrumentos.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
        } else if (figurinoEntregaLadoAtual === 'diretoria') {
            const tipos = ['mestre', 'diretor', 'apoio'].filter(p => doLado.some(x => x.perfil === p));
            select.innerHTML = '<option value="">Todos - Diretoria</option>'
                + tipos.map(p => `<option value="${p}">${LABEL_PUBLICO_FIGURINO[p]}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">Todos</option>';
        }
        select.value = valorAtual;
    }

    const LABEL_PERFIL_FIGURINO = { mestre: 'Mestre de Bateria', diretor: 'Diretor de Bateria', apoio: 'Diretor (Apoio)', ritmista: null };
    // Lista separada em seções (Ritmistas/Diretoria + Extras) quando a peça
    // tem "Incluir Extras" ligado e sobra gente dos dois lados na tela --
    // achado dela, 25/ago/2026: sem nenhuma divisão visual, os Extras
    // ficavam misturados na lista sem se destacar. Peça sem Extras continua
    // com a lista simples de sempre (sem título de seção nenhum).
    function renderizarEntregasFigurinoLista() {
        const container = document.getElementById('figurino-entregas-lista');
        if (!container) return;
        const item = figurinoEntregaItemAtual;
        // Filtro de lado -- Ritmista, Diretoria e Convidados (29/ago/2026,
        // virou aba própria) nunca aparecem misturados na mesma lista. A
        // pílula de Instrumento/Tipo só existe pra Ritmista/Diretoria --
        // Convidados nunca usa (ver popularFiltroInstrumentoEntregasFigurino).
        const doLado = figurinoEntregaLadoAtual === 'convidados'
            ? figurinoEntregaPessoasCache.filter(p => p.tipo === 'extra')
            : figurinoEntregaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === figurinoEntregaLadoAtual);
        const filtroInstrumentoEl = document.getElementById('figurino-entregas-filtro-instrumento');
        const mostrarFiltroInstrumento = figurinoEntregaLadoAtual !== 'convidados'
            && (figurinoEntregaLadoAtual === 'ritmista' ? doLado.some(p => p.instrumento_nome) : doLado.length > 0);
        filtroInstrumentoEl.style.display = mostrarFiltroInstrumento ? '' : 'none';
        const busca = (document.getElementById('figurino-entregas-busca').value || '').trim().toLowerCase();
        const instrumentoFiltro = mostrarFiltroInstrumento ? filtroInstrumentoEl.value : '';
        const statusFiltro = document.getElementById('figurino-entregas-filtro-status').value;
        const filtrada = doLado.filter(p => {
            if (busca && !((p.nome || '').toLowerCase().includes(busca) || (p.apelido || '').toLowerCase().includes(busca))) return false;
            if (instrumentoFiltro) {
                if (figurinoEntregaLadoAtual === 'ritmista') {
                    if (p.instrumento_nome !== instrumentoFiltro) return false;
                } else if (p.perfil !== instrumentoFiltro) return false;
            }
            if (statusFiltro === 'pendentes' && p.entregue) return false;
            if (statusFiltro === 'entregues' && !p.entregue) return false;
            return true;
        });
        // Só pode marcar entrega com "Entrega Iniciada" ligado e "Entrega
        // Finalizada" desligado (pedido dela, 04/set/2026) -- antes o botão
        // funcionava mesmo com os dois interruptores desligados, bastando
        // ter a permissão. Lê direto de bateriaFigurinoCache (não de `item`,
        // que fica desatualizado depois de mexer nos interruptores -- ver
        // salvarFlagFigurinoEntrega).
        const bfAtual = bateriaFigurinoCache.find(x => x.figurino_item_mestre_id === item.id);
        const entregaIniciada = !!(bfAtual && bfAtual.mostra_visao_geral && !bfAtual.entrega_finalizada);
        const podeEditar = entregaIniciada && tenhoCapacidade('editar_figurino');
        const linhaPessoaHtml = p => {
            const detalhe = esc(p.instrumento_nome || (p.tipo === 'vinculo' ? LABEL_PERFIL_FIGURINO[p.perfil] : null) || (p.tipo === 'extra' ? 'Convidado' : ''));
            let acaoHtml;
            if (p.entregue) {
                // Desfazer continua sem pedir confirmação -- não mudei essa
                // parte, só o rótulo/aparência (era um link "↺ Desfazer",
                // agora é o próprio selo de status "✓ Entregue").
                acaoHtml = podeEditar
                    ? `<button type="button" class="figurino-selo figurino-selo-entregue" onclick="toggleEntregaFigurino('${p.tipo}', ${p.id}, false)">✓ Entregue</button>`
                    : `<span class="figurino-selo figurino-selo-entregue">✓ Entregue</span>`;
            } else if (p.confirmando) {
                acaoHtml = `<div class="figurino-confirmacao">
                    <span class="pergunta">Confirma?</span>
                    <div class="botoes">
                        <button type="button" class="figurino-btn-nao" onclick="cancelarConfirmacaoEntregaFigurino('${p.tipo}', ${p.id})">Cancelar</button>
                        <button type="button" class="figurino-btn-sim" onclick="toggleEntregaFigurino('${p.tipo}', ${p.id}, true)">Sim</button>
                    </div>
                </div>`;
            } else {
                // Marcar continua pedindo confirmação -- não mudei essa
                // parte, só o rótulo/aparência (era um botão "Marcar", agora
                // é o próprio selo de status "Não entregue").
                acaoHtml = podeEditar
                    ? `<button type="button" class="figurino-selo figurino-selo-pendente" onclick="pedirConfirmacaoEntregaFigurino('${p.tipo}', ${p.id})">Não entregue</button>`
                    : `<span class="figurino-selo figurino-selo-pendente">Não entregue</span>`;
            }
            return `
            <div style="display:flex;align-items:center;gap:32px;padding:12px 0;border-bottom:1px solid #eee;">
                <div style="min-width:0;flex:1;">
                    <div style="font-weight:600;font-size:14px;">${esc(p.nome)}${p.apelido ? ` · <span style="color:#D4AF37;font-style:italic;font-weight:400;">${esc(p.apelido)}</span>` : ''}</div>
                    <div style="font-size:12px;color:var(--cor-texto-muted);">${detalhe}</div>
                </div>
                <div class="figurino-tamanho-caixa">${esc(p.tamanho || '—')}</div>
                <div class="figurino-coluna-acao">${acaoHtml}</div>
            </div>`;
        };
        if (filtrada.length === 0) {
            container.innerHTML = '<div class="estado-vazio">Ninguém encontrado com esse filtro.</div>';
        } else if (figurinoEntregaLadoAtual === 'ritmista') {
            container.innerHTML = filtrada.map(linhaPessoaHtml).join('');
        } else if (figurinoEntregaLadoAtual === 'diretoria') {
            // Sub-divide por cargo específico (Mestres/Diretores de Bateria/
            // Diretoria (Apoio)) -- pedido dela, 27/ago/2026.
            let html = '';
            ['mestre', 'diretor', 'apoio'].forEach(perfil => {
                const vinculos = filtrada.filter(p => p.perfil === perfil);
                if (vinculos.length === 0) return;
                html += `<div class="secao-titulo">${LABEL_PUBLICO_FIGURINO[perfil]}</div>`;
                html += vinculos.map(linhaPessoaHtml).join('');
            });
            container.innerHTML = html;
        } else {
            // Aba Convidados (29/ago/2026, pedido dela: "assim como tem o
            // totalizador, tenha um lugar separado para Convidados... e
            // este esteja separado pelo título Ritmista e Diretoria de
            // Bateria e Diretoria Apoio") -- mesma sub-divisão de 3 grupos
            // já usada em Diretoria, aplicada aqui pelo grupo de origem do
            // Convidado (nunca "mestre" -- Convidado não tem esse grupo).
            let html = '';
            ['ritmista', 'diretor', 'apoio'].forEach(perfil => {
                const doGrupo = filtrada.filter(p => p.perfil === perfil);
                if (doGrupo.length === 0) return;
                html += `<div class="secao-titulo">${LABEL_PUBLICO_FIGURINO[perfil]}</div>`;
                html += doGrupo.map(linhaPessoaHtml).join('');
            });
            container.innerHTML = html;
        }
        // Totalizador (27/ago/2026, refeito 29/ago/2026 pra caber Convidados
        // como grupo próprio) -- sempre soma a peça inteira (nunca só o que
        // está filtrado na busca/instrumento/status/lado, pedido dela
        // 25/ago/2026). Convidados só entra como linha própria quando existe
        // pelo menos 1 (pedido dela: "se não tiver convidados, eles não
        // apareceriam") -- nunca mais somado escondido dentro de Ritmistas/
        // Diretoria. Peça com um único grupo continua com total simples, sem
        // quebrar em blocos à toa (ver totalGradeHtml).
        const totalizador = document.getElementById('figurino-entregas-totalizador');
        const detalheEl = document.getElementById('figurino-grupos-detalhe');
        if (totalizador) {
            if (figurinoEntregaPessoasCache.length === 0) {
                totalizador.innerHTML = '';
                if (detalheEl) detalheEl.innerHTML = '';
            } else {
                const ritmistas = figurinoEntregaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === 'ritmista');
                const diretoria = figurinoEntregaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === 'diretoria');
                const convidados = figurinoEntregaPessoasCache.filter(p => p.tipo === 'extra');
                const grupos = [
                    { label: 'Ritmistas', total: ritmistas.length, feito: ritmistas.filter(p => p.entregue).length },
                    { label: 'Diretoria', total: diretoria.length, feito: diretoria.filter(p => p.entregue).length },
                    { label: 'Convidados', total: convidados.length, feito: convidados.filter(p => p.entregue).length },
                ].filter(g => g.total > 0);
                const grade = totalGradeHtml(grupos, 'figurino');
                totalizador.innerHTML = grade.hero;
                if (detalheEl) detalheEl.innerHTML = grade.detalhe;
                travarLarguraTotalizador('figurino-entregas-totalizador', 'figurino');
            }
        }
    }

    // Marcar exige confirmação de propósito (26/ago/2026, pedido dela): um
    // toque sozinho nunca marca ninguém, só abre a pergunta inline -- só
    // marca de verdade quem clicar em "Sim". Reduz a chance real de marcar
    // por engano quem não recebeu nada.
    function pedirConfirmacaoEntregaFigurino(tipo, id) {
        figurinoEntregaPessoasCache.forEach(p => { p.confirmando = false; });
        const pessoa = figurinoEntregaPessoasCache.find(p => p.tipo === tipo && p.id === id);
        if (pessoa) pessoa.confirmando = true;
        renderizarEntregasFigurinoLista();
    }
    function cancelarConfirmacaoEntregaFigurino(tipo, id) {
        const pessoa = figurinoEntregaPessoasCache.find(p => p.tipo === tipo && p.id === id);
        if (pessoa) pessoa.confirmando = false;
        renderizarEntregasFigurinoLista();
    }

    async function toggleEntregaFigurino(tipo, id, entregar) {
        const item = figurinoEntregaItemAtual;
        if (!item) return;
        // Trava de verdade, não só visual (04/set/2026) -- mesmo raciocínio
        // de marcarPresenca().
        const bfGuarda = bateriaFigurinoCache.find(x => x.figurino_item_mestre_id === item.id);
        if (!bfGuarda || !bfGuarda.mostra_visao_geral || bfGuarda.entrega_finalizada) { renderizarEntregasFigurinoLista(); return; }
        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        // Convidado Especial é vínculo de verdade -- grava em vinculo_id
        // como qualquer outro vínculo, mesmo sendo tipo 'extra' na UI (só o
        // Convidado Simples, quando essa bateria usa esse modo, usa
        // extra_id de verdade). Ver modoConvidadosEspecial().
        const coluna = (tipo === 'extra' && !modoConvidadosEspecial()) ? 'extra_id' : 'vinculo_id';
        if (entregar) {
            await fetch(`${SUPABASE_URL}/rest/v1/figurino_entregas?on_conflict=${coluna},figurino_item_id`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates', ...authHeaders },
                body: JSON.stringify([{ [coluna]: id, figurino_item_id: item.id, entregue_em: new Date().toISOString(), confirmado_por: u ? u.pessoa_id : null }]),
            });
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/figurino_entregas?${coluna}=eq.${id}&figurino_item_id=eq.${item.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ entregue_em: null, confirmado_por: null }),
            });
        }
        const pessoa = figurinoEntregaPessoasCache.find(p => p.tipo === tipo && p.id === id);
        if (pessoa) { pessoa.entregue = entregar; pessoa.confirmando = false; }
        renderizarEntregasFigurinoLista();
    }

    // Unificação (04/set/2026, decisão dela): acabou o modelo Simples
    // (tabela `extras`) -- toda bateria usa sempre vinculos/eh_convidado=true,
    // com ou sem carteirinha (isso último só decide o formulário de cadastro,
    // ver cadastro.html). Essa função ficou fixa em `true` de propósito: os
    // outros módulos (Entrega de Figurino, Presença) ainda checam ela pra
    // decidir vinculo_id vs extra_id -- forçar `true` aqui redireciona todo
    // mundo pro caminho certo de uma vez, sem precisar caçar cada `if
    // (especial)` um por um. Os ramos `else` que sobraram (tabela `extras`)
    // viram código morto de propósito -- nenhuma bateria real tinha dado lá
    // quando isso foi decidido. Ver project_unificacao_convidado_especial_desenho
    // na memória.
    function modoConvidadosEspecial() {
        return true;
    }
    async function iniciarConvidadosAba() {
        document.getElementById('convidados-especiais-conteudo').style.display = '';
        await iniciarConvidadosEspeciaisTab();
    }

    async function iniciarConvidadosEspeciaisTab() {
        // Mesmo modelo de "if (aba === 'diretoria') carregarDiretoria();" --
        // sem spinner, sem overlay. Na prática isso quase sempre é um
        // no-op instantâneo: os dados já foram pré-carregados ao entrar na
        // bateria (ver entrarContextoEscolaSA/iniciarUsuario), então
        // convidadosEspeciaisCarregados já está true e a trava no início de
        // carregarConvidadosEspeciais() nem chega a buscar de novo. Achado
        // dela, 01/set/2026, depois de 2 tentativas erradas (spinner
        // interno, depois overlay de tela cheia): "tem que ser o mesmo
        // modelo que existe para ritmistas e diretoria... se as outras não
        // tem spinner, essa também não pode ter."
        const be = document.getElementById('btnExportarConvidadosEspeciais');
        if (be) be.style.display = (souSuperAdmin || tenhoCapacidade('exportar_convidados_especiais')) ? '' : 'none';
        const cc = document.getElementById('cadastroConvidadoEspecialCabecalho');
        if (cc) cc.style.display = (souSuperAdmin || tenhoCapacidade('criar_cadastro_convidados_especiais') || tenhoCapacidade('copiar_link_convidados_especiais')) ? '' : 'none';
        await carregarConvidadosEspeciais();
    }

    // ══════════════════════════════════════════════════════════════════
    // CONVIDADO ESPECIAL (31/ago/2026) -- vínculo de verdade (eh_convidado=
    // true em vinculos), com login/carteirinha, mas 100% separado da
    // contagem normal de Ritmistas/Diretoria. Só existe/aparece se a
    // bateria tiver o gate comercial `convidado_tem_carteirinha` ligado
    // (Comercial → Convidado Especial). Reaproveita o motor único de
    // edição de perfil (fpMontar/fpIniciar) e os modais que já existem --
    // usa o modal de Ritmista pra perfil='ritmista' e o modal de Diretoria
    // pra perfil='diretor'/'apoio', só trocando a fonte dos dados
    // (convidadosEspeciaisCache, não todosRitmistas/listaDiretoriaAtual) e
    // a capacidade que libera os botões de ação (aprovar_convidados_
    // especiais, uma só pra tudo -- fila pequena, não precisa do mesmo
    // grau de granularidade de Ritmistas/Diretoria).
    let convidadosEspeciaisCache = [];
    // Mesma trava de diretoriaCarregada -- clicar na aba de novo (já
    // carregada) vira um no-op, sem rebuscar. 01/set/2026.
    let convidadosEspeciaisCarregados = false;

    // leve/completo (01/set/2026, mesmo padrão de carregarRitmistas/
    // carregarDiretoria, 25/ago/2026) -- Convidados nunca tinha recebido
    // esse tratamento, então a tela sempre esperava a foto de todo mundo
    // baixar antes de mostrar qualquer coisa. Achado dela: "está com o
    // mesmo problema que já tivemos antes com ritmistas e diretoria".
    // Estrutura idêntica a carregarDiretoria(), de propósito -- mesmo
    // ponto de entrada (bootstrap ao entrar na bateria), mesma trava, mesmo
    // spinner-mini só na lista (e só se a cache estiver mesmo vazia).
    async function carregarConvidadosEspeciais(leve = false) {
        if (convidadosEspeciaisCarregados) return;
        const bateriaId = bateriaIdContexto();
        const lista = document.getElementById('convidados-especiais-lista');
        if (lista && !convidadosEspeciaisCache.length) {
            lista.innerHTML = '<div style="text-align:center;padding:6px 20px;"><svg class="spinner-mini" viewBox="0 0 56 56" role="status" aria-label="Carregando"><use href="#tt-spinner-caminho"></use></svg></div>';
        }
        if (!bateriaId) { convidadosEspeciaisCache = []; convidadosEspeciaisCarregados = true; return; }
        const select = COLUNAS_RITMISTAS_SEM_FOTO; // 06/set/2026: nunca mais '*' -- ver comentário em preencherFotosRitmistasEmSegundoPlano()
        const res = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&eh_convidado=eq.true&order=perfil.asc,nome.asc&select=${select}`, { headers: authHeaders });
        const novos = res.ok ? await res.json() : [];
        const novosArr = Array.isArray(novos) ? novos : [];
        convidadosEspeciaisCache = reaproveitarFotosCache(novosArr, convidadosEspeciaisCache);
        aplicarFiltrosConvidadosEspeciais();
        atualizarTotalizadorConvidadosEspeciais();
        atualizarBadgesNav();
        convidadosEspeciaisCarregados = true;
        preencherFotosConvidadosEspeciaisEmSegundoPlano();
    }

    function renderizarLinksCadastroConvidadoEspecial() {
        const div = document.getElementById('linksCadastroConvidadoEspecial');
        const botoes = document.getElementById('botoesCadastroConvidadoEspecial');
        if (!div) return;
        // Usa o campo real da bateria, não modoConvidadosEspecial() -- essa
        // função ficou fixa em `true` (unificação de modelo de dados), mas
        // aqui a pergunta é outra: essa bateria específica tem carteirinha
        // (logo, link de autocadastro) ou não?
        const habilitado = !!(bateriaAtualData && bateriaAtualData.convidado_tem_carteirinha);
        // Cadastro manual ("+ Cadastrar Convidado") existe nos dois modelos
        // (com/sem carteirinha, pedido dela: "eu quero que tenha isso nos
        // dois modelos") -- igual Ritmistas/Diretoria, que já têm botão E
        // link juntos. Só o link de autocadastro é exclusivo de quem tem
        // carteirinha (sem carteirinha nunca teve link).
        if (botoes) {
            botoes.style.display = 'flex';
            const podeCriar = souSuperAdmin || tenhoCapacidade('criar_cadastro_convidados_especiais');
            botoes.querySelectorAll('button').forEach(b => {
                b.disabled = !podeCriar;
                b.style.opacity = podeCriar ? '1' : '0.5';
                b.style.cursor = podeCriar ? 'pointer' : 'not-allowed';
            });
        }
        if (!habilitado) { div.innerHTML = ''; return; }
        const codigo = codigoConviteBateria || bateriaIdContexto();
        if (!codigo) { div.innerHTML = ''; return; }
        const podeCopiar = souSuperAdmin || tenhoCapacidade('copiar_link_convidados_especiais');
        const base = `${window.location.origin}/cadastro?bateria=${codigo}&convidado_especial=1`;
        div.innerHTML = caixaLinkCadastro('linksCadastroConvidadoEspecial-box', 'Links de cadastro', [
            { label: 'Ritmista', url: base },
            { label: 'Diretor de Bateria', url: `${base}&cargo=diretor` },
            { label: 'Diretor (Apoio)', url: `${base}&cargo=apoio` },
        ], podeCopiar);
    }

    const LABEL_PERFIL_CONVIDADO_ESPECIAL = { ritmista: 'Ritmista', diretor: 'Diretor de Bateria', apoio: 'Diretor (Apoio)' };
    const BADGE_STATUS_CONVIDADO_ESPECIAL = {
        pendente:  '<span class="badge badge-pendente">Pendente</span>',
        aprovado:  '<span class="badge badge-aprovado">Ativo</span>',
        suspenso:  '<span class="badge badge-suspenso">Suspenso</span>',
        desligado: '<span class="badge badge-desligado">Desligado</span>',
        rejeitado: '<span class="badge badge-rejeitado">Rejeitado</span>',
    };
    // Recebe a lista já filtrada (busca + Tipo de Convidado + Status, ver
    // aplicarFiltrosConvidadosEspeciais) -- agrupa por tipo com título e
    // contador própria (pedido dela, 31/ago/2026: "os títulos por tipo de
    // convidado, o contador por tipo de convidado"), mesmo padrão de seção
    // já usado em Presença/Figurino (secao-titulo por perfil, só aparece
    // quem tem gente).
    function renderizarConvidadosEspeciais(lista) {
        // Só é chamada quando a bateria já está em modo Especial (ver
        // iniciarConvidadosAba) -- sem checagem própria de "habilitado" aqui.
        renderizarLinksCadastroConvidadoEspecial();
        lista = lista || convidadosEspeciaisCache;

        const container = document.getElementById('convidados-especiais-lista');
        if (!container) return;
        if (convidadosEspeciaisCache.length === 0) { container.innerHTML = '<div class="estado-vazio">Nenhum Convidado cadastrado ainda.</div>'; return; }
        if (lista.length === 0) { container.innerHTML = '<div class="estado-vazio">Nenhum Convidado encontrado com esses filtros.</div>'; return; }
        // Mesmo padrão de card de Ritmistas/Diretoria (card-ritmista, foto/
        // inicial, Ativar/Rejeitar inline quando pendente) -- achado dela,
        // 31/ago/2026: a 1ª versão só mostrava um badge, sem os botões que
        // já existem nos outros dois grupos.
        const cardHtml = r => {
            const inicial = (r.nome || '?')[0].toUpperCase();
            const fotoHtml = r.foto_url ? `<img src="${r.foto_url}" style="object-position:${r.foto_pos_x ?? 50}% ${r.foto_pos_y ?? 50}%;">` : inicial;
            const badgeStatus = BADGE_STATUS_CONVIDADO_ESPECIAL[r.status] || '';
            const podeAgir = souSuperAdmin || tenhoCapacidade('aprovar_convidados_especiais');
            const acoesExtras = (r.status === 'pendente' && podeAgir)
                ? `<button class="btn-card-acao btn-card-ativar" onclick="event.stopPropagation();atualizarStatus(${r.id},'aprovado',null,recarregarConvidadosEspeciais)">Ativar</button>
                   <button class="btn-card-acao btn-card-rejeitar" onclick="event.stopPropagation();atualizarStatus(${r.id},'rejeitado',null,recarregarConvidadosEspeciais)">Rejeitar</button>`
                : '';
            const direita = `${acoesExtras}${badgeStatus}<span class="card-chevron">›</span>`;
            return `
            <div class="card-ritmista ${r.status}" onclick="abrirFichaConvidadoEspecial(${r.id})">
                <div class="card-foto">${fotoHtml}</div>
                <div class="card-esquerda">
                    <div class="card-linha1"><span class="card-nome">${esc(r.nome)}</span>${r.apelido ? `<span class="card-apelido-inline">${esc(r.apelido)}</span>` : ''}</div>
                    <div class="card-linha2"><span class="dir-badge-cargo">${LABEL_PERFIL_CONVIDADO_ESPECIAL[r.perfil] || r.perfil}</span></div>
                </div>
                <div class="card-direita">${direita}</div>
            </div>`;
        };
        // Contador dourado à direita do título -- mesmo padrão de Diretoria
        // (tituloSecaoComContador), pedido dela (01/set/2026).
        const tituloComContador = (rotulo, qtd) => `<div class="secao-titulo" style="display:flex;justify-content:space-between;align-items:center;"><span>${rotulo}</span><span style="color:#D4AF37;font-weight:800;font-size:14px;letter-spacing:normal;">${qtd}</span></div>`;
        container.innerHTML = ['ritmista', 'diretor', 'apoio'].map(perfil => {
            const doGrupo = lista.filter(r => r.perfil === perfil);
            if (doGrupo.length === 0) return '';
            return tituloComContador(LABEL_PERFIL_CONVIDADO_ESPECIAL[perfil], doGrupo.length) + doGrupo.map(cardHtml).join('');
        }).join('');
    }

    function recarregarConvidadosEspeciais() {
        return carregarConvidadosEspeciais().then(() => { aplicarFiltrosConvidadosEspeciais(); atualizarTotalizadorConvidadosEspeciais(); atualizarBadgesNav(); });
    }

    // Ficha de Convidado Especial reaproveita os DOIS modais que já existem
    // (Ritmista pra perfil='ritmista', Diretoria pra 'diretor'/'apoio') --
    // mesmo motor fpMontar/fpIniciar, só com fonte de dados, capacidade e
    // recarregamento próprios (nunca abrirCadastro()/abrirFichaAdmin(), que
    // são hardcoded pra todosRitmistas/listaDiretoriaAtual e pras
    // capacidades normais de Ritmistas/Diretoria).
    async function abrirFichaConvidadoEspecial(id) {
        const r = convidadosEspeciaisCache.find(x => x.id === id);
        if (!r) return;
        const status = r.status || 'pendente';
        const nomeEscapado = (r.nome || '').replace(/'/g, "\\'");
        const podeAgir = souSuperAdmin || tenhoCapacidade('aprovar_convidados_especiais');
        let btns = '';
        if (status === 'pendente') {
            if (podeAgir) {
                btns += `<button class="btn-ficha btn-ficha-ativar" onclick="fecharModal('modalCadastroOverlay');fecharModalAdmin();atualizarStatus(${r.id},'aprovado',null,recarregarConvidadosEspeciais)">Aprovar</button>`;
                btns += `<button class="btn-ficha btn-ficha-rejeitar" onclick="fecharModal('modalCadastroOverlay');fecharModalAdmin();atualizarStatus(${r.id},'rejeitado',null,recarregarConvidadosEspeciais)">Rejeitar</button>`;
            }
        } else if (status === 'aprovado') {
            if (podeAgir) {
                btns += `<button class="btn-ficha btn-ficha-suspender" onclick="fecharModal('modalCadastroOverlay');fecharModalAdmin();abrirModalSuspender(${r.id},'${nomeEscapado}','Convidado',recarregarConvidadosEspeciais)">Suspender</button>`;
                btns += `<button class="btn-ficha btn-ficha-desligar" onclick="fecharModal('modalCadastroOverlay');fecharModalAdmin();abrirModalDesligar(${r.id},'${nomeEscapado}','Convidado',recarregarConvidadosEspeciais)">Desligar</button>`;
            }
        } else if (status === 'suspenso') {
            if (podeAgir) {
                btns += `<button class="btn-ficha btn-ficha-reativar" onclick="fecharModal('modalCadastroOverlay');fecharModalAdmin();atualizarStatus(${r.id},'aprovado',null,recarregarConvidadosEspeciais,'reativado')">Reativar</button>`;
                btns += `<button class="btn-ficha btn-ficha-desligar" onclick="fecharModal('modalCadastroOverlay');fecharModalAdmin();abrirModalDesligar(${r.id},'${nomeEscapado}','Convidado',recarregarConvidadosEspeciais)">Desligar</button>`;
            }
        } else if (podeAgir) {
            btns += `<button class="btn-ficha btn-ficha-reativar" onclick="fecharModal('modalCadastroOverlay');fecharModalAdmin();atualizarStatus(${r.id},'aprovado',null,recarregarConvidadosEspeciais,'reativado')">Reativar</button>`;
        }

        const meu = JSON.parse(localStorage.getItem('ritmista') || 'null');
        const podeVerCarteirinha = status === 'aprovado' && tenhoCapacidade('ver_carteirinha_outros');
        const btnCarteirinha = podeVerCarteirinha ? `<button class="btn-ficha btn-ficha-carteirinha" onclick="abrirCarteirinha(${r.id})">Ver carteirinha ↗</button>` : '';
        if (r.perfil === 'ritmista') {
            fichaAtualId = id;
            document.getElementById('fc-status-badge').innerHTML = BADGE_STATUS_CONVIDADO_ESPECIAL[status] || '';
            await fpMontar(document.getElementById('fp-container-ritmista'));
            fpIniciar(r, meu ? meu.perfil : null, meu ? meu.pessoa_id : null, { aoSalvar: recarregarConvidadosEspeciais });
            const extraConteudo = document.getElementById('fp-extra-conteudo');
            if (extraConteudo) extraConteudo.innerHTML = '';
            btns += `<button class="btn-ficha" onclick="fecharModal('modalCadastroOverlay')">Fechar</button>`;
            document.getElementById('fp-container-ritmista').querySelector('#fp-acoes-extra').innerHTML = btns;
            document.getElementById('fp-container-ritmista').querySelector('#fp-ver-carteirinha').innerHTML = btnCarteirinha;
            if (status !== 'aprovado' && status !== 'suspenso' && !souSuperAdmin) document.getElementById('fp-container-ritmista').querySelector('#fp-btn-editar').style.display = 'none';
            document.getElementById('modalCadastroOverlay').classList.add('aberto');
        } else {
            await fpMontar(document.getElementById('fp-container-admin'));
            fpIniciar(r, meu ? meu.perfil : null, meu ? meu.pessoa_id : null, { aoSalvar: recarregarConvidadosEspeciais });
            const extraAdmin = document.querySelector('#fp-container-admin #fp-extra-conteudo');
            if (extraAdmin) extraAdmin.innerHTML = '';
            btns += `<button class="btn-ficha" onclick="fecharModalAdmin()">Fechar</button>`;
            document.querySelector('#fp-container-admin #fp-acoes-extra').innerHTML = btns;
            document.querySelector('#fp-container-admin #fp-ver-carteirinha').innerHTML = btnCarteirinha;
            if (status !== 'aprovado' && status !== 'suspenso' && !souSuperAdmin) document.getElementById('fp-container-admin').querySelector('#fp-btn-editar').style.display = 'none';
            document.getElementById('modalAdmin').style.display = 'block';
            document.body.style.overflow = 'hidden';
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // CONFIGURAÇÕES → EVENTOS (29/ago/2026) -- cada bateria cria os próprios
    // eventos (ensaio, apresentação...), escolhendo um Tipo da biblioteca
    // mestre (Super Admin → Configurações → Tipos de Evento). Base do
    // módulo de Presença via QR -- essa tela só cadastra o evento, ainda
    // sem leitor de QR nem lista de presença.
    // ══════════════════════════════════════════════════════════════════
    let bibliotecaEventoTipos = []; // evento_tipos ativos, biblioteca mestre
    let bibliotecaTemporadas = []; // temporadas ativas, biblioteca mestre
    let eventosBateriaCache = [];
    let eventoEditando = null;
    let salvandoEvento = false;

    async function carregarBibliotecaEventoTipos() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/evento_tipos?ativo=eq.true&order=ordem`, { headers: authHeaders });
        bibliotecaEventoTipos = res.ok ? await res.json() : [];
    }
    async function carregarBibliotecaTemporadas() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/temporadas?ativo=eq.true&order=ordem`, { headers: authHeaders });
        bibliotecaTemporadas = res.ok ? await res.json() : [];
    }
    async function carregarEventosBateria() {
        const bateriaId = bateriaIdContexto();
        if (!bateriaId) { eventosBateriaCache = []; return; }
        const res = await fetch(`${SUPABASE_URL}/rest/v1/eventos?bateria_id=eq.${bateriaId}&order=data.desc`, { headers: authHeaders });
        eventosBateriaCache = res.ok ? await res.json() : [];
    }
    function nomeTipoEvento(id) {
        const t = bibliotecaEventoTipos.find(x => x.id === id);
        return t ? t.nome : '—';
    }
    function nomeTemporada(id) {
        const t = bibliotecaTemporadas.find(x => x.id === id);
        return t ? t.nome : null;
    }
    function formatarDataBR(dataIso) {
        if (!dataIso) return '—';
        const [ano, mes, dia] = dataIso.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    // Mesmo rótulo já usado em Figurino (LABEL_PERFIL_FIGURINO) pro mesmo
    // tipo de escolha granular por perfil de Diretoria -- pedido dela,
    // 29/ago/2026: nunca lotar Mestre/Diretor/Apoio numa coisa só, cada
    // evento pode incluir uma combinação diferente.
    const LABEL_PERFIL_DIRETORIA_EVENTO = { mestre: 'Mestre de Bateria', diretor: 'Diretor de Bateria', apoio: 'Diretor (Apoio)' };
    function renderizarEventosLista() {
        const container = document.getElementById('eventos-lista');
        if (!container) return;
        const podeEditar = souSuperAdmin || tenhoCapacidade('editar_eventos');
        const btnNovo = document.getElementById('eventos-btn-novo');
        if (btnNovo) btnNovo.style.display = podeEditar ? '' : 'none';
        if (bibliotecaEventoTipos.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📅</div>Nenhum Tipo de Evento cadastrado ainda pelo Super Admin — fale com ela antes de criar um Evento.</div>'; return; }
        if (eventosBateriaCache.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📅</div>Nenhum evento cadastrado ainda.</div>'; return; }
        container.innerHTML = eventosBateriaCache.map(ev => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-nome">${esc(ev.nome)}</div>
                    <div class="item-detalhe">${formatarDataBR(ev.data)} — ${esc(nomeTipoEvento(ev.evento_tipo_id))}${(ev.perfis_diretoria_inclusos || []).length > 0 ? ' · Inclui ' + ev.perfis_diretoria_inclusos.map(p => esc(LABEL_PERFIL_DIRETORIA_EVENTO[p] || p)).join(', ') : ''}${ev.inclui_extras ? ' · Convidados' : ''}${nomeTemporada(ev.temporada_id) ? ' · ' + esc(nomeTemporada(ev.temporada_id)) : ''}</div>
                </div>
                ${podeEditar ? `<div class="item-acoes"><button class="btn-ficha" onclick="abrirEditarEvento(${ev.id})">Editar</button></div>` : ''}
            </div>`).join('');
    }
    function abrirNovoEvento() {
        if (bibliotecaEventoTipos.length === 0) { mostrarToast('Nenhum Tipo de Evento cadastrado ainda — fale com o Super Admin.', 'erro'); return; }
        if (bibliotecaTemporadas.length === 0) { mostrarToast('Nenhuma Temporada cadastrada ainda — fale com o Super Admin.', 'erro'); return; }
        eventoEditando = { id: null, nome: '', data: '', evento_tipo_id: bibliotecaEventoTipos[0].id, perfis_diretoria_inclusos: [], temporada_id: bibliotecaTemporadas[0].id, inclui_extras: false };
        renderizarEditorEvento();
    }
    function abrirEditarEvento(id) {
        const ev = eventosBateriaCache.find(x => x.id === id);
        if (!ev) return;
        eventoEditando = { id: ev.id, nome: ev.nome, data: ev.data, evento_tipo_id: ev.evento_tipo_id, perfis_diretoria_inclusos: [...(ev.perfis_diretoria_inclusos || [])], temporada_id: ev.temporada_id || null, inclui_extras: !!ev.inclui_extras };
        renderizarEditorEvento();
    }
    function renderizarEditorEvento() {
        const ee = eventoEditando;
        const editor = document.getElementById('eventos-editor');
        if (!editor) return;
        if (!ee) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        editor.style.display = 'block';
        editor.innerHTML = `<div class="card-form">
            <div class="card-form-titulo">${ee.id ? 'Editar Evento' : 'Novo Evento'}</div>
            <div class="form-grid">
                <div class="campo campo-full"><label>Nome *</label><input type="text" id="ev-edit-nome" value="${esc(ee.nome)}" placeholder="Ex: Ensaio Técnico 2026"></div>
                <div class="campo"><label>Data *</label><input type="date" id="ev-edit-data" value="${esc(ee.data || '')}"></div>
                <div class="campo"><label>Tipo *</label><select id="ev-edit-tipo">
                    ${bibliotecaEventoTipos.map(t => `<option value="${t.id}" ${ee.evento_tipo_id === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
                </select></div>
                <div class="campo"><label>Temporada *</label><select id="ev-edit-temporada">
                    ${bibliotecaTemporadas.map(t => `<option value="${t.id}" ${ee.temporada_id === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
                </select></div>
                <div class="campo campo-full">
                    <label>Além dos Ritmistas (sempre incluídos), quem mais entra na lista de presença deste evento?</label>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
                        ${['mestre', 'diretor', 'apoio'].map(p => `
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" class="ev-edit-perfil-diretoria" value="${p}" id="ev-edit-perfil-${p}" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${ee.perfis_diretoria_inclusos.includes(p) ? 'checked' : ''}>
                            <label for="ev-edit-perfil-${p}" style="margin:0;font-size:13px;font-weight:700;cursor:pointer;">${LABEL_PERFIL_DIRETORIA_EVENTO[p]}</label>
                        </div>`).join('')}
                    </div>
                </div>
                <div class="campo campo-full" style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="ev-edit-inclui-extras" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${ee.inclui_extras ? 'checked' : ''}>
                    <label for="ev-edit-inclui-extras" style="margin:0;font-size:13px;font-weight:700;cursor:pointer;">Inclui Convidados (entram na lista de presença dos grupos marcados acima)</label>
                </div>
            </div>
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button class="btn-ficha btn-ficha-salvar" onclick="salvarEvento()">Salvar</button>
                    ${ee.id ? `<button class="btn-ficha btn-ficha-danger" onclick="excluirEvento(${ee.id})">Excluir</button>` : ''}
                </div>
                <button class="btn-ficha" onclick="fecharEditorEvento()">Cancelar</button>
            </div>
        </div>`;
        editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function fecharEditorEvento() { eventoEditando = null; renderizarEditorEvento(); }
    async function salvarEvento() {
        if (salvandoEvento) return;
        const nome = document.getElementById('ev-edit-nome').value.trim();
        if (!nome) { mostrarToast('Informe o nome do evento.', 'erro'); return; }
        const data = document.getElementById('ev-edit-data').value;
        if (!data) { mostrarToast('Informe a data do evento.', 'erro'); return; }
        const evento_tipo_id = Number(document.getElementById('ev-edit-tipo').value);
        const temporadaVal = document.getElementById('ev-edit-temporada').value;
        if (!temporadaVal) { mostrarToast('Selecione a temporada.', 'erro'); return; }
        const temporada_id = Number(temporadaVal);
        const perfis_diretoria_inclusos = [...document.querySelectorAll('.ev-edit-perfil-diretoria:checked')].map(el => el.value);
        const inclui_extras = document.getElementById('ev-edit-inclui-extras').checked;
        const bateriaId = bateriaIdContexto();
        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        salvandoEvento = true;
        try {
            if (eventoEditando.id) {
                await fetch(`${SUPABASE_URL}/rest/v1/eventos?id=eq.${eventoEditando.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome, data, evento_tipo_id, temporada_id, perfis_diretoria_inclusos, inclui_extras }) });
            } else {
                await fetch(`${SUPABASE_URL}/rest/v1/eventos`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ bateria_id: bateriaId, nome, data, evento_tipo_id, temporada_id, perfis_diretoria_inclusos, inclui_extras, criado_por: u ? u.pessoa_id : null }) });
            }
            mostrarToast(eventoEditando.id ? 'Evento atualizado!' : 'Evento criado!');
            eventoEditando = null;
            await carregarEventosBateria();
            renderizarEditorEvento();
            renderizarEventosLista();
        } catch (e) { mostrarToast('Não foi possível salvar. Verifique sua conexão e tente de novo.', 'erro'); }
        finally { salvandoEvento = false; }
    }
    async function excluirEvento(id) {
        if (!(await tumtuConfirmar('Excluir este evento? Isso apaga também todas as presenças já registradas nele.', { textoConfirmar: 'Excluir' }))) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/eventos?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) { mostrarToast('Não foi possível excluir.', 'erro'); return; }
        mostrarToast('Evento excluído.');
        eventoEditando = null;
        await carregarEventosBateria();
        renderizarEditorEvento();
        renderizarEventosLista();
    }

    // ══════════════════════════════════════════════════════════════════
    // PRESENÇA (29/ago/2026) -- marcar presença por evento, mesmo padrão
    // visual de Entrega de Figurino (selos, confirmação, totalizador), mas
    // sem tamanho/lado/Convidados -- aqui é só quem esteve presente. Cada
    // linha é um vínculo elegível pro evento (Ritmistas ativos sempre +
    // Diretoria dos perfis marcados em eventos.perfis_diretoria_inclusos).
    // Uma linha em evento_presencas = presente; sem linha = não registrado.
    // Leitor de câmera fica pra uma próxima etapa -- por enquanto,
    // marcação manual, um clique + confirmação por pessoa.
    // ══════════════════════════════════════════════════════════════════
    let presencaEventosCache = [];
    let presencaEventoAtual = null;
    let presencaPessoasCache = [];
    let presencaConfirmando = {};
    // Qual "lado" a lista mostra agora -- mesmo padrão de Entrega de
    // Figurino (figurinoEntregaLadoAtual), pedido dela 29/ago/2026 depois
    // de comparar as duas telas: "mais parecida com a entrega de
    // fantasias... aqui eu não consigo filtrar por tipo de pessoa". Nasce
    // sempre em 'ritmista' (Ritmistas são sempre incluídos no evento).
    let presencaLadoAtual = 'ritmista';

    function voltarPresencaLista() {
        // Desliga a câmera se estava escaneando -- rede de segurança, senão
        // ela continuaria ligada em segundo plano depois de sair da tela
        // (idempotente, não faz nada se já estava fechada).
        fecharScannerPresenca();
        fecharQrEvento();
        fecharQrFigurino();
        document.querySelectorAll('#painel-presenca .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('presenca-lista').style.display = 'block';
    }

    async function iniciarPresencaTab() {
        // Mesmo ajuste de iniciarFigurinoTab (01/set/2026) -- busca tudo
        // antes de trocar a tela visível, sem spinner nem overlay.
        await Promise.all([
            bibliotecaEventoTipos.length === 0 ? carregarBibliotecaEventoTipos() : Promise.resolve(),
            carregarEventosBateria(),
        ]);
        voltarPresencaLista();
        presencaEventosCache = eventosBateriaCache;
        renderizarPresencaEventosLista();
    }

    function renderizarPresencaEventosLista() {
        const container = document.getElementById('presenca-eventos-lista');
        if (!container) return;
        if (presencaEventosCache.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📅</div>Nenhum evento cadastrado ainda. Crie um em Configurações → Eventos.</div>'; return; }
        container.innerHTML = presencaEventosCache.map(ev => `
            <div class="item-card item-card-simples" onclick="abrirPresencaEvento(${ev.id})" style="cursor:pointer;">
                <div class="item-info">
                    <div class="item-nome">${esc(ev.nome)}</div>
                    <div class="item-detalhe">${formatarDataBR(ev.data)} — ${esc(nomeTipoEvento(ev.evento_tipo_id))}</div>
                </div>
                <span class="config-item-seta">›</span>
            </div>`).join('');
    }

    // Interruptores "Evento Iniciado"/"Evento Finalizado" (30/ago/2026) --
    // mesmo padrão de salvamento de Figurino (salvarFlagFigurinoEntrega),
    // só que aqui a coluna é direto na própria linha de `eventos` (não uma
    // tabela-ponte por bateria). Rótulo do interruptor nunca muda de texto
    // (diferente de Desfile) -- só a cor/posição indicam ligado/desligado.
    function renderPresencaTrilhos() {
        const evento = presencaEventoAtual;
        if (!evento) return;
        const aplicar = (idTrecho, idLabel, ligado) => {
            const trecho = document.getElementById(idTrecho);
            const label = document.getElementById(idLabel);
            if (!trecho || !label) return;
            trecho.classList.toggle('on', ligado);
            trecho.classList.toggle('off', !ligado);
            label.classList.toggle('on', ligado);
            label.classList.toggle('off', !ligado);
        };
        aplicar('pres-trilho-iniciado', 'pres-trilho-iniciado-label', !!evento.iniciado);
        aplicar('pres-trilho-finalizado', 'pres-trilho-finalizado-label', !!evento.finalizado);
    }
    async function salvarFlagEvento(campo, valor) {
        const evento = presencaEventoAtual;
        if (!evento) return;
        evento[campo] = valor;
        renderPresencaTrilhos();
        // Botão de marcar presença depende desse interruptor (04/set/2026) --
        // re-renderiza na hora, sem precisar sair e voltar da tela.
        renderizarPresencaLista();
        await fetch(`${SUPABASE_URL}/rest/v1/eventos?id=eq.${evento.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ [campo]: valor })
        });
        const emCache = presencaEventosCache.find(e => e.id === evento.id);
        if (emCache) emCache[campo] = valor;
        // Mesmo padrão de salvarFlagFigurinoEntrega -- Iniciado/Finalizado
        // decide se o evento aparece no resumo da Visão Geral (30/ago/2026,
        // correção: existia só o interruptor, nunca tinha ligado no card).
        carregarResumoEventosAtivos();
    }
    function toggleEventoIniciado() { salvarFlagEvento('iniciado', !presencaEventoAtual.iniciado); }
    function toggleEventoFinalizado() { salvarFlagEvento('finalizado', !presencaEventoAtual.finalizado); }

    async function abrirPresencaEvento(eventoId) {
        const evento = presencaEventosCache.find(e => e.id === eventoId);
        if (!evento) return;
        presencaEventoAtual = evento;
        presencaLadoAtual = 'ritmista';
        // Busca tudo ANTES de trocar a tela visível -- fica na lista de
        // eventos, sem nada "carregando" (nem spinner, nem overlay), até a
        // tela de marcar presença estar pronta pra aparecer já montada de
        // uma vez. Achado dela, 01/set/2026, depois de 2 tentativas erradas
        // (spinner interno, depois overlay de tela cheia): o modelo certo é
        // o mesmo de Ritmistas/Diretoria -- nenhuma etapa intermediária
        // visível, nunca.
        await carregarPresencaPessoas();
        document.getElementById('presenca-lista').style.display = 'none';
        document.querySelectorAll('#painel-presenca .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('presenca-tela-marcar').style.display = 'block';
        document.getElementById('presenca-evento-titulo').textContent = evento.nome;
        document.getElementById('presenca-busca').value = '';
        // Iniciado/Finalizado é dado do EVENTO (editar_eventos) -- diferente
        // de Mostrar QR/Escanear, que é sobre MARCAR presença
        // (marcar_presenca). São capacidades reais diferentes no banco;
        // mostrar cada bloco só quando a pessoa realmente tem a permissão
        // certa evita o "botão aparece habilitado e não funciona" (a trava
        // de verdade é o RLS de `eventos`, checado com
        // tenho_capacidade('editar_eventos', ...) -- só escondendo teria o
        // mesmo risco que já foi achado e corrigido antes noutras telas).
        const podeEditarEvento = souSuperAdmin || tenhoCapacidade('editar_eventos');
        const podeMarcarPresenca = souSuperAdmin || tenhoCapacidade('marcar_presenca');
        const trilhosWrap = document.getElementById('pres-trilhos-wrap');
        if (trilhosWrap) trilhosWrap.style.display = podeEditarEvento ? 'flex' : 'none';
        const qrBtns = document.getElementById('pres-qr-btns');
        if (qrBtns) qrBtns.style.display = podeMarcarPresenca ? 'flex' : 'none';
        // Risquinhos de separação -- só aparecem entre 2 blocos que estão
        // os DOIS visíveis (pedido dela, 30/ago/2026: "ajuda a separar o
        // que é cada coisa").
        const divisor1 = document.getElementById('pres-divisor-1');
        if (divisor1) divisor1.style.display = podeEditarEvento ? 'block' : 'none';
        const divisor2 = document.getElementById('pres-divisor-2');
        if (divisor2) divisor2.style.display = (podeEditarEvento && podeMarcarPresenca) ? 'block' : 'none';
        renderPresencaTrilhos();
    }

    // Mesmo rótulo já usado em Figurino/Eventos pro mesmo tipo de perfil de
    // Diretoria (LABEL_PERFIL_FIGURINO/LABEL_PERFIL_DIRETORIA_EVENTO).
    const LABEL_PERFIL_DIRETORIA_PRESENCA = { mestre: 'Mestre de Bateria', diretor: 'Diretor de Bateria', apoio: 'Diretor (Apoio)' };

    async function carregarPresencaPessoas() {
        const evento = presencaEventoAtual;
        if (!evento) return;
        const bateriaId = bateriaIdContexto();
        const perfis = ['ritmista', ...(evento.perfis_diretoria_inclusos || [])];
        // eh_convidado=eq.false (31/ago/2026): Convidado Especial tem conta
        // separada abaixo, nunca some escondido dentro de Ritmistas/
        // Diretoria (mesmo raciocínio de carregarRitmistas()).
        const especial = modoConvidadosEspecial();
        const buscas = [
            fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&status=eq.aprovado&eh_convidado=eq.false&perfil=in.(${perfis.join(',')})&order=nome&select=id,pessoa_id,nome,apelido,perfil,instrumento_nome,qr_token`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/evento_presencas?evento_id=eq.${evento.id}&vinculo_id=not.is.null`, { headers: authHeaders }),
        ];
        // Convidados (Extras) -- pedido dela, 29/ago/2026: "na configuração
        // do evento, tem que ter os convidados". Mesmo grupo de Figurino
        // (gruposExtraDoPublico, exclui mestre -- não existe "Convidado do
        // Mestre"). Igual Figurino, "Convidados" pode significar Convidado
        // Especial (vínculo de verdade) ou Simples (tabela extras),
        // dependendo do modo da bateria (modoConvidadosEspecial).
        const gruposExtras = evento.inclui_extras ? gruposExtraDoPublico(perfis) : [];
        if (gruposExtras.length > 0) {
            if (especial) {
                buscas.push(fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?bateria_id=eq.${bateriaId}&status=eq.aprovado&eh_convidado=eq.true&perfil=in.(${gruposExtras.join(',')})&order=nome&select=id,pessoa_id,nome,apelido,perfil,qr_token`, { headers: authHeaders }));
            } else {
                buscas.push(
                    fetch(`${SUPABASE_URL}/rest/v1/extras?bateria_id=eq.${bateriaId}&grupo=in.(${gruposExtras.join(',')})&order=nome`, { headers: authHeaders }),
                    fetch(`${SUPABASE_URL}/rest/v1/evento_presencas?evento_id=eq.${evento.id}&extra_id=not.is.null`, { headers: authHeaders }),
                );
            }
        }
        const [resPessoas, resPresencas, ...resto] = await Promise.all(buscas);
        const pessoas = resPessoas.ok ? await resPessoas.json() : [];
        const presencas = resPresencas.ok ? await resPresencas.json() : [];
        const presentesSet = new Set(presencas.map(p => p.vinculo_id));
        const linhasPessoas = pessoas.map(p => ({ tipo: 'vinculo', id: p.id, pessoa_id: p.pessoa_id, nome: p.nome, apelido: p.apelido, perfil: p.perfil, instrumento_nome: p.instrumento_nome || null, qr_token: p.qr_token, presente: presentesSet.has(p.id) }));
        let linhasExtras = [];
        if (gruposExtras.length > 0 && especial) {
            const [resConvidados] = resto;
            const convidados = resConvidados.ok ? await resConvidados.json() : [];
            // Convidado Especial é vínculo de verdade -- presença dele já
            // está em presentesSet acima (mesma tabela/coluna vinculo_id).
            linhasExtras = convidados.map(c => ({ tipo: 'extra', id: c.id, pessoa_id: c.pessoa_id, nome: c.nome, apelido: c.apelido, perfil: c.perfil, instrumento_nome: null, qr_token: c.qr_token, presente: presentesSet.has(c.id) }));
        } else if (gruposExtras.length > 0) {
            const [resExtras, resExtrasPresencas] = resto;
            const extras = resExtras.ok ? await resExtras.json() : [];
            const presencasExtras = resExtrasPresencas.ok ? await resExtrasPresencas.json() : [];
            const presentesExtrasSet = new Set(presencasExtras.map(p => p.extra_id));
            linhasExtras = extras.map(e => ({ tipo: 'extra', id: e.id, pessoa_id: null, nome: e.nome, apelido: null, perfil: e.grupo, instrumento_nome: null, presente: presentesExtrasSet.has(e.id) }));
        }
        presencaPessoasCache = linhasPessoas.concat(linhasExtras);
        presencaConfirmando = {};
        renderizarFiltroLadoPresenca();
        popularFiltroTipoPresenca();
        renderizarPresencaLista();
        atualizarTotalizadorPresenca();
    }

    // Convidados virou aba própria (29/ago/2026, mesmo pedido de Figurino:
    // "assim como tem o totalizador, tenha um lugar separado para
    // Convidados"). Até 3 abas: Ritmista, Diretoria, Convidados -- só
    // aparece a que tem gente, e a barra só aparece com mais de uma.
    function renderizarFiltroLadoPresenca() {
        const el = document.getElementById('presenca-filtro-lado');
        if (!el) return;
        const cobreDiretoria = (presencaEventoAtual.perfis_diretoria_inclusos || []).length > 0;
        const temConvidados = presencaPessoasCache.some(p => p.tipo === 'extra');
        const lados = ['ritmista'];
        if (cobreDiretoria) lados.push('diretoria');
        if (temConvidados) lados.push('convidados');
        if (!lados.includes(presencaLadoAtual)) presencaLadoAtual = lados[0];
        if (lados.length <= 1) { el.style.display = 'none'; el.innerHTML = ''; return; }
        el.style.display = '';
        const LABEL_LADO_PRESENCA = { ritmista: 'Ritmista', diretoria: 'Diretoria', convidados: 'Convidados' };
        el.innerHTML = lados.map(lado =>
            `<button type="button" class="${presencaLadoAtual === lado ? 'ativo' : ''}" onclick="mudarLadoPresenca('${lado}')">${LABEL_LADO_PRESENCA[lado]}</button>`
        ).join('');
    }
    function mudarLadoPresenca(lado) {
        presencaLadoAtual = lado;
        renderizarFiltroLadoPresenca();
        popularFiltroTipoPresenca();
        renderizarPresencaLista();
    }

    // Mesma pílula serve pra Ritmista/Diretoria (filtra por Instrumento ou
    // por Tipo de pessoa) -- Convidados (29/ago/2026, agora aba própria)
    // não usa esse filtro, a divisão por Ritmista/Diretor de Bateria/
    // Diretoria (Apoio) já aparece como título de seção na lista.
    function popularFiltroTipoPresenca() {
        const select = document.getElementById('presenca-filtro-tipo');
        if (!select) return;
        const valorAtual = select.value;
        const doLado = presencaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === presencaLadoAtual);
        if (presencaLadoAtual === 'ritmista') {
            const instrumentos = Array.from(new Set(doLado.map(p => p.instrumento_nome).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            select.innerHTML = '<option value="">Todos os instrumentos</option>'
                + instrumentos.map(i => `<option value="${esc(i)}">${esc(i)}</option>`).join('');
        } else if (presencaLadoAtual === 'diretoria') {
            const tipos = ['mestre', 'diretor', 'apoio'].filter(p => doLado.some(x => x.perfil === p));
            select.innerHTML = '<option value="">Todos - Diretoria</option>'
                + tipos.map(p => `<option value="${p}">${LABEL_PERFIL_DIRETORIA_PRESENCA[p]}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">Todos</option>';
        }
        select.value = valorAtual;
    }

    // Mesmo padrão de Entrega de Figurino, refeito 29/ago/2026 pra caber
    // Convidados como grupo próprio (era somado escondido dentro de
    // Ritmistas/Diretoria) -- só entra como linha quando existe pelo menos
    // 1 (pedido dela: "se não tiver convidados, eles não apareceriam").
    // Evento com um único grupo continua com total simples, sem quebrar em
    // blocos à toa (ver totalGradeHtml).
    function atualizarTotalizadorPresenca() {
        const el = document.getElementById('presenca-totalizador');
        if (!el) return;
        if (presencaPessoasCache.length === 0) {
            el.innerHTML = '';
            return;
        }
        const ritmistas = presencaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === 'ritmista');
        const diretoria = presencaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === 'diretoria');
        const convidados = presencaPessoasCache.filter(p => p.tipo === 'extra');
        const grupos = [
            { label: 'Ritmistas', total: ritmistas.length, feito: ritmistas.filter(p => p.presente).length },
            { label: 'Diretoria', total: diretoria.length, feito: diretoria.filter(p => p.presente).length },
            { label: 'Convidados', total: convidados.length, feito: convidados.filter(p => p.presente).length },
        ].filter(g => g.total > 0);
        const grade = totalGradeHtml(grupos, 'presenca');
        el.innerHTML = grade.hero;
        const detalheEl = document.getElementById('presenca-grupos-detalhe');
        if (detalheEl) detalheEl.innerHTML = grade.detalhe;
        travarLarguraTotalizador('presenca-totalizador', 'presenca');
    }

    function renderizarPresencaLista() {
        const container = document.getElementById('presenca-pessoas-lista');
        if (!container) return;
        const doLado = presencaLadoAtual === 'convidados'
            ? presencaPessoasCache.filter(p => p.tipo === 'extra')
            : presencaPessoasCache.filter(p => p.tipo === 'vinculo' && ladoDoPerfil(p.perfil) === presencaLadoAtual);
        const filtroTipoEl = document.getElementById('presenca-filtro-tipo');
        const mostrarFiltroTipo = presencaLadoAtual !== 'convidados'
            && (presencaLadoAtual === 'ritmista' ? doLado.some(p => p.instrumento_nome) : doLado.length > 0);
        filtroTipoEl.style.display = mostrarFiltroTipo ? '' : 'none';
        const busca = (document.getElementById('presenca-busca').value || '').trim().toLowerCase();
        const tipoFiltro = mostrarFiltroTipo ? filtroTipoEl.value : '';
        const statusFiltro = document.getElementById('presenca-filtro-status').value;
        const filtrada = doLado.filter(p => {
            if (busca && !((p.nome || '').toLowerCase().includes(busca) || (p.apelido || '').toLowerCase().includes(busca))) return false;
            if (tipoFiltro) {
                if (presencaLadoAtual === 'ritmista') { if (p.instrumento_nome !== tipoFiltro) return false; }
                else if (p.perfil !== tipoFiltro) return false;
            }
            if (statusFiltro === 'presentes' && !p.presente) return false;
            if (statusFiltro === 'ausentes' && p.presente) return false;
            return true;
        });
        // Só pode marcar presença com "Evento Iniciado" ligado e "Evento
        // Finalizado" desligado (pedido dela, 04/set/2026) -- antes o botão
        // funcionava mesmo com os dois interruptores desligados, bastando
        // ter a permissão (achado dela ao vivo, com print mostrando o botão
        // funcionando com "Evento Iniciado" desligado).
        const eventoIniciado = !!(presencaEventoAtual && presencaEventoAtual.iniciado && !presencaEventoAtual.finalizado);
        const podeMarcar = eventoIniciado && (souSuperAdmin || tenhoCapacidade('marcar_presenca'));
        const linhaHtml = p => {
            const detalhe = esc(p.instrumento_nome || (p.tipo === 'vinculo' ? LABEL_PERFIL_DIRETORIA_PRESENCA[p.perfil] : null) || (p.tipo === 'extra' ? 'Convidado' : ''));
            let acaoHtml;
            if (p.presente) {
                acaoHtml = podeMarcar
                    ? `<button type="button" class="figurino-selo figurino-selo-entregue" onclick="desfazerPresenca('${p.tipo}', ${p.id})">✓ Presente</button>`
                    : `<span class="figurino-selo figurino-selo-entregue">✓ Presente</span>`;
            } else if (presencaConfirmando[`${p.tipo}-${p.id}`]) {
                acaoHtml = `<div class="figurino-confirmacao">
                    <span class="pergunta">Confirma?</span>
                    <div class="botoes">
                        <button type="button" class="figurino-btn-nao" onclick="cancelarConfirmacaoPresenca('${p.tipo}', ${p.id})">Cancelar</button>
                        <button type="button" class="figurino-btn-sim" onclick="marcarPresenca('${p.tipo}', ${p.id})">Sim</button>
                    </div>
                </div>`;
            } else {
                acaoHtml = podeMarcar
                    ? `<button type="button" class="figurino-selo figurino-selo-pendente" onclick="pedirConfirmacaoPresenca('${p.tipo}', ${p.id})">Não registrado</button>`
                    : `<span class="figurino-selo figurino-selo-pendente">Não registrado</span>`;
            }
            return `
            <div style="display:flex;align-items:center;gap:32px;padding:12px 0;border-bottom:1px solid #eee;">
                <div style="min-width:0;flex:1;">
                    <div style="font-weight:600;font-size:14px;">${esc(p.nome)}${p.apelido ? ` · <span style="color:#D4AF37;font-style:italic;font-weight:400;">${esc(p.apelido)}</span>` : ''}</div>
                    <div style="font-size:12px;color:var(--cor-texto-muted);">${detalhe}</div>
                </div>
                <div class="figurino-coluna-acao">${acaoHtml}</div>
            </div>`;
        };
        if (filtrada.length === 0) {
            container.innerHTML = '<div class="estado-vazio">Ninguém encontrado com esse filtro.</div>';
        } else if (presencaLadoAtual === 'ritmista') {
            container.innerHTML = filtrada.map(linhaHtml).join('');
        } else if (presencaLadoAtual === 'diretoria') {
            // Sub-divide por cargo específico (mesma divisão já usada em
            // Figurino).
            let html = '';
            ['mestre', 'diretor', 'apoio'].forEach(perfil => {
                const vinculos = filtrada.filter(p => p.perfil === perfil);
                if (vinculos.length === 0) return;
                html += `<div class="secao-titulo">${LABEL_PERFIL_DIRETORIA_PRESENCA[perfil]}</div>`;
                html += vinculos.map(linhaHtml).join('');
            });
            container.innerHTML = html;
        } else {
            // Aba Convidados (29/ago/2026, pedido dela: lugar separado,
            // dividido pelos mesmos títulos Ritmista/Diretor de Bateria/
            // Diretoria (Apoio)) -- Convidado nunca tem grupo "mestre".
            let html = '';
            [['ritmista', 'Ritmista'], ['diretor', LABEL_PERFIL_DIRETORIA_PRESENCA.diretor], ['apoio', LABEL_PERFIL_DIRETORIA_PRESENCA.apoio]].forEach(([perfil, label]) => {
                const doGrupo = filtrada.filter(p => p.perfil === perfil);
                if (doGrupo.length === 0) return;
                html += `<div class="secao-titulo">${label}</div>`;
                html += doGrupo.map(linhaHtml).join('');
            });
            container.innerHTML = html;
        }
    }

    function pedirConfirmacaoPresenca(tipo, id) { presencaConfirmando[`${tipo}-${id}`] = true; renderizarPresencaLista(); }
    function cancelarConfirmacaoPresenca(tipo, id) { delete presencaConfirmando[`${tipo}-${id}`]; renderizarPresencaLista(); }

    async function marcarPresenca(tipo, id) {
        const p = presencaPessoasCache.find(x => x.tipo === tipo && x.id === id);
        if (!p || !presencaEventoAtual) return;
        // Trava de verdade, não só visual (04/set/2026) -- cobre o caso raro
        // de alguém já ter aberto a confirmação "Sim/Cancelar" antes do
        // evento ser des-iniciado por outra pessoa.
        if (!presencaEventoAtual.iniciado || presencaEventoAtual.finalizado) { delete presencaConfirmando[`${tipo}-${id}`]; renderizarPresencaLista(); return; }
        delete presencaConfirmando[`${tipo}-${id}`];
        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        const bateriaId = bateriaIdContexto();
        // Convidado Especial é vínculo de verdade -- grava em vinculo_id
        // como qualquer outro vínculo, mesmo sendo tipo 'extra' na UI (só o
        // Convidado Simples usa extra_id de verdade). Ver
        // modoConvidadosEspecial().
        const usaVinculo = tipo === 'vinculo' || modoConvidadosEspecial();
        const conflictCol = usaVinculo ? 'vinculo_id' : 'extra_id';
        const payload = usaVinculo
            ? { evento_id: presencaEventoAtual.id, vinculo_id: id, pessoa_id: p.pessoa_id, bateria_id: bateriaId, confirmado_por: u ? u.pessoa_id : null }
            : { evento_id: presencaEventoAtual.id, extra_id: id, bateria_id: bateriaId, confirmado_por: u ? u.pessoa_id : null };
        const res = await fetch(`${SUPABASE_URL}/rest/v1/evento_presencas?on_conflict=evento_id,${conflictCol}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates', ...authHeaders },
            body: JSON.stringify(payload)
        });
        if (!res.ok) { mostrarToast('Não foi possível marcar presença.', 'erro'); renderizarPresencaLista(); return; }
        p.presente = true;
        renderizarPresencaLista();
        atualizarTotalizadorPresenca();
    }
    async function desfazerPresenca(tipo, id) {
        const p = presencaPessoasCache.find(x => x.tipo === tipo && x.id === id);
        if (!p || !presencaEventoAtual) return;
        const col = (tipo === 'vinculo' || modoConvidadosEspecial()) ? 'vinculo_id' : 'extra_id';
        const res = await fetch(`${SUPABASE_URL}/rest/v1/evento_presencas?evento_id=eq.${presencaEventoAtual.id}&${col}=eq.${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) { mostrarToast('Não foi possível desfazer.', 'erro'); return; }
        p.presente = false;
        renderizarPresencaLista();
        atualizarTotalizadorPresenca();
    }

    // ══════════════════════════════════════════════════════════════════
    // LEITOR DE QR (29/ago/2026) -- câmera dentro do próprio app (não abre
    // link/navegador), lê o mesmo QR já usado na carteirinha/emergência
    // (pessoas.qr_token) e marca presença sozinho, sem precisar clicar na
    // lista. Só Ritmista/Diretoria têm QR -- Convidados não têm carteirinha
    // (nunca vão "achar" nada escaneando, e tudo bem, eles continuam
    // marcáveis manualmente na lista de sempre).
    // ══════════════════════════════════════════════════════════════════
    let presencaScannerStream = null;
    let presencaScannerAnimId = null;
    let presencaScannerUltimoToken = null;
    let presencaScannerUltimoTs = 0;

    async function abrirScannerPresenca() {
        if (!presencaEventoAtual) return;
        if (typeof jsQR !== 'function') { mostrarToast('O leitor de QR ainda não carregou -- tenta de novo em alguns segundos.', 'erro'); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { mostrarToast('Esse navegador não dá acesso à câmera. Marque a presença manualmente na lista.', 'erro'); return; }
        const overlay = document.getElementById('presenca-scanner-overlay');
        document.getElementById('presenca-scanner-evento').textContent = presencaEventoAtual.nome;
        document.getElementById('presenca-scanner-feedback').innerHTML = '';
        presencaScannerUltimoToken = null;
        overlay.style.display = 'block';
        try {
            presencaScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch (e) {
            mostrarToast('Não consegui acessar a câmera -- confira a permissão do navegador pro TumTu.', 'erro');
            overlay.style.display = 'none';
            return;
        }
        const video = document.getElementById('presenca-scanner-video');
        video.srcObject = presencaScannerStream;
        await video.play();
        presencaScannerLoop();
    }

    function fecharScannerPresenca() {
        document.getElementById('presenca-scanner-overlay').style.display = 'none';
        if (presencaScannerAnimId) cancelAnimationFrame(presencaScannerAnimId);
        presencaScannerAnimId = null;
        if (presencaScannerStream) {
            presencaScannerStream.getTracks().forEach(t => t.stop());
            presencaScannerStream = null;
        }
    }

    // QR do próprio evento (29/ago/2026) -- o Diretor abre/projeta essa
    // tela, cada Ritmista escaneia com a câmera do PRÓPRIO celular (fora do
    // app) e cai em presenca.html, que confirma sozinho -- sem o Diretor
    // precisar escanear ninguém. Aponta pra mesma URL base do site (rota
    // limpa, sem .html -- ver vercel.json).
    function abrirQrEvento() {
        if (!presencaEventoAtual) return;
        if (typeof QRCode !== 'function') { mostrarToast('O QR ainda não carregou -- tenta de novo em alguns segundos.', 'erro'); return; }
        document.getElementById('presenca-qr-evento').textContent = presencaEventoAtual.nome;
        const container = document.getElementById('presenca-qr-codigo');
        container.innerHTML = '';
        const url = `${window.location.origin}/presenca?e=${presencaEventoAtual.id}`;
        new QRCode(container, { text: url, width: 240, height: 240, colorDark: '#12101a', colorLight: '#ffffff' });
        document.getElementById('presenca-qr-overlay').style.display = 'block';
    }

    function fecharQrEvento() {
        document.getElementById('presenca-qr-overlay').style.display = 'none';
    }

    // QR da peça de Figurino (29/ago/2026) -- mesma ideia do QR do evento em
    // Presença: a pessoa escaneia com a câmera do PRÓPRIO celular na hora de
    // pegar a peça e confirma sozinha (ver figurino.html).
    function abrirQrFigurino() {
        const item = figurinoEntregaItemAtual;
        if (!item) return;
        if (typeof QRCode !== 'function') { mostrarToast('O QR ainda não carregou -- tenta de novo em alguns segundos.', 'erro'); return; }
        document.getElementById('figurino-qr-item').textContent = item.nome;
        const container = document.getElementById('figurino-qr-codigo');
        container.innerHTML = '';
        const url = `${window.location.origin}/figurino?f=${item.id}`;
        new QRCode(container, { text: url, width: 240, height: 240, colorDark: '#12101a', colorLight: '#ffffff' });
        document.getElementById('figurino-qr-overlay').style.display = 'block';
    }

    function fecharQrFigurino() {
        document.getElementById('figurino-qr-overlay').style.display = 'none';
    }

    // Imprimir o QR (29/ago/2026) -- depois de 3 tentativas de fazer o
    // overlay em cima do app imprimir direto (sempre em branco pra ela,
    // mesmo com a regra certa e o overflow do body corrigido), abandonado
    // esse caminho. Em vez de brigar com o CSS do app inteiro, abre uma
    // JANELA NOVA, mínima, só com o título + a imagem do QR (extraída do
    // <canvas> já desenhado na tela, via toDataURL) -- não tem NADA do
    // resto do app nessa janela pra atrapalhar a impressão.
    function imprimirQrEmJanela(titulo, containerId) {
        const canvas = document.querySelector(`#${containerId} canvas`);
        if (!canvas) { mostrarToast('O QR ainda não carregou -- tenta de novo em alguns segundos.', 'erro'); return; }
        const dataUrl = canvas.toDataURL('image/png');
        const win = window.open('', '_blank', 'width=420,height=560');
        if (!win) { mostrarToast('O navegador bloqueou a janela de impressão -- permite pop-ups pro TumTu e tenta de novo.', 'erro'); return; }
        win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(titulo)}</title>
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family: Arial, sans-serif; text-align:center; padding:40px 20px; }
                h1 { font-size:18px; margin-bottom:24px; color:#12101a; }
                img { width:280px; height:280px; }
            </style></head>
            <body><h1>${esc(titulo)}</h1><img src="${dataUrl}"></body></html>`);
        win.document.close();
        win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 250); };
    }

    function imprimirQrEvento() {
        if (!presencaEventoAtual) return;
        imprimirQrEmJanela(presencaEventoAtual.nome, 'presenca-qr-codigo');
    }

    function imprimirQrFigurino() {
        if (!figurinoEntregaItemAtual) return;
        imprimirQrEmJanela(figurinoEntregaItemAtual.nome, 'figurino-qr-codigo');
    }

    function presencaScannerLoop() {
        const video = document.getElementById('presenca-scanner-video');
        if (!video || document.getElementById('presenca-scanner-overlay').style.display === 'none') return;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            presencaScannerAnimId = requestAnimationFrame(presencaScannerLoop);
            return;
        }
        const canvas = document.getElementById('presenca-scanner-canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codigo = jsQR(imagem.data, imagem.width, imagem.height);
        if (codigo && codigo.data) processarQrEscaneado(codigo.data);
        presencaScannerAnimId = requestAnimationFrame(presencaScannerLoop);
    }

    // O QR da carteirinha é uma URL (`.../qr?t=<qr_token>`) -- extrai só o
    // token; se por algum motivo vier só o token puro (sem URL), usa o
    // texto lido direto, pra não travar em nenhum dos dois formatos.
    function extrairQrTokenDaLeitura(texto) {
        try {
            const url = new URL(texto);
            const t = url.searchParams.get('t');
            if (t) return t;
        } catch (e) { /* não era uma URL válida -- tenta como token puro abaixo */ }
        return (texto || '').trim();
    }

    async function processarQrEscaneado(textoLido) {
        const token = extrairQrTokenDaLeitura(textoLido);
        const agora = Date.now();
        // A câmera lê o mesmo QR em quase todo frame enquanto a pessoa não
        // afasta o celular -- sem isso, marcaria/desmarcaria em looping.
        // Só processa de novo depois de 3s, ou se já mudou o token.
        if (token === presencaScannerUltimoToken && (agora - presencaScannerUltimoTs) < 3000) return;
        presencaScannerUltimoToken = token;
        presencaScannerUltimoTs = agora;

        const feedback = document.getElementById('presenca-scanner-feedback');
        const pessoa = presencaPessoasCache.find(p => p.tipo === 'vinculo' && p.qr_token === token);
        if (!pessoa) {
            feedback.innerHTML = `<div style="color:#e2986e;font-weight:700;">QR não reconhecido pra este evento.</div>`;
            return;
        }
        if (pessoa.presente) {
            feedback.innerHTML = `<div style="color:#D4AF37;font-weight:700;">${esc(pessoa.nome)} já estava presente.</div>`;
            return;
        }
        feedback.innerHTML = `<div style="color:#8d88a3;">Marcando ${esc(pessoa.nome)}...</div>`;
        await marcarPresenca('vinculo', pessoa.id);
        feedback.innerHTML = `<div style="color:#5cb85c;font-weight:700;font-size:16px;">✓ ${esc(pessoa.nome)} — presença marcada!</div>`;
    }

    // ══════════════════════════════════════════════════════════════════
    // SUPER ADMIN — portado de super-admin.html (Etapa 2 da unificação,
    // 18/ago/2026). Tudo abaixo só é acionado quando souSuperAdmin===true.
    // Super Admin sempre vê tudo, sem checagem de capacidade nenhuma.
    // ══════════════════════════════════════════════════════════════════
    let souSuperAdmin = false;
    let dentroDeEscolaSA = false;
    let saAbaAtual = 'dashboard';
    let escolaSelecionadaId = null;
    let escolaAtualData = null;

    // Capacidades da PESSOA LOGADA (não a de quem está sendo visualizada) --
    // resolvidas uma vez ao entrar no contexto da bateria, usadas pra
    // esconder aba/ação que ela não tem. Super Admin nunca passa por isso
    // (bypassa tudo, ver souSuperAdmin acima). Etapa 3 da unificação,
    // 19/ago/2026 -- antes disso nenhuma aba era travada por permissão pra
    // Admin comum.
    let minhasCapacidades = {};
    async function carregarMinhasCapacidades(bateriaId) {
        minhasCapacidades = {};
        if (souSuperAdmin || !bateriaId) return;
        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        if (!u || !u.pessoa_id) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/vinculos?pessoa_id=eq.${u.pessoa_id}&bateria_id=eq.${bateriaId}&select=capacidades`, { headers: authHeaders });
        if (res.ok) {
            const dados = await res.json();
            minhasCapacidades = (dados && dados[0] && dados[0].capacidades) || {};
        }
    }
    function tenhoCapacidade(chave) {
        return souSuperAdmin || !!minhasCapacidades[chave];
    }

    // Mapa aba -> capacidade de "ver" exigida. Abas fora deste mapa (Meu
    // Perfil) ficam sempre visíveis, pra qualquer pessoa logada.
    const CAPACIDADE_DA_ABA = {
        'dados-escola': 'ver_dados_escola',
        'dados-bateria': 'ver_dados_bateria',
        'visao': 'ver_visao_geral',
        'ritmistas': 'ver_ritmistas',
        'diretoria': 'ver_acessos',
        'permissoes': 'ver_permissoes',
        'historico': 'ver_historico',
        'figurino': 'ver_figurino',
        'extras': 'ver_extras',
        'presenca': 'ver_eventos',
    };

    // A aba "Configurações" aparece se a pessoa tiver QUALQUER capacidade de
    // ver/editar de qualquer uma das 4 sub-telas (ver CAPACIDADE_CONFIG_SUBTELA).
    // "Comercial" (Modo Carteirinha) é EXCLUSIVO de Super Admin, sempre --
    // decisão comercial, nunca uma permissão configurável pra Mestre/Diretor/
    // Apoio, nem por engano (achado da Márcia, 28/ago/2026: existia
    // ver_comercial/editar_comercial no catálogo, dava pra conceder sem
    // querer). `tenhoCapacidade` sozinho não bastava aqui -- precisa negar
    // mesmo que `souSuperAdmin` mude de contexto no futuro.
    function podeVerAba(aba) {
        if (aba === 'comercial') return souSuperAdmin;
        if (aba === 'configuracoes') return Object.keys(CAPACIDADE_CONFIG_SUBTELA).some(nome => podeVerConfigSubtela(nome));
        // "Convidados" (31/ago/2026) roteia sozinho pro modelo ativo da
        // bateria (Simples ou Especial, ver modoConvidadosEspecial) -- a
        // capacidade exigida depende de qual dos dois está em uso.
        if (aba === 'extras') return modoConvidadosEspecial() ? tenhoCapacidade('ver_convidados_especiais') : tenhoCapacidade('ver_extras');
        const capacidadeExigida = CAPACIDADE_DA_ABA[aba];
        return !capacidadeExigida || tenhoCapacidade(capacidadeExigida);
    }
    // Sub-módulos agrupados dentro da aba "Administrativo" (19/ago/2026,
    // pedido da Márcia pra enxugar o menu no celular) -- a aba em si não
    // tem uma capacidade própria, aparece se a pessoa tiver QUALQUER uma
    // das capacidades dos itens que ela agrupa.
    const ABAS_ADMINISTRATIVO = ['dados-escola', 'dados-bateria', 'comercial', 'configuracoes', 'figurino', 'extras', 'presenca', 'permissoes', 'historico'];

    // Mostra/esconde cada aba de acordo com minhasCapacidades, e troca pra
    // primeira aba visível se a que estava ativa sumiu. Super Admin nunca
    // chama isso de verdade (sempre vê tudo, ver entrarContextoEscolaSA).
    function aplicarGatingAbas() {
        if (souSuperAdmin) return;
        let primeiraVisivel = null;
        document.querySelectorAll('#navAbasEscola .aba-btn').forEach(btn => {
            const aba = btn.dataset.aba;
            const visivel = aba === 'administrativo'
                ? ABAS_ADMINISTRATIVO.some(a => podeVerAba(a))
                : podeVerAba(aba);
            btn.style.display = visivel ? '' : 'none';
            if (visivel && !primeiraVisivel) primeiraVisivel = aba;
        });
        const abaAtivaEl = document.querySelector('#navAbasEscola .aba-btn.ativa');
        const abaAtivaEscondida = abaAtivaEl && abaAtivaEl.style.display === 'none';
        if (abaAtivaEscondida || !abaAtivaEl) {
            trocarAba(primeiraVisivel || 'meu-perfil', primeiraVisivel ? document.querySelector(`.aba-btn[data-aba="${primeiraVisivel}"]`) : null);
        }
    }

    // Botões de Exportar (dentro de Ritmistas/Diretoria, era a aba
    // "Relatórios" -- incorporados em 19/ago/2026) continuam com trava
    // própria (exportar_ritmistas/exportar_diretoria, separadas desde a
    // Reforma de Permissões de 27-28/ago/2026), diferente de só poder ver a
    // lista: exportar tira dado sensível (CPF, endereço...) de dentro do
    // sistema.
    function aplicarGatingBotoesExportar() {
        const be = document.getElementById('btnExportarConvidadosEspeciais');
        if (be) be.style.display = (souSuperAdmin || tenhoCapacidade('exportar_convidados_especiais')) ? '' : 'none';
        if (souSuperAdmin) return;
        const br = document.getElementById('btnExportarRitmistas');
        const bd = document.getElementById('btnExportarDiretoria');
        if (br) br.style.display = tenhoCapacidade('exportar_ritmistas') ? '' : 'none';
        if (bd) bd.style.display = tenhoCapacidade('exportar_diretoria') ? '' : 'none';
    }

    // "+ Novo cadastro" (Ritmistas/Diretoria) -- três camadas independentes
    // (28/ago/2026, pedido dela): "Visualizar Novo Cadastro" (a seção
    // inteira só existe com essa), "Criar Novo Cadastro" (só o botão de
    // cadastro manual) e "Copiar Link de Cadastro" (só a caixinha do
    // link) -- dá pra ter uma sem a outra, nas duas combinações (ex:
    // alguém que cadastra pessoalmente mas não deve ficar espalhando o
    // link sozinho). O cabeçalho inteiro some sem "Visualizar"; com ele,
    // o botão de cadastrar fica cinza/travado sem "Criar" (nunca some --
    // é o único caso, junto do link, onde "ver sem poder mexer" faz
    // sentido, mesmo padrão já usado em Configurações). A caixinha do
    // link em si (mostrar o endereço de verdade ou o aviso mascarado) é
    // decidida dentro de renderizarLinkCadastroRitmista/Diretoria, na
    // hora de desenhar o HTML -- não dá pra só esconder com CSS aqui,
    // senão o endereço real ainda estaria no código da página.
    function aplicarGatingNovoCadastro() {
        if (souSuperAdmin) return;
        const cr = document.getElementById('cadastroRitmistaCabecalho');
        const cd = document.getElementById('cadastroDiretoriaCabecalho');
        if (cr) cr.style.display = tenhoCapacidade('ver_novo_cadastro_ritmistas') ? '' : 'none';
        if (cd) cd.style.display = tenhoCapacidade('ver_novo_cadastro_diretoria') ? '' : 'none';

        const podeCriarRitmista = tenhoCapacidade('criar_cadastro_ritmistas');
        const btnCadRitmista = document.getElementById('btnCadastrarRitmista');
        if (btnCadRitmista) {
            btnCadRitmista.disabled = !podeCriarRitmista;
            btnCadRitmista.style.opacity = podeCriarRitmista ? '1' : '0.5';
            btnCadRitmista.style.cursor = podeCriarRitmista ? 'pointer' : 'not-allowed';
        }

        const podeCriarDiretoria = tenhoCapacidade('criar_cadastro_diretoria');
        const botoesDiretoria = document.getElementById('cadastroDiretoriaBotoes');
        if (botoesDiretoria) {
            botoesDiretoria.querySelectorAll('button').forEach(b => {
                b.disabled = !podeCriarDiretoria;
                b.style.opacity = podeCriarDiretoria ? '1' : '0.5';
                b.style.cursor = podeCriarDiretoria ? 'pointer' : 'not-allowed';
            });
        }
    }

    // Lista lançadora da aba "Administrativo" -- cada linha só aparece se a
    // pessoa tiver a capacidade daquele módulo (Super Admin vê todas).
    const ADMINISTRATIVO_ITENS = [
        { aba: 'dados-escola', label: 'Dados da Escola' },
        { aba: 'dados-bateria', label: 'Dados da Bateria' },
        { aba: 'configuracoes', label: 'Configurações' },
        { aba: 'extras', label: 'Convidados' },
        { aba: 'figurino', label: 'Entrega de Figurino' },
        { aba: 'presenca', label: 'Lista de Presença' },
        { aba: 'permissoes', label: 'Permissões' },
        { aba: 'historico', label: 'Histórico' },
        // Só o Super Admin enxerga esse item (ver podeVerAba) -- fica por
        // último de propósito, pedido dela (01/set/2026).
        { aba: 'comercial', label: 'Comercial' },
    ];
    function itensAdministrativoVisiveis() {
        return ADMINISTRATIVO_ITENS.filter(i => souSuperAdmin || podeVerAba(i.aba));
    }
    function renderizarAdministrativoLista() {
        const div = document.getElementById('admListaConteudo');
        if (!div) return;
        const abaAdmBtn = document.querySelector('.aba-btn[data-aba="administrativo"]');
        const itens = itensAdministrativoVisiveis();
        if (!itens.length) { div.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">🔒</div>Nenhum módulo disponível pra você aqui.</div>'; return; }
        const pendConv = pendentesConvidadosEspeciaisCount();
        div.innerHTML = itens.map(i => `
            <div class="config-item" onclick="trocarAba('${i.aba}', document.querySelector('.aba-btn[data-aba=administrativo]'))">
                <span>${i.label}${i.aba === 'extras' && pendConv > 0 ? `<span class="config-item-badge">${pendConv}</span>` : ''}</span>
                <span class="config-item-seta">›</span>
            </div>`).join('');
        if (abaAdmBtn) abaAdmBtn.classList.add('ativa');
    }

    // "Mais" no computador: acordeão que abre ali mesmo na barra lateral
    // (pedido da Márcia, 20/ago/2026: "pensei em colocar uma seta e esse
    // menu abrir para baixo"). No celular (rodapé, sem espaço vertical pra
    // abrir inline) continua indo pra tela própria de sempre.
    function onClickMais(el) {
        if (window.innerWidth <= 560) { trocarAba('administrativo', el); return; }
        const submenu = document.getElementById('abaMaisSubmenu');
        const abrir = !submenu.classList.contains('aberto');
        if (abrir) renderizarMaisSubmenu();
        submenu.classList.toggle('aberto', abrir);
        el.classList.toggle('aberto', abrir);
    }
    function renderizarMaisSubmenu() {
        const div = document.getElementById('abaMaisSubmenu');
        const itens = itensAdministrativoVisiveis();
        const pendConv = pendentesConvidadosEspeciaisCount();
        div.innerHTML = itens.length
            ? itens.map(i => `<button type="button" class="aba-sub-btn" onclick="clicarSubMais('${i.aba}', this)">${i.label}${i.aba === 'extras' && pendConv > 0 ? `<span class="config-item-badge">${pendConv}</span>` : ''}</button>`).join('')
            : '<div style="padding:8px 10px;font-size:12px;color:rgba(255,255,255,0.45);">Nenhum módulo disponível.</div>';
    }
    function clicarSubMais(aba, el) {
        trocarAba(aba, null);
        el.classList.add('ativa');
    }

    let bateriaAtualData = null;
    let escolasCache = [];
    let bateriasCache = [];
    let logoPendente = { escolaNova: null, escolaEdicao: null, bateria: null };

    // Mede a altura real do cabeçalho pra barra lateral do Super Admin nunca
    // ficar por baixo dele (mesmo truque de super-admin.html, 21/jul/2026).
    function ajustarAlturaHeaderAdmin() {
        const header = document.getElementById('pageHeader');
        if (header) document.documentElement.style.setProperty('--altura-header-admin', header.offsetHeight + 'px');
    }
    window.addEventListener('resize', ajustarAlturaHeaderAdmin);

    // Mede a altura real do rodapé fixo (#navAbasEscola no celular) --
    // achado da Márcia, 20/ago/2026: a pílula "‹ Escolas" tentou um valor
    // "chutado" (64px + safe-area) pra ficar acima do rodapé, mas ficou
    // sobrepondo o ícone de Visão Geral em telas reais. Medir de verdade
    // em vez de estimar evita esse tipo de erro em qualquer aparelho.
    let _diagnosticoRodapeEnviado = false;
    let _diagnosticoBtnVoltarEnviado = false;
    function ajustarAlturaNavMobile() {
        // Mede qualquer uma das duas barras fixas de baixo que estiver
        // visível no momento (Mestre/Diretor usa #navAbasEscola, Super
        // Admin usa #saSidebar -- nunca as duas ao mesmo tempo). Estendido
        // 05/set/2026: antes só media #navAbasEscola, então .sa-sidebar
        // usava a variável desatualizada/chutada (--altura-nav-mobile:70px)
        // ao virar `top` calculado em vez de `bottom:0`.
        const nav = document.getElementById('navAbasEscola');
        const sideb = document.getElementById('saSidebar');
        const alvo = (nav && nav.style.display !== 'none') ? nav : ((sideb && sideb.style.display !== 'none') ? sideb : null);
        if (alvo && window.innerWidth <= 600) {
            document.documentElement.style.setProperty('--altura-nav-mobile', alvo.offsetHeight + 'px');
        }
        // Diagnóstico real (06/set/2026) -- achado dela ao vivo: o rodapé
        // "ocupa a tela toda" no aparelho dela, e eu não consigo reproduzir
        // nem simular isso por aqui (largura de celular não é confiável no
        // navegador de teste). Em vez de arriscar mais um palpite, manda a
        // geometria REAL do elemento (tamanho, posição, se a media query
        // bateu) pro banco -- só uma vez por carregamento -- pra eu
        // conseguir ver o que está acontecendo de verdade no aparelho dela.
        if (alvo && !_diagnosticoRodapeEnviado) {
            _diagnosticoRodapeEnviado = true;
            setTimeout(() => {
                const r = alvo.getBoundingClientRect();
                const cs = getComputedStyle(alvo);
                logErroCliente('diagnostico_rodape', {
                    message: JSON.stringify({
                        elementoId: alvo.id,
                        innerWidth: window.innerWidth,
                        innerHeight: window.innerHeight,
                        mediaQueryBateu: window.matchMedia('(max-width: 560px)').matches,
                        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height },
                        display: cs.display,
                        flexDirection: cs.flexDirection,
                        position: cs.position,
                        top: cs.top,
                        bottom: cs.bottom,
                        height: cs.height,
                        devicePixelRatio: window.devicePixelRatio,
                    }),
                });
            }, 800);
        }
    }
    window.addEventListener('resize', ajustarAlturaNavMobile);

    // Lembra onde a pessoa estava (aba, e escola no caso do Super Admin)
    // pra atualizar a página não jogar todo mundo de volta pro início --
    // achado da Márcia, 20/ago/2026: "sempre que eu atualizo a página,
    // ela me leva para o dashboard... isso é um bug sério". Guardado em
    // localStorage (mesma chave some no sair(), pra nunca vazar pra
    // outra conta que logar depois no mesmo aparelho).
    function salvarEstadoNavegacao(contexto, aba, escolaId) {
        try {
            localStorage.setItem('tumtu_admin_estado', JSON.stringify({ contexto, aba, escolaId: escolaId || null }));
        } catch (e) {}
    }
    function lerEstadoNavegacaoSalvo() {
        try {
            return JSON.parse(localStorage.getItem('tumtu_admin_estado') || 'null');
        } catch (e) { return null; }
    }

    function esc(val) {
        if (!val) return '';
        return String(val).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function mostrarToast(msg, tipo = 'ok') {
        const t = document.getElementById('toast');
        t.textContent = tipo === 'ok' ? '✓  ' + msg : '✕  ' + msg;
        t.className = 'toast visivel ' + tipo;
        setTimeout(() => { t.className = 'toast'; }, 3500);
    }

    function fecharSeForaModal(event, overlayId, fecharFn) {
        if (event.target.id === overlayId) window[fecharFn]();
    }

    // ── UPLOAD DE LOGO (escola e bateria) ──────────────────────────────
    const LOGO_PREVIEW_IDS = { escolaNova: 'nova-escola-logo-preview', escolaEdicao: 'escola-logo-preview', bateria: 'bat-logo-preview' };
    function previewLogo(input, contexto) {
        if (!input.files || !input.files[0]) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const MAX = 500;
                let w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    const escala = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * escala); h = Math.round(h * escala);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const base64 = canvas.toDataURL('image/png');
                logoPendente[contexto] = base64;
                document.getElementById(LOGO_PREVIEW_IDS[contexto]).innerHTML = `<img src="${base64}">`;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }

    // ── PREVIEW DE COR ──────────────────────────────────────────────────
    function montarPreviewCores(idsCores) {
        const cores = idsCores.map(id => document.getElementById(id)?.value.trim() || '').filter(Boolean);
        if (!cores.length) return `<span style="font-size:13px;color:#999">Sem cores definidas</span>`;
        const circulos = cores.map(c => `<div class="preview-circulo" style="background:${c}"></div>`).join('');
        return `${circulos}<span class="preview-texto">Cores da escola</span>`;
    }
    function atualizarPreviewEscola() {
        const preview = document.getElementById('preview-escola');
        if (!preview) return;
        preview.innerHTML = montarPreviewCores(['escola-cor-primaria','escola-cor-secundaria','escola-cor-terciaria','escola-cor-quaternaria']);
    }
    function atualizarPreviewNovaEscola() {
        const preview = document.getElementById('preview-nova-escola');
        if (!preview) return;
        preview.innerHTML = montarPreviewCores(['nova-escola-cor-primaria','nova-escola-cor-secundaria','nova-escola-cor-terciaria','nova-escola-cor-quaternaria']);
    }

    // ══════════════════════════════════════════════════════════════════
    // NAVEGAÇÃO SUPER ADMIN — barra lateral (Dashboard/Escolas/
    // Configurações/Privacidade) vs. contexto de escola (barra horizontal
    // que Admin comum já usa, com 4 abas extras só pra Super Admin).
    // ══════════════════════════════════════════════════════════════════
    function mostrarShellSA() {
        dentroDeEscolaSA = false;
        resetTemaHeaderPadrao();
        document.getElementById('saSidebar').style.display = 'flex';
        document.getElementById('saMain').style.display = 'flex';
        document.getElementById('navAbasEscola').style.display = 'none';
        document.getElementById('mainEscola').style.display = 'none';
        document.getElementById('btnVoltarEscolasNav').style.display = 'none';
        document.getElementById('headerEscolaNome').textContent = 'Super Admin';
        document.getElementById('headerEscolaNome').style.display = '';
        document.getElementById('headerBateriaNome').textContent = '';
        document.getElementById('headerBateriaNome').style.display = 'none';
        // #saSidebar passou a precisar dessa medida de verdade também
        // (05/set/2026, ver comentário em ajustarAlturaNavMobile) -- antes
        // usava bottom:0, que não dependia disso.
        ajustarAlturaNavMobile();
    }

    async function trocarSaAba(aba, el) {
        // O BOTÃO acende na hora, antes de qualquer busca no banco --
        // separado de propósito do conteúdo (mais abaixo), que continua só
        // aparecendo quando estiver pronto. Achado dela, 05/set/2026: numa
        // conexão lenta, o botão ficava sem nenhuma resposta visual até os
        // dados chegarem (podendo levar vários segundos) -- parecia que o
        // clique não tinha registrado, e ela clicava de novo. Isso não viola
        // a regra de "nunca revelar tela pela metade" (01/set/2026): o
        // destaque é só do BOTÃO em si, não do painel de conteúdo.
        document.querySelectorAll('.sa-sidebar-item').forEach(x => x.classList.remove('ativa'));
        if (el) el.classList.add('ativa');

        // A partir daqui vai tudo dentro de um try/catch (06/set/2026) --
        // achado dela ao vivo: trocar de aba "não fazia nada" em momentos
        // imprevisíveis, sem nenhum aviso. Se uma dessas buscas falhar no
        // meio do caminho (rede, resposta inesperada), a função parava
        // silenciosamente bem aqui -- o botão acendia (linha de cima) mas o
        // painel nunca trocava, e ninguém via o motivo. Agora pelo menos
        // fica registrado (logErroCliente) pra investigar com dado real.
        try {
        // Busca os dados ANTES de trocar o painel visível -- fica na aba
        // atual, sem nada "carregando" (nem spinner, nem overlay), até a
        // aba nova estar pronta pra aparecer já montada de uma vez. Achado
        // dela, 01/set/2026, depois de 2 tentativas erradas (spinner
        // interno, depois overlay de tela cheia): mesmo modelo de
        // Ritmistas/Diretoria, nenhuma etapa intermediária visível. "Meu
        // Perfil" fica de fora dessa troca de ordem -- usa o motor único de
        // ficha (fpMontar), que sempre foi montado com o container já
        // visível, igual em toda outra tela que o usa.
        if (aba === 'dashboard') await carregarDashboard();
        else if (aba === 'escolas') await carregarEscolas();
        else if (aba === 'privacidade') await carregarPrivacidade();

        window.scrollTo(0, 0);
        saAbaAtual = aba;
        salvarEstadoNavegacao('sa-shell', aba);
        document.querySelectorAll('.sa-painel').forEach(p => p.classList.remove('ativo'));
        const alvo = document.getElementById('sa-painel-' + aba);
        if (alvo) alvo.classList.add('ativo');
        // Recalcula a altura do cabeçalho toda vez que troca de aba aqui na
        // casca do Super Admin -- achado dela, 25/ago/2026: saindo de dentro
        // de uma escola (cabeçalho pode ficar mais alto, com cor/logo
        // própria) de volta pro Dashboard/Escolas, a barra lateral (.sa-
        // sidebar, position:fixed) ficava presa na altura antiga (mais alta),
        // sobrando um vão branco entre o cabeçalho de verdade e ela.
        ajustarAlturaHeaderAdmin();
        if (aba === 'configuracoes-globais') voltarConfigListaSA();
        else if (aba === 'meu-perfil') await iniciarMeuPerfilSaAba();
        } catch (err) {
            console.error('trocarSaAba falhou:', err);
            logErroCliente('trocarSaAba:' + aba, err);
        }
    }

    // Meu Perfil do Super Admin, fora do contexto de uma escola -- mesmo
    // conteúdo/motor único de iniciarMeuPerfilAba(), só que montado no
    // container próprio do Super Admin (#fp-container-sa-meuperfil), já
    // que #saMain e #mainEscola são blocos irmãos independentes.
    async function iniciarMeuPerfilSaAba() {
        const u = JSON.parse(localStorage.getItem('ritmista') || 'null');
        if (!u) return;
        const container = document.getElementById('fp-container-sa-meuperfil');
        await fpMontar(container);
        // Sem isso, salvar uma foto/nome novo em Meu Perfil atualiza o
        // localStorage (ver fpSalvar em ficha-perfil.js) mas a bolinha do
        // cabeçalho fica com o valor antigo até a página recarregar --
        // achado da Márcia, 24/ago/2026 ("acabei de colocar a foto do super
        // admin e não está aparecendo no ícone do usuário no header").
        fpIniciar(u, u.perfil, u.pessoa_id, { aoSalvar: (novosDados) => renderizarAvatarHeader(novosDados) });
        container.querySelector('#fp-ver-carteirinha').innerHTML =
            u.status === 'aprovado'
                ? `<button class="btn-ficha btn-ficha-carteirinha" onclick="abrirCarteirinha(${u.id})">Ver carteirinha ↗</button>`
                : '';
    }

    // Entra no contexto de uma escola -- reaproveita 100% o que admin.html já
    // usa pro próprio Mestre/Diretor (carregarRitmistas, carregarDiretoria,
    // renderizarLinkCadastroRitmista, renderizarLinksCadastroDiretoria,
    // aplicarConfigEscola etc), só trocando de onde vem o bateria_id (ver
    // bateriaIdContexto()).
    async function entrarContextoEscolaSA(escolaId) {
        window.scrollTo(0, 0);
        escolaSelecionadaId = escolaId;
        dentroDeEscolaSA = true;

        // Spinner dourado cobre a tela enquanto busca a cor/logo real da
        // escola -- sem isso, o cabeçalho nascia preto/TumTu por um instante
        // e só depois de vários pedidos ao banco virava a cor da escola
        // (achado da Márcia, 19/ago/2026). Só sai da tela quando o tema já
        // está aplicado, igual ao login.html/carteirinha.html já fazem.
        mostrarOverlayCarregando();

        // 25/ago/2026: paraleliza os pedidos ao banco que não dependem um
        // do outro -- antes eram 5 pedidos em fila, cada um esperando o
        // anterior terminar sem precisar (achado dela: "demora muito pra
        // carregar" ao entrar numa escola). Escola, baterias e a
        // biblioteca mestre de instrumentos não dependem entre si, então
        // rodam juntos; só o que depende de já saber qual é a bateria
        // (instrumentos DESSA bateria, nome da escola/bateria) espera essa
        // primeira leva terminar.
        const [resE] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/escolas?id=eq.${escolaId}`, { headers: authHeaders }),
            carregarBaterias(escolaId),
            carregarBibliotecaInstrumentos(),
        ]);
        const dadosE = await resE.json();
        escolaAtualData = Array.isArray(dadosE) && dadosE[0] ? dadosE[0] : null;

        bateriaAtualData = bateriasCache[0] || null;
        diretoriaCarregada = false; // troca de escola invalida o cache de Diretoria da escola anterior
        convidadosEspeciaisCarregados = false; // idem, Convidados (01/set/2026, mesmo raciocínio)

        document.getElementById('saSidebar').style.display = 'none';
        document.getElementById('saMain').style.display = 'none';
        document.getElementById('navAbasEscola').style.display = 'flex';
        document.getElementById('mainEscola').style.display = 'flex';
        document.getElementById('btnVoltarEscolasNav').style.display = 'flex';
        document.querySelectorAll('.aba-btn-sa').forEach(el => el.style.display = '');
        // Diagnóstico real (06/set/2026) -- ela reportou o botão "Super
        // Admin" (voltar de dentro de uma bateria) sumido no celular; não
        // achei nenhuma regra/JS escondendo ele de propósito, e este
        // ambiente não simula largura de celular de verdade pra reproduzir.
        // Mesmo padrão já usado em ajustarAlturaNavMobile(): manda a
        // geometria REAL do elemento pro banco, uma vez, pra investigar com
        // dado real em vez de mais palpite.
        if (!_diagnosticoBtnVoltarEnviado) {
            _diagnosticoBtnVoltarEnviado = true;
            setTimeout(() => {
                const el = document.getElementById('btnVoltarEscolasNav');
                if (!el) return;
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                logErroCliente('diagnostico_btn_voltar_sa', {
                    message: JSON.stringify({
                        innerWidth: window.innerWidth,
                        innerHeight: window.innerHeight,
                        mediaQueryBateu: window.matchMedia('(max-width: 560px)').matches,
                        rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height },
                        display: cs.display,
                        position: cs.position,
                        bottom: cs.bottom,
                        zIndex: cs.zIndex,
                        alturaNavMobileVar: getComputedStyle(document.documentElement).getPropertyValue('--altura-nav-mobile'),
                        visibility: cs.visibility,
                        opacity: cs.opacity,
                    }),
                });
            }, 800);
        }

        await Promise.all([
            carregarBateriaInstrumentos(),
            bateriaAtualData ? carregarNomeEscolaBateria(bateriaAtualData.id) : Promise.resolve(),
        ]);
        if (!bateriaAtualData) {
            configEscola.nomeEscola = escolaAtualData ? (escolaAtualData.sigla || escolaAtualData.nome || '') : '';
            configEscola.nomeEscolaCurto = escolaAtualData ? (escolaAtualData.nome_curto || '') : '';
            configEscola.nomeBateria = '(sem bateria cadastrada)';
            configEscola.temaPersonalizadoAtivo = false;
        }
        construirMultiSelect();
        aplicarConfigEscola();
        // Depois do tema da escola aplicado (pode mudar a altura do
        // cabeçalho com logo/cor própria) -- a barra lateral nova
        // (#navAbasEscola) precisa saber onde começar embaixo dele.
        ajustarAlturaHeaderAdmin();
        ajustarAlturaNavMobile();
        renderizarLinkCadastroRitmista();
        renderizarLinksCadastroDiretoria();

        renderizarDadosEscolaTab();
        renderizarDadosBateriaTab();
        renderizarComercialTab();

        trocarAba('visao', document.querySelector('.aba-btn[data-aba="visao"]'));
        // Espera a primeira leva de cada card terminar (ritmistas/diretoria
        // sem foto, extras, convidados) antes de tirar o spinner -- achado
        // da Márcia, 01/set/2026: a tela "montava em tempo real", cada card
        // estalando na hora que a própria busca terminava, dando impressão
        // de sistema amador. As fotos continuam chegando em segundo plano
        // depois, sem bloquear nada -- mesma otimização de sempre
        // (carregarRitmistasComFotos/carregarDiretoriaComFotos), só que
        // agora dá pra esperar só a primeira passada de cada uma.
        await Promise.all([
            carregarRitmistas(true),
            carregarDiretoria(true), // Super Admin sempre vê o card "Diretoria ativa"
            carregarConvidadosEspeciais(true), // idem, card "Convidados" (achado 01/set/2026, mesmo bug do card acima)
        ]);
        iniciarAutoRefreshRitmistas();

        esconderOverlayCarregando();
        // Fotos completas chegam depois, em segundo plano, sem travar a tela
        // nem os cliques (achado real, 05/set/2026 -- ver
        // preencherFotosRitmistasEmSegundoPlano acima).
        preencherFotosRitmistasEmSegundoPlano();
        preencherFotosDiretoriaEmSegundoPlano();
        convidadosEspeciaisCarregados = false; carregarConvidadosEspeciais();
    }

    async function voltarParaEscolasSA() {
        window.scrollTo(0, 0);
        escolaSelecionadaId = null; escolaAtualData = null; bateriaAtualData = null;
        // Busca os dados do Dashboard ANTES de revelar a casca do Super
        // Admin -- mesma regra de "tela sempre completa" de 01/set/2026.
        // trocarSaAba() já faz isso sozinho (busca -> só depois troca o
        // painel ativo), mas até então #saMain segue escondido (mostrarShellSA
        // só é chamado depois) -- então nada disso aparece até estar pronto.
        await trocarSaAba('dashboard', document.querySelector('.sa-sidebar-item[data-sa="dashboard"]'));
        mostrarShellSA();
    }

    // Atalho do Dashboard: "X pendentes" de uma bateria já abre direto em Diretoria.
    async function irParaAcessosDaBateria(escolaId) {
        await entrarContextoEscolaSA(escolaId);
        trocarAba('diretoria', document.querySelector('.aba-btn[data-aba="diretoria"]'));
    }

    // Clicar na bolinha de conta abre Meu Perfil -- mesmo comportamento nos
    // dois contextos (achado da Márcia, 21/ago/2026: "quando estou no super
    // admin... some tudo do menu... eu prefiro o primeiro comportamento
    // para os dois"): dentro de uma escola, só troca de aba (barra
    // continua); no painel geral (Dashboard/Escolas/Configurações/
    // Privacidade), vira só mais uma aba da barra lateral do Super Admin,
    // que também continua visível -- nunca mais esconde a barra inteira.
    function abrirMeuPerfilSA() {
        if (!souSuperAdmin) return;
        if (dentroDeEscolaSA) { trocarAba('meu-perfil', null); return; }
        trocarSaAba('meu-perfil', null);
    }

    // ══════════════════════════════════════════════════════════════════
    // DASHBOARD (agregado, todas as escolas)
    // ══════════════════════════════════════════════════════════════════
    async function carregarDashboard() {
        const kpisEl = document.getElementById('dashboard-kpis');
        const atencaoEl = document.getElementById('dashboard-atencao');
        const anivEl = document.getElementById('dashboard-aniversariantes');
        const container = document.getElementById('dashboard-lista-baterias');
        const demoEl = document.getElementById('dashboard-escolas-demo');
        const ativEl = document.getElementById('dashboard-atividade');
        const [resBaterias, resEscolas, resVinculos, resAniv, resEventosAtivos, resFigurinoAtivo] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/baterias?select=id,nome,escola_id,logo_url&order=nome`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/escolas?select=id,nome,temporada_atual,tipo,cor_primaria,cor_secundaria,cor_terciaria,cor_quaternaria`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/vinculos?select=bateria_id,status,perfil,eh_convidado`, { headers: authHeaders }),
            // Aniversariantes de hoje/amanhã (pedido dela, 01/set/2026: mês
            // inteiro é inviável -- só na Imperatriz são 15-16/mês) -- mesmo
            // filtro de renderizarVisaoGeral (eh_convidado=false, só quem
            // está ativo agora), só que agregado em todas as baterias.
            fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?status=eq.aprovado&eh_convidado=eq.false&select=nome,apelido,nascimento,genero,perfil,instrumento_nome,bateria_id`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/eventos?iniciado=eq.true&finalizado=eq.false&select=id,bateria_id`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/bateria_figurino_itens?ativo=eq.true&mostra_visao_geral=eq.true&entrega_finalizada=eq.false&select=id,bateria_id`, { headers: authHeaders }),
        ]);
        const todasEscolas = await resEscolas.json();
        const todasBaterias = await resBaterias.json();
        const vinculos = await resVinculos.json();
        const pessoasAniv = resAniv.ok ? await resAniv.json() : [];
        const eventosAtivos = resEventosAtivos.ok ? await resEventosAtivos.json() : [];
        const figurinoAtivo = resFigurinoAtivo.ok ? await resFigurinoAtivo.json() : [];
        const escolaPorId = Object.fromEntries((todasEscolas || []).map(e => [e.id, e]));

        // Dashboard geral conta só escola real -- escola DEMO nunca soma nos
        // números principais (ela existe pra demonstração, não pode inflar o
        // que a Márcia acompanha de verdade). Pedido dela, 19/ago/2026.
        const escolasReais = (todasEscolas || []).filter(e => e.tipo !== 'demo');
        const escolasDemoCount = (todasEscolas || []).length - escolasReais.length;
        const idsEscolasReais = new Set(escolasReais.map(e => e.id));
        const baterias = (todasBaterias || []).filter(b => idsEscolasReais.has(b.escola_id));
        const idsBateriasReais = new Set(baterias.map(b => b.id));
        const vinculosReais = vinculos.filter(v => idsBateriasReais.has(v.bateria_id));
        const bateriaPorId = Object.fromEntries(baterias.map(b => [b.id, b]));
        const idsBateriasComEvento = new Set(eventosAtivos.filter(e => idsBateriasReais.has(e.bateria_id)).map(e => e.bateria_id));
        const idsBateriasComFigurino = new Set(figurinoAtivo.filter(f => idsBateriasReais.has(f.bateria_id)).map(f => f.bateria_id));

        const totalAtivos = vinculosReais.filter(v => v.status === 'aprovado').length;
        const totalPendentes = vinculosReais.filter(v => v.status === 'pendente').length;
        kpisEl.innerHTML = `
            <div class="kpi"><div class="n">${escolasReais.length}</div><div class="l">Escolas</div></div>
            <div class="kpi"><div class="n">${baterias.length}</div><div class="l">Baterias</div></div>
            <div class="kpi ok"><div class="n">${totalAtivos}</div><div class="l">Pessoas ativas</div></div>
            <div class="kpi"><div class="n">${vinculosReais.length}</div><div class="l">Total no cadastro</div></div>
            <div class="kpi${totalPendentes > 0 ? ' atencao' : ''}"><div class="n">${totalPendentes}</div><div class="l">Pendências</div></div>`;

        // "Precisa de você" só considera Mestre pendente -- é o único caso em
        // que ninguém além do Super Admin pode aprovar (Diretor/Ritmista já
        // são trabalho do Mestre/Diretor de cada bateria). Achado dela,
        // 01/set/2026: a versão antiga contava qualquer pendência, o que não
        // representava de verdade o que precisava da atenção dela.
        const mestresPendentes = baterias
            .map(b => ({ bateria: b, escola: escolaPorId[b.escola_id], pendentes: vinculosReais.filter(v => v.bateria_id === b.id && v.status === 'pendente' && v.perfil === 'mestre').length }))
            .filter(x => x.pendentes > 0);
        atencaoEl.innerHTML = mestresPendentes.length === 0 ? '' : `
            <div class="atencao-box">
                <div class="atencao-titulo">Precisa de você</div>
                <div class="atencao-sub">Só pendência de Mestre aparece aqui</div>
                ${mestresPendentes.map(x => `
                    <div class="atencao-item" onclick="irParaAcessosDaBateria(${x.bateria.escola_id})">
                        <span>Novo Mestre pendente — ${esc(x.escola?.nome) || ''} (${esc(x.bateria.nome)})</span>
                        <span class="seta">Revisar ›</span>
                    </div>`).join('')}
            </div>`;

        // Aniversariantes de hoje/amanhã, juntando todas as baterias.
        const hoje = new Date();
        const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
        const diaMesBate = (nascStr, ref) => {
            const n = new Date(nascStr + 'T00:00:00');
            return n.getDate() === ref.getDate() && n.getMonth() === ref.getMonth();
        };
        const aniversariantes = pessoasAniv
            .filter(r => r.nascimento && idsBateriasReais.has(r.bateria_id))
            .map(r => ({ ...r, quando: diaMesBate(r.nascimento, hoje) ? 'hoje' : (diaMesBate(r.nascimento, amanha) ? 'amanha' : null) }))
            .filter(r => r.quando)
            .sort((a, b) => (a.quando === 'hoje' ? 0 : 1) - (b.quando === 'hoje' ? 0 : 1));
        anivEl.innerHTML = aniversariantes.length === 0 ? '' : `
            <div class="dash-secao-titulo">🎂 Aniversariantes de hoje e amanhã</div>
            <div class="aniv-grid">
                ${aniversariantes.map(r => {
                    const cargoAniv = r.perfil === 'mestre' ? (r.genero === 'feminino' ? 'Mestra' : 'Mestre')
                        : r.perfil === 'diretor' ? (r.genero === 'feminino' ? 'Diretora de Bateria' : 'Diretor de Bateria')
                        : r.perfil === 'apoio' ? (r.genero === 'feminino' ? 'Diretora (Apoio)' : 'Diretor (Apoio)') : 'Ritmista';
                    const detalhe = (r.perfil === 'ritmista' && r.instrumento_nome) ? `${cargoAniv} · ${r.instrumento_nome}` : cargoAniv;
                    return `<div class="aniv-card">
                        <span class="aniv-tag ${r.quando}">${r.quando === 'hoje' ? 'HOJE' : 'AMANHÃ'}</span>
                        <div class="aniv-nome"><b>${esc(r.nome)}</b>${r.apelido ? ` <span class="aniv-apelido">${esc(r.apelido)}</span>` : ''}</div>
                        <div class="aniv-meta">${calcularIdade(r.nascimento)} anos · ${esc(detalhe)}</div>
                        <div class="aniv-bateria">${esc(bateriaPorId[r.bateria_id]?.nome) || ''}</div>
                    </div>`;
                }).join('')}
            </div>`;

        container.innerHTML = baterias.length === 0
            ? `<div class="estado-vazio"><div class="estado-vazio-icone">📊</div>Nenhuma bateria real cadastrada ainda.</div>`
            : baterias.map(b => {
                const vinculosBateria = vinculosReais.filter(v => v.bateria_id === b.id);
                const pendentes = vinculosBateria.filter(v => v.status === 'pendente').length;
                const ativosBateria = vinculosBateria.filter(v => v.status === 'aprovado');
                const ativos = ativosBateria.length;
                const nConvidados = ativosBateria.filter(v => v.eh_convidado).length;
                const nDiretoria = ativosBateria.filter(v => !v.eh_convidado && ['mestre', 'diretor', 'apoio'].includes(v.perfil)).length;
                const nRitmistas = ativos - nConvidados - nDiretoria;
                const nRejeitados = vinculosBateria.filter(v => v.status === 'rejeitado').length;
                const nSuspensos = vinculosBateria.filter(v => v.status === 'suspenso').length;
                const nDesligados = vinculosBateria.filter(v => v.status === 'desligado').length;
                const escola = escolaPorId[b.escola_id];
                const temporada = escola?.temporada_atual;
                return `<div class="bateria-card" onclick="entrarContextoEscolaSA(${b.escola_id})">
                    <div class="bc-topo">
                        <div class="escola-logo-circulo" style="box-shadow:0 0 0 2px ${corBordaLogoEscola(escola || {})};">${b.logo_url ? `<img src="${b.logo_url}">` : esc((b.nome || '?')[0].toUpperCase())}</div>
                        <div>
                            <div class="bc-nome">${esc(b.nome)}</div>
                            <div class="bc-escola">${esc(escola?.nome) || ''}${temporada ? ` · ${esc(temporada)}` : ''}</div>
                        </div>
                    </div>
                    <div class="bc-stats">
                        <div class="bc-stat"><div class="n">${ativos}</div><div class="l">Ativos</div></div>
                        <div class="bc-stat"><div class="n${pendentes > 0 ? ' aviso' : ''}">${pendentes}</div><div class="l">Pendentes</div></div>
                    </div>
                    <div class="bc-divisor"></div>
                    <div class="bc-subgrid">
                        <div class="bc-substat"><div class="n">${nRitmistas}</div><div class="l">Ritmistas</div></div>
                        <div class="bc-substat"><div class="n">${nDiretoria}</div><div class="l">Diretoria</div></div>
                        <div class="bc-substat"><div class="n">${nConvidados}</div><div class="l">Convidados</div></div>
                    </div>
                    ${(nRejeitados + nSuspensos + nDesligados) > 0 ? `<div class="bc-outros"><b>${nRejeitados}</b> rejeitados · <b>${nSuspensos}</b> suspensos · <b>${nDesligados}</b> desligados</div>` : ''}
                    ${(idsBateriasComEvento.has(b.id) || idsBateriasComFigurino.has(b.id)) ? `<div class="bc-modulos">
                        ${idsBateriasComEvento.has(b.id) ? `<span class="bc-modulo-pill">🎪 Evento aberto</span>` : ''}
                        ${idsBateriasComFigurino.has(b.id) ? `<span class="bc-modulo-pill">👕 Entrega de figurino aberta</span>` : ''}
                    </div>` : ''}
                </div>`;
            }).join('');

        demoEl.innerHTML = escolasDemoCount === 0 ? '' : `
            <div class="dash-demo-box">Escolas DEMO (fora da contagem acima) <b>${escolasDemoCount}</b></div>`;

        // Atividade recente, juntando todas as baterias -- mesmo dado do
        // Histórico por escola (vinculos_historico_status), só que aqui sem
        // precisar entrar em cada uma pra saber o que aconteceu.
        if (baterias.length > 0) {
            const resHist = await fetch(`${SUPABASE_URL}/rest/v1/vinculos_historico_status?select=id,perfil,status_anterior,status_novo,criado_em,pessoa:pessoa_id(nome,genero),decisor:decidido_por(nome),bateria:bateria_id(nome)&bateria_id=in.(${baterias.map(b => b.id).join(',')})&order=criado_em.desc&limit=4`, { headers: authHeaders });
            const historico = resHist.ok ? await resHist.json() : [];
            ativEl.innerHTML = historico.length === 0 ? '' : `
                <div class="dash-secao-titulo">Atividade recente</div>
                <div class="atividade-card">
                    ${historico.map(ev => {
                        const aprovado = ev.status_novo === 'aprovado';
                        const rejeitado = ev.status_novo === 'rejeitado';
                        const acaoLabel = aprovado ? `${histPerfilLabel(ev.perfil, ev.pessoa?.genero)} aprovado`
                            : rejeitado ? 'cadastro rejeitado'
                            : `${histStatusLabel(ev.status_anterior)} → ${histStatusLabel(ev.status_novo)}`;
                        return `<div class="atividade-item">
                            <div class="ativ-ponto ${aprovado ? 'ok' : (rejeitado ? 'rej' : 'warn')}"></div>
                            <div>
                                <div class="ativ-texto"><b>${esc(ev.pessoa?.nome) || '—'}</b> · ${esc(acaoLabel)}</div>
                                <div class="ativ-meta">por ${esc(ev.decisor?.nome) || '—'} · ${esc(ev.bateria?.nome) || '—'} · ${histDataHora(ev.criado_em)}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <div class="dash-link" style="cursor:default;">Histórico completo dentro de cada bateria, aba Histórico</div>`;
        } else {
            ativEl.innerHTML = '';
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // ESCOLAS — LISTAGEM + NOVA ESCOLA
    // ══════════════════════════════════════════════════════════════════
    async function carregarEscolas() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/escolas?order=nome`, { headers: authHeaders });
        escolasCache = res.ok ? await res.json() : [];
        renderizarListaEscolas(escolasCache);
    }

    // Mesma lógica exata da borda da logo na carteirinha (escolherCorBordaLogo/
    // corEhBranca em carteirinha.html) -- pedido da Márcia, 22/ago/2026: o
    // anel do card de Escolas não devia ser o dourado fixo do TumTu, e sim a
    // cor de acento real de cada escola (última cor da cadeia, pulando
    // branco e nunca caindo na cor 1), com o mesmo dourado só como fallback.
    function corEhBrancaSA(hex) {
        if (!hex) return true;
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        if (full.length !== 6) return false;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return r > 240 && g > 240 && b > 240;
    }
    function corBordaLogoEscola(e) {
        const cores = [e.cor_primaria, e.cor_secundaria, e.cor_terciaria, e.cor_quaternaria].filter(Boolean);
        for (let i = cores.length - 1; i >= 1; i--) {
            if (cores[i] && !corEhBrancaSA(cores[i])) return cores[i];
        }
        return '#D4AF37';
    }
    function renderizarListaEscolas(lista) {
        const div = document.getElementById('lista-escolas');
        if (!lista.length) { div.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">🏫</div>Nenhuma escola cadastrada ainda.</div>'; return; }
        const cardEscolaHTML = e => `
            <div class="item-card" style="cursor:pointer" onclick="entrarContextoEscolaSA(${e.id})">
                <div class="item-card-esquerda">
                    <div class="escola-logo-circulo" style="box-shadow:0 0 0 2px ${corBordaLogoEscola(e)};">${e.logo_url ? `<img src="${e.logo_url}">` : esc((e.sigla || e.nome || '?')[0].toUpperCase())}</div>
                    <div class="item-info">
                        <div class="item-nome">${esc(e.sigla || e.nome)}</div>
                        <div class="item-detalhe">${esc(e.nome)}</div>
                    </div>
                </div>
                <div class="item-acoes">
                    ${e.tipo === 'demo' ? '<span class="badge-tag-demo">DEMO</span>' : ''}
                    <span class="${e.ativa !== false ? 'badge-ativo' : 'badge-inativo'}">${e.ativa !== false ? 'Ativa' : 'Inativa'}</span>
                </div>
            </div>`;
        // Reais sem título (mesmo padrão que Diretoria usa pra Mestres/Diretores,
        // pedido da Márcia 19/ago/2026) -- demo separada embaixo, com título.
        const reais = lista.filter(e => e.tipo !== 'demo');
        const demo = lista.filter(e => e.tipo === 'demo');
        let html = reais.map(cardEscolaHTML).join('');
        if (demo.length) html += '<div class="secao-titulo">DEMO</div>' + demo.map(cardEscolaHTML).join('');
        div.innerHTML = html;
    }

    function abrirNovaEscolaSA() {
        window.scrollTo(0, 0);
        trocarSaAba('nova-escola', null);
        ['nova-escola-nome','nova-escola-sigla','nova-escola-temporada','nova-escola-validade',
         'nova-escola-cor-primaria','nova-escola-cor-secundaria','nova-escola-cor-terciaria','nova-escola-cor-quaternaria'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        document.getElementById('nova-escola-tema-ativo').checked = false;
        logoPendente.escolaNova = null;
        document.getElementById('nova-escola-logo-preview').innerHTML = '<span class="logo-box-vazio">Sem logo</span>';
        atualizarPreviewNovaEscola();
    }

    async function salvarNovaEscola() {
        const nome = document.getElementById('nova-escola-nome').value.trim();
        const sigla = document.getElementById('nova-escola-sigla').value.trim();
        if (!nome) { mostrarToast('Informe o nome da escola.', 'erro'); return; }
        if (!sigla) { mostrarToast('Informe a sigla da escola.', 'erro'); return; }

        const payload = {
            nome, sigla,
            logo_url: logoPendente.escolaNova || null,
            temporada_atual: document.getElementById('nova-escola-temporada').value.trim() || null,
            validade_carteirinha: document.getElementById('nova-escola-validade').value || null,
            cor_primaria: document.getElementById('nova-escola-cor-primaria').value.trim() || null,
            cor_secundaria: document.getElementById('nova-escola-cor-secundaria').value.trim() || null,
            cor_terciaria: document.getElementById('nova-escola-cor-terciaria').value.trim() || null,
            cor_quaternaria: document.getElementById('nova-escola-cor-quaternaria').value.trim() || null,
            tema_personalizado_ativo: document.getElementById('nova-escola-tema-ativo').checked,
            ativa: true
        };

        const res = await fetch(`${SUPABASE_URL}/rest/v1/escolas`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify(payload) });
        if (res.ok) {
            mostrarToast('Escola cadastrada!');
            await carregarEscolas();
            trocarSaAba('escolas', document.querySelector('.sa-sidebar-item[data-sa="escolas"]'));
        } else {
            const err = await res.json();
            mostrarToast('Erro: ' + (err.message || res.status), 'erro');
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // DADOS DA ESCOLA (aba, só Super Admin nesta etapa)
    // ══════════════════════════════════════════════════════════════════
    function renderizarDadosEscolaTab(modoEdicao = false) {
        const e = escolaAtualData;
        const container = document.getElementById('dadosEscolaConteudo');
        if (!container) return;
        const visEdit = modoEdicao ? 'display:block' : 'display:none';
        const visView = modoEdicao ? 'display:none' : '';

        const podeEditar = tenhoCapacidade('editar_dados_escola');
        const rodape = modoEdicao ? `
            <div class="form-rodape">
                <div class="form-rodape-esq"><button class="btn-ficha btn-ficha-salvar" onclick="salvarDadosEscola()">Salvar</button></div>
                <button class="btn-ficha" onclick="renderizarDadosEscolaTab(false)">Cancelar</button>
            </div>` : (podeEditar ? `
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button class="btn-ficha btn-ficha-editar" onclick="renderizarDadosEscolaTab(true)">Editar</button>
                </div>
            </div>` : '');

        const campo = (label, id, valor, opts = {}) => `
            <div class="ficha-campo${opts.full ? ' full' : ''}">
                <span>${label}</span>
                <strong style="${visView}">${opts.tipo === 'data' ? (typeof fpFormatarData === 'function' ? fpFormatarData(valor) : (valor || '—')) : (valor ? esc(valor) : '—')}</strong>
                <input type="${opts.tipo === 'data' ? 'date' : 'text'}" id="${id}" class="fc-input" value="${e ? esc(valor || '') : ''}" style="${visEdit}" ${opts.placeholder ? `placeholder="${opts.placeholder}"` : ''} ${opts.extra || ''}>
            </div>`;

        container.innerHTML = `
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Dados da Escola</div>
                <div class="ficha-grid">
                    <div class="ficha-campo"><span>ID</span><strong>${e ? e.id : '—'}</strong></div>
                    ${campo('Nome Completo *', 'de-nome', e && e.nome, { full: true, placeholder: 'Ex: Grêmio Recreativo...' })}
                    ${campo('Sigla *', 'de-sigla', e && e.sigla, { full: true, placeholder: 'Ex: Imperatriz' })}
                    ${campo('Nome Curto', 'de-nome-curto', e && e.nome_curto, { full: true, placeholder: 'Ex: Imperatriz Leopoldinense' })}
                </div>
                ${modoEdicao ? `<div style="font-size:13px;color:var(--cor-texto-muted);margin-top:4px;">Opcional -- sem o "G.R.E.S." e afins, do jeito que a galera chama no dia a dia. Aparece no cabeçalho do painel, embaixo do nome da bateria. Deixe em branco pra usar a Sigla.</div>` : ''}
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Logo</div>
                <div class="logo-area">
                    <div class="logo-box ${modoEdicao ? '' : 'desabilitado'}" id="escola-logo-preview" ${modoEdicao ? `onclick="document.getElementById('escola-logo-input').click()"` : ''}>
                        ${e && e.logo_url ? `<img src="${esc(e.logo_url)}">` : '<span class="logo-box-vazio">Sem logo</span>'}
                    </div>
                    ${modoEdicao ? `<div class="logo-hint">Clique no quadro para trocar o logo.<br>Funciona melhor em PNG com fundo transparente, formato quadrado, mín. 300×300px.</div>` : ''}
                </div>
                <input type="file" id="escola-logo-input" accept="image/*" style="display:none" onchange="previewLogo(this,'escolaEdicao')">
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Temporada e cores</div>
                <div class="ficha-grid">
                    ${campo('Temporada Atual', 'de-temporada', e && e.temporada_atual, { full: true, placeholder: 'Ex: Carnaval 2027' })}
                    ${campo('Validade da Carteirinha', 'de-validade', e && e.validade_carteirinha, { full: true, tipo: 'data' })}
                    ${campo('Cor Primária', 'de-cor-primaria', e && e.cor_primaria, { placeholder: '#000000', extra: 'oninput="atualizarPreviewDadosEscola()"' })}
                    ${campo('Cor Secundária', 'de-cor-secundaria', e && e.cor_secundaria, { placeholder: '#000000', extra: 'oninput="atualizarPreviewDadosEscola()"' })}
                    ${campo('Cor Terciária', 'de-cor-terciaria', e && e.cor_terciaria, { placeholder: '#000000', extra: 'oninput="atualizarPreviewDadosEscola()"' })}
                    ${campo('Cor Quaternária', 'de-cor-quaternaria', e && e.cor_quaternaria, { placeholder: '#000000', extra: 'oninput="atualizarPreviewDadosEscola()"' })}
                </div>
                <div class="preview-cores" id="preview-dados-escola" style="margin-top:12px;"></div>
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Cores da Escola no Painel de Gestão</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="de-tema-ativo" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${e && e.tema_personalizado_ativo ? 'checked' : ''} ${modoEdicao ? '' : 'disabled'}>
                    <label for="de-tema-ativo" style="margin:0;font-size:13px;font-weight:700;color:var(--cor-texto-principal);cursor:pointer;">Ligado</label>
                </div>
                <div style="font-size:13px;color:var(--cor-texto-muted);margin-top:4px;">Enquanto ligado, o cabeçalho do painel de gestão (Mestre/Diretor) usa a cor primária e o logo da escola no lugar da marca TumTu.</div>
            </div>
            ${rodape}`;
        logoPendente.escolaEdicao = null;
        atualizarPreviewDadosEscola();
    }
    function atualizarPreviewDadosEscola() {
        const preview = document.getElementById('preview-dados-escola');
        if (!preview) return;
        preview.innerHTML = montarPreviewCores(['de-cor-primaria','de-cor-secundaria','de-cor-terciaria','de-cor-quaternaria']);
    }

    async function salvarDadosEscola() {
        const id = escolaAtualData ? escolaAtualData.id : null;
        const nome = document.getElementById('de-nome').value.trim();
        const sigla = document.getElementById('de-sigla').value.trim();
        if (!nome) { mostrarToast('Informe o nome da escola.', 'erro'); return; }
        if (!sigla) { mostrarToast('Informe a sigla.', 'erro'); return; }

        const payload = {
            nome, sigla,
            nome_curto: document.getElementById('de-nome-curto').value.trim() || null,
            logo_url: logoPendente.escolaEdicao || (escolaAtualData ? escolaAtualData.logo_url : null) || null,
            temporada_atual: document.getElementById('de-temporada').value.trim() || null,
            validade_carteirinha: document.getElementById('de-validade').value || null,
            cor_primaria: document.getElementById('de-cor-primaria').value.trim() || null,
            cor_secundaria: document.getElementById('de-cor-secundaria').value.trim() || null,
            cor_terciaria: document.getElementById('de-cor-terciaria').value.trim() || null,
            cor_quaternaria: document.getElementById('de-cor-quaternaria').value.trim() || null,
            tema_personalizado_ativo: document.getElementById('de-tema-ativo').checked,
        };
        const res = await fetch(`${SUPABASE_URL}/rest/v1/escolas?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify(payload) });
        if (res.ok) {
            const dados = await res.json();
            escolaAtualData = dados[0];
            const idx = escolasCache.findIndex(x => x.id === id);
            if (idx >= 0) escolasCache[idx] = escolaAtualData;
            configEscola.nomeEscola = escolaAtualData.sigla || escolaAtualData.nome || '';
            configEscola.nomeEscolaCurto = escolaAtualData.nome_curto || '';
            renderizarDadosEscolaTab(false);
            aplicarConfigEscola();
            mostrarToast('Escola atualizada!');
        } else {
            const err = await res.json();
            mostrarToast('Erro: ' + (err.message || res.status), 'erro');
        }
    }

    let motivoEscolaIdAtual = null;
    function confirmarToggleEscola(id, ativaAtual) {
        if (ativaAtual) {
            motivoEscolaIdAtual = id;
            document.getElementById('modalDesativarEscolaNome').textContent = escolaAtualData ? (escolaAtualData.sigla || escolaAtualData.nome) : '';
            document.getElementById('motivoDesativarEscola').value = '';
            document.getElementById('modalDesativarEscola').classList.add('aberto');
            return;
        }
        aplicarToggleEscola(id, false, null);
    }
    function confirmarDesativarEscola() {
        const motivo = document.getElementById('motivoDesativarEscola').value.trim();
        if (!motivo) { mostrarToast('Informe um motivo para desativar.', 'erro'); return; }
        fecharModal('modalDesativarEscola');
        aplicarToggleEscola(motivoEscolaIdAtual, true, motivo);
    }
    async function aplicarToggleEscola(id, ativaAtual, motivo) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/escolas?id=eq.${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders },
            body: JSON.stringify({ ativa: !ativaAtual, motivo_inativacao: ativaAtual ? motivo : null })
        });
        if (res.ok) {
            mostrarToast(ativaAtual ? 'Escola desativada.' : 'Escola ativada!');
            const dados = await res.json();
            escolaAtualData = dados[0];
            const idx = escolasCache.findIndex(x => x.id === id);
            if (idx >= 0) escolasCache[idx] = escolaAtualData;
            renderizarComercialTab();
        } else {
            mostrarToast('Erro ao atualizar escola.', 'erro');
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // DADOS DA BATERIA (aba, só Super Admin nesta etapa) — SEM Modo
    // Carteirinha aqui dentro (mora sozinho na aba "Comercial").
    // ══════════════════════════════════════════════════════════════════
    async function carregarBaterias(escolaId) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?order=nome&escola_id=eq.${escolaId}`, { headers: authHeaders });
        bateriasCache = res.ok ? await res.json() : [];
    }

    function renderizarDadosBateriaTab(modoEdicao = false) {
        const b = bateriaAtualData;
        const div = document.getElementById('dadosBateriaConteudo');
        if (!div) return;

        if (!b) {
            div.innerHTML = `<div class="estado-vazio"><div class="estado-vazio-icone">🥁</div><div style="margin-bottom:16px">Nenhuma bateria cadastrada.</div>
                <button class="btn-novo" style="display:inline-flex;margin:0 auto" onclick="renderizarNovaBateriaTab()">+ Criar Bateria</button></div>`;
            return;
        }

        const podeEditar = tenhoCapacidade('editar_dados_bateria');
        const visEdit = modoEdicao ? 'display:block' : 'display:none';
        const visView = modoEdicao ? 'display:none' : '';
        const rodape = modoEdicao ? `
            <div class="form-rodape">
                <div class="form-rodape-esq"><button class="btn-ficha btn-ficha-salvar" onclick="salvarDadosBateria()">Salvar</button></div>
                <button class="btn-ficha" onclick="renderizarDadosBateriaTab(false)">Cancelar</button>
            </div>` : (podeEditar ? `
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button class="btn-ficha btn-ficha-editar" onclick="renderizarDadosBateriaTab(true)">Editar</button>
                </div>
            </div>` : '');
        const campo = (label, id, valor) => `
            <div class="ficha-campo full">
                <span>${label}</span>
                <strong style="${visView}">${valor ? esc(valor) : '—'}</strong>
                <input type="text" id="${id}" class="fc-input" value="${esc(valor || '')}" style="${visEdit}">
            </div>`;

        div.innerHTML = `
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Dados da Bateria</div>
                <div class="ficha-grid">
                    <div class="ficha-campo"><span>ID</span><strong>${b.id}</strong></div>
                    ${campo('Nome da Bateria *', 'db-nome', b.nome)}
                    ${campo('Instagram', 'db-instagram', b.instagram)}
                </div>
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Logo</div>
                <div class="logo-area">
                    <div class="logo-box ${modoEdicao ? '' : 'desabilitado'}" id="bat-logo-preview" ${modoEdicao ? `onclick="document.getElementById('bat-logo-input').click()"` : ''}>
                        ${b.logo_url ? `<img src="${esc(b.logo_url)}">` : '<span class="logo-box-vazio">Sem logo</span>'}
                    </div>
                    ${modoEdicao ? `<div class="logo-hint">Clique no quadro para trocar o logo.<br>Aparece no verso da carteirinha.</div>` : ''}
                </div>
                <input type="file" id="bat-logo-input" accept="image/*" style="display:none" onchange="previewLogo(this,'bateria')">
            </div>
            ${rodape}`;
        logoPendente.bateria = null;
    }

    function renderizarNovaBateriaTab() {
        bateriaAtualData = null;
        logoPendente.bateria = null;
        document.getElementById('dadosBateriaConteudo').innerHTML = `
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Nova Bateria</div>
                <div class="ficha-grid">
                    <div class="ficha-campo full"><span>Nome da Bateria *</span><input type="text" id="db-nome" class="fc-input" style="display:block;" placeholder="Ex: Swing da Leopoldina"></div>
                    <div class="ficha-campo full"><span>Instagram</span><input type="text" id="db-instagram" class="fc-input" style="display:block;" placeholder="@nomeDaBateria"></div>
                </div>
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Logo</div>
                <div class="logo-area">
                    <div class="logo-box" id="bat-logo-preview" onclick="document.getElementById('bat-logo-input').click()"><span class="logo-box-vazio">Sem logo</span></div>
                    <div class="logo-hint">Clique no quadro para escolher a imagem do logo.<br>Aparece no verso da carteirinha.</div>
                </div>
                <input type="file" id="bat-logo-input" accept="image/*" style="display:none" onchange="previewLogo(this,'bateria')">
            </div>
            <div class="form-rodape"><div class="form-rodape-esq"><button class="btn-ficha btn-ficha-salvar" onclick="salvarDadosBateria()">Salvar Bateria</button></div></div>`;
    }

    async function salvarDadosBateria() {
        const nome = document.getElementById('db-nome').value.trim();
        if (!nome) { mostrarToast('Informe o nome da bateria.', 'erro'); return; }
        const id = bateriaAtualData ? bateriaAtualData.id : null;
        const payload = {
            nome, escola_id: escolaSelecionadaId,
            instagram: document.getElementById('db-instagram').value.trim() || null,
            logo_url: logoPendente.bateria || (bateriaAtualData ? bateriaAtualData.logo_url : null) || null,
            ativa: true,
        };
        if (!id) payload.modo_piloto = false; // decisão comercial -- nasce desligada, só se muda em "Comercial"
        const res = id
            ? await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify(payload) })
            : await fetch(`${SUPABASE_URL}/rest/v1/baterias`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify(payload) });
        if (res.ok) {
            const dados = await res.json();
            bateriaAtualData = (Array.isArray(dados) ? dados[0] : dados) || bateriaAtualData;
            const idx = bateriasCache.findIndex(x => x.id === bateriaAtualData.id);
            if (idx >= 0) bateriasCache[idx] = bateriaAtualData; else bateriasCache.push(bateriaAtualData);
            renderizarDadosBateriaTab(false);
            renderizarComercialTab();
            renderizarLinkCadastroRitmista();
            renderizarLinksCadastroDiretoria();
            carregarRitmistas(true);
            mostrarToast(id ? 'Bateria atualizada!' : 'Bateria cadastrada!');
        } else {
            const err = await res.json();
            mostrarToast('Erro: ' + (err.message || res.status), 'erro');
        }
    }

    async function toggleBateriaAtiva(id, ativaAtual) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ ativa: !ativaAtual }) });
        if (res.ok) {
            mostrarToast(ativaAtual ? 'Bateria desativada.' : 'Bateria ativada!');
            await carregarBaterias(escolaSelecionadaId);
            bateriaAtualData = bateriasCache.find(b => b.id === id) || bateriasCache[0] || null;
            renderizarComercialTab();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // COMERCIAL (aba independente) — reúne toda decisão comercial da
    // escola/bateria, nunca junto de "Dados da Escola"/"Dados da Bateria":
    // Modo Carteirinha, Ativar/Desativar Escola, Ativar/Desativar Bateria,
    // Classificação (DEMO/Real). Pedido explícito da Márcia (18 e 19/ago/2026)
    // — tudo isso é decisão de negócio, não dado operacional do dia a dia.
    // ══════════════════════════════════════════════════════════════════
    function renderizarComercialTab() {
        const div = document.getElementById('comercialConteudo');
        if (!div) return;
        const e = escolaAtualData;
        const b = bateriaAtualData;
        const podeEditar = tenhoCapacidade('editar_comercial');
        const ativaEscola = e && e.ativa !== false;
        const ativaBateria = b && b.ativa !== false;

        let html = `
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Classificação da Escola</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="cm-tipo-demo" style="width:15px;height:15px;accent-color:#D4AF37;cursor:${podeEditar ? 'pointer' : 'not-allowed'};" ${e && e.tipo === 'demo' ? 'checked' : ''} ${podeEditar ? '' : 'disabled'} onchange="salvarClassificacaoEscola(this.checked)">
                    <label for="cm-tipo-demo" style="margin:0;font-size:13px;font-weight:700;color:var(--cor-texto-principal);cursor:pointer;">Escola DEMO (demonstração)</label>
                </div>
                <div style="font-size:13px;color:var(--cor-texto-muted);margin-top:4px;">Escolas DEMO ficam de fora da contagem do Dashboard geral.</div>
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Status da Escola</div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span class="${ativaEscola ? 'badge-ativo' : 'badge-inativo'}">${ativaEscola ? 'Ativa' : 'Inativa'}</span>
                    ${podeEditar && e ? `<button class="btn-ficha btn-ficha-danger" onclick="confirmarToggleEscola(${e.id},${ativaEscola})">${ativaEscola ? 'Desativar Escola' : 'Ativar Escola'}</button>` : ''}
                </div>
            </div>`;

        if (b) {
            html += `
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Modo Carteirinha</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="mv-modo-piloto" style="width:15px;height:15px;accent-color:#D4AF37;cursor:${podeEditar ? 'pointer' : 'not-allowed'};" ${b.modo_piloto ? 'checked' : ''} ${podeEditar ? '' : 'disabled'} onchange="salvarComercial(this.checked)">
                    <label for="mv-modo-piloto" style="margin:0;font-size:13px;font-weight:700;color:var(--cor-texto-principal);cursor:pointer;">Ligado</label>
                </div>
                <div style="font-size:13px;color:var(--cor-texto-muted);margin-top:4px;">Enquanto ligado, Mestre e Diretor dessa bateria veem só a própria carteirinha ao entrar — sem acesso ao painel de gestão. Decisão comercial (ex: vender só a carteirinha pra quem não quer o módulo de gestão completo) — não é um dado operacional da bateria.</div>
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Convidado Especial</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="mv-convidado-tem-carteirinha" style="width:15px;height:15px;accent-color:#D4AF37;cursor:${podeEditar ? 'pointer' : 'not-allowed'};" ${b.convidado_tem_carteirinha ? 'checked' : ''} ${podeEditar ? '' : 'disabled'} onchange="salvarConvidadoTemCarteirinha(this.checked)">
                    <label for="mv-convidado-tem-carteirinha" style="margin:0;font-size:13px;font-weight:700;color:var(--cor-texto-principal);cursor:pointer;">Ligado</label>
                </div>
                <div style="font-size:13px;color:var(--cor-texto-muted);margin-top:4px;">Enquanto ligado, essa bateria pode cadastrar gente de fora com carteirinha de verdade (login), separada da contagem normal de Ritmistas/Diretoria. Decisão comercial — não vendemos isso por padrão.</div>
            </div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Status da Bateria</div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span class="${ativaBateria ? 'badge-ativo' : 'badge-inativo'}">${ativaBateria ? 'Ativa' : 'Inativa'}</span>
                    ${podeEditar ? `<button class="btn-ficha btn-ficha-danger" onclick="toggleBateriaAtiva(${b.id},${ativaBateria})">${ativaBateria ? 'Desativar Bateria' : 'Ativar Bateria'}</button>` : ''}
                </div>
            </div>`;
        } else {
            html += `
            <div class="ficha-secao">
                <div class="ficha-secao-titulo">Modo Carteirinha</div>
                <div style="font-size:13px;color:var(--cor-texto-muted);">Cadastre a bateria primeiro, em "Dados da Bateria".</div>
            </div>`;
        }

        div.innerHTML = html;
    }
    async function salvarComercial(ligado) {
        const id = bateriaAtualData ? bateriaAtualData.id : null;
        if (!id) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ modo_piloto: ligado }) });
        if (res.ok) {
            const dados = await res.json();
            bateriaAtualData = dados[0];
            const idx = bateriasCache.findIndex(x => x.id === id);
            if (idx >= 0) bateriasCache[idx] = bateriaAtualData;
            mostrarToast(ligado ? 'Modo Carteirinha ligado.' : 'Modo Carteirinha desligado.');
        } else {
            mostrarToast('Erro ao atualizar.', 'erro');
        }
    }
    async function salvarConvidadoTemCarteirinha(ligado) {
        const id = bateriaAtualData ? bateriaAtualData.id : null;
        if (!id) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ convidado_tem_carteirinha: ligado }) });
        if (res.ok) {
            const dados = await res.json();
            bateriaAtualData = dados[0];
            const idx = bateriasCache.findIndex(x => x.id === id);
            if (idx >= 0) bateriasCache[idx] = bateriaAtualData;
            mostrarToast(ligado ? 'Convidado Especial ligado.' : 'Convidado Especial desligado.');
            if (typeof renderizarConvidadosEspeciais === 'function') renderizarConvidadosEspeciais();
            if (typeof atualizarTotalizadorConvidadosEspeciais === 'function') atualizarTotalizadorConvidadosEspeciais();
            if (typeof atualizarBadgesNav === 'function') atualizarBadgesNav();
        } else {
            mostrarToast('Erro ao atualizar.', 'erro');
        }
    }
    async function salvarClassificacaoEscola(demo) {
        const id = escolaAtualData ? escolaAtualData.id : null;
        if (!id) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/escolas?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ tipo: demo ? 'demo' : 'real' }) });
        if (res.ok) {
            const dados = await res.json();
            escolaAtualData = dados[0];
            const idx = escolasCache.findIndex(x => x.id === id);
            if (idx >= 0) escolasCache[idx] = escolaAtualData;
            mostrarToast(demo ? 'Marcada como Escola DEMO.' : 'Marcada como Escola Real.');
        } else {
            mostrarToast('Erro ao atualizar classificação.', 'erro');
            renderizarComercialTab();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // PERMISSÕES (aba própria, isolada da ficha de Diretoria) — cada
    // capacidade é marcada DIRETO no vínculo da pessoa (vinculos.capacidades,
    // jsonb), sem perfil nomeado no meio. Mudança de rumo pedida pela
    // Márcia, 19/ago/2026, depois de testar o modelo antigo (perfil
    // nomeado, niveis_acesso/escola_niveis_acesso) e achar indireto demais
    // -- e depois apontar que isso NUNCA pode morar dentro da ficha de
    // Diretoria (qualquer um com acesso a Diretoria veria a permissão de
    // todo mundo). Aba só visível pra quem tiver ver_permissoes/
    // editar_permissoes -- ter acesso a Diretoria não dá acesso a isso.
    // ══════════════════════════════════════════════════════════════════
    // Reforma de Permissões (27-28/ago/2026) -- catálogo antigo era muito
    // grosso ("editar_ritmistas" cobria instrumento E medidas, "ver_ritmistas"
    // já destravava CPF/endereço/emergência junto, várias ações como
    // Suspender/Desligar/Reativar nunca tiveram permissão própria nenhuma).
    // Catálogo novo é mais fino, mas a MECÂNICA continua a mesma: um objeto
    // jsonb por pessoa (vinculos.capacidades), tudo-ou-nada por chave, Super
    // Admin sempre bypassa (tenhoCapacidade()). Migração de quem já tinha
    // permissão configurada: ver seção 62 da documentação técnica.
    const GRUPOS_CAPACIDADES = [
        // Carteirinha (02/set/2026, pedido dela) -- logo abaixo de "Acesso ao
        // TumTu" (a seção fixa renderizada antes deste array), por ser
        // conceitualmente parecida: acesso/visualização de alto nível.
        { grupo: 'Carteirinha', itens: [{ chave: 'ver_carteirinha_outros', label: 'Visualizar a carteirinha de outra pessoa' }] },
        // "Meu Perfil" (01/set/2026, pedido dela: "tem que ter o item Meu
        // Perfil, pq o mestre e diretor poderá fazer coisas no seu próprio
        // perfil") -- separado de "Perfil do Diretor" (que é sobre o que
        // essa pessoa pode fazer com a ficha de OUTRA pessoa da Diretoria).
        // Hoje só existe uma capacidade de verdade sobre a própria ficha
        // (editar_propria_medida, movida de dentro de "Perfil do Diretor" pra
        // cá) -- mas o grupo já nasce pronto pra receber outras no futuro.
        { grupo: 'Meu Perfil', itens: [
            { chave: 'editar_propria_medida', label: 'Editar Medidas', subgrupo: 'Medidas' },
        ] },
        { grupo: 'Visão Geral', itens: [{ chave: 'ver_visao_geral', label: 'Visualizar' }] },
        { grupo: 'Dados da Escola', itens: [{ chave: 'ver_dados_escola', label: 'Visualizar' }, { chave: 'editar_dados_escola', label: 'Editar', dependeDe: 'ver_dados_escola' }] },
        { grupo: 'Dados da Bateria', itens: [{ chave: 'ver_dados_bateria', label: 'Visualizar' }, { chave: 'editar_dados_bateria', label: 'Editar', dependeDe: 'ver_dados_bateria' }] },
        // Ritmistas/Diretoria ganharam "subgrupo" em 30/ago/2026 (pedido dela:
        // "eu queria que a permissão fizesse menção de onde está mexendo") --
        // cada bloco misturava capacidades de 3 lugares bem diferentes (a
        // tela toda / o Novo Cadastro / a ficha de UMA pessoa) sem separação
        // nenhuma. `subgrupo` é só um rótulo visual (renderizarEditorPermissoesPessoa
        // desenha um título menor a cada troca) -- não muda chave, dependência
        // nem trava real nenhuma.
        { grupo: 'Ritmistas', itens: [
            { chave: 'ver_ritmistas', label: 'Visualizar lista', subgrupo: 'Lista de Ritmistas' },
            { chave: 'exportar_ritmistas', label: 'Exportar pra Excel', dependeDe: 'ver_ritmistas', subgrupo: 'Lista de Ritmistas' },
            { chave: 'ver_novo_cadastro_ritmistas', label: 'Visualizar Novo Cadastro', dependeDe: 'ver_ritmistas', subgrupo: 'Novo Cadastro' },
            { chave: 'criar_cadastro_ritmistas', label: 'Criar Novo Cadastro', dependeDe: 'ver_novo_cadastro_ritmistas', subgrupo: 'Novo Cadastro' },
            { chave: 'copiar_link_cadastro_ritmistas', label: 'Copiar Link de Cadastro', dependeDe: 'ver_novo_cadastro_ritmistas', subgrupo: 'Novo Cadastro' },
            { chave: 'aprovar_ritmistas', label: 'Aprovar', dependeDe: 'ver_ritmistas', subgrupo: 'Status' },
            { chave: 'rejeitar_ritmistas', label: 'Rejeitar', dependeDe: 'ver_ritmistas', subgrupo: 'Status' },
            { chave: 'suspender_ritmistas', label: 'Suspender', dependeDe: 'ver_ritmistas', subgrupo: 'Status' },
            { chave: 'desligar_ritmistas', label: 'Desligar', dependeDe: 'ver_ritmistas', subgrupo: 'Status' },
            { chave: 'reativar_ritmistas', label: 'Reativar', dependeDe: 'ver_ritmistas', subgrupo: 'Status' },
        ] },
        // "Perfil do Ritmista" (01/set/2026, pedido dela) -- os 16 itens que
        // ficavam empilhados num único subtítulo "Ficha do Ritmista" (dentro
        // do grupo "Ritmistas") ganharam grupo PRÓPRIO, separado do que é
        // lista/fila (que ficou em "Ritmistas" acima) -- mesmo raciocínio de
        // "Meu Perfil" no interruptor de bateria: dado de ficha/perfil de
        // um lado, ação de fila/aprovação do outro. "São muitas!!!" (dela)
        // -- 7 sub-blocos por assunto em vez de 1 subtítulo genérico.
        // 01/set/2026, pedido dela: mapa COMPLETO de tudo que existe (ou
        // poderia existir) na ficha de um Ritmista, mesmo sem capacidade
        // real por trás ainda -- "coloque tudo, independente de ter
        // funcionalidade ou não criada... pra mapear todo o sistema, senão
        // eu fico maluca toda hora criando permissão aleatória". Itens com
        // semFuncionalidade mostram só uma nota (ver renderizarEditorPermissoesPessoa),
        // sem checkbox -- não existe capacidade nenhuma por trás deles hoje.
        { grupo: 'Perfil do Ritmista', itens: [
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda', subgrupo: 'Foto' },
            { chave: 'ver_dados_sensiveis_ritmistas', label: 'Visualizar Dados Pessoais', dependeDe: 'ver_ritmistas', subgrupo: 'Dados Pessoais' },
            { chave: 'editar_instrumento_ritmista', label: 'Editar instrumento', dependeDe: 'ver_ritmistas', subgrupo: 'Instrumento' },
            { chave: 'ver_repique_bossa', label: 'Visualizar Repique de Bossa', dependeDe: 'ver_ritmistas', subgrupo: 'Instrumento' },
            { chave: 'editar_repique_bossa', label: 'Marcar Repique de Bossa', dependeDe: 'ver_repique_bossa', subgrupo: 'Instrumento' },
            { chave: 'ver_endereco_ritmista', label: 'Visualizar Endereço', dependeDe: 'ver_ritmistas', subgrupo: 'Endereço' },
            { chave: 'editar_medidas_ritmista', label: 'Editar medidas', dependeDe: 'ver_ritmistas', subgrupo: 'Medidas' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Entrega de Figurinos' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Eventos' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Saúde' },
            { chave: 'ver_contato_emergencia_ritmista', label: 'Visualizar Contato de Emergência', dependeDe: 'ver_ritmistas', subgrupo: 'Contato de Emergência' },
            { chave: 'ver_observacoes', label: 'Visualizar Observações', dependeDe: 'ver_ritmistas', subgrupo: 'Observações' },
            { chave: 'editar_observacoes', label: 'Editar Observações', dependeDe: 'ver_observacoes', subgrupo: 'Observações' },
            { chave: 'ver_declaracao_responsavel', label: 'Visualizar Declaração do Responsável', dependeDe: 'ver_ritmistas', subgrupo: 'Declaração do Responsável' },
            { chave: 'editar_declaracao_responsavel', label: 'Editar Declaração do Responsável', dependeDe: 'ver_declaracao_responsavel', subgrupo: 'Declaração do Responsável' },
            { chave: 'ver_nao_desfila', label: 'Visualizar Não Desfila', dependeDe: 'ver_ritmistas', subgrupo: 'Desfile' },
            { chave: 'editar_nao_desfila', label: 'Marcar Não Desfila', dependeDe: 'ver_nao_desfila', subgrupo: 'Desfile' },
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda — fica só no aparelho da pessoa, nunca no servidor', subgrupo: 'FaceId/Digital' },
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda', subgrupo: 'Suporte' },
        ] },
        { grupo: 'Diretoria', itens: [
            { chave: 'ver_acessos', label: 'Visualizar lista', subgrupo: 'Lista de Diretoria' },
            { chave: 'exportar_diretoria', label: 'Exportar pra Excel', dependeDe: 'ver_acessos', subgrupo: 'Lista de Diretoria' },
            { chave: 'ver_novo_cadastro_diretoria', label: 'Visualizar Novo Cadastro', dependeDe: 'ver_acessos', subgrupo: 'Novo Cadastro' },
            { chave: 'criar_cadastro_diretoria', label: 'Criar Novo Cadastro', dependeDe: 'ver_novo_cadastro_diretoria', subgrupo: 'Novo Cadastro' },
            { chave: 'copiar_link_cadastro_diretoria', label: 'Copiar Link de Cadastro', dependeDe: 'ver_novo_cadastro_diretoria', subgrupo: 'Novo Cadastro' },
            { chave: 'aprovar_acessos', label: 'Aprovar', dependeDe: 'ver_acessos', subgrupo: 'Status' },
            { chave: 'rejeitar_acessos', label: 'Rejeitar', dependeDe: 'ver_acessos', subgrupo: 'Status' },
            { chave: 'suspender_acessos', label: 'Suspender', dependeDe: 'ver_acessos', subgrupo: 'Status' },
            { chave: 'desligar_acessos', label: 'Desligar', dependeDe: 'ver_acessos', subgrupo: 'Status' },
            { chave: 'reativar_acessos', label: 'Reativar', dependeDe: 'ver_acessos', subgrupo: 'Status' },
        ] },
        // "Perfil do Diretor" (01/set/2026) -- mesmo raciocínio de "Perfil do
        // Ritmista" logo abaixo: dado de ficha/perfil separado de ação de
        // fila/aprovação (que ficou em "Diretoria" acima). "Ficha da
        // Diretoria" tinha 11 itens empilhados num subtítulo só, mesmo
        // problema que ela apontou em Ritmistas -- proposta própria minha,
        // sem ela ter pedido esse grupo especificamente, aplicando o mesmo
        // modelo que ela já aprovou (ver feedback_sempre_sugerir_com_justificativa).
        { grupo: 'Perfil do Diretor', itens: [
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda', subgrupo: 'Foto' },
            { chave: 'ver_dados_sensiveis_acessos', label: 'Visualizar Dados Pessoais', dependeDe: 'ver_acessos', subgrupo: 'Dados Pessoais' },
            { chave: 'ver_endereco_acessos', label: 'Visualizar Endereço', dependeDe: 'ver_acessos', subgrupo: 'Endereço' },
            { chave: 'editar_medidas_diretoria', label: 'Editar Medida de outra pessoa da Diretoria', dependeDe: 'ver_acessos', subgrupo: 'Medidas' },
            { chave: 'ver_admin_bateria', label: 'Visualizar Admin da Bateria', dependeDe: 'ver_acessos', subgrupo: 'Admin da Bateria' },
            { chave: 'editar_admin_bateria', label: 'Editar Admin da Bateria', dependeDe: 'ver_admin_bateria', subgrupo: 'Admin da Bateria' },
            { chave: 'ver_naipe', label: 'Visualizar naipe que lidera', dependeDe: 'ver_acessos', subgrupo: 'Naipe' },
            { chave: 'editar_naipe', label: 'Editar naipe que lidera', dependeDe: 'ver_naipe', subgrupo: 'Naipe' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Eventos' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Entrega de Figurinos' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Saúde' },
            { chave: 'ver_contato_emergencia_acessos', label: 'Visualizar Contato de Emergência', dependeDe: 'ver_acessos', subgrupo: 'Contato de Emergência' },
            { chave: 'ver_permissoes', label: 'Visualizar Permissões', dependeDe: 'ver_acessos', subgrupo: 'Permissões' },
            { chave: 'editar_permissoes', label: 'Editar Permissões', dependeDe: 'ver_permissoes', subgrupo: 'Permissões' },
        ] },
        { grupo: 'Figurino', itens: [{ chave: 'ver_figurino', label: 'Visualizar entrega de figurinos' }, { chave: 'editar_figurino', label: 'Marcar entrega de figurinos', dependeDe: 'ver_figurino' }] },
        // Bug real, 01/set/2026: dependia de "ver_eventos", que é a
        // permissão de CONFIGURAÇÕES (catálogo de tipos de evento) -- nada
        // a ver com marcar presença de verdade. Travava o checkbox pra
        // qualquer Diretor que não tivesse acesso a Configurações, mesmo
        // sendo exatamente quem deveria poder marcar presença. Capacidade
        // solta, sem depender de nada -- mesmo padrão de ver_carteirinha_outros.
        { grupo: 'Lista de Presença', itens: [{ chave: 'marcar_presenca', label: 'Marcar presença dos eventos' }] },
        // Convidados (25/ago/2026, reorganizado 31/ago/2026): por trás são 2
        // modelos -- Simples (extras, sem login) e Especial (vinculos, com
        // login/carteirinha) -- mas cada bateria só usa UM por vez (escolhido
        // em Comercial → Convidado Especial). `modoConvidados` marca qual é
        // qual; renderizarEditorPermissoesPessoa/permissoesResumoDetalhado
        // mostram só o grupo do modelo ativo, os dois rotulados "Convidados"
        // -- pra quem usa o app, nunca fica visível que existem 2 modelos.
        { grupo: 'Convidados (modelo Simples)', modoConvidados: 'simples', itens: [{ chave: 'ver_extras', label: 'Visualizar' }, { chave: 'editar_extras', label: 'Cadastrar e editar', dependeDe: 'ver_extras' }] },
        { grupo: 'Convidados (modelo Especial)', modoConvidados: 'especial', itens: [
            { chave: 'ver_convidados_especiais', label: 'Visualizar lista (nome, cargo, status)', subgrupo: 'Lista' },
            { chave: 'aprovar_convidados_especiais', label: 'Aprovar, rejeitar, suspender, desligar e reativar', dependeDe: 'ver_convidados_especiais', subgrupo: 'Lista' },
            { chave: 'exportar_convidados_especiais', label: 'Exportar pra Excel', dependeDe: 'ver_convidados_especiais', subgrupo: 'Lista' },
            { chave: 'copiar_link_convidados_especiais', label: 'Copiar Link de Cadastro', dependeDe: 'ver_convidados_especiais', subgrupo: 'Novo Cadastro' },
            { chave: 'criar_cadastro_convidados_especiais', label: 'Cadastrar Convidado (sem carteirinha)', dependeDe: 'ver_convidados_especiais', subgrupo: 'Novo Cadastro' },
        ] },
        // "Perfil do Convidado" (01/set/2026) -- mesmo mapa completo de
        // Perfil do Ritmista/Diretor, pedido dela: "Essa ficha do perfil...
        // vai servir para TODAS AS PERSONAS, Tanto ritmista, diretores,
        // mestres, convidados, TODOS." Convidado Especial reaproveita o
        // mesmo motor de ficha de Ritmista/Diretoria (conforme o cargo),
        // mas hoje só existe UMA capacidade real sobre a ficha dele
        // (editar_convidados_especiais, que já bundlava instrumento+medidas
        // antes desse mapa existir) -- todo o resto é sem funcionalidade
        // própria ainda, igual boa parte de Perfil do Ritmista/Diretor.
        { grupo: 'Perfil do Convidado', modoConvidados: 'especial', itens: [
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda', subgrupo: 'Foto' },
            { semFuncionalidade: true, nota: 'Sem permissão própria ainda — quem vê a lista já vê esses dados', subgrupo: 'Dados Pessoais' },
            { chave: 'editar_convidados_especiais', label: 'Editar ficha (instrumento, medidas)', dependeDe: 'ver_convidados_especiais', subgrupo: 'Instrumento' },
            { semFuncionalidade: true, nota: 'Hoje incluso em "Instrumento" acima (Editar ficha: instrumento, medidas) — sem interruptor próprio ainda', subgrupo: 'Endereço' },
            { semFuncionalidade: true, nota: 'Hoje incluso em "Instrumento" acima (Editar ficha: instrumento, medidas) — sem interruptor próprio ainda', subgrupo: 'Medidas' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Entrega de Figurinos' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Eventos' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Saúde' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Contato de Emergência' },
            { semFuncionalidade: true, nota: 'Sem configuração de permissão para esse item (todos visualizam)', subgrupo: 'Observações' },
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda', subgrupo: 'Declaração do Responsável' },
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda', subgrupo: 'Desfile' },
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda — fica só no aparelho da pessoa, nunca no servidor', subgrupo: 'FaceId/Digital' },
            { semFuncionalidade: true, nota: 'Sem funcionalidade ainda', subgrupo: 'Suporte' },
        ] },
        { grupo: 'Configurações', itens: [
            { chave: 'ver_instrumentos', label: 'Visualizar Instrumentos da bateria' },
            { chave: 'editar_instrumentos', label: 'Editar Instrumentos da bateria', dependeDe: 'ver_instrumentos' },
            { chave: 'ver_medidas', label: 'Visualizar Medidas / Categorias de Figurino da bateria' },
            { chave: 'editar_medidas', label: 'Editar Medidas / Categorias de Figurino da bateria', dependeDe: 'ver_medidas' },
            { chave: 'ver_vagas', label: 'Visualizar Vagas por instrumento' },
            { chave: 'editar_vagas', label: 'Editar Vagas por instrumento', dependeDe: 'ver_vagas' },
            { chave: 'ver_figurino_bateria', label: 'Visualizar Figurino ativado nesta bateria' },
            { chave: 'editar_figurino_bateria', label: 'Ativar/editar peças de Figurino nesta bateria', dependeDe: 'ver_figurino_bateria' },
            { chave: 'ver_eventos', label: 'Visualizar Eventos' },
            { chave: 'editar_eventos', label: 'Criar/editar Eventos', dependeDe: 'ver_eventos' },
        ] },
        { grupo: 'Histórico', itens: [{ chave: 'ver_historico', label: 'Visualizar' }] },
    ];
    // itens com semFuncionalidade (01/set/2026, pedido dela: "coloque tudo,
    // independente de ter funcionalidade ou não criada... pra mapear todo o
    // sistema") não têm capacidade real nenhuma por trás -- filtrados aqui
    // pra nunca virar chave "undefined" salva em vinculos.capacidades.
    const TODAS_CAPACIDADES = GRUPOS_CAPACIDADES.flatMap(g => g.itens.filter(i => !i.semFuncionalidade).map(i => i.chave));
    // Mapa chave -> chave "pai" da qual depende (Reforma de Permissões, 28/ago/
    // 2026 -- pedido dela: "se ver ritmistas não estiver marcado, não é nem
    // pra liberar" as ações que dependem disso). Usado só na TELA de Permissões
    // pra desabilitar/desmarcar o dependente quando o pai está desmarcado --
    // não é uma trava de banco nova (a trava real de cada ação já existe nos
    // triggers/RLS, independente disso).
    const DEPENDE_DE = {};
    GRUPOS_CAPACIDADES.forEach(g => g.itens.forEach(i => { if (i.dependeDe) DEPENDE_DE[i.chave] = i.dependeDe; }));

    // "Convidados" tem 2 grupos internamente (modoConvidados: 'simples'/
    // 'especial', ver GRUPOS_CAPACIDADES), mas a bateria só usa um por vez --
    // essa lista tira o grupo do modelo que não está em uso, pra nunca
    // aparecer duas seções "Convidados" (ou uma inútil) na tela.
    // "Convidados (modelo Simples)" fica congelado, nunca mais visível --
    // desde a unificação (04/set/2026) toda bateria usa o mesmo modelo
    // (vinculos, eh_convidado), com ou sem carteirinha.
    function gruposCapacidadesVisiveis() {
        return GRUPOS_CAPACIDADES.filter(g => g.modoConvidados !== 'simples');
    }

    let permissoesPessoaCache = [];
    let permissoesPessoaEditando = null;
    // Grupo (nível 2) atualmente aberto na tela de Permissões -- null quando
    // está na lista (nível 1). "diretor-naipe"/"diretor" são o MESMO perfil
    // no banco (diretor), divididos aqui por TER naipe declarado ou não --
    // corrigido em 29/ago/2026 (achado dela: "o diretor de naipe é declarado
    // quando responde a pergunta Naipe que lidera... se ele lidera um
    // naipe, ele tem que ficar na lista de diretores de naipe"). Antes o
    // filtro usava `restrito_ao_naipe` (o interruptor de RESTRIÇÃO DE
    // ACESSO, separado) -- um Diretor podia ter naipe cadastrado e mesmo
    // assim não aparecer aqui, se a restrição estivesse desligada (caso
    // real: Jhones Silva, naipe Repique+Repique de Bossa, restrito_ao_naipe
    // false). `restrito_ao_naipe` continua existindo como interruptor à
    // parte dentro do editor de cada Diretor de Naipe -- ter naipe não liga
    // a restrição sozinho, são coisas diferentes.
    let permissoesGrupoAtual = null;
    const PERMISSOES_GRUPOS = {
        mestre: { label: 'Mestre', filtro: p => p.perfil === 'mestre' },
        // "Admin manda mais" (04/set/2026, confirmado por ela: na Imperatriz
        // tem Diretor que é Naipe E Admin ao mesmo tempo) -- quem é Admin
        // aparece só aqui, mesmo que também tenha Naipe declarado. O campo
        // `naipe` continua salvo/editável na ficha normalmente, só não
        // decide mais o agrupamento pra quem também é Admin.
        'diretor-admin': { label: 'Diretor Admin', filtro: p => p.perfil === 'diretor' && p.eh_admin_bateria },
        'diretor-naipe': { label: 'Diretor de Bateria - Naipe', filtro: p => p.perfil === 'diretor' && !p.eh_admin_bateria && Array.isArray(p.naipe) && p.naipe.length > 0 },
        diretor: { label: 'Diretor de Bateria', filtro: p => p.perfil === 'diretor' && !p.eh_admin_bateria && !(Array.isArray(p.naipe) && p.naipe.length > 0) },
        apoio: { label: 'Diretor (Apoio)', filtro: p => p.perfil === 'apoio' },
        // "Convidados" (01/set/2026) não entra aqui de propósito -- mesmo
        // caso de "Ritmistas": interruptor da bateria inteira, sem lista de
        // gente, então não precisa de filtro/fonte nenhum.
    };
    // Plural pro botão "Aplicar a todos" (03/set/2026, pedido dela: "tá me
    // dando um trabalho danado marcar tudo igualzinho para todos"). Mesmo
    // agrupamento de PERMISSOES_GRUPOS, mas por perfil puro -- Diretor de
    // Naipe e Diretor sem naipe são o MESMO cargo pra fins de permissão, só
    // divididos ali por causa da restrição de naipe (que "Aplicar a todos"
    // nunca mexe, ver aplicarPermissoesATodos).
    // 04/set/2026, achado grave dela (aplicou sem querer permissão de
    // Diretor de Naipe em Diretores comuns via "Aplicar a todos"): dentro
    // de perfil='diretor' existem 3 níveis bem diferentes (comum/naipe/
    // admin) -- "mesmo perfil" tem que respeitar isso, nunca tratar os 3
    // como um grupo só. Mesma prioridade de PERMISSOES_GRUPOS ("admin
    // manda mais").
    function cargoChaveDiretoria(p) {
        if (p.perfil !== 'diretor') return p.perfil;
        const ehAdmin = p.eh_admin_bateria !== undefined ? p.eh_admin_bateria : p.ehAdminBateria;
        const temNaipe = p.temNaipe !== undefined ? p.temNaipe : (Array.isArray(p.naipe) && p.naipe.length > 0);
        if (ehAdmin) return 'diretor_admin';
        if (temNaipe) return 'diretor_naipe';
        return 'diretor';
    }
    const LABEL_PERFIL_PLURAL = { mestre: 'Mestres', diretor_admin: 'Diretores Admin', diretor_naipe: 'Diretores de Naipe', diretor: 'Diretores de Bateria', apoio: 'Diretores (Apoio)' };

    // Usado na lista de Permissões (linha por pessoa, precisa ser curto --
    // só a contagem, não cabe o detalhe todo numa lista de várias pessoas).
    function permissoesResumoTexto(p) {
        const caps = p.capacidades || {};
        const ligadas = TODAS_CAPACIDADES.filter(c => caps[c]);
        const base = p.modo_carteirinha_individual
            ? 'Modo Carteirinha individual — não entra na gestão'
            : (ligadas.length === 0 ? 'nenhuma capacidade ligada' : ligadas.length + ' capacidade' + (ligadas.length === 1 ? '' : 's') + ' ligada' + (ligadas.length === 1 ? '' : 's'));
        return base + (p.restrito_ao_naipe ? ' · restrito ao naipe' : '');
    }

    // Usado dentro da ficha de uma pessoa só (23/ago/2026, achado dela: "4
    // capacidades ligadas" não é resumo nenhum, só uma conta) -- aqui é UMA
    // pessoa só, cabe listar o que de fato está ligado, agrupado por seção.
    function permissoesResumoDetalhado(p) {
        if (p.modo_carteirinha_individual) return 'Modo Carteirinha individual — não entra na gestão';
        const caps = p.capacidades || {};
        const linhas = [];
        gruposCapacidadesVisiveis().forEach(g => {
            const ligados = g.itens.filter(i => caps[i.chave]);
            if (ligados.length === 0) return;
            // Grupos com subgrupo (Ritmistas/Diretoria, 30/ago/2026) mostram o
            // título do grupo sozinho e cada subgrupo (Lista/Novo Cadastro/
            // Ficha) numa linha própria, indentada -- mesma separação "onde
            // está mexendo" pedida por ela pra tela de edição.
            if (!ligados.some(i => i.subgrupo)) {
                linhas.push(`<strong>${esc(g.grupo)}:</strong> ${esc(ligados.map(i => i.label).join(', '))}`);
                return;
            }
            linhas.push(`<strong>${esc(g.grupo)}</strong>`);
            const porSubgrupo = [];
            ligados.forEach(i => {
                let bucket = porSubgrupo.find(b => b.subgrupo === i.subgrupo);
                if (!bucket) { bucket = { subgrupo: i.subgrupo, labels: [] }; porSubgrupo.push(bucket); }
                bucket.labels.push(i.label);
            });
            porSubgrupo.forEach(b => linhas.push(`<span style="padding-left:10px;"><i>${esc(b.subgrupo)}:</i> ${esc(b.labels.join(', '))}</span>`));
        });
        if (p.restrito_ao_naipe) linhas.push('<strong>Restrito ao naipe:</strong> só Ritmistas do naipe que lidera');
        if (linhas.length === 0) return 'Nenhuma capacidade ligada';
        return linhas.join('<br>');
    }

    // "Ver detalhes"/"Ver menos" do resumo de Permissões dentro da ficha
    // (31/ago/2026, pedido dela: com muita capacidade ligada -- ex: Lolo,
    // Jhones -- o resumo detalhado de cima deixava o formulário enorme).
    // Mesmo padrão visual/comportamento já usado em "Ver por grupo"
    // (totalGradeHtml) -- nasce fechado, só o rótulo/seta ficam visíveis.
    function toggleResumoPermissoesFicha() {
        const det = document.getElementById('fp-permissoes-detalhe');
        const seta = document.getElementById('fp-permissoes-toggle-seta');
        const rotulo = document.getElementById('fp-permissoes-toggle-rotulo');
        if (!det || !seta || !rotulo) return;
        const aberto = det.style.display !== 'block';
        det.style.display = aberto ? 'block' : 'none';
        seta.classList.toggle('aberta', aberto);
        rotulo.textContent = aberto ? 'Ver menos' : 'Ver detalhes';
    }

    async function carregarPermissoesEscola() {
        const bateriaId = bateriaAtualData ? bateriaAtualData.id : null;
        const chkRitmista = document.getElementById('pe-ritmista-edita-medidas');
        const podeEditarPermissoes = tenhoCapacidade('editar_permissoes');
        if (chkRitmista) {
            chkRitmista.checked = !!(bateriaAtualData && bateriaAtualData.ritmista_pode_editar_medidas);
            chkRitmista.disabled = !podeEditarPermissoes;
            chkRitmista.style.cursor = podeEditarPermissoes ? 'pointer' : 'not-allowed';
        }
        const chkRepiqueVer = document.getElementById('pe-ritmista-ve-repique-bossa');
        if (chkRepiqueVer) {
            chkRepiqueVer.checked = !!(bateriaAtualData && bateriaAtualData.ritmista_pode_ver_repique_bossa);
            chkRepiqueVer.disabled = !podeEditarPermissoes;
            chkRepiqueVer.style.cursor = podeEditarPermissoes ? 'pointer' : 'not-allowed';
        }
        const chkRepiqueMarcar = document.getElementById('pe-ritmista-marca-repique-bossa');
        if (chkRepiqueMarcar) {
            chkRepiqueMarcar.checked = !!(bateriaAtualData && bateriaAtualData.ritmista_pode_marcar_repique_bossa);
            chkRepiqueMarcar.disabled = !podeEditarPermissoes;
            chkRepiqueMarcar.style.cursor = podeEditarPermissoes ? 'pointer' : 'not-allowed';
        }
        const chkVeDesfile = document.getElementById('pe-ritmista-ve-desfile');
        if (chkVeDesfile) {
            chkVeDesfile.checked = !!(bateriaAtualData && bateriaAtualData.ritmista_pode_ver_desfile);
            chkVeDesfile.disabled = !podeEditarPermissoes;
            chkVeDesfile.style.cursor = podeEditarPermissoes ? 'pointer' : 'not-allowed';
        }
        const chkVeDeclaracao = document.getElementById('pe-ritmista-ve-declaracao');
        if (chkVeDeclaracao) {
            chkVeDeclaracao.checked = !!(bateriaAtualData && bateriaAtualData.ritmista_pode_ver_declaracao_responsavel);
            chkVeDeclaracao.disabled = !podeEditarPermissoes;
            chkVeDeclaracao.style.cursor = podeEditarPermissoes ? 'pointer' : 'not-allowed';
        }
        const chkVeObservacoes = document.getElementById('pe-ritmista-ve-observacoes');
        if (chkVeObservacoes) {
            chkVeObservacoes.checked = !!(bateriaAtualData && bateriaAtualData.ritmista_pode_ver_observacoes);
            chkVeObservacoes.disabled = !podeEditarPermissoes;
            chkVeObservacoes.style.cursor = podeEditarPermissoes ? 'pointer' : 'not-allowed';
        }
        const chkConvidadoMedidas = document.getElementById('pe-convidado-edita-medidas');
        if (chkConvidadoMedidas) {
            chkConvidadoMedidas.checked = !!(bateriaAtualData && bateriaAtualData.convidado_pode_editar_medida);
            chkConvidadoMedidas.disabled = !podeEditarPermissoes;
            chkConvidadoMedidas.style.cursor = podeEditarPermissoes ? 'pointer' : 'not-allowed';
        }
        if (!bateriaId) {
            permissoesPessoaCache = [];
            if (permissoesGrupoAtual && PERMISSOES_GRUPOS[permissoesGrupoAtual]) renderizarListaPermissoesGrupo(permissoesGrupoAtual);
            return;
        }
        // eh_convidado=eq.false (31/ago/2026): CRÍTICO -- Convidado Especial -
        // Diretor/Apoio nunca pode ganhar permissão de gestão nenhuma, mesmo
        // acidentalmente. Sem esse filtro, um Diretor de verdade abrindo o
        // grupo "Diretor de Bateria"/"Diretor (Apoio)" em Permissões veria
        // (e poderia editar) as permissões de um Convidado misturado na
        // lista -- ele já nunca acessa o painel (modo_carteirinha_individual
        // sempre true pra esse grupo), mas capacidades nunca deviam nem
        // existir na ficha dele, muito menos serem ligáveis por essa tela.
        const res = await fetch(`${SUPABASE_URL}/rest/v1/ritmistas_com_instrumento?perfil=in.(mestre,diretor,apoio)&bateria_id=eq.${bateriaId}&eh_convidado=eq.false&order=perfil.asc,nome.asc&select=id,nome,apelido,perfil,genero,capacidades,modo_carteirinha_individual,restrito_ao_naipe,naipe,eh_admin_bateria`, { headers: authHeaders });
        permissoesPessoaCache = res.ok ? await res.json() : [];
        if (permissoesGrupoAtual && PERMISSOES_GRUPOS[permissoesGrupoAtual]) renderizarListaPermissoesGrupo(permissoesGrupoAtual);
    }
    // Navegação nível 1 ↔ nível 2 (mesmo padrão de Configurações/Entrega de
    // Figurino: abrirConfigTela/voltarConfigLista).
    async function abrirPermissoesGrupo(grupoId) {
        document.getElementById('pe-lista').style.display = 'none';
        document.querySelectorAll('#painel-permissoes .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('pe-tela-' + grupoId).style.display = 'block';
        permissoesGrupoAtual = grupoId;
        if (PERMISSOES_GRUPOS[grupoId]) renderizarListaPermissoesGrupo(grupoId);
    }
    function voltarPermissoesLista() {
        document.querySelectorAll('#painel-permissoes .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('pe-lista').style.display = 'block';
        permissoesGrupoAtual = null;
    }
    async function salvarRitmistaEditaMedidas(ligado) {
        const id = bateriaAtualData ? bateriaAtualData.id : null;
        if (!id) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ ritmista_pode_editar_medidas: ligado }) });
        if (res.ok) {
            const dados = await res.json();
            bateriaAtualData = dados[0];
            const idx = bateriasCache.findIndex(x => x.id === id);
            if (idx >= 0) bateriasCache[idx] = bateriaAtualData;
            mostrarToast(ligado ? 'Ritmistas podem preencher medidas em branco.' : 'Edição de medidas pelo ritmista desligada.');
        } else {
            mostrarToast('Erro ao atualizar.', 'erro');
        }
    }
    // Convidados (01/set/2026) -- mesmo padrão de salvarRitmistaEditaMedidas,
    // só que vale pra qualquer tipo de Convidado (Ritmista/Diretor/Apoio) de
    // uma vez, nunca pessoa por pessoa.
    async function salvarConvidadoEditaMedidas(ligado) {
        const id = bateriaAtualData ? bateriaAtualData.id : null;
        if (!id) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ convidado_pode_editar_medida: ligado }) });
        if (res.ok) {
            const dados = await res.json();
            bateriaAtualData = dados[0];
            const idx = bateriasCache.findIndex(x => x.id === id);
            if (idx >= 0) bateriasCache[idx] = bateriaAtualData;
            mostrarToast(ligado ? 'Convidados podem editar a própria Medida.' : 'Edição de Medida pelo Convidado desligada.');
        } else {
            mostrarToast('Erro ao atualizar.', 'erro');
        }
    }
    async function salvarRitmistaRepiqueBossa(acao, ligado) {
        const id = bateriaAtualData ? bateriaAtualData.id : null;
        if (!id) return;
        const coluna = acao === 'ver' ? 'ritmista_pode_ver_repique_bossa' : 'ritmista_pode_marcar_repique_bossa';
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ [coluna]: ligado }) });
        if (res.ok) {
            const dados = await res.json();
            bateriaAtualData = dados[0];
            const idx = bateriasCache.findIndex(x => x.id === id);
            if (idx >= 0) bateriasCache[idx] = bateriaAtualData;
            mostrarToast(ligado
                ? (acao === 'ver' ? 'Ritmistas podem ver o próprio Repique de Bossa.' : 'Ritmistas podem marcar o próprio Repique de Bossa.')
                : (acao === 'ver' ? 'Ritmistas não veem mais o próprio Repique de Bossa.' : 'Ritmistas não marcam mais o próprio Repique de Bossa.'));
        } else {
            mostrarToast('Erro ao atualizar.', 'erro');
        }
    }
    async function salvarRitmistaVeToggle(qual, ligado) {
        const id = bateriaAtualData ? bateriaAtualData.id : null;
        if (!id) return;
        const colunas = { desfile: 'ritmista_pode_ver_desfile', declaracao: 'ritmista_pode_ver_declaracao_responsavel', observacoes: 'ritmista_pode_ver_observacoes' };
        const nomes = { desfile: 'o próprio Desfile', declaracao: 'a própria Declaração do Responsável', observacoes: 'as próprias Observações' };
        const coluna = colunas[qual];
        const res = await fetch(`${SUPABASE_URL}/rest/v1/baterias?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ [coluna]: ligado }) });
        if (res.ok) {
            const dados = await res.json();
            bateriaAtualData = dados[0];
            const idx = bateriasCache.findIndex(x => x.id === id);
            if (idx >= 0) bateriasCache[idx] = bateriaAtualData;
            const nome = nomes[qual];
            mostrarToast(ligado ? `Ritmistas podem ver ${nome}.` : `Ritmistas não veem mais ${nome}.`);
        } else {
            mostrarToast('Erro ao atualizar.', 'erro');
        }
    }
    function cardHTMLPermissoes(p) {
        const detalhe = permissoesResumoTexto(p);
        return `<div class="item-card">
            <div class="item-info">
                <div class="item-nome">${esc(p.nome)}${p.apelido ? ' · ' + esc(p.apelido) : ''}${p.eh_admin_bateria && tenhoCapacidade('ver_admin_bateria') ? ' <span class="dir-badge-admin">Admin</span>' : ''}</div>
                <div class="item-detalhe">${detalhe}</div>
            </div>
            <div class="item-acoes"><button class="btn-ficha" onclick="abrirEditorPermissoesPessoa(${p.id})">Editar</button></div>
        </div>`;
    }
    // Uma sub-tela por cargo (29/ago/2026, reorganização pedida por ela) --
    // "diretor-naipe" e "diretor" filtram o MESMO perfil de banco (diretor),
    // só divididos por restrito_ao_naipe.
    function renderizarListaPermissoesGrupo(grupoId) {
        const meta = PERMISSOES_GRUPOS[grupoId];
        const container = document.getElementById('pe-perfis-lista-' + grupoId);
        if (!meta || !container) return;
        // Convidados (31/ago/2026, 3 sub-grupos por cargo) NUNCA lê de
        // permissoesPessoaCache (que exclui Convidado de propósito) -- usa
        // convidadosEspeciaisCache, já carregada com as mesmas colunas
        // (capacidades/modo_carteirinha_individual/etc, view
        // ritmistas_com_instrumento sem select= restrito), filtrada por cargo
        // igual aos grupos de Diretoria.
        const doGrupo = meta.fonte === 'convidados' ? convidadosEspeciaisCache.filter(meta.filtro) : permissoesPessoaCache.filter(meta.filtro);
        if (doGrupo.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">🔐</div>Ninguém nesse grupo, nesta bateria, ainda.</div>'; return; }

        const buscaEl = document.getElementById('pe-busca-' + grupoId);
        const busca = (buscaEl ? buscaEl.value : '').trim().toLowerCase();
        const filtrada = busca
            ? doGrupo.filter(p => (p.nome || '').toLowerCase().includes(busca) || (p.apelido || '').toLowerCase().includes(busca))
            : doGrupo;

        if (filtrada.length === 0) { container.innerHTML = '<div class="estado-vazio">Nenhuma pessoa encontrada com essa busca.</div>'; return; }
        container.innerHTML = filtrada.map(cardHTMLPermissoes).join('');
    }
    // veioDaFicha marca quem chegou aqui pelo atalho da ficha (item 4) --
    // controla o "Voltar para a ficha" (link + volta automática ao salvar/
    // cancelar). Quem abre da sub-tela de um grupo (o normal) volta pra
    // esse grupo (grupoOrigem) em vez da lista de nível 1 -- reorganização
    // de 29/ago/2026.
    function abrirEditorPermissoesPessoa(vinculoId, veioDaFicha = false) {
        const p = permissoesPessoaCache.find(x => x.id === vinculoId);
        if (!p) return;
        permissoesPessoaEditando = { id: p.id, nome: p.nome, cargo: labelPerfilSA(p.perfil, p.genero), perfil: p.perfil, capacidades: { ...(p.capacidades || {}) }, modoCarteirinhaIndividual: !!p.modo_carteirinha_individual, restritoAoNaipe: !!p.restrito_ao_naipe, temNaipe: Array.isArray(p.naipe) && p.naipe.length > 0, ehAdminBateria: !!p.eh_admin_bateria, veioDaFicha, grupoOrigem: veioDaFicha ? null : permissoesGrupoAtual };
        // O editor toma conta da tela inteira, por cima da sub-tela do
        // grupo (ou da lista, se veio da ficha) -- nunca os dois visíveis
        // ao mesmo tempo.
        const lista = document.getElementById('pe-lista');
        if (lista) lista.style.display = 'none';
        document.querySelectorAll('#painel-permissoes .config-subtela').forEach(el => el.style.display = 'none');
        renderizarEditorPermissoesPessoa();
        const editor = document.getElementById('pe-editor');
        if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Setinha de abrir/fechar cada título-pai de Permissões (02/set/2026) --
    // corpo (o irmão logo depois do título) nasce escondido, clicar no
    // título alterna. Mesma função serve pro editor por pessoa e pras telas
    // de "Meu Perfil" (Ritmistas/Convidados).
    function togglePermissaoSecao(tituloEl) {
        const corpo = tituloEl.nextElementSibling;
        if (!corpo) return;
        const seta = tituloEl.querySelector('.ficha-secao-seta');
        const abrir = corpo.style.display === 'none';
        corpo.style.display = abrir ? '' : 'none';
        if (seta) seta.classList.toggle('aberto', abrir);
    }
    // Atalho "Editar permissões" de dentro da ficha (item 4, 22/ago/2026) --
    // fecha a ficha, navega pra aba Permissões e já abre o editor dessa
    // pessoa, reaproveitando o mesmo abrirEditorPermissoesPessoa de sempre.
    async function fpIrParaPermissoesDeFicha(vinculoId) {
        fecharModalAdmin();
        trocarAba('permissoes', document.querySelector('.aba-btn[data-aba=administrativo]'));
        await carregarPermissoesEscola();
        abrirEditorPermissoesPessoa(vinculoId, true);
    }
    // Mesmo cargo (mestre/diretor/apoio), qualquer bateria -- Diretor de
    // Naipe e Diretor sem naipe contam como o mesmo cargo aqui (ver
    // LABEL_PERFIL_PLURAL). Usado por "Copiar de" e "Aplicar a todos"
    // (03/set/2026, pedido dela).
    function permissoesPessoasMesmoPerfil(pe) {
        const chave = cargoChaveDiretoria(pe);
        return permissoesPessoaCache.filter(x => x.id !== pe.id && cargoChaveDiretoria(x) === chave);
    }
    function renderizarEditorPermissoesPessoa() {
        const pe = permissoesPessoaEditando;
        const editor = document.getElementById('pe-editor');
        if (!editor) return;
        if (!pe) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        editor.style.display = 'block';
        const outrosMesmoPerfil = permissoesPessoasMesmoPerfil(pe);
        const pluralPerfil = LABEL_PERFIL_PLURAL[cargoChaveDiretoria(pe)] || 'outras pessoas desse cargo';
        const blocoCopiarDe = outrosMesmoPerfil.length === 0 ? '' : `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:12px 14px;background:#f7f6fb;border-radius:10px;">
                <label for="pp-copiar-de" style="margin:0;font-size:13px;color:var(--cor-texto-secundario);white-space:nowrap;">Copiar permissão de</label>
                <select id="pp-copiar-de" style="flex:1;min-width:140px;padding:6px 10px;border-radius:8px;border:1px solid #e0e0e0;font-size:13px;font-family:inherit;">
                    <option value="">Selecione...</option>
                    ${outrosMesmoPerfil.map(o => `<option value="${o.id}">${esc(o.nome)}</option>`).join('')}
                </select>
                <button class="btn-ficha" onclick="copiarPermissoesDe()">Copiar</button>
            </div>`;
        editor.innerHTML = `<div class="card-form">
            ${pe.veioDaFicha
                ? `<div style="margin-bottom:8px;"><span onclick="abrirFichaAdmin(${pe.id})" style="color:#D4AF37;font-size:13px;font-weight:600;cursor:pointer;">← Voltar para a ficha</span></div>`
                : (pe.grupoOrigem && PERMISSOES_GRUPOS[pe.grupoOrigem] ? `<div style="margin-bottom:8px;"><span onclick="fecharEditorPermissoesPessoa()" style="color:#D4AF37;font-size:13px;font-weight:600;cursor:pointer;">← ${esc(PERMISSOES_GRUPOS[pe.grupoOrigem].label)}</span></div>` : '')}
            <div class="card-form-titulo">${esc(pe.nome)} <span style="font-weight:400;color:#999;font-size:13px;">— ${esc(pe.cargo)}</span></div>
            ${blocoCopiarDe}
            <div class="ficha-secao">
                <div class="ficha-secao-titulo-pai" onclick="togglePermissaoSecao(this)"><span class="ficha-secao-titulo-pai-tracinho"></span>Acesso ao TumTu<span class="ficha-secao-seta">▸</span></div>
                <div class="ficha-secao-corpo" style="display:none;">
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                    <input type="checkbox" id="pp-modo-carteirinha" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${pe.modoCarteirinhaIndividual ? 'checked' : ''}>
                    <label for="pp-modo-carteirinha" style="margin:0;font-size:13px;font-weight:400;color:var(--cor-texto-principal);cursor:pointer;">Modo Carteirinha individual — só vê a própria carteirinha, sem entrar na gestão (ignora as capacidades abaixo)</label>
                </div>
                </div>
            </div>
            ${gruposCapacidadesVisiveis().map(g => `
                <div class="ficha-secao">
                    <div class="ficha-secao-titulo-pai" onclick="togglePermissaoSecao(this)"><span class="ficha-secao-titulo-pai-tracinho"></span>${esc(g.grupo)}<span class="ficha-secao-seta">▸</span></div>
                    <div class="ficha-secao-corpo" style="display:none;">
                    ${g.itens.map((c, idx) => {
                        // Sub-título "onde está mexendo" (Lista/Novo Cadastro/Ficha) a
                        // cada troca de subgrupo -- pedido dela, 30/ago/2026. Reaproveita
                        // .config-grupo-titulo, mesmo estilo já aprovado em Instrumentos
                        // (Tradicionais/Especiais). Respiro sempre igual (01/set/2026,
                        // mesmo achado de Ritmistas: "respiro diferente" no primeiro
                        // subtítulo x os demais) -- usa o margin-top padrão da classe
                        // pra todo mundo, sem exceção pro primeiro da lista.
                        const trocouSubgrupo = c.subgrupo && c.subgrupo !== (g.itens[idx - 1] || {}).subgrupo;
                        const subtitulo = trocouSubgrupo ? `<div class="config-grupo-titulo">${esc(c.subgrupo)}</div>` : '';
                        // semFuncionalidade (01/set/2026, pedido dela: "coloque tudo,
                        // independente de ter funcionalidade ou não criada... pra
                        // mapear todo o sistema, senão eu fico maluca toda hora
                        // criando permissão aleatória") -- mostra só uma nota, sem
                        // checkbox nenhum (não existe capacidade real por trás).
                        if (c.semFuncionalidade) {
                            return subtitulo + `
                        <div style="margin-top:6px;font-size:12.5px;color:var(--cor-texto-muted);font-style:italic;">${esc(c.nota || 'Sem funcionalidade ainda')}</div>`;
                        }
                        return subtitulo + `
                        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                            <input type="checkbox" id="pp-cap-${c.chave}" onchange="aplicarDependenciasPermissoes()" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${pe.capacidades[c.chave] ? 'checked' : ''}>
                            <label for="pp-cap-${c.chave}" style="margin:0;font-size:13px;font-weight:400;color:var(--cor-texto-principal);cursor:pointer;">${c.label}</label>
                        </div>`;
                    }).join('')}
                    ${g.grupo === 'Ritmistas' && pe.perfil === 'diretor' && pe.temNaipe ? `
                        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed #e0e0e0;">
                            <input type="checkbox" id="pp-restrito-naipe" onchange="aplicarDependenciasPermissoes()" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${pe.restritoAoNaipe ? 'checked' : ''}>
                            <label for="pp-restrito-naipe" style="margin:0;font-size:13px;font-weight:400;color:var(--cor-texto-principal);cursor:pointer;">Restrito ao próprio naipe — só vê/aprova/edita Ritmistas do naipe que lidera</label>
                        </div>` : ''}
                    ${g.grupo === 'Ritmistas' && pe.perfil === 'diretor' && !pe.temNaipe ? `
                        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #e0e0e0;font-size:13px;color:var(--cor-texto-muted);">Essa pessoa ainda não declarou um Naipe (Ficha → Naipe que lidera) — sem isso, não tem como restringir o acesso a um naipe específico.</div>` : ''}
                    </div>
                </div>`).join('')}
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button class="btn-ficha btn-ficha-salvar" onclick="salvarPermissoesPessoa()">Salvar</button>
                    ${outrosMesmoPerfil.length > 0 ? `<button class="btn-ficha" onclick="aplicarPermissoesATodos()">Aplicar a todos os ${esc(pluralPerfil)}</button>` : ''}
                </div>
                <button class="btn-ficha" onclick="fecharEditorPermissoesPessoa()">Cancelar</button>
            </div>
        </div>`;
        aplicarDependenciasPermissoes();
    }
    // Desabilita (e desmarca) cada checkbox cujo "pai" (DEPENDE_DE) não está
    // marcado -- roda ao abrir o editor e a cada clique em qualquer checkbox,
    // em cascata (repete até estabilizar, cobre corrente de 2+ níveis, ex:
    // editar_naipe depende de ver_naipe que depende de ver_ritmistas).
    function aplicarDependenciasPermissoes() {
        let mudou = true;
        while (mudou) {
            mudou = false;
            Object.keys(DEPENDE_DE).forEach(chave => {
                const el = document.getElementById('pp-cap-' + chave);
                const pai = document.getElementById('pp-cap-' + DEPENDE_DE[chave]);
                if (!el || !pai) return;
                const travar = !pai.checked;
                if (el.disabled !== travar) { el.disabled = travar; mudou = true; }
                if (travar && el.checked) { el.checked = false; mudou = true; }
            });
        }
        // "Restrito ao naipe" só existe pra Diretor de Bateria e depende de
        // "Ver lista" (Ritmistas) -- mesma regra: sem ver_ritmistas, ligar a
        // restrição não teria nada pra restringir.
        const restritoNaipe = document.getElementById('pp-restrito-naipe');
        const verRitmistas = document.getElementById('pp-cap-ver_ritmistas');
        if (restritoNaipe && verRitmistas) {
            const travar = !verRitmistas.checked;
            restritoNaipe.disabled = travar;
            if (travar && restritoNaipe.checked) restritoNaipe.checked = false;
        }
    }
    // Quem veio da ficha (item 4) volta pra ela sozinho ao salvar/cancelar --
    // achado da Márcia, 22/ago/2026: sem isso, depois de editar não tinha
    // como voltar pra conferir se o resumo da ficha atualizou.
    function fecharEditorPermissoesPessoa() {
        const veioDaFicha = permissoesPessoaEditando && permissoesPessoaEditando.veioDaFicha;
        const grupoOrigem = permissoesPessoaEditando && permissoesPessoaEditando.grupoOrigem;
        const id = permissoesPessoaEditando && permissoesPessoaEditando.id;
        permissoesPessoaEditando = null;
        renderizarEditorPermissoesPessoa();
        if (veioDaFicha) abrirFichaAdmin(id);
        else if (grupoOrigem) abrirPermissoesGrupo(grupoOrigem);
        else voltarPermissoesLista();
    }
    async function salvarPermissoesPessoa() {
        const pe = permissoesPessoaEditando;
        if (!pe) return;
        const capacidades = {};
        // "Convidados" (31/ago/2026) só renderiza o grupo do modelo ativo da
        // bateria (ver gruposCapacidadesVisiveis) -- pra chave do modelo
        // escondido, o checkbox nem existe na tela; preserva o valor que já
        // estava salvo em vez de quebrar (ou de resetar pra false à toa).
        TODAS_CAPACIDADES.forEach(c => {
            const el = document.getElementById('pp-cap-' + c);
            capacidades[c] = el ? el.checked : !!(pe.capacidades && pe.capacidades[c]);
        });
        // Editor restrito do grupo "Convidados" (ver renderizarEditorPermissoesPessoa)
        // não mostra esse checkbox -- preserva o valor já salvo em vez de
        // travar/resetar (Convidado Diretor/Apoio já nasce com isso true no
        // cadastro; nunca deixar essa tela apagar isso à toa).
        const modoCarteirinhaEl = document.getElementById('pp-modo-carteirinha');
        const modo_carteirinha_individual = modoCarteirinhaEl ? modoCarteirinhaEl.checked : !!pe.modoCarteirinhaIndividual;
        // "Restrito ao naipe" só existe na tela pra Diretor de Bateria (ver
        // renderizarEditorPermissoesPessoa) -- pra qualquer outro perfil,
        // salva false (nunca ficou disponível pra marcar mesmo).
        const restritoNaipeEl = document.getElementById('pp-restrito-naipe');
        const restrito_ao_naipe = restritoNaipeEl ? restritoNaipeEl.checked : false;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=eq.${pe.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ capacidades, modo_carteirinha_individual, restrito_ao_naipe }) });
        if (res.ok) {
            mostrarToast('Permissões atualizadas!');
            const grupoOrigem = pe.grupoOrigem;
            permissoesPessoaEditando = null;
            await carregarPermissoesEscola();
            renderizarEditorPermissoesPessoa();
            if (pe.veioDaFicha) abrirFichaAdmin(pe.id);
            else if (grupoOrigem) abrirPermissoesGrupo(grupoOrigem);
            else voltarPermissoesLista();
        }
        else { const err = await res.json(); mostrarToast('Erro: ' + (err.message || res.status), 'erro'); }
    }
    // "Copiar permissão de [Fulano]" (03/set/2026, pedido dela: "tá me
    // dando um trabalho danado marcar tudo igualzinho para todos"). Só
    // preenche os checkboxes na tela com o que Fulano já tem hoje -- não
    // grava nada sozinho, ela ainda precisa clicar em Salvar (dá pra
    // conferir/ajustar antes). Restrito ao naipe só copia se ESSA pessoa
    // (não a de origem) tiver naipe declarado -- senão o checkbox nem
    // existe na tela pra ela marcar.
    function copiarPermissoesDe() {
        const pe = permissoesPessoaEditando;
        if (!pe) return;
        const sel = document.getElementById('pp-copiar-de');
        const origemId = sel && sel.value ? Number(sel.value) : null;
        if (!origemId) return;
        const origem = permissoesPessoaCache.find(x => x.id === origemId);
        if (!origem) return;
        pe.capacidades = { ...(origem.capacidades || {}) };
        pe.modoCarteirinhaIndividual = !!origem.modo_carteirinha_individual;
        if (pe.temNaipe) pe.restritoAoNaipe = !!origem.restrito_ao_naipe;
        renderizarEditorPermissoesPessoa();
        mostrarToast(`Permissão de ${origem.nome} copiada pra tela -- confira e clique em Salvar.`);
    }
    // "Aplicar a todos os [cargo]" (03/set/2026, mesmo pedido) -- grava de
    // uma vez só (sem passar por Salvar) a permissão que está marcada AGORA
    // na tela pra essa pessoa E pra todo mundo do mesmo cargo nesta bateria,
    // numa única chamada (id=in.(...), PostgREST atualiza todas as linhas
    // que baterem no filtro). De propósito, NÃO inclui restrito_ao_naipe --
    // é um interruptor pessoal (cada Diretor de Naipe restringe a SI mesmo),
    // replicar às cegas podia ligar a restrição em alguém sem considerar se
    // isso faz sentido pro naipe dele. Pede confirmação antes (mesmo modal
    // personalizado usado em excluirX) porque sobrescreve o que os outros
    // já tinham configurado.
    async function aplicarPermissoesATodos() {
        const pe = permissoesPessoaEditando;
        if (!pe) return;
        const outros = permissoesPessoasMesmoPerfil(pe);
        if (outros.length === 0) return;
        const capacidades = {};
        TODAS_CAPACIDADES.forEach(c => {
            const el = document.getElementById('pp-cap-' + c);
            capacidades[c] = el ? el.checked : !!(pe.capacidades && pe.capacidades[c]);
        });
        const modoCarteirinhaEl = document.getElementById('pp-modo-carteirinha');
        const modo_carteirinha_individual = modoCarteirinhaEl ? modoCarteirinhaEl.checked : !!pe.modoCarteirinhaIndividual;
        const plural = LABEL_PERFIL_PLURAL[cargoChaveDiretoria(pe)] || 'pessoas desse cargo';
        const confirmou = await tumtuConfirmar(`Aplicar essa mesma permissão (o que está marcado acima) para os outros ${outros.length} ${plural}? Isso substitui o que cada um já tinha configurado -- a restrição por Naipe de cada um não muda.`, { textoConfirmar: 'Aplicar a todos' });
        if (!confirmou) return;
        const idsAlvo = [pe.id, ...outros.map(o => o.id)];
        const res = await fetch(`${SUPABASE_URL}/rest/v1/vinculos?id=in.(${idsAlvo.join(',')})`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ capacidades, modo_carteirinha_individual }) });
        if (res.ok) {
            mostrarToast(`Permissão aplicada a ${idsAlvo.length} ${plural}.`);
            const grupoOrigem = pe.grupoOrigem;
            const veioDaFicha = pe.veioDaFicha;
            const id = pe.id;
            permissoesPessoaEditando = null;
            await carregarPermissoesEscola();
            renderizarEditorPermissoesPessoa();
            if (veioDaFicha) abrirFichaAdmin(id);
            else if (grupoOrigem) abrirPermissoesGrupo(grupoOrigem);
            else voltarPermissoesLista();
        } else {
            const err = await res.json();
            mostrarToast('Erro: ' + (err.message || res.status), 'erro');
        }
    }

    // ── Configurações globais → Permissões Padrão (04/set/2026, pedido
    // dela: "nunca mais terei trabalho de lembrar disso, que tenho que
    // colocar permissão para as pessoas assim que elas caem no cadastro").
    // Molde de capacidades por cargo (Mestre/Diretor Admin/Diretor/Apoio),
    // global (não por bateria) -- aplicado automaticamente na 1a aprovação
    // de cada pessoa em QUALQUER bateria (trigger trg_permissoes_padrao_vinculos
    // no banco, não código daqui). Reaproveita o MESMO editor de checkboxes
    // já usado pra pessoa (GRUPOS_CAPACIDADES/togglePermissaoSecao/
    // esc/mostrarToast) -- só troca onde lê e onde salva. Usa
    // GRUPOS_CAPACIDADES direto (não gruposCapacidadesVisiveis, que filtra
    // pelo modo de Convidados da bateria ATUAL carregada) -- molde global
    // não tem "bateria atual", então mostra os dois modelos de Convidados
    // possíveis, já que baterias diferentes podem usar modelos diferentes.
    let permissoesPadraoCache = [];
    let permissaoPadraoEditando = null;
    const LABEL_PERMISSAO_PADRAO = { mestre: 'Mestre', diretor_admin: 'Diretor Admin', diretor_naipe: 'Diretor de Naipe', diretor: 'Diretor de Bateria', apoio: 'Diretor (Apoio)' };
    async function carregarPermissoesPadrao() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/permissoes_padrao`, { headers: authHeaders });
        permissoesPadraoCache = res.ok ? await res.json() : [];
    }
    function renderizarPermissoesPadraoLista() {
        const ordem = ['mestre', 'diretor_admin', 'diretor_naipe', 'diretor', 'apoio'];
        const container = document.getElementById('sa-permissoes-padrao-lista');
        if (!container) return;
        container.innerHTML = ordem.map(cargo => {
            const p = permissoesPadraoCache.find(x => x.cargo === cargo) || { cargo, capacidades: {}, modo_carteirinha_individual: false };
            const ligadas = TODAS_CAPACIDADES.filter(c => p.capacidades && p.capacidades[c]).length;
            // Achado dela, 04/set/2026: Modo Carteirinha individual não
            // contava aqui -- alguém podia salvar SÓ isso (sem nenhuma
            // capacidade marcada, o que é normal, já que o modo ignora as
            // capacidades) e o card dizia "Nenhuma permissão marcada ainda",
            // como se nada tivesse sido configurado.
            const partes = [];
            if (p.modo_carteirinha_individual) partes.push('Modo Carteirinha individual');
            if (ligadas > 0) partes.push(`${ligadas} permissão(ões) marcada(s)`);
            const detalhe = partes.length === 0 ? 'Nenhuma permissão marcada ainda' : partes.join(' · ');
            return `<div class="item-card">
                <div class="item-info">
                    <div class="item-nome">${LABEL_PERMISSAO_PADRAO[cargo]}</div>
                    <div class="item-detalhe">${detalhe}</div>
                </div>
                <div class="item-acoes"><button class="btn-ficha" onclick="abrirEditorPermissaoPadrao('${cargo}')">Editar</button></div>
            </div>`;
        }).join('');
    }
    function abrirEditorPermissaoPadrao(cargo) {
        const p = permissoesPadraoCache.find(x => x.cargo === cargo) || { cargo, capacidades: {}, modo_carteirinha_individual: false };
        permissaoPadraoEditando = { cargo, capacidades: { ...(p.capacidades || {}) }, modoCarteirinhaIndividual: !!p.modo_carteirinha_individual };
        const lista = document.getElementById('sa-permissoes-padrao-lista');
        if (lista) lista.style.display = 'none';
        renderizarEditorPermissaoPadrao();
        const editor = document.getElementById('sa-permissoes-padrao-editor');
        if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function fecharEditorPermissaoPadrao() {
        permissaoPadraoEditando = null;
        const editor = document.getElementById('sa-permissoes-padrao-editor');
        if (editor) { editor.style.display = 'none'; editor.innerHTML = ''; }
        const lista = document.getElementById('sa-permissoes-padrao-lista');
        if (lista) lista.style.display = '';
    }
    function renderizarEditorPermissaoPadrao() {
        const pe = permissaoPadraoEditando;
        const editor = document.getElementById('sa-permissoes-padrao-editor');
        if (!editor) return;
        if (!pe) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        editor.style.display = 'block';
        editor.innerHTML = `<div class="card-form">
            <div class="card-form-titulo">Molde: ${LABEL_PERMISSAO_PADRAO[pe.cargo]}</div>
            <div class="ficha-secao">
                <div class="ficha-secao-titulo-pai" onclick="togglePermissaoSecao(this)"><span class="ficha-secao-titulo-pai-tracinho"></span>Acesso ao TumTu<span class="ficha-secao-seta">▸</span></div>
                <div class="ficha-secao-corpo" style="display:none;">
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                    <input type="checkbox" id="ppp-modo-carteirinha" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${pe.modoCarteirinhaIndividual ? 'checked' : ''}>
                    <label for="ppp-modo-carteirinha" style="margin:0;font-size:13px;font-weight:400;color:var(--cor-texto-principal);cursor:pointer;">Modo Carteirinha individual — só vê a própria carteirinha, sem entrar na gestão (ignora as capacidades abaixo)</label>
                </div>
                </div>
            </div>
            ${GRUPOS_CAPACIDADES.filter(g => g.modoConvidados !== 'simples').map(g => `
                <div class="ficha-secao">
                    <div class="ficha-secao-titulo-pai" onclick="togglePermissaoSecao(this)"><span class="ficha-secao-titulo-pai-tracinho"></span>${esc(g.grupo)}<span class="ficha-secao-seta">▸</span></div>
                    <div class="ficha-secao-corpo" style="display:none;">
                    ${g.itens.map((c, idx) => {
                        const trocouSubgrupo = c.subgrupo && c.subgrupo !== (g.itens[idx - 1] || {}).subgrupo;
                        const subtitulo = trocouSubgrupo ? `<div class="config-grupo-titulo">${esc(c.subgrupo)}</div>` : '';
                        if (c.semFuncionalidade) {
                            return subtitulo + `
                        <div style="margin-top:6px;font-size:12.5px;color:var(--cor-texto-muted);font-style:italic;">${esc(c.nota || 'Sem funcionalidade ainda')}</div>`;
                        }
                        return subtitulo + `
                        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                            <input type="checkbox" id="ppp-cap-${c.chave}" onchange="aplicarDependenciasPermissaoPadrao()" style="width:15px;height:15px;accent-color:#D4AF37;cursor:pointer;" ${pe.capacidades[c.chave] ? 'checked' : ''}>
                            <label for="ppp-cap-${c.chave}" style="margin:0;font-size:13px;font-weight:400;color:var(--cor-texto-principal);cursor:pointer;">${c.label}</label>
                        </div>`;
                    }).join('')}
                    </div>
                </div>`).join('')}
            <div class="form-rodape">
                <div class="form-rodape-esq"><button class="btn-ficha btn-ficha-salvar" onclick="salvarPermissaoPadrao()">Salvar</button></div>
                <button class="btn-ficha" onclick="fecharEditorPermissaoPadrao()">Cancelar</button>
            </div>
        </div>`;
        aplicarDependenciasPermissaoPadrao();
    }
    function aplicarDependenciasPermissaoPadrao() {
        let mudou = true;
        while (mudou) {
            mudou = false;
            Object.keys(DEPENDE_DE).forEach(chave => {
                const el = document.getElementById('ppp-cap-' + chave);
                const pai = document.getElementById('ppp-cap-' + DEPENDE_DE[chave]);
                if (!el || !pai) return;
                const travar = !pai.checked;
                if (el.disabled !== travar) { el.disabled = travar; mudou = true; }
                if (travar && el.checked) { el.checked = false; mudou = true; }
            });
        }
    }
    async function salvarPermissaoPadrao() {
        const pe = permissaoPadraoEditando;
        if (!pe) return;
        const capacidades = {};
        TODAS_CAPACIDADES.forEach(c => {
            const el = document.getElementById('ppp-cap-' + c);
            capacidades[c] = el ? el.checked : !!(pe.capacidades && pe.capacidades[c]);
        });
        const modoCarteirinhaEl = document.getElementById('ppp-modo-carteirinha');
        const modo_carteirinha_individual = modoCarteirinhaEl ? modoCarteirinhaEl.checked : !!pe.modoCarteirinhaIndividual;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/permissoes_padrao?cargo=eq.${pe.cargo}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ capacidades, modo_carteirinha_individual }) });
        if (res.ok) {
            mostrarToast('Permissão padrão atualizada!');
            fecharEditorPermissaoPadrao();
            await carregarPermissoesPadrao();
            renderizarPermissoesPadraoLista();
        } else {
            const err = await res.json();
            mostrarToast('Erro: ' + (err.message || res.status), 'erro');
        }
    }

    // ── Configurações globais → Instrumentos (biblioteca mestre) ─────────
    let categoriasCache = [];
    let categoriaEditando = null;
    let salvandoCategoria = false;
    function abrirConfigTelaSA(nome) {
        document.getElementById('sa-config-lista').style.display = 'none';
        document.getElementById('sa-config-tela-' + nome).style.display = 'block';
        if (nome === 'instrumentos') { fecharEditorCategoria(); carregarCategorias().then(renderizarCategoriasLista); }
        if (nome === 'medidas') { fecharEditorMedidaTipo(); carregarMedidaTiposSA().then(renderizarMedidaTiposListaSA); }
        if (nome === 'figurino') {
            fecharEditorFigurinoMestre();
            (medidaTiposCacheSA.length === 0 ? carregarMedidaTiposSA() : Promise.resolve())
                .then(carregarFigurinoMestreSA).then(renderizarFigurinoMestreListaSA);
        }
        if (nome === 'eventos') { fecharEditorEventoTipo(); carregarEventoTiposSA().then(renderizarEventoTiposListaSA); }
        if (nome === 'temporadas') { fecharEditorTemporada(); carregarTemporadasSA().then(renderizarTemporadasListaSA); }
        if (nome === 'permissoes-padrao') { fecharEditorPermissaoPadrao(); carregarPermissoesPadrao().then(renderizarPermissoesPadraoLista); }
    }
    function voltarConfigListaSA() {
        document.querySelectorAll('#sa-painel-configuracoes-globais .config-subtela').forEach(el => el.style.display = 'none');
        document.getElementById('sa-config-lista').style.display = 'block';
    }
    async function carregarCategorias() {
        const [resCat, resNom] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/instrumento_categorias?order=ordem`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/instrumento_nomenclaturas?order=ordem`, { headers: authHeaders })
        ]);
        const categorias = await resCat.json();
        const nomenclaturas = await resNom.json();
        categoriasCache = (categorias || []).map(c => ({ ...c, nomenclaturas: (nomenclaturas || []).filter(n => n.categoria_id === c.id) }));
    }
    function renderizarCategoriasLista() {
        const container = document.getElementById('sa-categorias-lista');
        if (categoriasCache.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">🥁</div>Nenhuma categoria cadastrada ainda.</div>'; return; }
        const grupos = [['tradicional', 'Tradicionais'], ['especial', 'Especiais']];
        container.innerHTML = grupos.map(([chave, label]) => {
            const itens = categoriasCache.filter(c => c.grupo === chave).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
            if (itens.length === 0) return '';
            return `<div class="config-grupo-titulo">${label}</div>` + itens.map(c => `
                <div class="item-card">
                    <div class="item-info">
                        <div class="item-nome">${esc(c.nome)} ${c.ativo === false ? '<span class="badge-inativo">Inativa</span>' : ''}</div>
                        <div class="item-detalhe">${c.nomenclaturas.length > 0 ? esc([...c.nomenclaturas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(n => n.nome).join(', ')) : 'Sem nomenclaturas alternativas'}</div>
                    </div>
                    <div class="item-acoes"><button class="btn-ficha" onclick="abrirEditarCategoria(${c.id})">Editar</button></div>
                </div>`).join('');
        }).join('');
    }
    function abrirNovaCategoria() { categoriaEditando = { id: null, nome: '', grupo: 'tradicional', ativo: true, nomenclaturas: [], removidas: [] }; renderizarEditorCategoria(); }
    function abrirEditarCategoria(id) {
        const c = categoriasCache.find(x => x.id === id);
        if (!c) return;
        categoriaEditando = { id: c.id, nome: c.nome, grupo: c.grupo, ativo: c.ativo !== false, nomenclaturas: [...c.nomenclaturas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(n => ({ id: n.id, nome: n.nome })), removidas: [] };
        renderizarEditorCategoria();
    }
    function renderizarEditorCategoria() {
        const ce = categoriaEditando;
        const editor = document.getElementById('sa-categoria-editor');
        if (!editor) return;
        if (!ce) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        editor.style.display = 'block';
        editor.innerHTML = `<div class="card-form">
            <div class="card-form-titulo">${ce.id ? 'Editar Categoria' : 'Nova Categoria'}</div>
            <div class="form-grid">
                <div class="campo campo-full"><label>Nome *</label><input type="text" id="cat-edit-nome" value="${esc(ce.nome)}" placeholder="Ex: Surdo de Marcação"></div>
                <div class="campo"><label>Grupo</label><select id="cat-edit-grupo">
                    <option value="tradicional" ${ce.grupo === 'tradicional' ? 'selected' : ''}>Tradicional</option>
                    <option value="especial" ${ce.grupo === 'especial' ? 'selected' : ''}>Especial</option>
                </select></div>
                <div class="campo"><label>Status</label><select id="cat-edit-ativo">
                    <option value="true" ${ce.ativo ? 'selected' : ''}>Ativa</option>
                    <option value="false" ${!ce.ativo ? 'selected' : ''}>Inativa</option>
                </select></div>
                <div class="campo campo-full">
                    <label>Nomenclaturas (nomes que a bateria pode escolher)</label>
                    <div id="cat-edit-nomenclaturas">
                        ${ce.nomenclaturas.map((n, i) => `<div class="cat-edit-nom-linha">
                            <input type="text" class="cat-edit-nom-nome" data-idx="${i}" value="${esc(n.nome)}" placeholder="Nome da nomenclatura">
                            <button type="button" class="cat-edit-nom-remover" onclick="removerLinhaNomenclatura(${i})">×</button>
                        </div>`).join('')}
                    </div>
                    <span class="cat-edit-nom-add" onclick="adicionarLinhaNomenclatura()">+ Adicionar nomenclatura</span>
                </div>
            </div>
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button id="cat-btn-salvar" class="btn-ficha btn-ficha-salvar" onclick="salvarCategoria()">Salvar</button>
                    ${ce.id ? `<button class="btn-ficha btn-ficha-danger" onclick="excluirCategoria(${ce.id})">Excluir categoria</button>` : ''}
                </div>
                <button class="btn-ficha" onclick="fecharEditorCategoria()">Cancelar</button>
            </div>
        </div>`;
    }
    function sincronizarNomenclaturasDoDOM() {
        if (!categoriaEditando) return;
        document.querySelectorAll('.cat-edit-nom-nome').forEach(input => {
            const idx = Number(input.dataset.idx);
            if (categoriaEditando.nomenclaturas[idx]) categoriaEditando.nomenclaturas[idx].nome = input.value;
        });
    }
    function adicionarLinhaNomenclatura() { sincronizarNomenclaturasDoDOM(); categoriaEditando.nomenclaturas.push({ id: null, nome: '' }); renderizarEditorCategoria(); }
    function removerLinhaNomenclatura(idx) {
        sincronizarNomenclaturasDoDOM();
        const removida = categoriaEditando.nomenclaturas.splice(idx, 1)[0];
        if (removida && removida.id) categoriaEditando.removidas.push(removida.id);
        renderizarEditorCategoria();
    }
    function fecharEditorCategoria() { categoriaEditando = null; renderizarEditorCategoria(); }
    async function salvarCategoria() {
        if (salvandoCategoria) return;
        sincronizarNomenclaturasDoDOM();
        const nome = document.getElementById('cat-edit-nome').value.trim();
        if (!nome) { mostrarToast('Informe o nome da categoria.', 'erro'); return; }
        const grupo = document.getElementById('cat-edit-grupo').value;
        const ativo = document.getElementById('cat-edit-ativo').value === 'true';
        salvandoCategoria = true;
        try {
            let categoriaId = categoriaEditando.id;
            if (categoriaId) {
                await fetch(`${SUPABASE_URL}/rest/v1/instrumento_categorias?id=eq.${categoriaId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome, grupo, ativo }) });
            } else {
                const ordem = Math.max(0, ...categoriasCache.map(c => c.ordem || 0)) + 1;
                const res = await fetch(`${SUPABASE_URL}/rest/v1/instrumento_categorias`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ nome, grupo, ativo, ordem }) });
                const dados = await res.json();
                categoriaId = dados[0].id;
            }
            for (const id of categoriaEditando.removidas) await fetch(`${SUPABASE_URL}/rest/v1/instrumento_nomenclaturas?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
            let ordemNom = 1;
            for (const n of categoriaEditando.nomenclaturas) {
                const nomeNom = (n.nome || '').trim();
                if (!nomeNom) { ordemNom++; continue; }
                if (n.id) await fetch(`${SUPABASE_URL}/rest/v1/instrumento_nomenclaturas?id=eq.${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome: nomeNom, ordem: ordemNom }) });
                else await fetch(`${SUPABASE_URL}/rest/v1/instrumento_nomenclaturas`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ categoria_id: categoriaId, nome: nomeNom, ordem: ordemNom }) });
                ordemNom++;
            }
            mostrarToast(categoriaEditando.id ? 'Categoria atualizada!' : 'Categoria criada!');
            categoriaEditando = null;
            await carregarCategorias();
            renderizarEditorCategoria();
            renderizarCategoriasLista();
        } catch (e) { mostrarToast('Não foi possível salvar. Verifique sua conexão e tente de novo.', 'erro'); }
        finally { salvandoCategoria = false; }
    }
    async function excluirCategoria(id) {
        if (!(await tumtuConfirmar('Excluir esta categoria? Isso remove também suas nomenclaturas. Se alguma bateria já usa esse instrumento, prefira marcar como "Inativa".', { textoConfirmar: 'Excluir' }))) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/instrumento_categorias?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) { mostrarToast('Não foi possível excluir — provavelmente já está em uso. Marque como "Inativa".', 'erro'); return; }
        mostrarToast('Categoria excluída.'); categoriaEditando = null; await carregarCategorias(); renderizarEditorCategoria(); renderizarCategoriasLista();
    }

    // ── Configurações globais → Medidas (biblioteca mestre) ──────────────
    // Reforma de 23/ago/2026: tipo de medida (Camisa/Fantasia/Calça/Sapato/
    // etc) deixou de ser um texto fixo no código -- virou biblioteca mestre
    // própria (medida_tipos), editada aqui junto com sua escala de tamanhos
    // (medida_tamanhos) num único editor -- mesmo padrão já usado em
    // Instrumentos (Categoria + Nomenclaturas juntas). Pedido explícito
    // dela: toda medida nova precisa nascer já ligada a uma escala de
    // tamanho, nunca separada.
    let medidaTiposCacheSA = [];
    let medidaTipoEditando = null;
    let salvandoMedidaTipo = false;
    async function carregarMedidaTiposSA() {
        const [resTipos, resTam] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/medida_tipos?order=ordem`, { headers: authHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/medida_tamanhos?order=ordem`, { headers: authHeaders }),
        ]);
        const tipos = await resTipos.json();
        const tamanhos = await resTam.json();
        medidaTiposCacheSA = (tipos || []).map(t => ({ ...t, tamanhos: (tamanhos || []).filter(x => x.tipo_id === t.id) }));
    }
    // Tradicionais/Especiais -- pedido da Márcia, 24/ago/2026, mesmo rótulo
    // já usado em Instrumentos: Tradicional é obrigatória no cadastro,
    // Especial é opcional (peça pontual, ex: Vestido só pro Chocalho).
    const GRUPOS_MEDIDA_TIPO = [['tradicional', 'Tradicionais'], ['especial', 'Especiais']];
    function cardMedidaTipoSA(t) {
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-nome">${esc(t.nome)} ${t.ativo === false ? '<span class="badge-inativo">Inativo</span>' : ''}</div>
                    <div class="item-detalhe">${t.tamanhos.length > 0 ? esc([...t.tamanhos].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(x => x.nome).join(', ')) : 'Sem tamanhos cadastrados'}</div>
                </div>
                <div class="item-acoes"><button class="btn-ficha" onclick="abrirEditarMedidaTipo(${t.id})">Editar</button></div>
            </div>`;
    }
    function renderizarMedidaTiposListaSA() {
        const container = document.getElementById('sa-medida-tipos-lista');
        if (medidaTiposCacheSA.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">👕</div>Nenhuma categoria de figurino cadastrada ainda.</div>'; return; }
        container.innerHTML = GRUPOS_MEDIDA_TIPO.map(([chave, label]) => {
            const itens = medidaTiposCacheSA.filter(t => (t.grupo || 'tradicional') === chave).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
            if (itens.length === 0) return '';
            return `<div class="secao-titulo">${label}</div>${itens.map(cardMedidaTipoSA).join('')}`;
        }).join('');
    }
    function abrirNovoMedidaTipo() { medidaTipoEditando = { id: null, nome: '', ativo: true, grupo: 'tradicional', tamanhos: [], removidas: [] }; renderizarEditorMedidaTipo(); }
    function abrirEditarMedidaTipo(id) {
        const t = medidaTiposCacheSA.find(x => x.id === id);
        if (!t) return;
        medidaTipoEditando = { id: t.id, nome: t.nome, ativo: t.ativo !== false, grupo: t.grupo || 'tradicional', tamanhos: [...t.tamanhos].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(s => ({ id: s.id, nome: s.nome })), removidas: [] };
        renderizarEditorMedidaTipo();
    }
    function renderizarEditorMedidaTipo() {
        const te = medidaTipoEditando;
        const editor = document.getElementById('sa-medida-tipo-editor');
        if (!editor) return;
        if (!te) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        editor.style.display = 'block';
        editor.innerHTML = `<div class="card-form">
            <div class="card-form-titulo">${te.id ? 'Editar Categoria de Figurino' : 'Nova Categoria de Figurino'}</div>
            <div class="form-grid">
                <div class="campo campo-full"><label>Nome *</label><input type="text" id="mt-edit-nome" value="${esc(te.nome)}" placeholder="Ex: Vestido"></div>
                <div class="campo"><label>Status</label><select id="mt-edit-ativo">
                    <option value="true" ${te.ativo ? 'selected' : ''}>Ativo</option>
                    <option value="false" ${!te.ativo ? 'selected' : ''}>Inativo</option>
                </select></div>
                <div class="campo"><label>Grupo</label><select id="mt-edit-grupo">
                    <option value="tradicional" ${te.grupo !== 'especial' ? 'selected' : ''}>Tradicional (obrigatória no cadastro)</option>
                    <option value="especial" ${te.grupo === 'especial' ? 'selected' : ''}>Especial (opcional no cadastro)</option>
                </select></div>
                <div class="campo campo-full">
                    <label>Medida (escala de tamanhos desta categoria) *</label>
                    <div id="mt-edit-tamanhos">
                        ${te.tamanhos.map((s, i) => `<div class="cat-edit-nom-linha">
                            <input type="text" class="mt-edit-tam-nome" data-idx="${i}" value="${esc(s.nome)}" placeholder="Ex: PP, M, GG ou 38">
                            <button type="button" class="cat-edit-nom-remover" onclick="removerLinhaTamanhoMT(${i})">×</button>
                        </div>`).join('')}
                    </div>
                    <span class="cat-edit-nom-add" onclick="adicionarLinhaTamanhoMT()">+ Adicionar tamanho</span>
                </div>
            </div>
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button id="mt-btn-salvar" class="btn-ficha btn-ficha-salvar" onclick="salvarMedidaTipoSA()">Salvar</button>
                    ${te.id ? `<button class="btn-ficha btn-ficha-danger" onclick="excluirMedidaTipoSA(${te.id})">Excluir tipo</button>` : ''}
                </div>
                <button class="btn-ficha" onclick="fecharEditorMedidaTipo()">Cancelar</button>
            </div>
        </div>`;
    }
    // Sincroniza TUDO que existe no editor de volta pro objeto antes de
    // qualquer re-render disparado por +/- tamanho -- sem isso, nome/status
    // já digitados somem quando o editor inteiro é redesenhado (achado
    // testando ao vivo, 23/ago/2026: sincronizar só os tamanhos deixava o
    // campo Nome voltar a vazio ao clicar "+ Adicionar tamanho").
    function sincronizarTamanhosMTDoDOM() {
        if (!medidaTipoEditando) return;
        const nomeInput = document.getElementById('mt-edit-nome');
        const ativoInput = document.getElementById('mt-edit-ativo');
        const grupoInput = document.getElementById('mt-edit-grupo');
        if (nomeInput) medidaTipoEditando.nome = nomeInput.value;
        if (ativoInput) medidaTipoEditando.ativo = ativoInput.value === 'true';
        if (grupoInput) medidaTipoEditando.grupo = grupoInput.value;
        document.querySelectorAll('.mt-edit-tam-nome').forEach(input => {
            const idx = Number(input.dataset.idx);
            if (medidaTipoEditando.tamanhos[idx]) medidaTipoEditando.tamanhos[idx].nome = input.value;
        });
    }
    function adicionarLinhaTamanhoMT() { sincronizarTamanhosMTDoDOM(); medidaTipoEditando.tamanhos.push({ id: null, nome: '' }); renderizarEditorMedidaTipo(); }
    function removerLinhaTamanhoMT(idx) {
        sincronizarTamanhosMTDoDOM();
        const removido = medidaTipoEditando.tamanhos.splice(idx, 1)[0];
        if (removido && removido.id) medidaTipoEditando.removidas.push(removido.id);
        renderizarEditorMedidaTipo();
    }
    function fecharEditorMedidaTipo() { medidaTipoEditando = null; renderizarEditorMedidaTipo(); }
    async function salvarMedidaTipoSA() {
        if (salvandoMedidaTipo) return;
        sincronizarTamanhosMTDoDOM();
        const nome = document.getElementById('mt-edit-nome').value.trim();
        if (!nome) { mostrarToast('Informe o nome da categoria de figurino.', 'erro'); return; }
        const ativo = document.getElementById('mt-edit-ativo').value === 'true';
        const grupo = document.getElementById('mt-edit-grupo').value;
        const tamanhosValidos = medidaTipoEditando.tamanhos.map(s => (s.nome || '').trim()).filter(Boolean);
        if (tamanhosValidos.length === 0) { mostrarToast('Adicione pelo menos um tamanho — toda categoria precisa de uma escala de Medida.', 'erro'); return; }
        salvandoMedidaTipo = true;
        try {
            let tipoId = medidaTipoEditando.id;
            if (tipoId) {
                await fetch(`${SUPABASE_URL}/rest/v1/medida_tipos?id=eq.${tipoId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome, ativo, grupo }) });
            } else {
                const ordem = Math.max(0, ...medidaTiposCacheSA.map(t => t.ordem || 0)) + 1;
                const res = await fetch(`${SUPABASE_URL}/rest/v1/medida_tipos`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation', ...authHeaders }, body: JSON.stringify({ nome, ativo, ordem, grupo }) });
                const dados = await res.json();
                tipoId = dados[0].id;
            }
            for (const id of medidaTipoEditando.removidas) await fetch(`${SUPABASE_URL}/rest/v1/medida_tamanhos?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
            let ordemTam = 1;
            for (const s of medidaTipoEditando.tamanhos) {
                const nomeTam = (s.nome || '').trim();
                if (!nomeTam) { ordemTam++; continue; }
                if (s.id) await fetch(`${SUPABASE_URL}/rest/v1/medida_tamanhos?id=eq.${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome: nomeTam, ordem: ordemTam }) });
                else await fetch(`${SUPABASE_URL}/rest/v1/medida_tamanhos`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ tipo_id: tipoId, nome: nomeTam, ordem: ordemTam, ativo: true }) });
                ordemTam++;
            }
            mostrarToast(medidaTipoEditando.id ? 'Categoria de figurino atualizada!' : 'Categoria de figurino criada!');
            medidaTipoEditando = null;
            await carregarMedidaTiposSA();
            renderizarEditorMedidaTipo();
            renderizarMedidaTiposListaSA();
        } catch (e) { mostrarToast('Não foi possível salvar. Verifique sua conexão e tente de novo.', 'erro'); }
        finally { salvandoMedidaTipo = false; }
    }
    async function excluirMedidaTipoSA(id) {
        if (!(await tumtuConfirmar('Excluir esta categoria de figurino? Isso remove também sua escala de Medida. Se alguma bateria já usa, prefira marcar como "Inativo".', { textoConfirmar: 'Excluir' }))) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/medida_tipos?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) { mostrarToast('Não foi possível excluir — provavelmente já está em uso. Marque como "Inativo".', 'erro'); return; }
        mostrarToast('Categoria de figurino excluída.'); medidaTipoEditando = null; await carregarMedidaTiposSA(); renderizarEditorMedidaTipo(); renderizarMedidaTiposListaSA();
    }

    // ══════════════════════════════════════════════════════════════════
    // FIGURINO -- LISTA MESTRE (Super Admin, 23/ago/2026) -- peça
    // específica (ex: "Camisa da Final"), sempre ligada a uma Categoria de
    // Figurino só pra usar o tamanho dela (nunca tem tamanho próprio) e
    // sempre de um público só (Ritmista ou Diretoria) -- não pode misturar,
    // são peças diferentes (decisão explícita da Márcia).
    let figurinoMestreCacheSA = [];
    let figurinoMestreEditando = null;
    let salvandoFigurinoMestre = false;
    async function carregarFigurinoMestreSA() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/figurino_itens_mestre?order=ordem`, { headers: authHeaders });
        figurinoMestreCacheSA = res.ok ? await res.json() : [];
    }
    function renderizarFigurinoMestreListaSA() {
        const container = document.getElementById('sa-figurino-lista');
        if (figurinoMestreCacheSA.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">👕</div>Nenhum Figurino cadastrado ainda.</div>'; return; }
        // Agrupa por Categoria de Figurino, não mais por público (27/ago/2026,
        // achado dela: a peça já mostra todos os públicos que cobre no
        // próprio card, então agrupar por público fazia a mesma peça se
        // repetir numa seção pra cada público marcado -- confuso e
        // redundante). Categoria continua sendo dono único de cada peça,
        // então agrupar por ela nunca repete nada.
        const categoriaIds = [...new Set(figurinoMestreCacheSA.map(f => f.medida_tipo_id))];
        const categorias = categoriaIds.map(id => medidaTiposCacheSA.find(t => t.id === id)).filter(Boolean)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        container.innerHTML = categorias.map(cat => {
            const itens = figurinoMestreCacheSA.filter(f => f.medida_tipo_id === cat.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
            return `<div class="secao-titulo">${esc(cat.nome)}</div>` + itens.map(f => {
                return `
                <div class="item-card">
                    <div class="item-info">
                        <div class="item-nome">${esc(f.nome)} ${f.ativo === false ? '<span class="badge-inativo">Inativo</span>' : ''}</div>
                    </div>
                    <div class="item-acoes"><button class="btn-ficha" onclick="abrirEditarFigurinoMestre(${f.id})">Editar</button></div>
                </div>`;
            }).join('');
        }).join('');
    }
    function abrirNovoFigurinoMestre() {
        figurinoMestreEditando = { id: null, nome: '', medida_tipo_id: medidaTiposCacheSA[0] ? medidaTiposCacheSA[0].id : null, ativo: true };
        renderizarEditorFigurinoMestre();
    }
    function abrirEditarFigurinoMestre(id) {
        const f = figurinoMestreCacheSA.find(x => x.id === id);
        if (!f) return;
        figurinoMestreEditando = { id: f.id, nome: f.nome, medida_tipo_id: f.medida_tipo_id, ativo: f.ativo !== false };
        renderizarEditorFigurinoMestre();
    }
    function renderizarEditorFigurinoMestre() {
        const fe = figurinoMestreEditando;
        const editor = document.getElementById('sa-figurino-editor');
        if (!editor) return;
        if (!fe) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        if (medidaTiposCacheSA.length === 0) { editor.style.display = 'block'; editor.innerHTML = '<div class="card-form">Cadastre uma Categoria de Figurino primeiro, em Configurações → Categoria de Figurino.</div>'; return; }
        editor.style.display = 'block';
        editor.innerHTML = `<div class="card-form">
            <div class="card-form-titulo">${fe.id ? 'Editar Figurino' : 'Novo Figurino'}</div>
            <div class="form-grid">
                <div class="campo campo-full"><label>Nome *</label><input type="text" id="fig-mestre-edit-nome" value="${esc(fe.nome)}" placeholder="Ex: Camisa da Final"></div>
                <div class="campo"><label>Categoria de Figurino (usa o tamanho dela) *</label><select id="fig-mestre-edit-categoria">${medidaTiposCacheSA.map(t => `<option value="${t.id}" ${fe.medida_tipo_id === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
                <div class="campo"><label>Status</label><select id="fig-mestre-edit-ativo">
                    <option value="true" ${fe.ativo ? 'selected' : ''}>Ativo</option>
                    <option value="false" ${!fe.ativo ? 'selected' : ''}>Inativo</option>
                </select></div>
                <div class="campo campo-full" style="color:var(--cor-texto-muted);font-size:13px;">Público e "Incluir Convidados" agora são decisão de cada bateria -- ative essa peça em Configurações → Figurino, dentro da bateria, pra escolher.</div>
            </div>
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button class="btn-ficha btn-ficha-salvar" onclick="salvarFigurinoMestre()">Salvar</button>
                    ${fe.id ? `<button class="btn-ficha btn-ficha-danger" onclick="excluirFigurinoMestre(${fe.id})">Excluir</button>` : ''}
                </div>
                <button class="btn-ficha" onclick="fecharEditorFigurinoMestre()">Cancelar</button>
            </div>
        </div>`;
    }
    function fecharEditorFigurinoMestre() { figurinoMestreEditando = null; renderizarEditorFigurinoMestre(); }
    async function salvarFigurinoMestre() {
        if (salvandoFigurinoMestre) return;
        const nome = document.getElementById('fig-mestre-edit-nome').value.trim();
        if (!nome) { mostrarToast('Informe o nome do Figurino.', 'erro'); return; }
        const medidaTipoId = Number(document.getElementById('fig-mestre-edit-categoria').value);
        const ativo = document.getElementById('fig-mestre-edit-ativo').value === 'true';
        salvandoFigurinoMestre = true;
        try {
            if (figurinoMestreEditando.id) {
                await fetch(`${SUPABASE_URL}/rest/v1/figurino_itens_mestre?id=eq.${figurinoMestreEditando.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ medida_tipo_id: medidaTipoId, nome, ativo }) });
            } else {
                const ordem = Math.max(0, ...figurinoMestreCacheSA.map(i => i.ordem || 0)) + 1;
                await fetch(`${SUPABASE_URL}/rest/v1/figurino_itens_mestre`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ medida_tipo_id: medidaTipoId, nome, ativo, ordem }) });
            }
            mostrarToast(figurinoMestreEditando.id ? 'Figurino atualizado!' : 'Figurino criado!');
            figurinoMestreEditando = null;
            await carregarFigurinoMestreSA();
            renderizarEditorFigurinoMestre();
            renderizarFigurinoMestreListaSA();
        } finally { salvandoFigurinoMestre = false; }
    }
    async function excluirFigurinoMestre(id) {
        if (!(await tumtuConfirmar('Excluir este Figurino? Isso remove também o controle de entrega já registrado em toda bateria que usa ele. Se preferir manter o histórico, marque como "Inativo".', { textoConfirmar: 'Excluir' }))) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/figurino_itens_mestre?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) { mostrarToast('Não foi possível excluir.', 'erro'); return; }
        mostrarToast('Figurino excluído.');
        figurinoMestreEditando = null;
        await carregarFigurinoMestreSA();
        renderizarEditorFigurinoMestre();
        renderizarFigurinoMestreListaSA();
    }

    // ══════════════════════════════════════════════════════════════════
    // TIPOS DE EVENTO -- LISTA MESTRE (Super Admin, 29/ago/2026) -- biblioteca
    // de tipos (Ensaio, Ensaio Técnico, Apresentação...) pro módulo de
    // Presença via QR. Cada bateria escolhe o tipo ao criar um Evento
    // próprio -- mesmo padrão de Instrumentos/Categoria de Figurino/
    // Figurino, mas mais simples (só nome/ordem/ativo, sem sub-lista).
    // ══════════════════════════════════════════════════════════════════
    let eventoTiposCacheSA = [];
    let eventoTipoEditando = null;
    let salvandoEventoTipo = false;
    async function carregarEventoTiposSA() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/evento_tipos?order=ordem`, { headers: authHeaders });
        eventoTiposCacheSA = res.ok ? await res.json() : [];
    }
    function cardEventoTipoSA(t) {
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-nome">${esc(t.nome)} ${t.ativo === false ? '<span class="badge-inativo">Inativo</span>' : ''}</div>
                </div>
                <div class="item-acoes"><button class="btn-ficha" onclick="abrirEditarEventoTipo(${t.id})">Editar</button></div>
            </div>`;
    }
    function renderizarEventoTiposListaSA() {
        const container = document.getElementById('sa-evento-tipos-lista');
        if (!container) return;
        if (eventoTiposCacheSA.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📅</div>Nenhum tipo de evento cadastrado ainda.</div>'; return; }
        container.innerHTML = [...eventoTiposCacheSA].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(cardEventoTipoSA).join('');
    }
    function abrirNovoEventoTipo() { eventoTipoEditando = { id: null, nome: '', ativo: true }; renderizarEditorEventoTipo(); }
    function abrirEditarEventoTipo(id) {
        const t = eventoTiposCacheSA.find(x => x.id === id);
        if (!t) return;
        eventoTipoEditando = { id: t.id, nome: t.nome, ativo: t.ativo !== false };
        renderizarEditorEventoTipo();
    }
    function renderizarEditorEventoTipo() {
        const te = eventoTipoEditando;
        const editor = document.getElementById('sa-evento-tipo-editor');
        if (!editor) return;
        if (!te) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        editor.style.display = 'block';
        editor.innerHTML = `<div class="card-form">
            <div class="card-form-titulo">${te.id ? 'Editar Tipo de Evento' : 'Novo Tipo de Evento'}</div>
            <div class="form-grid">
                <div class="campo campo-full"><label>Nome *</label><input type="text" id="et-edit-nome" value="${esc(te.nome)}" placeholder="Ex: Ensaio Técnico"></div>
                <div class="campo"><label>Status</label><select id="et-edit-ativo">
                    <option value="true" ${te.ativo ? 'selected' : ''}>Ativo</option>
                    <option value="false" ${!te.ativo ? 'selected' : ''}>Inativo</option>
                </select></div>
            </div>
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button id="et-btn-salvar" class="btn-ficha btn-ficha-salvar" onclick="salvarEventoTipoSA()">Salvar</button>
                    ${te.id ? `<button class="btn-ficha btn-ficha-danger" onclick="excluirEventoTipoSA(${te.id})">Excluir tipo</button>` : ''}
                </div>
                <button class="btn-ficha" onclick="fecharEditorEventoTipo()">Cancelar</button>
            </div>
        </div>`;
    }
    function fecharEditorEventoTipo() { eventoTipoEditando = null; renderizarEditorEventoTipo(); }
    async function salvarEventoTipoSA() {
        if (salvandoEventoTipo) return;
        const nome = document.getElementById('et-edit-nome').value.trim();
        if (!nome) { mostrarToast('Informe o nome do tipo de evento.', 'erro'); return; }
        const ativo = document.getElementById('et-edit-ativo').value === 'true';
        salvandoEventoTipo = true;
        try {
            if (eventoTipoEditando.id) {
                await fetch(`${SUPABASE_URL}/rest/v1/evento_tipos?id=eq.${eventoTipoEditando.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome, ativo }) });
            } else {
                const ordem = Math.max(0, ...eventoTiposCacheSA.map(t => t.ordem || 0)) + 1;
                await fetch(`${SUPABASE_URL}/rest/v1/evento_tipos`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome, ativo, ordem }) });
            }
            mostrarToast(eventoTipoEditando.id ? 'Tipo de evento atualizado!' : 'Tipo de evento criado!');
            eventoTipoEditando = null;
            await carregarEventoTiposSA();
            renderizarEditorEventoTipo();
            renderizarEventoTiposListaSA();
        } catch (e) { mostrarToast('Não foi possível salvar. Verifique sua conexão e tente de novo.', 'erro'); }
        finally { salvandoEventoTipo = false; }
    }
    async function excluirEventoTipoSA(id) {
        if (!(await tumtuConfirmar('Excluir este tipo de evento? Se alguma bateria já tem Eventos criados com ele, prefira marcar como "Inativo".', { textoConfirmar: 'Excluir' }))) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/evento_tipos?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) { mostrarToast('Não foi possível excluir — provavelmente já está em uso. Marque como "Inativo".', 'erro'); return; }
        mostrarToast('Tipo de evento excluído.'); eventoTipoEditando = null; await carregarEventoTiposSA(); renderizarEditorEventoTipo(); renderizarEventoTiposListaSA();
    }

    // ══════════════════════════════════════════════════════════════════
    // TEMPORADAS -- LISTA MESTRE (Super Admin, 29/ago/2026) -- rótulo
    // padronizado (ex: "Carnaval 2026") usado em Eventos. Pedido dela:
    // texto livre ia gerar grafia inconsistente ("já vi no apelido, que é
    // livre"). Mesma estrutura simples de Tipos de Evento (nome/ordem/ativo).
    // ══════════════════════════════════════════════════════════════════
    let temporadasCacheSA = [];
    let temporadaEditando = null;
    let salvandoTemporada = false;
    async function carregarTemporadasSA() {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/temporadas?order=ordem`, { headers: authHeaders });
        temporadasCacheSA = res.ok ? await res.json() : [];
    }
    function cardTemporadaSA(t) {
        return `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-nome">${esc(t.nome)} ${t.ativo === false ? '<span class="badge-inativo">Inativa</span>' : ''}</div>
                </div>
                <div class="item-acoes"><button class="btn-ficha" onclick="abrirEditarTemporada(${t.id})">Editar</button></div>
            </div>`;
    }
    function renderizarTemporadasListaSA() {
        const container = document.getElementById('sa-temporadas-lista');
        if (!container) return;
        if (temporadasCacheSA.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📅</div>Nenhuma temporada cadastrada ainda.</div>'; return; }
        container.innerHTML = [...temporadasCacheSA].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)).map(cardTemporadaSA).join('');
    }
    function abrirNovaTemporada() { temporadaEditando = { id: null, nome: '', ativo: true }; renderizarEditorTemporada(); }
    function abrirEditarTemporada(id) {
        const t = temporadasCacheSA.find(x => x.id === id);
        if (!t) return;
        temporadaEditando = { id: t.id, nome: t.nome, ativo: t.ativo !== false };
        renderizarEditorTemporada();
    }
    function renderizarEditorTemporada() {
        const te = temporadaEditando;
        const editor = document.getElementById('sa-temporada-editor');
        if (!editor) return;
        if (!te) { editor.style.display = 'none'; editor.innerHTML = ''; return; }
        editor.style.display = 'block';
        editor.innerHTML = `<div class="card-form">
            <div class="card-form-titulo">${te.id ? 'Editar Temporada' : 'Nova Temporada'}</div>
            <div class="form-grid">
                <div class="campo campo-full"><label>Nome *</label><input type="text" id="tp-edit-nome" value="${esc(te.nome)}" placeholder="Ex: Carnaval 2026"></div>
                <div class="campo"><label>Status</label><select id="tp-edit-ativo">
                    <option value="true" ${te.ativo ? 'selected' : ''}>Ativa</option>
                    <option value="false" ${!te.ativo ? 'selected' : ''}>Inativa</option>
                </select></div>
            </div>
            <div class="form-rodape">
                <div class="form-rodape-esq">
                    <button id="tp-btn-salvar" class="btn-ficha btn-ficha-salvar" onclick="salvarTemporadaSA()">Salvar</button>
                    ${te.id ? `<button class="btn-ficha btn-ficha-danger" onclick="excluirTemporadaSA(${te.id})">Excluir temporada</button>` : ''}
                </div>
                <button class="btn-ficha" onclick="fecharEditorTemporada()">Cancelar</button>
            </div>
        </div>`;
    }
    function fecharEditorTemporada() { temporadaEditando = null; renderizarEditorTemporada(); }
    async function salvarTemporadaSA() {
        if (salvandoTemporada) return;
        const nome = document.getElementById('tp-edit-nome').value.trim();
        if (!nome) { mostrarToast('Informe o nome da temporada.', 'erro'); return; }
        const ativo = document.getElementById('tp-edit-ativo').value === 'true';
        salvandoTemporada = true;
        try {
            if (temporadaEditando.id) {
                await fetch(`${SUPABASE_URL}/rest/v1/temporadas?id=eq.${temporadaEditando.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome, ativo }) });
            } else {
                const ordem = Math.max(0, ...temporadasCacheSA.map(t => t.ordem || 0)) + 1;
                await fetch(`${SUPABASE_URL}/rest/v1/temporadas`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ nome, ativo, ordem }) });
            }
            mostrarToast(temporadaEditando.id ? 'Temporada atualizada!' : 'Temporada criada!');
            temporadaEditando = null;
            await carregarTemporadasSA();
            renderizarEditorTemporada();
            renderizarTemporadasListaSA();
        } catch (e) { mostrarToast('Não foi possível salvar. Verifique sua conexão e tente de novo.', 'erro'); }
        finally { salvandoTemporada = false; }
    }
    async function excluirTemporadaSA(id) {
        if (!(await tumtuConfirmar('Excluir esta temporada? Se algum evento já usa ela, prefira marcar como "Inativa".', { textoConfirmar: 'Excluir' }))) return;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/temporadas?id=eq.${id}`, { method: 'DELETE', headers: authHeaders });
        if (!res.ok) { mostrarToast('Não foi possível excluir — provavelmente já está em uso. Marque como "Inativa".', 'erro'); return; }
        mostrarToast('Temporada excluída.'); temporadaEditando = null; await carregarTemporadasSA(); renderizarEditorTemporada(); renderizarTemporadasListaSA();
    }

    // ══════════════════════════════════════════════════════════════════
    // HISTÓRICO (por escola/bateria, só Super Admin nesta etapa)
    // ══════════════════════════════════════════════════════════════════
    const HIST_STATUS_LABEL = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado', suspenso: 'Suspenso', desligado: 'Desligado', inativo: 'Inativo' };
    function histStatusLabel(s) { return HIST_STATUS_LABEL[s] || s || '—'; }
    function histPerfilLabel(p, genero) { return p === 'ritmista' ? 'Ritmista' : labelPerfilSA(p, genero); }
    // Gênero muda Mestre/Mestra e Diretor/Diretora -- mesma lógica de
    // fpCargoLabel (ficha-perfil.js), reaplicada aqui pros selos/rótulos
    // do painel que não passam pelo motor único de ficha. Apoio é
    // invariável (nunca teve forma feminina definida). Pedido dela,
    // 24/ago/2026, depois de eu esquecer disso ao criar o rótulo de cargo
    // em Aniversariantes do mês.
    function labelPerfilSA(p, genero) { if (p === 'mestre') return genero === 'feminino' ? 'Mestra de Bateria' : 'Mestre de Bateria'; if (p === 'diretor') return genero === 'feminino' ? 'Diretora de Bateria' : 'Diretor de Bateria'; if (p === 'apoio') return genero === 'feminino' ? 'Diretora (Apoio)' : 'Diretor (Apoio)'; return p; }
    function histDataHora(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
    async function carregarHistoricoEscolaSA() {
        // Busca tudo antes de mexer na lista -- sem spinner, sem overlay
        // (01/set/2026, mesma varredura). O título "Histórico" é fixo no
        // HTML e não dá pra adiar (aparece junto com o resto do painel),
        // mas a lista em si só é tocada quando o resultado final já está
        // pronto -- nunca fica vazia/"carregando" no meio do caminho.
        const container = document.getElementById('lista-historico-escola');
        // Bug real, 06/set/2026 (achado dela: Jhones tinha "ver_historico"
        // marcado e via a lista vazia): esta função sempre usava
        // bateriasCache -- só existe preenchida quando quem está logado é
        // Super Admin (carregarBaterias, chamada dentro do contexto de
        // Super Admin de uma escola). Pra Mestre/Diretor comum essa lista
        // nunca é preenchida, então a busca sempre via "nenhuma bateria" e
        // mostrava a tela vazia, mesmo com a permissão certa no banco.
        // 1ª correção (sem filtro de bateria_id, deixando o RLS decidir
        // sozinho) causou um vazamento real: Jhones, que tem "ver_historico"
        // em DUAS baterias de escolas DIFERENTES (Diretor na Imperatriz,
        // Mestre na Rocinha), passou a ver o histórico das duas MISTURADO
        // mesmo logado em só uma delas -- achado dela ao vivo ("Nem
        // condições"). Corrigido de vez: pra quem não é Super Admin, filtra
        // sempre pela bateria ATUAL da sessão (bateriaIdContexto(), mesma
        // função que Ritmistas/Diretoria/Figurino/etc já usam) -- nunca
        // mistura baterias diferentes, mesmo quando a pessoa tem permissão
        // em mais de uma. RLS continua sendo a rede de segurança por baixo.
        let url;
        if (souSuperAdmin) {
            const idsBaterias = bateriasCache.map(b => b.id);
            if (idsBaterias.length === 0) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📋</div>Nenhum evento registrado ainda.</div>'; return; }
            url = `${SUPABASE_URL}/rest/v1/vinculos_historico_status?select=id,perfil,status_anterior,status_novo,motivo,criado_em,pessoa:pessoa_id(nome,genero),decisor:decidido_por(nome),bateria:bateria_id(nome)&bateria_id=in.(${idsBaterias.join(',')})&order=criado_em.desc&limit=200`;
        } else {
            const meuBateriaId = bateriaIdContexto();
            if (!meuBateriaId) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📋</div>Nenhum evento registrado ainda.</div>'; return; }
            url = `${SUPABASE_URL}/rest/v1/vinculos_historico_status?select=id,perfil,status_anterior,status_novo,motivo,criado_em,pessoa:pessoa_id(nome,genero),decisor:decidido_por(nome),bateria:bateria_id(nome)&bateria_id=eq.${meuBateriaId}&order=criado_em.desc&limit=200`;
        }
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📋</div>Não foi possível carregar o histórico.</div>'; return; }
        const eventos = await res.json();
        if (!eventos.length) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">📋</div>Nenhum evento registrado ainda.</div>'; return; }
        container.innerHTML = eventos.map(ev => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-nome">${esc(ev.pessoa?.nome || '—')}<span style="font-size:12px;font-weight:600;color:var(--cor-texto-muted)"> · ${histPerfilLabel(ev.perfil, ev.pessoa?.genero)}</span></div>
                    <div class="item-detalhe" style="margin-top:5px">
                        ${histStatusLabel(ev.status_anterior)} → ${histStatusLabel(ev.status_novo)} · por ${esc(ev.decisor?.nome || '—')} · ${esc(ev.bateria?.nome || '—')} · ${histDataHora(ev.criado_em)}
                        ${ev.motivo ? ` · "${esc(ev.motivo)}"` : ''}
                    </div>
                </div>
            </div>`).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // PRIVACIDADE (exclusão de dados sob pedido — LGPD)
    // ══════════════════════════════════════════════════════════════════
    let exclusaoLgpdPendente = null;
    async function carregarPrivacidade() {
        const select = document.getElementById('priv-select-escola');
        select.innerHTML = '<option value="">Selecione a escola...</option>' + escolasCache.map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join('');
        document.getElementById('priv-resultado-pessoa').innerHTML = '';
        document.getElementById('priv-busca-pessoa').value = '';
        // await (01/set/2026, mesma varredura) -- antes não devolvia a
        // promise de carregarLogExclusoes(), então quem chamava (trocarSaAba)
        // achava que essa aba já tinha terminado de carregar sem ter esperado
        // o log de exclusões de verdade.
        await carregarLogExclusoes();
    }
    async function buscarPessoaExclusao() {
        const termo = document.getElementById('priv-busca-pessoa').value.trim();
        const container = document.getElementById('priv-resultado-pessoa');
        if (!termo) { container.innerHTML = ''; return; }
        container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">🔎</div>Buscando...</div>';
        const filtro = `or=(nome.ilike.*${encodeURIComponent(termo)}*,cpf.ilike.*${encodeURIComponent(termo)}*,email.ilike.*${encodeURIComponent(termo)}*)`;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/pessoas?${filtro}&select=id,nome,cpf,email,super_admin&order=nome&limit=20`, { headers: authHeaders });
        if (!res.ok) { container.innerHTML = '<div class="estado-vazio">Não foi possível buscar.</div>'; return; }
        const lista = await res.json();
        if (!lista.length) { container.innerHTML = '<div class="estado-vazio">Ninguém encontrado com esse termo.</div>'; return; }
        container.innerHTML = lista.map(p => `
            <div class="item-card">
                <div class="item-info"><div class="item-nome">${esc(p.nome)}</div><div class="item-detalhe" style="margin-top:5px">CPF ${esc(p.cpf) || '—'} · ${esc(p.email) || '—'}</div></div>
                <div class="item-acoes">${p.super_admin ? '<span style="font-size:12px;color:var(--cor-texto-muted)">Super Admin — protegida</span>' : `<button class="btn-ficha btn-ficha-danger" onclick='abrirConfirmacaoExclusaoPessoa(${p.id}, ${JSON.stringify(p.nome)})'>Excluir</button>`}</div>
            </div>`).join('');
    }
    function abrirConfirmacaoExclusaoPessoa(id, nome) {
        exclusaoLgpdPendente = { tipo: 'pessoa', id, nome };
        document.getElementById('excluir-lgpd-titulo').textContent = 'Excluir dados de ' + nome;
        document.getElementById('excluir-lgpd-descricao').textContent = 'Isso apaga a ficha pessoal e a conta de login de ' + nome + ' por completo, de todas as baterias. Não tem volta.';
        abrirModalExclusaoLgpd();
    }
    function prepararExclusaoEscola() {
        const select = document.getElementById('priv-select-escola');
        const id = select.value;
        if (!id) { mostrarToast('Selecione uma escola primeiro.', 'erro'); return; }
        const nome = select.options[select.selectedIndex].textContent;
        exclusaoLgpdPendente = { tipo: 'escola', id: Number(id), nome };
        document.getElementById('excluir-lgpd-titulo').textContent = 'Excluir a escola ' + nome;
        document.getElementById('excluir-lgpd-descricao').textContent = 'Isso apaga a escola, todas as baterias dela e todos os vínculos ligados a elas. Fichas pessoais de quem ficar sem vínculo em nenhum lugar são preservadas. Não tem volta.';
        abrirModalExclusaoLgpd();
    }
    function abrirModalExclusaoLgpd() {
        const ehPessoa = exclusaoLgpdPendente && exclusaoLgpdPendente.tipo === 'pessoa';
        document.getElementById('excluir-lgpd-motivo-pessoa-wrap').style.display = ehPessoa ? '' : 'none';
        document.getElementById('excluir-lgpd-motivo-outro-wrap').style.display = 'none';
        document.getElementById('excluir-lgpd-motivo-escola-wrap').style.display = ehPessoa ? 'none' : '';
        document.getElementById('excluir-lgpd-motivo-select').value = '';
        document.getElementById('excluir-lgpd-motivo-outro').value = '';
        document.getElementById('excluir-lgpd-motivo').value = '';
        document.getElementById('excluir-lgpd-solicitante').value = '';
        document.getElementById('excluir-lgpd-confirmacao').value = '';
        document.getElementById('excluir-lgpd-btn-confirmar').disabled = true;
        document.getElementById('modal-excluir-lgpd-overlay').classList.add('aberto');
    }
    function fecharConfirmacaoExclusao() { exclusaoLgpdPendente = null; document.getElementById('modal-excluir-lgpd-overlay').classList.remove('aberto'); }
    function onMudarMotivoExclusaoPessoa() {
        const select = document.getElementById('excluir-lgpd-motivo-select').value;
        document.getElementById('excluir-lgpd-motivo-outro-wrap').style.display = select === 'outro' ? '' : 'none';
        onDigitarConfirmacaoExclusao();
    }
    function onDigitarConfirmacaoExclusao() {
        const confirmacao = document.getElementById('excluir-lgpd-confirmacao').value.trim().toUpperCase();
        const ehPessoa = exclusaoLgpdPendente && exclusaoLgpdPendente.tipo === 'pessoa';
        let motivoOk;
        if (ehPessoa) {
            const select = document.getElementById('excluir-lgpd-motivo-select').value;
            motivoOk = select !== '' && (select !== 'outro' || document.getElementById('excluir-lgpd-motivo-outro').value.trim() !== '');
        } else {
            motivoOk = document.getElementById('excluir-lgpd-motivo').value.trim() !== '';
        }
        document.getElementById('excluir-lgpd-btn-confirmar').disabled = !(motivoOk && confirmacao === 'EXCLUIR');
    }
    async function executarExclusaoConfirmada() {
        if (!exclusaoLgpdPendente) return;
        const btn = document.getElementById('excluir-lgpd-btn-confirmar');
        btn.disabled = true; btn.textContent = 'Excluindo...';
        const LABELS_MOTIVO_PESSOA = { pedido_pessoa: 'A pedido da própria pessoa', perda_acesso: 'Perda de acesso — vai se cadastrar de novo' };
        let motivo;
        if (exclusaoLgpdPendente.tipo === 'pessoa') {
            const select = document.getElementById('excluir-lgpd-motivo-select').value;
            motivo = select === 'outro' ? document.getElementById('excluir-lgpd-motivo-outro').value.trim() : LABELS_MOTIVO_PESSOA[select];
        } else {
            motivo = document.getElementById('excluir-lgpd-motivo').value.trim();
        }
        const solicitado_por = document.getElementById('excluir-lgpd-solicitante').value.trim() || null;
        const funcao = exclusaoLgpdPendente.tipo === 'pessoa' ? 'admin-excluir-pessoa' : 'admin-excluir-escola';
        const payload = exclusaoLgpdPendente.tipo === 'pessoa' ? { pessoa_id: exclusaoLgpdPendente.id, motivo, solicitado_por } : { escola_id: exclusaoLgpdPendente.id, motivo, solicitado_por };
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/${funcao}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(payload) });
            const resultado = await res.json();
            if (!res.ok || !resultado.ok) { mostrarToast('Erro: ' + (resultado.error || 'não foi possível excluir.'), 'erro'); btn.disabled = false; btn.textContent = 'Excluir de vez'; return; }
            mostrarToast(resultado.aviso || 'Excluído com sucesso.');
            fecharConfirmacaoExclusao();
            if (exclusaoLgpdPendente?.tipo === 'pessoa' || funcao === 'admin-excluir-pessoa') {
                document.getElementById('priv-resultado-pessoa').innerHTML = '';
                document.getElementById('priv-busca-pessoa').value = '';
            } else { await carregarEscolas(); carregarPrivacidade(); }
            carregarLogExclusoes();
        } catch (e) { mostrarToast('Erro de conexão ao excluir.', 'erro'); btn.disabled = false; btn.textContent = 'Excluir de vez'; }
    }
    async function carregarLogExclusoes() {
        const container = document.getElementById('priv-lista-log');
        const url = `${SUPABASE_URL}/rest/v1/exclusoes_lgpd?select=*,decisor:decidido_por(nome)&order=criado_em.desc&limit=100`;
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) { container.innerHTML = '<div class="estado-vazio">Não foi possível carregar o histórico de exclusões.</div>'; return; }
        const lista = await res.json();
        if (!lista.length) { container.innerHTML = '<div class="estado-vazio"><div class="estado-vazio-icone">🔒</div>Nenhuma exclusão registrada ainda.</div>'; return; }
        container.innerHTML = lista.map(ex => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-nome">${esc(ex.alvo_nome)}<span style="font-size:12px;font-weight:600;color:var(--cor-texto-muted)"> · ${ex.tipo === 'pessoa' ? 'Pessoa' : 'Escola'}</span></div>
                    <div class="item-detalhe" style="margin-top:5px">
                        ${esc(ex.resumo)} · autorizado por ${esc(ex.decisor?.nome || '—')} · ${histDataHora(ex.criado_em)}
                        ${ex.solicitado_por ? ` · pedido por ${esc(ex.solicitado_por)}` : ''}${ex.motivo ? ` · "${esc(ex.motivo)}"` : ''}
                    </div>
                </div>
            </div>`).join('');
    }

    // Também dentro de DOMContentLoaded (06/set/2026, mesmo motivo do `sb`
    // acima) -- precisa rodar DEPOIS que o `sb` acima já foi criado (os
    // dois listeners disparam na ordem em que foram registrados, e este
    // é registrado depois, então sempre roda depois).
    document.addEventListener('DOMContentLoaded', () => {
        (async () => {
            await iniciarSessaoAuth();
            await iniciarUsuario();
        })();
    });
