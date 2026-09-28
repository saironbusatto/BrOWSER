// Escape de HTML do painel.
//
// Toda vez que texto de fora entra no painel (resposta da IA, pergunta, nome de arquivo, rótulo
// de plano, link de login) passa por aqui. A resposta da IA pode carregar texto de uma página
// hostil, então isto é uma fronteira de segurança, não COSMÉTICA — e por isso tem teste próprio.

/** Escapa os cinco caracteres que abrem/fecham marcação ou atributo. */
export function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * `href` de um link que vem da ponte (URL de login extraída do CLI oficial).
 *
 * `escapeHtml` sozinho não basta: o atributo ficaria seguro, mas o esquema continua. Um
 * `javascript:alert(1)` escapingado ainda executa ao clicar. Só http(s) passa.
 */
export function urlSegura(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}
