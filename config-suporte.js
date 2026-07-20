/**
 * E-mail de suporte do TumTu — tumtu.com.br com encaminhamento (ImprovMX)
 * pro tumtuapp@gmail.com, criado em 19/jul/2026.
 */
const EMAIL_SUPORTE = "suporte@tumtu.com.br";

function linkSuporteEmail(assunto) {
  if (!EMAIL_SUPORTE) return null;
  const params = assunto ? `?subject=${encodeURIComponent(assunto)}` : '';
  return `mailto:${EMAIL_SUPORTE}${params}`;
}
