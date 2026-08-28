// ── Face ID / Digital — trava local de reabertura do app ────────────────
// NÃO substitui login/senha nenhum: só evita ter que digitar a senha de
// novo quando o celular JÁ tem uma sessão salva (o app sempre funcionou
// assim). Quem ativa aqui passa a precisar confirmar com a biometria do
// próprio aparelho (Face ID/Touch ID/digital — quem decide isso é o
// celular, o TumTu só pede a confirmação) antes de reabrir; se falhar ou
// recusar, cai pro login normal com senha (signOut de verdade, ver
// usarSenhaEmVezDeFaceId em login.html).
//
// Cada aparelho guarda sua própria credencial em localStorage, por
// pessoa (tumtu_faceid_<pessoa_id>) — ativar num celular novo não mexe
// nos outros, e trocar de pessoa no mesmo aparelho não confunde as duas.
// Não existe verificação server-side aqui de propósito: o objetivo é só
// um cadeado local em cima de uma sessão que já é válida, não uma segunda
// forma de login — por isso não precisa de nenhuma tabela nova no banco.

function faceIdSuportado() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}

async function faceIdDisponivelNesteAparelho() {
    if (!faceIdSuportado()) return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) {
        return false;
    }
}

function faceIdChave(pessoaId) {
    return 'tumtu_faceid_' + pessoaId;
}

function faceIdAtivo(pessoaId) {
    return !!localStorage.getItem(faceIdChave(pessoaId));
}

function faceIdBase64ParaBuffer(base64) {
    const bin = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}
function faceIdBufferParaBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
}

// Pede pro aparelho criar a credencial (aciona o prompt de Face ID/digital
// na hora) e guarda só o identificador dela — nunca nenhum dado biométrico
// de verdade, isso nunca sai do sistema operacional do aparelho.
async function faceIdAtivar(pessoaId, nome) {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const credential = await navigator.credentials.create({
        publicKey: {
            challenge,
            rp: { name: 'TumTu' },
            user: { id: userId, name: 'pessoa-' + pessoaId, displayName: nome || 'Ritmista' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', requireResidentKey: false },
            timeout: 60000,
            attestation: 'none',
        },
    });
    if (!credential) throw new Error('Não foi possível criar a credencial.');
    localStorage.setItem(faceIdChave(pessoaId), faceIdBufferParaBase64(credential.rawId));
}

function faceIdDesativar(pessoaId) {
    localStorage.removeItem(faceIdChave(pessoaId));
}

// true só se o aparelho confirmar a biometria de verdade contra a
// credencial já guardada — qualquer recusa/cancelamento/erro vira false.
async function faceIdVerificar(pessoaId) {
    const rawIdBase64 = localStorage.getItem(faceIdChave(pessoaId));
    if (!rawIdBase64) return false;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    try {
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                allowCredentials: [{ id: faceIdBase64ParaBuffer(rawIdBase64), type: 'public-key' }],
                userVerification: 'required',
                timeout: 60000,
            },
        });
        return !!assertion;
    } catch (e) {
        return false;
    }
}
