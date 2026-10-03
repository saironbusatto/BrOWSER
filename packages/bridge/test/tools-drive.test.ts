import { describe, expect, it } from 'bun:test';
import { conversaDe } from '../src/conversas';
import { navegacaoLiberada } from '../src/navegacao';
import { type DepsDrive, registrarToolsDrive } from '../src/tools-drive';

type Handler = (args: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[] }>;

function montar(enviar: DepsDrive['enviar']) {
  const handlers = new Map<string, Handler>();
  const conversa = conversaDe(new Map(), 'c1');
  const status: string[] = [];
  registrarToolsDrive({ registerTool: (n: string, _c: unknown, h: Handler) => handlers.set(n, h) } as never, {
    enviar,
    status: (t) => status.push(t),
    conversa: () => conversa,
  });
  const chamar = async (nome: string, args: Record<string, unknown>) => JSON.parse((await handlers.get(nome)!(args)).content[0]!.text!);
  return { chamar, conversa, status };
}

const LINK = 'https://docs.google.com/document/d/x1/edit';

describe('buscar_no_drive', () => {
  it('busca no conteúdo pela extensão e libera os links devolvidos para navegar', async () => {
    const enviados: unknown[] = [];
    const t = montar((async (cmd: string, args: unknown) => {
      enviados.push({ cmd, args });
      return { arquivos: [{ id: 'x1', nome: 'Contrato Ana', tipo: 'doc', modificadoEm: '', link: LINK }] };
    }) as DepsDrive['enviar']);
    const r = await t.chamar('buscar_no_drive', { texto: 'Ana Souza' });
    expect(enviados).toEqual([{ cmd: 'buscar_drive', args: { texto: 'Ana Souza' } }]);
    expect(r.arquivos[0].nome).toBe('Contrato Ana');
    expect(t.status.some((s) => s.includes('Ana Souza'))).toBe(true);
    // O link veio da API do Google, não foi montado pela IA: abrir o resultado não vira pergunta.
    const contexto = { linksDaPagina: t.conversa.linksConhecidos, hostsDaPessoa: [], hostsAprovados: [] };
    expect(navegacaoLiberada(new URL(LINK), contexto)).toBe(true);
    expect(navegacaoLiberada(new URL('https://docs.google.com/document/d/x1/edit?vazou=cpf'), contexto)).toBe(false);
  });

  it('Drive não conectado vira instrução para a IA, não erro do pedido', async () => {
    const t = montar((async () => {
      throw new Error('o Google Drive não está conectado no BrOWSER; use a busca do Drive pela interface');
    }) as DepsDrive['enviar']);
    const r = await t.chamar('buscar_no_drive', { texto: 'x' });
    expect(r.erro).toContain('use a busca do Drive pela interface');
  });
});

describe('ler_arquivo_drive', () => {
  it('lê o texto pela extensão e libera o link do arquivo', async () => {
    const t = montar((async (cmd: string, args: { id: string }) => {
      expect(cmd).toBe('ler_drive');
      return { nome: 'Contrato Ana', tipo: 'doc', link: LINK, texto: `arquivo ${args.id}: CPF 123` };
    }) as DepsDrive['enviar']);
    const r = await t.chamar('ler_arquivo_drive', { id: 'x1' });
    expect(r.texto).toBe('arquivo x1: CPF 123');
    expect(t.conversa.linksConhecidos.has(LINK)).toBe(true);
  });

  it('falha ao ler devolve o motivo para a IA seguir por outro caminho', async () => {
    const t = montar((async () => {
      throw new Error('Drive não leu Contrato (403)');
    }) as DepsDrive['enviar']);
    expect((await t.chamar('ler_arquivo_drive', { id: 'x1' })).erro).toContain('403');
  });
});
