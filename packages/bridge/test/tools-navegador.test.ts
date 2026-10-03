import { describe, expect, it } from 'bun:test';
import { conversaDe, registrarMensagem } from '../src/conversas';
import { type DepsNavegador, registrarToolsNavegador } from '../src/tools-navegador';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[] }>;

/** Monta as tools com uma ponte falsa e devolve o que cada uma fez. */
function montar(opcoes: { links?: string[]; resposta?: string; pedido?: string; abas?: { id: number; url: string }[] }) {
  const handlers = new Map<string, Handler>();
  const servidor = { registerTool: (nome: string, _cfg: unknown, h: Handler) => handlers.set(nome, h) };
  const conversa = conversaDe(new Map(), 'c1');
  registrarMensagem(conversa, opcoes.pedido ?? 'preenche o formulário', 7);
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
    expect(t.conversa.abasPermitidas.has(99)).toBe(true); // a aba que a IA abriu é dela
  });

  it('javascript: e file: são recusados sem nem perguntar', async () => {
    const t = montar({ resposta: 'Permitir' });
    expect(await t.chamar('navegar', { url: 'javascript:alert(1)' })).toContain('não é permitido');
    expect(t.perguntas).toHaveLength(0);
  });
});

describe('abas da pessoa são dela', () => {
  const abas = [
    { id: 7, url: 'https://formulario.gov.br' },
    { id: 3, url: 'https://mail.google.com/u/0' },
  ];

  it('listar_abas não entrega título de aba alheia (pode ser assunto de e-mail)', async () => {
    const t = montar({ abas });
    const r = await t.chamar('listar_abas');
    expect(r).toContain('mail.google.com');
    expect(r.match(/Caixa de entrada/g)).toHaveLength(1); // só a aba 7, de onde a pessoa pediu
  });

  it('usar uma aba que a IA não abriu pergunta; negado, não troca', async () => {
    const t = montar({ abas });
    const r = await t.chamar('usar_aba', { id: 3 });
    expect(t.perguntas[0]).toContain('mail.google.com');
    expect(r).toContain('não permitiu');
    expect(t.enviados.some((e) => e.startsWith('usar_aba'))).toBe(false);
  });

  it('a aba de onde a pessoa pediu não precisa de permissão', async () => {
    const t = montar({ abas });
    await t.chamar('usar_aba', { id: 7 });
    expect(t.perguntas).toHaveLength(0);
    expect(t.enviados).toContain('usar_aba 7');
  });
});
