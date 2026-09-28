import { describe, expect, it } from 'bun:test';
import { delimiter } from 'node:path';
import { comandoExecutavel, pathComIAs } from '../src/caminhos';

// Estes testes rodam no CI em Linux e em Windows, então nada aqui pode assumir `:` como separador
// nem caminho que comece com `/`: no Windows o delimitador é `;` e o caminho absoluto é `C:\...`.
// A primeira versão deste arquivo falhava no job do Windows exatamente por isso.

// Um par de pastas que existe nas duas plataformas, para o teste não depender do PATH da máquina.
const PASTA_A = process.platform === 'win32' ? 'C:\\a' : '/usr/bin';
const PASTA_B = process.platform === 'win32' ? 'C:\\b' : '/bin';

describe('pathComIAs: as CLIs instaladas depois do navegador', () => {
  it('mantém o PATH atual e acrescenta o que existe', () => {
    const comIa = pathComIAs([PASTA_A, PASTA_B].join(delimiter));
    expect(comIa.startsWith([PASTA_A, PASTA_B].join(delimiter))).toBe(true);
    expect(comIa.split(delimiter).length).toBeGreaterThanOrEqual(2);
  });

  it('não duplica uma pasta que já está no PATH', () => {
    const comIa = pathComIAs(PASTA_A);
    const ocorrencias = comIa.split(delimiter).filter((p) => p === PASTA_A).length;
    expect(ocorrencias).toBe(1);
  });

  it('PATH vazio não quebra (devolve só as pastas válidas)', () => {
    const r = pathComIAs('');
    expect(r).not.toContain('undefined');
    expect(r).not.toContain(';;');
  });

  it('as pastas das IAs vêm depois do PATH do usuário, nunca na frente', () => {
    // Sobrescrever a escolha do PATH do usuário seria pior do que não achar a CLI: a ponte
    // poderia rodar um binário homônimo de outro lugar.
    const comIa = pathComIAs(PASTA_A);
    const partes = comIa.split(delimiter);
    expect(partes[0]).toBe(PASTA_A);
  });
});

describe('comandoExecutavel: shims .cmd do Windows', () => {
  it('comando inexistente volta como está (o erro é do spawn, com mensagem clara)', () => {
    expect(comandoExecutavel(['nao-existe-xyz', '--sinal'])).toEqual(['nao-existe-xyz', '--sinal']);
  });

  it('binário nativo é usado direto, sem cmd.exe por cima', () => {
    const r = comandoExecutavel(['node', '-e', '0']);
    // `node` existe nas duas plataformas; um shim .cmd seria embrulhado, o que também é válido.
    expect(r[0]).not.toBe('cmd.exe');
    expect(r.slice(1)).toEqual(['-e', '0']);
  });

  it('nunca deixa o cmd.exe reinterpretar os argumentos (a trava do comentário continua válida)', () => {
    const r = comandoExecutavel(['nao-existe-xyz', 'a&b', 'c|d', 'e>f']);
    expect(r.slice(1)).toEqual(['a&b', 'c|d', 'e>f']);
  });
});

describe('pastasDasIAs: onde as ferramentas são procuradas', () => {
  it('inclui as pastas de instalação usuais de cada sistema', async () => {
    const { pastasDasIAs } = await import('../src/caminhos');
    const pastas = pastasDasIAs();
    expect(pastas.some((p) => p.includes('.bun'))).toBe(true);
    expect(pastas.length).toBeGreaterThan(2);
  });

  it('no Windows inclui a pasta do agy, que fica fora do PATH padrão', async () => {
    const { pastasDasIAs } = await import('../src/caminhos');
    if (process.platform !== 'win32') return;
    expect(pastasDasIAs().some((p) => p.toLowerCase().includes('agy'))).toBe(true);
  });
});
