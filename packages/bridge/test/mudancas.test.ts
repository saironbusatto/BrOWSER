import { describe, expect, it } from 'bun:test';
import { agirEVer, descreverMudanca, type Leitura } from '../src/mudancas';

const leitura = (texto: string, url = 'https://a.com/x'): Leitura => ({ url, titulo: 'Página', texto, truncado: false, campos: [] });

describe('descreverMudanca: só a diferença, com o caminho até ela', () => {
  it('janela que abriu aparece inteira; o que não mudou não volta', () => {
    const antes = leitura('título: Projetos\nProjeto Atlas\nbotão "Mais opções" [ref=16]');
    const depois = leitura(
      'título: Projetos\nProjeto Atlas\nbotão "Mais opções" [ref=16]\njanela "Confirmar"\n  Arquivar o projeto?\n  botão "Arquivar projeto" [ref=40]',
    );
    expect(descreverMudanca(antes, depois)).toBe(
      'Apareceu:\njanela "Confirmar"\n  Arquivar o projeto?\n  botão "Arquivar projeto" [ref=40]',
    );
  });

  it('linha nova dentro de algo que já existia vem com o pai, para a IA saber de onde é', () => {
    const antes = leitura('tabela\n  linha: 1043 | Padaria Sol\n  linha: 1045 | Padaria Lua');
    const depois = leitura('tabela\n  linha: 1043 | Padaria Sol\n    botão "Desfazer" [ref=9]\n  linha: 1045 | Padaria Lua');
    expect(descreverMudanca(antes, depois)).toBe('Apareceu:\ntabela\n  linha: 1043 | Padaria Sol\n    botão "Desfazer" [ref=9]');
  });

  it('o que sumiu é dito, com teto; nada mudou é dito também', () => {
    const antes = leitura(Array.from({ length: 20 }, (_, i) => `linha: ${i}`).join('\n'));
    const r = descreverMudanca(antes, leitura('linha: 0'));
    expect(r.startsWith('Sumiu:\nlinha: 1\n')).toBe(true);
    expect(r).toContain('… e mais 7');
    expect(descreverMudanca(antes, antes)).toBe('Nada mais mudou na página.');
  });

  it('o campo que a própria ação preencheu não conta como mudança', () => {
    const antes = leitura('campo "CNPJ" [ref=4]\ncampo "Cidade" [ref=9]');
    const depois = leitura('campo "CNPJ" [ref=4] = "45.987"\ncampo "Cidade" [ref=9]\nalerta: CNPJ incompleto');
    expect(descreverMudanca(antes, depois, [4])).toBe('Apareceu:\nalerta: CNPJ incompleto');
  });

  it('endereço novo: devolve a página nova, cortada se for enorme', () => {
    const r = descreverMudanca(leitura('a'), leitura('x'.repeat(9000), 'https://a.com/outra'));
    expect(r.startsWith('A página agora é: Página\nhttps://a.com/outra')).toBe(true);
    expect(r).toContain('cortado');
    expect(r.length).toBeLessThan(6200);
  });
});

describe('agirEVer: lê, age, espera assentar, lê de novo', () => {
  const semPausa = async () => {};

  it('para na segunda leitura igual e devolve a leitura nova', async () => {
    const telas = ['antes', 'meio', 'depois', 'depois', 'nunca lida'];
    let lidas = 0;
    const comandos: string[] = [];
    const enviar = (async (cmd: string) => {
      comandos.push(cmd);
      return cmd === 'ler_estrutura' ? leitura(telas[lidas++]!) : { ok: true };
    }) as never;
    const r = await agirEVer(enviar, () => (enviar as any)('clicar', { ref: 1 }), [], semPausa);
    expect(comandos).toEqual(['ler_estrutura', 'clicar', 'ler_estrutura', 'ler_estrutura', 'ler_estrutura']);
    expect(r.resultado).toEqual({ ok: true });
    expect(r.depois?.texto).toBe('depois');
    expect(r.mudou).toBe('Apareceu:\ndepois\n\nSumiu:\nantes');
  });

  it('sem leitura antes (extensão antiga, aba carregando) a ação acontece do mesmo jeito', async () => {
    let agiu = 0;
    const enviar = (async () => {
      throw new Error('aba carregando');
    }) as never;
    const r = await agirEVer(enviar, async () => ++agiu, [], semPausa);
    expect(r).toEqual({ resultado: 1, mudou: '' });
  });

  it('página que não volta a responder depois da ação: avisa em vez de inventar', async () => {
    let lidas = 0;
    const enviar = (async () => {
      if (lidas++ === 0) return leitura('antes');
      throw new Error('navegando');
    }) as never;
    const r = await agirEVer(enviar, async () => 'ok', [], semPausa);
    expect(r.mudou).toContain('carregando');
    expect(r.depois).toBeUndefined();
  });
});
