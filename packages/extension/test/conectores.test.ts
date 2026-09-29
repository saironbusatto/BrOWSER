import { describe, expect, it } from 'bun:test';
import { CONECTORES, codeChallenge, formatarTamanho, listarDrive, paramDaUrl } from '../utils/conectores';

// O chrome.runtime só existe dentro da extensão; o módulo chama isso no import.
(globalThis as any).chrome = { runtime: { getManifest: () => ({}) } };

describe('escopos dos conectores', () => {
  it('Drive é só leitura — nenhum scope de escrita', () => {
    // ponytail: se algum dia der escrita, o teste quebra na revisão. É a trava de segurança
    // mais barata que existe: um escopo que o BrOWSER não precisa não entra.
    for (const c of CONECTORES) {
      expect(c.escopo).toMatch(/\.readonly$/);
      expect(c.escopo).toContain('googleapis.com/auth/');
    }
  });
});

describe('listarDrive: o que entra na lista de anexos', () => {
  const token = 'fake-token';
  const resposta = (files: unknown[]) =>
    Promise.resolve(
      new Response(JSON.stringify({ files }), { status: 200 }),
    );

  it('pastas e nativos voltam marcados, não escondidos — sem pasta não há como navegar', async () => {
    globalThis.fetch = (() =>
      resposta([
        { id: 'a', name: 'nota.pdf', mimeType: 'application/pdf', size: '1024', modifiedTime: '2026-01-01T00:00:00Z' },
        { id: 'b', name: 'Pasta', mimeType: 'application/vnd.google-apps.folder' },
        { id: 'c', name: 'Planilha', mimeType: 'application/vnd.google-apps.spreadsheet' },
        { id: 'd', name: 'dados.csv', mimeType: 'text/csv', size: '10' },
      ])) as any;

    const lista = await listarDrive(token);
    expect(lista).toHaveLength(4); // esconder era o que deixava o seletor vazio
    expect(lista.find((f) => f.nome === 'Pasta')!.pasta).toBe(true);
    expect(lista.find((f) => f.nome === 'Planilha')!.exportavel).toBe(true);
    expect(lista.find((f) => f.nome === 'nota.pdf')!.exportavel).toBe(false);
    expect(lista.find((f) => f.nome === 'nota.pdf')!.tamanho).toBe(1024);
  });

  it('Forms e Vids não são exportáveis mas também não somem da lista', async () => {
    globalThis.fetch = (() =>
      resposta([{ id: 'f', name: 'Form', mimeType: 'application/vnd.google-apps.form' }])) as any;
    const lista = await listarDrive(token);
    // A doc só confirma que Vids dá fileNotExportable. O regex é restrito a doc/sheet/presentation
    // de propósito: Form aparece com download quebrado em vez de sumir da lista.
    expect(lista).toHaveLength(1);
    expect(lista[0]!.exportavel).toBe(false);
    expect(lista[0]!.pasta).toBe(false);
  });

  it('sem size no Drive (Google Docs exportado) não vira NaN', async () => {
    globalThis.fetch = (() => resposta([{ id: 'a', name: 'x.bin', mimeType: 'application/octet-stream' }])) as any;
    const lista = await listarDrive(token);
    expect(lista[0]!.tamanho).toBe(0);
  });

  it('erro do Drive traz a mensagem do Google, não só o status', async () => {
    // A doc diz: em 400 o corpo traz "an error message stating what's wrong". Sem ler o corpo,
    // fields malformado e token expirado viram o mesmo "respondeu 400" e não há como diagnosticar.
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 400, message: 'Invalid field selection canAddChildren.' } }), { status: 400 }),
      )) as any;
    await expect(listarDrive(token)).rejects.toThrow('Invalid field selection canAddChildren.');
  });

  it('erro sem corpo JSON não derruba a mensagem', async () => {
    globalThis.fetch = (() => Promise.resolve(new Response('nao e json', { status: 403 }))) as any;
    await expect(listarDrive(token)).rejects.toThrow('403');
  });

  it('manda o bearer e só o que a lista precisa', async () => {
    let url = '';
    let headers: Record<string, string> = {};
    globalThis.fetch = ((u: string, o: any) => {
      url = u;
      headers = o.headers;
      return resposta([]);
    }) as any;

    await listarDrive(token);
    expect(headers.Authorization).toBe('Bearer fake-token');
    expect(url).toContain('trashed+%3D+false');
    expect(url).toContain('orderBy=modifiedTime+desc');
  });
});

describe('formatarTamanho', () => {
  it('bytes, KB, MB e o zero que o Drive devolve para arquivo sem size', () => {
    expect(formatarTamanho(0)).toBe('—');
    expect(formatarTamanho(512)).toBe('512 B');
    expect(formatarTamanho(2048)).toBe('2.0 KB');
    expect(formatarTamanho(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

// O flow PKCE é fronteira de segurança: o code_verifier tem de bater com o challenge, senão o
// Google recusa a troca. Estes testes pegam o erro antes do navegador, não depois.
describe('code_verifier e code_challenge', () => {
  it('o S256 é determinístico e bate com o vetor oficial do RFC 7636', async () => {
    // O exemplo canônico do RFC: verifierKnown -> challengeKnown.
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('base64url: sem +, / e = (o Google recusa se vazar)', async () => {
    for (const v of ['a'.repeat(43), 'x'.repeat(86), 'qu'.repeat(31)]) {
      const c = await codeChallenge(v);
      expect(c).not.toMatch(/[+/=]/);
    }
  });

  it('verifiers diferentes dão challenges diferentes — sem colisão', async () => {
    expect(await codeChallenge('verificador-um')).not.toBe(await codeChallenge('verificador-dois'));
  });
});

describe('paramDaUrl: o code volta na query e o token no fragment', () => {
  it('lê o code da query do redirect do chromiumapp', () => {
    expect(paramDaUrl('https://abc.chromiumapp.org/?state=x&code=4/0Aean-Ab_c', 'code')).toBe('4/0Aean-Ab_c');
  });
  it('lê o token do fragment', () => {
    expect(paramDaUrl('https://abc.chromiumapp.org/#access_token=ya29.abc&token_type=Bearer', 'access_token')).toBe('ya29.abc');
  });
  it('devolve null quando não tem — o chamador trata como erro em vez de seguir com undefined', () => {
    expect(paramDaUrl('https://abc.chromiumapp.org/?error=access_denied', 'code')).toBeNull();
  });
});

describe('query do Drive: parâmetro malformado é 400, não lista vazia', () => {
  const urlDaChamada = async () => {
    let url = '';
    globalThis.fetch = ((u: string) => {
      url = u;
      return Promise.resolve(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    }) as any;
    await listarDrive('t');
    return url;
  };

  it('fields não vem aninhado: files(files(...)) faz o Drive responder 400', async () => {
    const url = await urlDaChamada();
    const fields = new URL(url).searchParams.get('fields')!;
    expect(fields).toBe('files(id,name,mimeType,size,modifiedTime)');
    expect(fields).not.toMatch(/files\(files\(/);
    // O wrapper tem que fechar uma vez só — conta de parênteses é o teste mais direto.
    expect((fields.match(/\(/g) ?? []).length).toBe((fields.match(/\)/g) ?? []).length);
    expect((fields.match(/files\(/g) ?? []).length).toBe(1);
  });

  it('supportsAllDrives sem corpora=team/allUser não é pedido de shared drive', async () => {
    const params = new URL(await urlDaChamada()).searchParams;
    // includeItemsFromAllDrives só faz sentido com corpora que inclua shared drives; com o
    // padrão (user) ele é redundante e o Drive pode recusar a combinação.
    expect(params.get('supportsAllDrives')).toBe('true');
    expect(params.get('corpora')).toBeNull();
  });

  it('listar por pasta usa o mesmo seletor de campos, senão quebra só nesse caminho', async () => {
    let url = '';
    globalThis.fetch = ((u: string) => {
      url = u;
      return Promise.resolve(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    }) as any;
    await listarDrive('t', 'abc123');
    const params = new URL(url).searchParams;
    expect(params.get('fields')).toBe('files(id,name,mimeType,size,modifiedTime)');
    expect(params.get('q')).toBe("'abc123' in parents and trashed = false");
  });
});
