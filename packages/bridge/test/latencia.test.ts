import { describe, expect, it } from 'bun:test';
import { Relogio, formatar as textoLatencia } from '../src/latencia';

const cmd = (n: number, ms: number) => ({ n, ms });

describe('textoLatencia: a conta que decide o próximo passo', () => {
  it('separa tempo de browser de tempo de modelo', () => {
    const linha = textoLatencia(180_000, 12_000, new Map([['preencher', cmd(43, 10_000)]]));
    expect(linha).toContain('latência 180.0s');
    expect(linha).toContain('168.0s fora do browser');
    expect(linha).toContain('12.0s em browser');
    expect(linha).toContain('preencher 43x/10.0s');
  });

  it('ordena por quantidade de chamadas: o que mais roda é o gargalo', () => {
    const linha = textoLatencia(
      10_000,
      5_000,
      new Map([
        ['clicar', cmd(2, 4_000)],
        ['preencher', cmd(20, 900)],
        ['ler_campos', cmd(2, 100)],
      ]),
    );
    const ordem = linha.match(/preencher|clicar|ler_campos/g)!;
    expect(ordem).toEqual(['preencher', 'clicar', 'ler_campos']);
  });

  it('relógio que andou para trás não vira tempo negativo na linha de decisão', () => {
    const linha = textoLatencia(100, 5_000, new Map([['preencher', cmd(1, 5_000)]]));
    expect(linha).toContain('0.0s fora do browser');
    expect(linha).not.toContain('-');
  });

  it('pedido que não tocou no browser diz isso em vez de mostrar lista vazia', () => {
    expect(textoLatencia(2_000, 0, new Map())).toContain('nenhuma');
  });
});

describe('Relogio: o contador que main.ts chama a cada enviar()', () => {
  it('acumula quantas vezes e quanto cada comando rodou', () => {
    const r = new Relogio();
    r.registrar('preencher', 3_000);
    r.registrar('preencher', 2_000);
    r.registrar('clicar', 1_000);
    const linha = r.resumo(30_000);
    expect(linha).toContain('preencher 2x/5.0s');
    expect(linha).toContain('clicar 1x/1.0s');
    expect(linha).toContain('6.0s em browser');
    expect(linha).toContain('3 chamadas');
  });

  it('o mesmo comando não se perde: a segunda chamada soma na primeira', () => {
    const r = new Relogio();
    r.registrar('ler_campos', 500);
    r.registrar('ler_campos', 700);
    expect(r.resumo(10_000)).toContain('ler_campos 2x/1.2s');
  });

  it('zerar começa o pedido seguinte do zero, e não do anterior', () => {
    const r = new Relogio();
    r.registrar('preencher', 9_000);
    r.zerar();
    const linha = r.resumo(5_000);
    expect(linha).toContain('0.0s em browser');
    expect(linha).toContain('5.0s fora do browser');
    expect(linha).toContain('nenhuma');
  });

  it('relogio sem nenhum registro não explode', () => {
    expect(new Relogio().resumo(1_000)).toContain('latência 1.0s');
  });
});
