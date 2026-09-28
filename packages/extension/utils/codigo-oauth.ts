// Engrenagem do login automático: qual aba a extensão precisa vigiar para capturar o código de
// autorização. Puro de propósito — o resto (raspar o DOM) só roda dentro da aba.

/** O redirect_uri que o CLI imprimiu na URL de login, ou null se o fluxo não tem página de callback. */
export function redirectDe(urlAuth: string): string | null {
  try {
    return new URL(urlAuth).searchParams.get('redirect_uri');
  } catch {
    return null;
  }
}

/** O código às vezes vem pronto na query da página de callback. */
export function codigoDaUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('code');
  } catch {
    return null;
  }
}

/** Um input da página só conta como código se for longo e sem espaços. */
export function pareceCodigo(valor: string): boolean {
  return /^[A-Za-z0-9_\-/=]{16,}$/.test(valor.trim());
}

/**
 * Texto solto na página: pega o primeiro token longo. A classe inclui `/` e `=` porque os
 * authorization codes do Google saem no formato `4/0Aean...` — sem eles o path de texto nunca
 * encontraria um code real.
 */
export function codigoNoTexto(texto: string): string | null {
  return texto.trim().match(/\b[A-Za-z0-9_\-/=]{16,}\b/)?.[0] ?? null;
}
