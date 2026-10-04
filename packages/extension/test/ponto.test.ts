import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { descreverNoPonto, escalaFoto, LADO_MAX_FOTO } from '../utils/ponto';

describe('escalaFoto: a foto que a IA recebe nunca passa do teto', () => {
  it('tela pequena fica como está; tela grande reduz pelo lado maior', () => {
    expect(escalaFoto(1280, 720)).toBe(1);
    expect(escalaFoto(800, 600)).toBe(1);
    expect(escalaFoto(2560, 1440)).toBe(0.5);
    expect(Math.round(900 * escalaFoto(900, 1600))).toBeLessThan(LADO_MAX_FOTO); // tela em pé
    expect(escalaFoto(0, 0)).toBe(1);
  });
});

// A função roda dentro da página: o teste monta um DOM de verdade. O jsdom não faz layout, então
// `elementFromPoint` é trocado por "o elemento marcado com id=alvo".
describe('descreverNoPonto: o que há embaixo do ponto', () => {
  let dom: JSDOM;
  const GLOBAIS = ['window', 'document'];

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    for (const k of GLOBAIS) (globalThis as Record<string, unknown>)[k] = (dom.window as unknown as Record<string, unknown>)[k];
  });
  afterAll(() => {
    for (const k of GLOBAIS) delete (globalThis as Record<string, unknown>)[k];
  });

  function sobre(html: string) {
    const doc = dom.window.document;
    doc.body.innerHTML = html;
    doc.elementFromPoint = () => doc.getElementById('alvo');
    return descreverNoPonto(10, 10, []);
  }

  it('canvas solto: cadeia do elemento até a raiz, sem rótulo', () => {
    const r = sobre('<div><canvas id="alvo"></canvas></div>');
    expect(r?.cadeia.map((n) => n.tag)).toEqual(['canvas', 'div', 'body', 'html']);
    expect(r?.texto).toBe('');
    expect(r?.descer).toBeUndefined();
  });

  it('ícone dentro de botão: o botão e o papel aparecem na cadeia', () => {
    const r = sobre('<div role="Button"><button><svg id="alvo"></svg></button></div>');
    expect(r?.cadeia.slice(0, 3)).toEqual([{ tag: 'svg' }, { tag: 'button' }, { tag: 'div', papel: 'button' }]);
  });

  it('área editável é marcada; contenteditable="false" não', () => {
    expect(sobre('<div contenteditable><p id="alvo">oi</p></div>')?.cadeia[1]).toEqual({ tag: 'div', editavel: true });
    expect(sobre('<div contenteditable="false"><p id="alvo">oi</p></div>')?.cadeia[1]).toEqual({ tag: 'div' });
  });

  it('rótulo: o texto curto mais abrangente por perto; texto comprido é conteúdo', () => {
    expect(sobre('<div class="btn"><i id="alvo"></i> Enviar pedido</div>')?.texto).toBe('Enviar pedido');
    expect(sobre('<div aria-label="Pagar agora"><img id="alvo"></div>')?.texto).toBe('Pagar agora');
    expect(sobre(`<div><canvas id="alvo"></canvas><p>${'relatório de vendas '.repeat(10)}</p></div>`)?.texto).toBe('');
  });

  it('nada embaixo do ponto: cadeia vazia', () => {
    expect(sobre('<p>sem alvo</p>')).toEqual({ cadeia: [], texto: '' });
  });

  it('dentro de web component, responde o que está na sombra', () => {
    const doc = dom.window.document;
    doc.body.innerHTML = '<div id="alvo"></div>';
    const raiz = doc.getElementById('alvo')!.attachShadow({ mode: 'open' });
    raiz.innerHTML = '<button>ok</button>';
    doc.elementFromPoint = () => doc.getElementById('alvo');
    (raiz as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => raiz.querySelector('button');
    expect(descreverNoPonto(1, 1, [])?.cadeia.slice(0, 2)).toEqual([{ tag: 'button' }, { tag: 'div' }]);
  });

  it('iframe: manda descer para o frame filho, com o ponto já nas coordenadas dele', () => {
    const doc = dom.window.document;
    doc.body.innerHTML = '<iframe></iframe><iframe id="alvo"></iframe>';
    const quadro = doc.getElementById('alvo')!;
    quadro.getBoundingClientRect = () => ({ left: 100, top: 40 }) as DOMRect;
    doc.elementFromPoint = () => quadro;
    expect(descreverNoPonto(130, 90, [])?.descer).toEqual({ indice: 1, x: 30, y: 50 });
  });

  it('frame que não é o do caminho pedido fica calado', () => {
    expect(descreverNoPonto(1, 1, [0])).toBeNull();
  });
});
