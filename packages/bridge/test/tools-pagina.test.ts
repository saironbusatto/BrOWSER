import { describe, expect, it } from 'bun:test';
import type { Campo } from '@browser/shared';
import { type DepsPagina, registrarToolsPagina } from '../src/tools-pagina';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[] }>;

const CAMPOS: Campo[] = [
  { ref: 1, papel: 'textbox', nome: 'CNPJ' },
  { ref: 2, papel: 'button', nome: 'Mais opções' },
  { ref: 3, papel: 'button', nome: 'Enviar cadastro' },
];
const ANTES = 'campo "CNPJ" [ref=1]\nbotão "Mais opções" [ref=2]\nbotão "Enviar cadastro" [ref=3]';
const DEPOIS = `${ANTES}\nmenu\n  item de menu "Arquivar" [ref=9]`;

/** Extensão falsa: a página muda (abre um menu) depois do primeiro clique. */
function montar(opcoes: { semEstrutura?: boolean; falhaNoRef?: number } = {}) {
  const handlers = new Map<string, Handler>();
  const anotados: string[] = [];
  const enviados: { cmd: string; args: any }[] = [];
  let campos = new Map<number, Campo>();
  let clicou = false;
  const d: DepsPagina = {
    enviar: (async (cmd: string, args: any) => {
      enviados.push({ cmd, args });
      if (cmd === 'ler_estrutura') {
        if (opcoes.semEstrutura) throw new Error('comando desconhecido');
        const menu: Campo[] = clicou ? [{ ref: 9, papel: 'menuitem', nome: 'Arquivar' }] : [];
        return {
          url: 'https://a.com',
          titulo: 'Cadastro',
          texto: args.filtro ? 'botão "Mais opções" [ref=2]' : clicou ? DEPOIS : ANTES,
          truncado: !!args.filtro,
          campos: [...CAMPOS, ...menu],
        };
      }
      if (cmd === 'ler_campos') return { url: 'https://a.com', titulo: 'Cadastro', campos: CAMPOS };
      if (cmd === 'ler_pagina') return { url: 'https://a.com', titulo: 'Cadastro', texto: 'x', truncado: true, caracteres: 1 };
      if (cmd === 'clicar') clicou = true;
      if (cmd === 'preencher') {
        if (args.ref === opcoes.falhaNoRef) throw new Error('opção não encontrada: Acre');
        return { valor: args.valor };
      }
      return { ok: true };
    }) as DepsPagina['enviar'],
    status: () => {},
    anotar: (acao, alvo) => anotados.push(`${acao} ${alvo ?? ''}`.trim()),
    temPedido: () => true,
    campos: () => campos,
    definirCampos: (m) => {
      campos = m;
    },
    log: () => {},
  };
  registrarToolsPagina({ registerTool: (n: string, _c: unknown, h: Handler) => handlers.set(n, h) } as never, d);
  const chamar = async (nome: string, args: Record<string, unknown> = {}) => (await handlers.get(nome)!(args)).content[0]?.text ?? '';
  return { chamar, enviados, anotados, campos: () => campos, cmds: () => enviados.map((e) => e.cmd) };
}

describe('ler_estrutura', () => {
  it('devolve texto puro (título, endereço, estrutura) e guarda os campos para a guarda de cliques', async () => {
    const t = montar();
    const r = await t.chamar('ler_estrutura');
    expect(r).toBe(`Cadastro\nhttps://a.com\n\n${ANTES}`);
    expect([...t.campos().keys()]).toEqual([1, 2, 3]);
  });

  it('leitura filtrada acrescenta ao que já se conhecia, e avisa quando veio cortada', async () => {
    const t = montar();
    await t.chamar('ler_estrutura');
    const r = await t.chamar('ler_estrutura', { filtro: 'opções' });
    expect(t.enviados.at(-1)).toEqual({ cmd: 'ler_estrutura', args: { filtro: 'opções' } });
    expect(r).toContain('leitura cortada');
    expect(t.campos().size).toBe(3);
  });
});

describe('clicar: a guarda de envio continua em código, e a resposta diz o que mudou', () => {
  it('ref que não foi lida é recusada; botão de envio final é barrado sem chegar à página', async () => {
    const t = montar();
    expect(await t.chamar('clicar', { ref: 2 })).toContain('desconhecida');
    await t.chamar('ler_estrutura');
    expect(await t.chamar('clicar', { ref: 3 })).toContain('pedirConfirmacao');
    expect(t.cmds()).not.toContain('clicar');
  });

  it('clique que abre um menu devolve o menu, e o item novo já pode ser clicado', async () => {
    const t = montar();
    await t.chamar('ler_estrutura');
    const r = await t.chamar('clicar', { ref: 2 });
    expect(r).toBe('Clique feito em "Mais opções".\n\nApareceu:\nmenu\n  item de menu "Arquivar" [ref=9]');
    expect(t.campos().has(9)).toBe(true);
    expect(await t.chamar('clicar', { ref: 9 })).toContain('Clique feito em "Arquivar"');
    // A trilha guarda a ação e o nome do controle: é o que vira receita do site.
    expect(t.anotados).toEqual(['clicar Mais opções', 'clicar Arquivar']);
  });

  it('extensão que não sabe ler estrutura: o clique acontece e responde como antes', async () => {
    const t = montar({ semEstrutura: true });
    await t.chamar('ler_campos');
    expect(JSON.parse(await t.chamar('clicar', { ref: 2 }))).toEqual({ ok: true });
  });
});

describe('preencher e preencher_varios', () => {
  it('vários campos numa chamada; um que falha não derruba os outros', async () => {
    const t = montar({ falhaNoRef: 5 });
    const r = await t.chamar('preencher_varios', {
      campos: [
        { ref: 1, valor: '45.987' },
        { ref: 5, valor: 'Acre' },
        { ref: 6, valor: 'true' },
      ],
    });
    expect(t.cmds().filter((c) => c === 'preencher')).toHaveLength(3);
    expect(r).toContain('ref 1: "45.987"');
    expect(r).toContain('ref 5: NÃO preenchido (opção não encontrada: Acre)');
    expect(r).toContain('ref 6: "true"');
    expect(r).toContain('Nada mais mudou na página.');
    expect(t.anotados.join()).not.toContain('45.987'); // valor digitado nunca entra na trilha
  });

  it('preencher sozinho repassa à extensão', async () => {
    const t = montar();
    expect(JSON.parse(await t.chamar('preencher', { ref: 1, valor: 'um valor bem comprido mesmo' }))).toEqual({
      valor: 'um valor bem comprido mesmo',
    });
  });
});

describe('ler_pagina', () => {
  it('avisa quando o texto veio cortado; sem pedido ativo não lê', async () => {
    const t = montar();
    expect(JSON.parse(await t.chamar('ler_pagina', { limite: 500 })).aviso).toContain('cortado');
    expect(t.enviados.at(-1)).toEqual({ cmd: 'ler_pagina', args: { limite: 500 } });
  });
});
