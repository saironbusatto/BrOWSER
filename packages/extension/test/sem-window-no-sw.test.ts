import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const fonte = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');

// Este arquivo roda num service worker de MV3. `window` não existe ali — é `self`. Ler
// `window.innerWidth` no background dá ReferenceError, cai no catch e vira um console.warn:
// o efeito some sem erro visível. Foi exatamente o que aconteceu com a teia.

describe('o background de MV3 não pode tocar em window', () => {
  // Pega só o código que roda no service worker (fora de função serializada injetada na aba).
  const codigoDoServiceWorker = fonte
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');

  it('nenhuma leitura de window.* no código do service worker', () => {
    const usos = [...codigoDoServiceWorker.matchAll(/\bwindow\.\w+/g)].map((m) => m[0]);
    expect(usos).toEqual([]);
  });

  it('a config é montada dentro da aba, que é quem tem window', () => {
    // `ligarTeia` não pode calcular a config: a medida tem de vir de medirEIniciar, que roda
    // serializado dentro da aba.
    const ligar = fonte.slice(fonte.indexOf('async function ligarTeia'));
    const corpo = ligar.slice(0, ligar.indexOf('\n}'));
    expect(corpo).not.toMatch(/configTeia\s*\(/);
    expect(corpo).toContain('medirEIniciar');
  });

  it('as funções do módulo chegam na aba como globais antes de serem chamadas', () => {
    const ligar = fonte.slice(fonte.indexOf('async function ligarTeia'));
    const corpo = ligar.slice(0, ligar.indexOf('\n}'));
    const injeta = corpo.indexOf('injetarFuncoesDaPagina');
    const chama = corpo.indexOf('medirEIniciar');
    expect(injeta).toBeGreaterThan(-1);
    expect(chama).toBeGreaterThan(-1);
    // Injetar depois de chamar é a forma de garantir ReferenceError de novo.
    expect(injeta).toBeLessThan(chama);
  });
});

describe('a página de destino é quem mede', () => {
  it('medirEIniciar usa window.innerWidth/innerHeight/devicePixelRatio', () => {
    const inicio = fonte.indexOf('function medirEIniciar');
    expect(inicio).toBeGreaterThan(-1);
    // Não usar o primeiro "\n}": dentro da função há um type inline que fecha antes.
    const fim = fonte.indexOf('\nasync function injetarFuncoesDaPagina');
    const fn = fonte.slice(inicio, fim); // sanidade
    expect(fn).toContain('innerWidth');
    expect(fn).toContain('innerHeight');
    expect(fn).toContain('devicePixelRatio');
  });
});
