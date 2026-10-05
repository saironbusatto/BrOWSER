import { describe, expect, it } from 'bun:test';
import type { Campo } from '@browser/shared';
import type { Leitura } from '../src/mudancas';
import type { DepsPagina } from '../src/tools-pagina';
import { acharAlvo, registrarToolsPassos } from '../src/tools-passos';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[] }>;
const leitura = (texto: string, campos: Campo[]): Leitura => ({ url: 'https://a.com', titulo: 'P', texto, truncado: false, campos });
const botao = (ref: number, nome: string): Campo => ({ ref, papel: 'button', nome });

describe('acharAlvo: o controle pelo nome, entre os que estão escritos na leitura', () => {
  const tela = leitura('linha: Padaria Sol\n  botão "Excluir" [ref=1]\nbotão "Arquivar projeto" [ref=3]', [
    botao(1, 'Excluir'),
    botao(2, 'Excluir'),
    botao(3, 'Arquivar projeto'),
  ]);

  it('nome exato ganha de nome que só contém; acento e caixa não importam', () => {
    expect(acharAlvo(tela, 'excluir')).toEqual({ campo: botao(1, 'Excluir') }); // o ref=2 não está escrito: ficou fora do filtro
    expect(acharAlvo(tela, 'arquivar')).toEqual({ campo: botao(3, 'Arquivar projeto') });
  });

  it('nenhum ou mais de um: diz o motivo em vez de escolher', () => {
    expect(acharAlvo(tela, 'Salvar')).toEqual({ erro: 'não achei nenhum controle chamado "Salvar"' });
    const dois = leitura('botão "Excluir" [ref=1]\nbotão "Excluir" [ref=2]', [botao(1, 'Excluir'), botao(2, 'Excluir')]);
    expect((acharAlvo(dois, 'Excluir') as { erro: string }).erro).toContain('há 2 controles');
  });
});

/** Página falsa: menu "Mais opções" -> item "Arquivar" -> janela com "Arquivar projeto". */
function montar() {
  const handlers = new Map<string, Handler>();
  const anotados: string[] = [];
  const enviados: string[] = [];
  let etapa = 0;
  let aoEsperar = 0;
  let campos = new Map<number, Campo>();
  const telas: Leitura[] = [
    leitura('Projeto Atlas\nbotão "Mais opções" [ref=1]\nbotão "Enviar" [ref=7]', [botao(1, 'Mais opções'), botao(7, 'Enviar')]),
    leitura('Projeto Atlas\nbotão "Mais opções" [ref=1]\nmenu\n  item de menu "Arquivar" [ref=2]', [
      botao(1, 'Mais opções'),
      { ref: 2, papel: 'menuitem', nome: 'Arquivar' },
    ]),
    leitura('janela "Confirmar"\n  botão "Arquivar projeto" [ref=3]', [botao(3, 'Arquivar projeto')]),
    leitura('Projeto arquivado.', []),
  ];
  const d: DepsPagina = {
    enviar: (async (cmd: string, args: any) => {
      if (cmd === 'ler_estrutura') return telas[etapa]!;
      enviados.push(`${cmd} ${args.ref ?? args.texto ?? args.tecla ?? ''}`.trim());
      if (cmd === 'clicar') etapa++;
      if (cmd === 'esperar') return { achou: args.texto !== 'nunca', esperouMs: 1 };
      if (cmd === 'preencher') return { valor: args.valor };
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
  registrarToolsPassos({ registerTool: (n: string, _c: unknown, h: Handler) => handlers.set(n, h) } as never, d, async () => {
    if (aoEsperar) etapa = aoEsperar; // a página "termina de carregar" durante a espera
  });
  const fazer = async (passos: unknown[]) => (await handlers.get('fazer_passos')!({ passos })).content[0]?.text ?? '';
  return {
    fazer,
    enviados,
    anotados,
    campos: () => campos,
    carregarDepois: (n: number) => {
      aoEsperar = n;
    },
  };
}

describe('fazer_passos', () => {
  it('abre o menu, escolhe e confirma numa chamada, achando pelo nome o que só aparece depois', async () => {
    const t = montar();
    const r = await t.fazer([
      { acao: 'clicar', alvo: 'Mais opções' },
      { acao: 'clicar', alvo: 'Arquivar' },
      { acao: 'clicar', alvo: 'Arquivar projeto' },
    ]);
    expect(t.enviados).toEqual(['clicar 1', 'clicar 2', 'clicar 3']);
    expect(r).toContain('1. cliquei em "Mais opções"\n2. cliquei em "Arquivar"\n3. cliquei em "Arquivar projeto"');
    expect(r).toContain('Apareceu:\nProjeto arquivado.');
    expect(r).not.toContain('PAROU');
    expect(t.anotados).toEqual(['clicar Mais opções', 'clicar Arquivar', 'clicar Arquivar projeto']);
  });

  it('para no passo que não acha o controle; os seguintes não são feitos e as refs da página atual ficam valendo', async () => {
    const t = montar();
    const r = await t.fazer([
      { acao: 'clicar', alvo: 'Mais opções' },
      { acao: 'clicar', alvo: 'Duplicar' },
      { acao: 'clicar', alvo: 'Arquivar projeto' },
    ]);
    expect(t.enviados).toEqual(['clicar 1']);
    expect(r).toContain('PAROU no passo 2: não achei nenhum controle chamado "Duplicar"');
    expect(r).toContain('item de menu "Arquivar" [ref=2]'); // mostra o que há, para a IA corrigir
    expect(t.campos().has(2)).toBe(true);
  });

  it('botão de envio final é barrado também aqui, e nada depois dele acontece', async () => {
    const t = montar();
    const r = await t.fazer([
      { acao: 'clicar', alvo: 'Enviar' },
      { acao: 'clicar', alvo: 'Mais opções' },
    ]);
    expect(t.enviados).toEqual([]);
    expect(r).toContain('botão de envio final');
  });

  it('preencher, esperar e teclar; espera que não se cumpre para a sequência', async () => {
    const t = montar();
    const r = await t.fazer([
      { acao: 'preencher', alvo: 'Mais opções', valor: 'x' },
      { acao: 'teclar', tecla: 'Escape' },
      { acao: 'esperar', texto: 'nunca' },
      { acao: 'teclar', tecla: 'Tab' },
    ]);
    expect(t.enviados).toEqual(['preencher 1', 'teclar Escape', 'esperar nunca']);
    expect(r).toContain('PAROU no passo 3 (esperar): o texto "nunca" não apareceu');
  });

  it('controle que ainda não apareceu: espera a página e segue, em vez de falhar', async () => {
    const t = montar();
    t.carregarDepois(2); // a janela de confirmação só existe depois de um tempo
    const r = await t.fazer([{ acao: 'clicar', alvo: 'Arquivar projeto' }]);
    expect(t.enviados).toEqual(['clicar 3']);
    expect(r).toContain('1. cliquei em "Arquivar projeto"');
  });

  it('passo incompleto é recusado com o que falta', async () => {
    const t = montar();
    expect(await t.fazer([{ acao: 'preencher', alvo: 'Mais opções' }])).toContain('falta "valor"');
    expect(await t.fazer([{ acao: 'clicar' }])).toContain('falta "alvo"');
    expect(await t.fazer([{ acao: 'teclar' }])).toContain('falta "tecla"');
  });
});
