import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { lerCamposDom, preencherDom } from '../utils/dom-fallback';

// O plano B roda dentro da página real, então o teste monta um DOM de verdade: o que importa não é
// a função isolada, é o que a IA enxergaria naquele campo.
let window: Window & typeof globalThis;

// Globais que o código do plano B usa: a janela do jsdom precisa estar visível aqui, senão
// `location`, `getComputedStyle` e os construtores não existem no escopo do módulo.
const GLOBAIS = [
  'window',
  'document',
  'location',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'getComputedStyle',
  'Event',
  'InputEvent',
  'Node',
  'CSS',
  'Element',
];

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  window = dom.window as unknown as Window & typeof globalThis;
  // O código do plano B referencia os globais da janela; sem isto o jsdom não é visto.
  for (const k of GLOBAIS) {
    (globalThis as Record<string, unknown>)[k] = (window as unknown as Record<string, unknown>)[k];
  }
});

afterAll(() => {
  for (const k of GLOBAIS) delete (globalThis as Record<string, unknown>)[k];
});

function montar(html: string) {
  window.document.body.innerHTML = html;
  // jsdom não faz layout: getBoundingClientRect devolve 0x0 e o filtro de visibilidade do código
  // descartaria todo campo. O stub dá tamanho a tudo, que é o caso "campo visível" que importa.
  for (const el of window.document.querySelectorAll('*')) {
    el.getBoundingClientRect = () =>
      ({ width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  }
}

describe('Segredo nunca sai da página (plano B por DOM)', () => {
  beforeEach(() => montar(''));

  it('campo de senha aparece, mas sem valor e marcado como sensível', () => {
    montar('<label>Senha <input type="password" value="hunter2-secreta"></label>');
    const leitura = lerCamposDom();
    const senha = leitura.campos.find((c) => c.papel === 'password');

    expect(senha).toBeDefined();
    expect(senha?.sensivel).toBe(true);
    expect(senha?.valor).toBeUndefined();
    expect(JSON.stringify(leitura)).not.toContain('hunter2-secreta');
  });

  it('texto normal continua com o valor, senão a IA perde o formulário preenchido', () => {
    montar('<label>E-mail <input type="email" value="joana@exemplo.com"></label>');
    const leitura = lerCamposDom();
    const email = leitura.campos.find((c) => c.papel === 'textbox');

    expect(email?.sensivel).toBeUndefined();
    expect(email?.valor).toBe('joana@exemplo.com');
  });

  it('campo de senha continua preenchível e a resposta não devolve o segredo', () => {
    montar('<label>Senha <input type="password" id="p"></label>');
    const ref = lerCamposDom().campos.find((c) => c.papel === 'password')!.ref;

    const r = preencherDom(ref, 'outra-seenha-123');

    expect((document.getElementById('p') as HTMLInputElement).value).toBe('outra-seenha-123');
    expect(r.valor).toBe('[senha preenchida]');
    expect(r.valor).not.toContain('outra-seenha-123');
  });

  it('outros campos continuam devolvendo o valor gravado', () => {
    montar('<label>Nome <input id="n"></label>');
    const ref = lerCamposDom().campos[0]!.ref;
    expect(preencherDom(ref, 'Joana').valor).toBe('Joana');
  });
});

describe('Select continua funcionando depois do ajuste do tipo', () => {
  beforeEach(() => montar(''));

  it('lê opções e aceita texto ou value', () => {
    montar(`
      <label>UF<select id="s">
        <option value="sp">São Paulo</option>
        <option value="rj">Rio de Janeiro</option>
      </select></label>`);
    const ref = lerCamposDom().campos.find((c) => c.papel === 'combobox')!.ref;
    expect(lerCamposDom().campos.find((c) => c.papel === 'combobox')?.opcoes).toEqual(['São Paulo', 'Rio de Janeiro']);

    expect(preencherDom(ref, 'rj').valor).toBe('rj');
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('rj');
  });

  it('opção inexistente falha com mensagem clara', () => {
    montar('<label>UF<select id="s"><option value="sp">São Paulo</option></select></label>');
    const ref = lerCamposDom().campos[0]!.ref;
    expect(() => preencherDom(ref, 'Maranhão')).toThrow('opção não encontrada');
  });
});
