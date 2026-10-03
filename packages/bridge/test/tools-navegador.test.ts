import { describe, expect, it } from 'bun:test';
import { conversaDe, registrarMensagem } from '../src/conversas';
import { type DepsNavegador, registrarToolsNavegador } from '../src/tools-navegador';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[] }>;

/** Monta as tools com uma ponte falsa e devolve o que cada uma fez. */
function montar(opcoes: { links?: string[]; resposta?: string; pedido?: string; abas?: { id: number; url: string }[] }) {
  const handlers = new Map<string, Handler>();
  const servidor = { registerTool: (nome: string, _cfg: unknown, h: Handler) => handlers.set(nome, h) };
  const conversa = conversaDe(new Map(), 'c1');
  registrarMensagem(conversa, opcoes.pedido ?? 'preenche o formulário');
  const enviados: string[] = [];
  const perguntas: string[] = [];
  const deps: DepsNavegador = {
    enviar: (async (cmd: string, args: Record<string, unknown>) => {
      enviados.push(`${cmd}${args.url ? ` ${args.url}` : ''}${args.id ? ` ${args.id}` : ''}`);
      if (cmd === 'links') return { links: opcoes.links ?? [] };
      if (cmd === 'listar_abas') return { abas: (opcoes.abas ?? []).map((a) => ({ ...a, titulo: 'Caixa de entrada (3)', alvo: false })) };
      if (cmd === 'abrir_aba') return { id: 99, url: String(args.url), titulo: '' };
      return { url: String(args.url ?? ''), titulo: '' };
    }) as DepsNavegador['enviar'],
    status: () => {},
    perguntar: async (p) => {
      perguntas.push(p);
      return opcoes.resposta ?? 'Não permitir';
    },
    conversa: () => conversa,
    paginaMudou: () => {},
  };
  registrarToolsNavegador(servidor as never, deps);
  const chamar = async (nome: string, args: Record<string, unknown> = {}) => {
    const r = await handlers.get(nome)!(args);
    return r.content[0]?.text ?? '';
  };
  return { chamar, enviados, perguntas, conversa };
}

describe('navegar: a regra é de código', () => {
  it('site estranho pergunta; negado, a aba não sai do lugar', async () => {
    const t = montar({});
    const r = await t.chamar('navegar', { url: 'https://atacante.com/?cpf=123' });
    expect(t.perguntas[0]).toContain('atacante.com');
    expect(r).toContain('não permitiu');
    expect(t.enviados.some((e) => e.startsWith('navegar'))).toBe(false);
  });

  it('aprovado uma vez, o site fica liberado no resto da conversa', async () => {
    const t = montar({ resposta: 'Permitir' });
    await t.chamar('navegar', { url: 'https://nfe.fazenda.sp.gov.br/a' });
    await t.chamar('navegar', { url: 'https://nfe.fazenda.sp.gov.br/b' });
    expect(t.perguntas).toHaveLength(1);
    expect(t.enviados.filter((e) => e.startsWith('navegar'))).toHaveLength(2);
  });

  it('link da página e site citado pela pessoa vão direto, sem perguntar', async () => {
    const t = montar({ links: ['https://loja.com/produto/1'], pedido: 'compara com o preço no mercadolivre.com.br' });
    await t.chamar('navegar', { url: 'https://loja.com/produto/1' });
    await t.chamar('abrir_aba', { url: 'https://www.mercadolivre.com.br/busca' });
    expect(t.perguntas).toHaveLength(0);
  });

  it('javascript: e file: são recusados sem nem perguntar', async () => {
    const t = montar({ resposta: 'Permitir' });
    expect(await t.chamar('navegar', { url: 'javascript:alert(1)' })).toContain('não é permitido');
    expect(t.perguntas).toHaveLength(0);
  });
});

describe('abas: a fronteira é o grupo, não uma pergunta', () => {
  it('usar e fechar aba não perguntam nada: quem recusa aba fora do grupo é a extensão', async () => {
    const t = montar({});
    await t.chamar('usar_aba', { id: 3 });
    await t.chamar('fechar_aba', { id: 4 });
    expect(t.perguntas).toHaveLength(0);
    expect(t.enviados).toEqual(['usar_aba 3', 'fechar_aba 4']);
  });
});
