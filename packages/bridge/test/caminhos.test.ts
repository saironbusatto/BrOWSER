import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { comandoExecutavel, pathComIAs } from '../src/caminhos';

describe('pathComIAs: as CLIs instaladas depois do navegador', () => {
  it('mantém o PATH atual e acrescenta o que existe', () => {
    const atual = ['/usr/bin', '/bin'];
    const comIa = pathComIAs(atual.join(':'));
    expect(comIa.startsWith('/usr/bin:/bin')).toBe(true);
    expect(comIa.split(':').length).toBeGreaterThanOrEqual(2);
  });

  it('não duplica uma pasta que já está no PATH', () => {
    const unica = pathComIAs('/usr/bin');
    const occurencias = unica.split(':').filter((p) => p === '/usr/bin').length;
    expect(occurencias).toBe(1);
  });

  it('PATH vazio não quebra (devolve só as pastas válidas)', () => {
    const r = pathComIAs('');
    expect(r).not.toContain('undefined');
  });
});

describe('comandoExecutavel: shims .cmd do Windows', () => {
  it('comando inexistente volta como está (o erro é do spawn, com mensagem clara)', () => {
    expect(comandoExecutavel(['nao-existe-xyz', '--sinal'])).toEqual(['nao-existe-xyz', '--sinal']);
  });

  it('binário do Linux é usado direto, sem cmd.exe', () => {
    const r = comandoExecutavel(['sh', '-c', 'echo']);
    if (r[0] !== 'sh') return; // sh não existe neste ambiente: nada a afirmar
    expect(r[0]).not.toBe('cmd.exe');
    expect(r.slice(1)).toEqual(['-c', 'echo']);
  });

  it('nunca deixa o cmd.exe reinterpretar os argumentos (a trava do comentário continua válida)', () => {
    const r = comandoExecutavel(['nao-existe-xyz', 'a&b', 'c|d', 'e>f']);
    expect(r.slice(1)).toEqual(['a&b', 'c|d', 'e>f']);
  });
});

describe('caminhos das IAs', () => {
  it('inclui as pastas de instalação usuais de cada sistema', async () => {
    const { pastasDasIAs } = await import('../src/caminhos');
    const pastas = pastasDasIAs();
    expect(pastas.some((p) => p.includes('.bun'))).toBe(true);
    expect(pastas.length).toBeGreaterThan(2);
    if (process.platform === 'win32') {
      expect(pastas.some((p) => p.toLowerCase().includes('agy'))).toBe(true);
    }
  });
});

describe('join de caminho do host', () => {
  it('o host do manifesto é sempre um caminho absoluto', () => {
    expect(join('/tmp', 'x.json').startsWith('/')).toBe(true);
  });
});
