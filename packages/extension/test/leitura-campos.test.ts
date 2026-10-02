import { describe, expect, it } from 'bun:test';
import type { Campo } from '@browser/shared';
import { fecharLeitura, type LeituraDom } from '../utils/dom-fallback';

// O formato da leitura é contrato com a ponte: `ler_campos` responde `{url, titulo, campos}`.
// Passar a leitura inteira para onde se espera a lista de campos jogava um objeto no meio, e o
// `campos.filter` do registro de sensíveis estourava — "e.filter is not a function" no bundle
// minificado. No caminho do CDP isso acontecia em TODA página; no plano B, o retorno saía com
// as chaves numéricas do array e sem `campos`, que é um contrato igualmente quebrado e mais
// silencioso.

const campo = (ref: number, extra: Partial<Campo> = {}): Campo => ({
  ref,
  papel: 'textbox',
  nome: `campo ${ref}`,
  ...extra,
});

const leitura = (campos: Campo[]): LeituraDom => ({
  url: 'https://teams.microsoft.com/x',
  titulo: 'Chat',
  campos,
});

describe('Ler campos: a leitura sai no formato que a ponte consome', () => {
  it('devolve a leitura com a lista de campos dentro, não a lista no lugar dela', () => {
    // A forma quebrada devolvia o array espalhado no objeto, o que produz
    // `{0: campo, 1: campo, url, titulo}` — sem `campos`. É o que a ponte lia.
    const { leitura: lida } = fecharLeitura(leitura([campo(1), campo(2)]));
    expect(Array.isArray(lida.campos)).toBe(true);
    expect(lida.campos).toHaveLength(2);
    expect(lida.url).toBe('https://teams.microsoft.com/x');
    expect(lida.titulo).toBe('Chat');
    expect(Object.keys(lida).sort()).toEqual(['campos', 'titulo', 'url']);
  });

  it('junta os campos de frame de outra origem no fim, sem perder os da página principal', () => {
    const principal = [campo(1), campo(2)];
    const daOutraOrigem = [campo(90), campo(91)];
    const { leitura: lida } = fecharLeitura(leitura(principal), daOutraOrigem);
    expect(lida.campos.map((c) => c.ref)).toEqual([1, 2, 90, 91]);
  });

  it('sem campos de outra origem, a lista da principal segue inteira', () => {
    const { leitura: lida } = fecharLeitura(leitura([campo(1), campo(2), campo(3)]), []);
    expect(lida.campos.map((c) => c.ref)).toEqual([1, 2, 3]);
  });

  it('marca o modo quando vem do plano B', () => {
    expect(fecharLeitura(leitura([campo(1)]), [], 'dom').leitura.modo).toBe('dom');
    // No caminho do CDP não há modo: a leitura é a do navegador.
    expect(fecharLeitura(leitura([campo(1)])).leitura.modo).toBeUndefined();
  });
});

describe('Ler campos: o segredo não passa', () => {
  it('tira o valor do campo sensível e devolve a ref para o preenchimento mascarar', () => {
    const { leitura: lida, sensiveis } = fecharLeitura(
      leitura([campo(1, { valor: 'público' }), campo(2, { papel: 'password', sensivel: true, valor: 's3nh4' })]),
    );
    expect(lida.campos[1]!.valor).toBeUndefined();
    expect(lida.campos[0]!.valor).toBe('público');
    expect(sensiveis).toEqual([2]);
    // O campo continua na lista: a IA precisa poder preenchê-lo.
    expect(lida.campos).toHaveLength(2);
  });

  it('sensível é o ref, mesmo quando o valor veio de frame de outra origem', () => {
    const { sensiveis, leitura: lida } = fecharLeitura(leitura([campo(1)]), [
      campo(90, { papel: 'password', sensivel: true, valor: 's3nh4' }),
    ]);
    expect(sensiveis).toEqual([90]);
    expect(lida.campos.find((c) => c.ref === 90)!.valor).toBeUndefined();
  });

  it('sem campo sensível, a lista de refs é vazia e nada é mexido', () => {
    const { sensiveis, leitura: lida } = fecharLeitura(leitura([campo(1, { valor: 'ok' })]));
    expect(sensiveis).toEqual([]);
    expect(lida.campos[0]!.valor).toBe('ok');
  });
});
