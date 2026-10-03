// Roda vertical de modelos (o "picker" de rodinha do iOS) com lente de vidro.
//
// Substitui o input+datalist, que quebrava: o dropdown nativo abria fora do card, cortado pelo
// sheet, e o texto livre deixava qualquer coisa ir para o CLI. A rolagem é a nativa do navegador
// (scroll-snap); a curvatura é CSS puro (animation-timeline: view()). O JS só decide qual item
// ficou no centro e reflete isso no ARIA.

import type { ModeloInfo } from '@browser/shared';
import { escapeHtml } from './escape';

export const ALTURA_ITEM = 30; // px; precisa bater com --roda-item no CSS
const PADRAO: ModeloInfo = { id: '', nome: 'Padrão (rápido)' };

/** Itens da roda: "Padrão" primeiro, depois a lista; o escolhido entra mesmo se saiu da lista. */
export function itensDaRoda(modelos: readonly ModeloInfo[], atual: string): ModeloInfo[] {
  const itens = [PADRAO, ...modelos.filter((m) => m.id)];
  return atual && !itens.some((m) => m.id === atual) ? [...itens, { id: atual, nome: atual }] : itens;
}

// Quanto de rodinha vale um item. Um "clique" de mouse manda ~100px (deltaMode 0) ou 3 linhas
// (deltaMode 1); o touchpad manda pedacinhos de poucos px. 40px: um clique de mouse = um item, e
// no touchpad o dedo precisa andar um pouco antes de trocar, o que evita trocar sem querer.
export const PASSO_RODINHA = 40;

/**
 * Converte rodinha em passos de UM item. Sem isso a rolagem nativa andava ~100px por clique
 * contra itens de 30px, e o scroll-snap jogava a roda direto para o fim da lista.
 */
export function passoDaRodinha(acumulado: number, deltaY: number, deltaMode: number): { passo: -1 | 0 | 1; resto: number } {
  const total = acumulado + (deltaMode === 0 ? deltaY : Math.sign(deltaY) * PASSO_RODINHA);
  if (Math.abs(total) < PASSO_RODINHA) return { passo: 0, resto: total };
  return { passo: total > 0 ? 1 : -1, resto: 0 };
}

/** Índice do item no centro para uma posição de rolagem, preso aos limites. */
export function indiceNoCentro(scrollTop: number, total: number): number {
  return Math.max(0, Math.min(total - 1, Math.round(scrollTop / ALTURA_ITEM)));
}

export function rodaModelo(opcoes: {
  rotulo: string;
  modelos: readonly ModeloInfo[];
  atual: string;
  aoEscolher: (id: string) => void;
}): HTMLElement {
  const itens = itensDaRoda(opcoes.modelos, opcoes.atual);
  let escolhido = Math.max(
    0,
    itens.findIndex((m) => m.id === opcoes.atual),
  );
  const base = `roda-${crypto.randomUUID().slice(0, 8)}`;

  const roda = document.createElement('div');
  roda.className = 'roda';
  roda.innerHTML = `
    <span class="roda-rotulo" id="${base}-rotulo">Modelo</span>
    <div class="roda-poco">
      <div class="roda-lente" aria-hidden="true"></div>
      <ul class="roda-lista" role="listbox" tabindex="0" aria-labelledby="${base}-rotulo"
          aria-description="${escapeHtml(opcoes.rotulo)}">
        ${itens
          .map(
            (m, i) => `<li class="roda-item" role="option" id="${base}-${i}" data-i="${i}"
              title="${escapeHtml(m.nome)}">${escapeHtml(m.nome)}${m.forte ? '<span class="roda-selo">forte</span>' : ''}</li>`,
          )
          .join('')}
      </ul>
    </div>
  `;

  const lista = roda.querySelector<HTMLUListElement>('.roda-lista')!;
  const marcar = (i: number) => {
    for (const [j, li] of lista.querySelectorAll('.roda-item').entries()) li.setAttribute('aria-selected', String(i === j));
    lista.setAttribute('aria-activedescendant', `${base}-${i}`);
  };
  // Para onde a roda está indo. Rodinha e teclado contam a partir daqui, e não do scrollTop: no
  // meio de uma animação suave o scrollTop ainda está no item velho, e dois cliques rápidos
  // virariam um só.
  let alvo = escolhido;
  const irPara = (i: number, suave = true) => {
    alvo = Math.max(0, Math.min(itens.length - 1, i));
    lista.scrollTo({ top: alvo * ALTURA_ITEM, behavior: suave && !reduzirMovimento() ? 'smooth' : 'instant' });
  };

  marcar(escolhido);
  // A lista só tem altura depois de entrar no DOM; antes disso o scrollTo é ignorado.
  requestAnimationFrame(() => irPara(escolhido, false));

  // Só decide quando a rolagem assenta: escolher no meio do giro mandaria um modelo por frame.
  lista.addEventListener('scrollend', () => {
    const i = indiceNoCentro(lista.scrollTop, itens.length);
    alvo = i;
    marcar(i);
    if (i === escolhido) return;
    escolhido = i;
    opcoes.aoEscolher(itens[i]!.id);
  });

  lista.addEventListener('click', (ev) => {
    const li = (ev.target as HTMLElement).closest<HTMLElement>('.roda-item');
    if (li) irPara(Number(li.dataset.i));
  });

  let acumulado = 0;
  lista.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault(); // a rolagem nativa é que pulava vários itens de uma vez
      const { passo, resto } = passoDaRodinha(acumulado, ev.deltaY, ev.deltaMode);
      acumulado = resto;
      if (passo) irPara(alvo + passo);
    },
    { passive: false },
  );

  lista.addEventListener('keydown', (ev) => {
    const destinos: Record<string, number> = { ArrowDown: alvo + 1, ArrowUp: alvo - 1, Home: 0, End: itens.length - 1 };
    const destino = destinos[ev.key];
    if (destino === undefined) return;
    ev.preventDefault();
    irPara(destino);
  });

  return roda;
}

function reduzirMovimento(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
