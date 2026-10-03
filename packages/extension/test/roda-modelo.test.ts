import { describe, expect, it } from 'bun:test';
import { ALTURA_ITEM, indiceNoCentro, itensDaRoda, PASSO_RODINHA, passoDaRodinha } from '../entrypoints/sidepanel/roda-modelo';

const modelos = [
  { id: 'haiku', nome: 'Haiku' },
  { id: 'opus', nome: 'Opus', forte: true },
];

describe('Roda de modelos', () => {
  it('"Padrão" vem primeiro e representa o modelo vazio (default do CLI)', () => {
    const itens = itensDaRoda(modelos, '');
    expect(itens.map((m) => m.id)).toEqual(['', 'haiku', 'opus']);
  });

  it('modelo escolhido que saiu da lista continua na roda, senão ele some da tela', () => {
    expect(itensDaRoda(modelos, 'sonnet-antigo').at(-1)).toEqual({ id: 'sonnet-antigo', nome: 'sonnet-antigo' });
    expect(itensDaRoda(modelos, 'opus')).toHaveLength(3);
  });

  it('o índice do centro arredonda pelo meio do item e não sai dos limites', () => {
    expect(indiceNoCentro(0, 3)).toBe(0);
    expect(indiceNoCentro(ALTURA_ITEM * 0.6, 3)).toBe(1);
    expect(indiceNoCentro(ALTURA_ITEM * 9, 3)).toBe(2);
    expect(indiceNoCentro(-40, 3)).toBe(0);
  });

  it('um clique de rodinha anda um item só, mesmo mandando 100px', () => {
    expect(passoDaRodinha(0, 100, 0)).toEqual({ passo: 1, resto: 0 });
    expect(passoDaRodinha(0, -240, 0)).toEqual({ passo: -1, resto: 0 });
    expect(passoDaRodinha(0, 3, 1)).toEqual({ passo: 1, resto: 0 }); // modo linhas (Firefox/Windows)
  });

  it('touchpad acumula pedacinhos até dar um item, sem trocar no primeiro toque', () => {
    let r = passoDaRodinha(0, 15, 0);
    expect(r.passo).toBe(0);
    r = passoDaRodinha(r.resto, 15, 0);
    expect(r.passo).toBe(0);
    r = passoDaRodinha(r.resto, PASSO_RODINHA - 30, 0);
    expect(r).toEqual({ passo: 1, resto: 0 });
  });
});
