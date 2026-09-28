// Telemetria passiva: o que o content script coleta de cada página.
//
// Tudo aqui é puro e testável, porque a parte perigosa desta feature não é o envio (isso é o
// background), é a decisão do que entra no mapa. Um rótulo com CPF que escapa daqui é um vazamento
// que a ponte não consegue desfazer.

/** Máscaras de PII. Espelha src/sanitizar.ts da ponte: aqui é a primeira das duas barreiras. */
const MASCARAS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]'],
  [/\b\d{5}-?\d{3}\b/g, '[cep]'],
  [/(\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]'],
  [/\b\d{6,}\b/g, '[número]'],
];

const URL = /https?:\/\/|\bwww\.\S+\.\S+/i;

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

/**
 * Rótulo/opção já saneado, ou null quando não é estrutura (é conteúdo do usuário).
 * `null` = o campo é descartado do mapa; um marcador `[cpf]` = o texto vira inútil, então o
 * chamador prefere descartar.
 */
export function textoEstrutural(bruto: string | null | undefined, maximo = 80): string | null {
  if (typeof bruto !== 'string') return null;
  const texto = bruto.replace(/\s+/g, ' ').trim();
  if (!texto || texto.length > maximo || URL.test(texto)) return null;
  return MASCARAS.reduce((t, [re, rep]) => t.replace(re, rep), texto);
}

/**
 * Igual a `textoEstrutural`, mas descarta o que carrega endereço/documento.
 *
 * Um "Rua das Flores, 123, CEP [cep]" não serve para o mapa (não é um estado, é um endereço salvo)
 * e não deve ficar ali: quem ler o mapa depois pensaria que existe um estado chamado assim.
 * Descartar é melhor que mascarar neste ponto — a entrada é inútil para preencher de qualquer forma.
 */
export function opcaoEstrutural(texto: string, maximo = 60): string | null {
  const limpo = textoEstrutural(texto, maximo);
  if (limpo === null || /\[/.test(limpo)) return null;
  return limpo;
}

/** O único seletor usado: sem `hidden` e sem `password` (o mapa é público). */
export const SELETOR_CAMPOS =
  'input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="reset"]):not([type="button"]), select, textarea';
