import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'bun:test';

type Modulo = typeof import('../utils/dom-fallback');
let m: Modulo;

beforeEach(async () => {
  const { window } = new JSDOM(`<form>
    <label>Nome completo <input name="nome" required></label>
    <label>Estado <select name="uf"><option value="">Selecione</option><option value="MG">Minas Gerais</option></select></label>
    <label><input type="checkbox" name="aceite"> Aceito os termos</label>
    <textarea aria-label="Observações"></textarea>
    <input type="hidden" name="csrf" value="x">
    <input name="escondido" style="display:none">
    <button type="submit">Enviar</button>
  </form>`);
  // jsdom não calcula layout: todo elemento teria 0x0. Visível = não tem display:none.
  window.Element.prototype.getBoundingClientRect = function (this: Element) {
    const oculto = (this as HTMLElement).style?.display === 'none';
    return { width: oculto ? 0 : 10, height: oculto ? 0 : 10 } as DOMRect;
  };
  Object.assign(globalThis, {
    window, document: window.document, getComputedStyle: window.getComputedStyle.bind(window), location: window.location,
    HTMLSelectElement: window.HTMLSelectElement, HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement, Event: window.Event, InputEvent: window.InputEvent,
  });
  m = await import('../utils/dom-fallback');
});

describe('plano B: DOM sem chrome.debugger', () => {
  it('lista campos visíveis com rótulo e ignora hidden/invisíveis', () => {
    const { campos } = m.lerCamposDom();
    const resumo = campos.map((c) => `${c.papel}:${c.nome}`);
    expect(resumo).toEqual(['textbox:Nome completo', 'combobox:Estado', 'checkbox:Aceito os termos', 'textbox:Observações', 'button:Enviar']);
    expect(campos[0]!.obrigatorio).toBe(true);
    expect(campos[1]!.opcoes).toEqual(['Selecione', 'Minas Gerais']);
  });

  it('preenche texto, select por texto, checkbox e textarea disparando eventos', () => {
    const { campos } = m.lerCamposDom();
    const ref = (nome: string) => campos.find((c) => c.nome === nome)!.ref;
    let eventos = 0;
    document.querySelector('[name=nome]')!.addEventListener('input', () => eventos++);

    expect(m.preencherDom(ref('Nome completo'), 'Maria').valor).toBe('Maria');
    expect(eventos).toBe(1);
    expect(m.preencherDom(ref('Estado'), 'minas gerais').valor).toBe('MG');
    expect(m.preencherDom(ref('Aceito os termos'), 'true').valor).toBe('true');
    expect(m.preencherDom(ref('Aceito os termos'), 'true').valor).toBe('true'); // idempotente
    expect(m.preencherDom(ref('Observações'), 'ok').valor).toBe('ok');
  });

  it('erra de forma clara com ref antiga ou opção inexistente', () => {
    const { campos } = m.lerCamposDom();
    expect(() => m.preencherDom(999, 'x')).toThrow('chame ler_campos de novo');
    expect(() => m.preencherDom(campos[1]!.ref, 'Bahia')).toThrow('opção não encontrada');
  });
});
