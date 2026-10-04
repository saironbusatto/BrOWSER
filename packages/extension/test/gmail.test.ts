import { describe, expect, it } from 'bun:test';
import { buscarNoGmail, lerEmail, textoDoHtml } from '../utils/gmail';

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(bytes as string)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const cab = (h: Record<string, string>) => Object.entries(h).map(([name, value]) => ({ name, value }));

/** Gmail falso: responde pelo caminho pedido e anota o que foi chamado. */
function gmail(rotas: Record<string, unknown>, status = 200) {
  const pedidos: { url: string; auth: string | null }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, auth: new Headers(init.headers).get('authorization') });
    const chave = Object.keys(rotas).find((k) => url.includes(k));
    return new Response(JSON.stringify(chave ? rotas[chave] : {}), { status });
  }) as never;
  return pedidos;
}

describe('buscarNoGmail', () => {
  it('manda a consulta como a pessoa digitaria, e devolve remetente, assunto, trecho e link de cada e-mail', async () => {
    const pedidos = gmail({
      'messages?': { messages: [{ id: 'm1' }, { id: 'm2' }] },
      'messages/m1': {
        id: 'm1',
        threadId: 't1',
        snippet: 'Prazo &#39;final&#39; &amp; custas',
        payload: { headers: cab({ From: 'Cartório <c@x.br>', Subject: 'Prazo', Date: 'Mon, 1 Sep 2026' }) },
      },
      'messages/m2': { id: 'm2', threadId: 't2', payload: { headers: cab({ from: 'ana@x.br', subject: 'Re: Prazo' }) } },
    });
    const emails = await buscarNoGmail('tok', 'from:cartorio newer_than:7d', 5);

    expect(pedidos[0]!.url).toContain('q=from%3Acartorio+newer_than%3A7d');
    expect(pedidos[0]!.url).toContain('maxResults=5');
    expect(pedidos.every((p) => p.auth === 'Bearer tok')).toBe(true);
    expect(pedidos[1]!.url).toContain('format=metadata'); // a busca não baixa o corpo de ninguém
    expect(emails[0]).toEqual({
      id: 'm1',
      de: 'Cartório <c@x.br>',
      assunto: 'Prazo',
      data: 'Mon, 1 Sep 2026',
      trecho: "Prazo 'final' & custas",
      link: 'https://mail.google.com/mail/u/0/#all/t1',
    });
    expect(emails[1]!.assunto).toBe('Re: Prazo'); // nome de cabeçalho não tem caixa fixa
  });

  it('caixa sem resultado é lista vazia, não erro', async () => {
    gmail({ 'messages?': {} });
    expect(await buscarNoGmail('tok', 'nada')).toEqual([]);
  });

  it('erro do Google chega com o motivo (API desligada, escopo não concedido)', async () => {
    gmail({ 'messages?': { error: { message: 'Request had insufficient authentication scopes.' } } }, 403);
    await expect(buscarNoGmail('tok', 'x')).rejects.toThrow('Gmail não buscou (403): Request had insufficient authentication scopes.');
  });
});

describe('lerEmail', () => {
  const lerCom = (payload: unknown) => {
    gmail({ 'messages/m1': { id: 'm1', threadId: 't1', snippet: 's', payload } });
    return lerEmail('tok', 'm1');
  };

  it('prefere o texto puro, mesmo aninhado, e lista os anexos sem baixar', async () => {
    const e = await lerCom({
      headers: cab({ From: 'a@x.br', To: 'eu@x.br', Subject: 'Contrato' }),
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('Segue o contrato.\nAção até sexta.') } },
            { mimeType: 'text/html', body: { data: b64url('<p>Segue</p>') } },
          ],
        },
        { mimeType: 'application/pdf', filename: 'contrato.pdf', body: {} },
      ],
    });
    expect(e.texto).toBe('Segue o contrato.\nAção até sexta.');
    expect(e.para).toBe('eu@x.br');
    expect(e.anexos).toEqual(['contrato.pdf']);
    expect(e.truncado).toBeUndefined();
  });

  it('e-mail só em HTML vira texto, sem estilo nem script', async () => {
    const html =
      '<html><head><style>p{color:red}</style></head><body><p>Olá&nbsp;Ana,</p><div>valor: R$&#32;10 &lt;hoje&gt;</div><script>x()</script></body></html>';
    const e = await lerCom({ mimeType: 'text/html', body: { data: b64url(html) } });
    expect(e.texto).toBe('Olá Ana,\nvalor: R$ 10 <hoje>');
  });

  it('respeita o charset do e-mail: ISO-8859-1 não vira acento quebrado', async () => {
    const latin1 = Uint8Array.from('Intimação'.split('').map((c) => c.charCodeAt(0)));
    const e = await lerCom({
      mimeType: 'text/plain',
      headers: cab({ 'Content-Type': 'text/plain; charset="ISO-8859-1"' }),
      body: { data: b64url(latin1) },
    });
    expect(e.texto).toBe('Intimação');
  });

  it('charset desconhecido cai em UTF-8; e-mail sem corpo de texto devolve vazio', async () => {
    const e = await lerCom({
      mimeType: 'text/plain',
      headers: cab({ 'content-type': 'text/plain; charset=x-inventado' }),
      body: { data: b64url('ok') },
    });
    expect(e.texto).toBe('ok');
    expect((await lerCom({ mimeType: 'image/png', filename: 'foto.png', body: {} })).texto).toBe('');
  });

  it('e-mail gigante é cortado e avisa', async () => {
    const e = await lerCom({ mimeType: 'text/plain', body: { data: b64url('a'.repeat(70_000)) } });
    expect(e.texto).toHaveLength(60_000);
    expect(e.truncado).toBe(true);
  });
});

describe('textoDoHtml', () => {
  it('quebra de linha onde o HTML quebra; entidade desconhecida fica como está', () => {
    expect(textoDoHtml('<ul><li>um</li><li>dois</li></ul>linha<br>outra &foo; fim')).toBe('um\ndois\nlinha\noutra &foo; fim');
  });
});
