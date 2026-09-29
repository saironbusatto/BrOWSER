// Texto da página inteira, por código.
//
// A IA precisava do que está escrito na página e só tinha os campos. Por isso respondia "não
// consigo resumir" a um pedido legítimo: não era recusando, estava cega.
//
// Duas decisões que moldaram este arquivo:
//
// 1. É o DOM, não a tela. O texto vem por `Runtime.evaluate` (CDP) ou por `executeScript` (plano
//    B), sem renderizar e sem rolar. A página inteira vem de uma vez, inclusive o que está abaixo
//    da dobra — o que era o motivo de a rolagem nem entrar na conversa.
//
// 2. Campo de senha nunca tem valor lido. O `input[type=password]` aparece como `[senha: rótulo]`,
//    sem o conteúdo. Um agente que lê senhas de página arbitrária deixa de ser ferramenta e vira
//    coletor de credencial, e a política de privacidade do projeto promete o contrário.
//
// A função é autocontida de propósito: ela é serializada e roda dentro da página, então não pode
// referenciar nada de fora deste arquivo. Por isso as tabelas vivem aqui dentro, e não em
// `content-regra.ts`.

export const LIMITE_PADRAO = 40_000;

export type TextoDaPagina = { titulo: string; texto: string; truncado: boolean; caracteres: number };

/**
 * Extrai o texto visível da página. Roda dentro da página.
 *
 * @param limite Quantos caracteres devolver. O corte é por página inteira e nunca no meio de uma
 *   palavra, porque um texto cortado no meio faz a IA citar besteira.
 * @param raiz Raiz da varredura. Só o teste passa isto; dentro da página é o `body`. Existe para
 *   que a lógica de verdade seja testada sem DOM: sem esse parâmetro, o único jeito de testar o
 *   texto seria reescrever a função no teste, que é como teste deixa de valer para alguma coisa.
 * @param titulo Título da página, quando o teste passa a raiz.
 */
export function extrairTextoDaPagina(limite = LIMITE_PADRAO, raiz?: Node, titulo = ''): TextoDaPagina {
  // Tags cujo conteúdo é código, estilo, metadado ou mídia: nada disso é texto para a pessoa.
  const semTexto = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
    'SVG',
    'CANVAS',
    'IFRAME',
    'OBJECT',
    'HEAD',
    'MAP',
    'AUDIO',
    'VIDEO',
    'SELECT',
    'OPTION',
  ]);

  const partes: string[] = [];
  let tamanho = 0;
  let truncado = false;

  /** Campo de formulário vira uma linha com rótulo e estado. Senha nunca vira valor. */
  const campo = (el: Element): string => {
    const tipo = (el.getAttribute('type') ?? '').toLowerCase();
    const input = el as HTMLInputElement;
    const rotulo =
      el.getAttribute('aria-label') || el.getAttribute('name') || el.getAttribute('placeholder') || el.id || el.tagName.toLowerCase();

    if (tipo === 'password') return `[senha: ${rotulo}]`;
    if (tipo === 'checkbox' || tipo === 'radio') return `[${rotulo}: ${input.checked ? 'marcado' : 'desmarcado'}]`;
    if (tipo === 'submit' || tipo === 'button' || tipo === 'reset') return `[botão: ${rotulo}]`;
    if (tipo === 'file') return `[arquivo: ${rotulo}]`;
    if (tipo === 'hidden') return '';
    const valor = (input.value ?? '').trim();
    return valor ? `[${rotulo}: ${valor}]` : `[${rotulo}]`;
  };

  const andar = (n: Node): void => {
    if (truncado) return;

    if (n.nodeType === 3 /* texto */) {
      const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      partes.push(t);
      tamanho += t.length + 1;
      if (tamanho > limite) truncado = true;
      return;
    }

    if (n.nodeType !== 1 /* elemento */) return;
    const el = n as Element;
    const tag = el.tagName.toUpperCase();
    if (semTexto.has(tag)) return;

    // aria-hidden e hidden são o sinal autoral de "isto não é para o usuário". Respeitar é o que
    // evita devolver menu oculto e bloco de acessibilidade que polui o texto.
    if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return;
    const estilo = (el as HTMLElement).style;
    if (estilo && (estilo.display === 'none' || estilo.visibility === 'hidden')) return;

    // Bloco de nível: dar quebra entre blocos, senão tudo vira uma linha só e a IA perde a
    // estrutura de título, parágrafo e item.
    const bloco =
      /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|NAV|ASIDE|H[1-6]|LI|UL|OL|DL|DT|DD|TABLE|TR|BLOCKQUOTE|PRE|FIGURE|ADDRESS|FORM|FIELDSET|BODY)$/.test(
        tag,
      );
    if (bloco) partes.push('\n');

    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const linha = campo(el);
      if (linha) partes.push(` ${linha} `);
    } else if (tag === 'BUTTON' || (tag === 'A' && (el as HTMLAnchorElement).href)) {
      const rotulo = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (rotulo) partes.push(` ${rotulo} `);
    }

    el.childNodes.forEach(andar);

    if (bloco) partes.push('\n');
    tamanho = partes.join(' ').length;
    if (tamanho > limite) truncado = true;
  };

  (raiz ?? document.body ?? document.documentElement).childNodes.forEach(andar);

  // Normaliza: colapsa espaço, tira linhas em branco demais, corta no limite em fronteira de
  // palavra e avisa que cortou.
  let texto = partes
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (texto.length > limite) {
    const cortado = texto.slice(0, limite);
    const ultimo = cortado.lastIndexOf(' ');
    texto = `${(ultimo > limite * 0.8 ? cortado.slice(0, ultimo) : cortado).trim()}\n\n[texto cortado em ${limite} caracteres — peça para continuar se precisar do resto]`;
  }

  return {
    titulo: raiz === undefined ? (document.title ?? '') : titulo,
    texto,
    truncado: texto.length >= limite,
    caracteres: texto.length,
  };
}
