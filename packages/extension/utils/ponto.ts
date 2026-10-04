// Clique por ponto: a IA aponta um lugar na foto do `ver_tela`. Aqui ficam as duas peças que não
// dependem do navegador para serem testadas: a escala da foto e a função que, DENTRO da página,
// diz o que há embaixo do ponto. Quem decide se pode clicar é a ponte (envio.ts › recusaPonto).

import type { Ponto } from '@browser/shared';

// Foto maior que isso o modelo reduz por conta própria, e a coordenada que ele devolve deixa de
// bater com a tela. Reduzindo aqui, o espaço de pixels é um só: o da foto que ele recebeu.
export const LADO_MAX_FOTO = 1280;

/** Fator entre a tela (px de CSS) e a foto entregue à IA. Nunca amplia. */
export function escalaFoto(largura: number, altura: number): number {
  return Math.min(1, LADO_MAX_FOTO / Math.max(largura, altura, 1));
}

/** `descer`: o ponto caiu num iframe; a resposta está no frame filho de índice `indice`. */
export type PontoNoFrame = Ponto & { descer?: { indice: number; x: number; y: number } };

/**
 * Roda dentro de cada frame da aba (por isso não usa nada de fora dela). Só responde o frame cujo
 * caminho a partir do topo (índices em `window.frames`) é `caminho`; os outros devolvem null.
 * O caminho serve para iframe de outra origem: pai e filho não se enxergam, mas índice e
 * identidade de janela o navegador deixa comparar.
 */
export function descreverNoPonto(x: number, y: number, caminho: number[]): PontoNoFrame | null {
  const meu: number[] = [];
  for (let w: Window = window; w !== w.parent; w = w.parent) {
    let i = 0;
    while (i < w.parent.length && w.parent[i] !== w) i++;
    meu.unshift(i);
  }
  if (meu.join() !== caminho.join()) return null;

  let el = document.elementFromPoint(x, y);
  // Web component: o que está embaixo do ponto é o que há dentro da sombra, não o hospedeiro.
  for (let dentro: Element | null = el; dentro; ) {
    let raiz: ShadowRoot | null = dentro.shadowRoot;
    try {
      raiz = (globalThis as any).chrome?.dom?.openOrClosedShadowRoot?.(dentro) ?? raiz;
    } catch {}
    dentro = raiz?.elementFromPoint(x, y) ?? null;
    if (dentro === el) break;
    if (dentro) el = dentro;
  }
  if (!el) return { cadeia: [], texto: '' };

  if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
    const janela = (el as HTMLIFrameElement).contentWindow;
    let indice = 0;
    while (indice < window.length && window[indice] !== janela) indice++;
    const r = el.getBoundingClientRect();
    // ponytail: desconta só a borda. Iframe com padding ou transform de CSS erra o ponto por
    // alguns px; se aparecer um caso real, trocar por sessão do CDP por frame.
    return { cadeia: [], texto: '', descer: { indice, x: x - r.left - el.clientLeft, y: y - r.top - el.clientTop } };
  }

  const cadeia: Ponto['cadeia'] = [];
  let texto = '';
  for (let n: Element | null = el, nivel = 0; n; nivel++) {
    const papel = n.getAttribute('role');
    const editavel = n.getAttribute('contenteditable');
    cadeia.push({
      tag: n.tagName.toLowerCase(),
      ...(papel && { papel: papel.toLowerCase() }),
      ...(editavel !== null && editavel !== 'false' && { editavel: true }),
    });
    // Rótulo do que está sendo clicado: o texto curto mais abrangente nos 4 níveis de baixo (um
    // ícone dentro de um <div> "Enviar" responde "Enviar"). Texto comprido é conteúdo, não rótulo.
    if (nivel < 4) {
      const t = (n.getAttribute('aria-label') || n.getAttribute('title') || (n as HTMLElement).innerText || n.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (t && t.length <= 60) texto = t;
    }
    n = n.parentElement ?? (n.getRootNode() as ShadowRoot).host ?? null;
  }
  return { cadeia, texto };
}
