// Pergunta: por que o blueprint do open.spotify.com entrou com 0 campos de texto?
//
// Hipótese: o seletor de ler_campos (utils/dom-fallback.ts) não pega a search box do Spotify.
// Este teste roda o MESMO seletor da produção contra as duas camadas que a extensão tem
// (content script e executeScript) e mede a diferença. Se as duasgebenam o mesmo, o problema
// não é o seletor — e a busca do Spotify simplesmente não é campo de texto no DOM.

import { describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';

// Copiado de packages/extension/entrypoints/content.ts:72 — a camada do content script.
const SELETOR_CONTENT = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"])',
  'select',
  'textarea',
].join(',');

// Copiado de packages/extension/utils/dom-fallback.ts:11 — a camada do ler_campos.
const SELETOR_FALLBACK = [
  'input:not([type=hidden])',
  'select',
  'textarea',
  'button',
  'a[href]',
  '[contenteditable=""]',
  '[contenteditable=true]',
  '[role=button]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=combobox]',
  '[role=switch]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=option]',
  '[role=textbox]',
].join(',');

// As duas search boxes que o Spotify web usa (historicamente input, hoje contenteditable) coexistem
// aqui: o caso real é a página com as duas camadas de React montadas ao mesmo tempo durante a troca.
const PAGINA = `
  <nav>
    <a href="/search">Buscar</a>
    <a href="/library">Sua biblioteca</a>
  </nav>
  <div role="search">
    <input type="text" placeholder="O que você quer ouvir?" data-testid="search-input">
    <div contenteditable="true" role="combobox" aria-label="Buscar"></div>
  </div>
`;

function comLayout(html: string, seletor: string): string[] {
  const { window } = new JSDOM(html);
  // jsdom não calcula layout: sem isso todo elemento seria 0x0 e o filtro de visibilidade
  // zeraria o resultado. Espelho o que dom-fallback.test.ts já faz.
  window.Element.prototype.getBoundingClientRect = function (this: Element) {
    return { width: 10, height: 10 } as DOMRect;
  };
  return Array.from(window.document.querySelectorAll(seletor)).map((el) =>
    (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('role') || el.tagName).trim(),
  );
}

describe('cobertura da search box do Spotify', () => {
  it('content script acha o input, mas não o contenteditable', () => {
    const achados = comLayout(PAGINA, SELETOR_CONTENT);
    expect(achados).toContain('O que você quer ouvir?');
    expect(achados).not.toContain('Buscar');
  });

  it('ler_campos pega as duas versões', () => {
    const achados = comLayout(PAGINA, SELETOR_FALLBACK);
    expect(achados).toContain('O que você quer ouvir?'); // input
    expect(achados).toContain('Buscar'); // contenteditable
  });

  it('as duas camadas veem a MESMA search box: a camada do blueprint não tem cobertura', () => {
    const fallback = comLayout(PAGINA, SELETOR_FALLBACK);
    const content = comLayout(PAGINA, SELETOR_CONTENT);
    const deTexto = (lista: string[]) => lista.filter((n) => /O que você quer ouvir|Buscar/.test(n));
    // O que o ler_campos enxerga como campo de texto e o content script não enxerga.
    const soNoFallback = deTexto(fallback).filter((n) => !deTexto(content).includes(n));
    expect(soNoFallback).toEqual(['Buscar']);
  });
});
