import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { HOST_NAME } from '@browser/shared';
import { comandoExecutavel, pathComIAs } from '../src/caminhos';
import { registrarHost, removerHost } from '../src/instalar';

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

describe('removerHost: a desinstalação não pode levar o perfil do navegador junto', () => {
  // Home de mentira, passado por parâmetro. Usar o Home real aqui apagaria o registro que a
  // pessoa tem nos próprios navegadores, no meio de um `bun test`.
  const FAKE = join(import.meta.dir, 'instalar-falso');
  const chrome = () => join(FAKE, '.config', 'google-chrome');
  const manifestos = () => join(chrome(), 'NativeMessagingHosts');
  const manifesto = () => join(manifestos(), `${HOST_NAME}.json`);
  const ponte = () => {
    const p = join(FAKE, 'bin', 'bridge');
    mkdirSync(join(FAKE, 'bin'), { recursive: true });
    writeFileSync(p, '');
    return p;
  };

  beforeEach(() => {
    rmSync(FAKE, { recursive: true, force: true });
    mkdirSync(FAKE, { recursive: true });
  });

  afterEach(() => {
    rmSync(FAKE, { recursive: true, force: true });
  });

  it('registra e depois some com o manifesto', () => {
    registrarHost(ponte(), FAKE);
    expect(existsSync(manifesto())).toBe(true);
    removerHost(FAKE);
    expect(existsSync(manifesto())).toBe(false);
  });

  it('limpa a pasta NativeMessagingHosts que ficou vazia', () => {
    registrarHost(ponte(), FAKE);
    removerHost(FAKE);
    expect(existsSync(manifestos())).toBe(false);
  });

  // A pasta de config do navegador guarda o perfil inteiro: histórico, cookies, senhas. Se a
  // limpeza fosse um `rm -rf` dela, desinstalar o BrOWSER apagaria a vida da pessoa no Chrome.
  it('preserva a pasta do navegador e o que está dentro dela', () => {
    mkdirSync(chrome(), { recursive: true });
    writeFileSync(join(chrome(), 'Local State'), '{}');
    registrarHost(ponte(), FAKE);
    removerHost(FAKE);
    expect(existsSync(join(chrome(), 'Local State'))).toBe(true);
  });

  it('não apaga outro host registrado no mesmo lugar', () => {
    mkdirSync(manifestos(), { recursive: true });
    writeFileSync(join(manifestos(), 'outro.json'), '{}');
    registrarHost(ponte(), FAKE);
    removerHost(FAKE);
    expect(existsSync(join(manifestos(), 'outro.json'))).toBe(true);
  });

  it('não quebra quando o navegador nunca foi registrado', () => {
    expect(() => removerHost(FAKE)).not.toThrow();
    expect(removerHost(FAKE)).toEqual([]);
  });
});
