// Sites em que nada é aprendido nem lido por bastidor: login, pagamento, banco.

// Login e pagamento: nunca aprendidos. São os dois casos em que o mapa não serve e o vazamento
// machucaria. A checagem é no host (e nos rótulos de subdomínio), não no caminho, porque a URL de
// login varia por site — `appleid.apple.com` e `checkout.mercadolivre.com.br` não têm "login" no host.
const SUBDOMINIO_SENSIVEL =
  /^(login|signin|sign-in|auth|conta|conta\.secure|checkout|pagamento|payment|pay|secure|id|accounts|appleid|sso|myaccount)\./i;
const HOST_SENSIVEL =
  /(^|\.)(login|signin|sign-in|auth|id\.microsoftonline|apple|accounts\.google|facebook|instagram|linkedin|netflix|amazon|mercadolivre|mercadopago|shopify|stripe|paypal|pagseguro|cielo|bradesco|itau|santander|inter|caixa|sicredi|sicoob|banco|bb)\./i;

/** `true` quando a página não deve ser aprendida (login, pagamento, banco). */
export function siteSensivel(host: string): boolean {
  const h = host.toLowerCase().split(':')[0]!;
  if (HOST_SENSIVEL.test(h)) return true;
  // Subdomínio inicial: `checkout.mercadolivre.com.br`, `login.bb.com.br`, `appleid.apple.com`.
  return SUBDOMINIO_SENSIVEL.test(h);
}
