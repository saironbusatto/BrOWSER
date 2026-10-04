// Gmail pela API (conector do Google, só leitura): buscar e ler e-mail sem depender da tela.
//
// Mesmo motivo do Drive (conectores.ts): "ache o e-mail do cartório com o prazo" pela interface são
// dezenas de cliques e fotos; pela API são duas chamadas. O escopo é gmail.readonly: não envia,
// não apaga, não marca como lido.

import type { Comandos } from '@browser/shared';

const RAIZ = 'https://gmail.googleapis.com/gmail/v1/users/me';
const LIMITE_TEXTO = 60_000;

type ResumoEmail = Comandos['buscar_gmail']['result']['emails'][number];
type Email = Comandos['ler_gmail']['result'];
type Parte = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: Parte[];
};
type Mensagem = { id: string; threadId: string; snippet?: string; payload?: Parte };

async function pedir<T>(token: string, caminho: string, acao: string): Promise<T> {
  const r = await fetch(`${RAIZ}/${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.ok) return (await r.json()) as T;
  // O corpo diz o que houve (API desligada no projeto, escopo não concedido, cota): sem ele todo
  // erro vira o mesmo "403".
  const detalhe = await r
    .json()
    .then((c: { error?: { message?: string } }) => c.error?.message ?? '')
    .catch(() => '');
  throw new Error(`Gmail ${acao} (${r.status})${detalhe ? `: ${detalhe}` : ''}`);
}

const cabecalho = (p: Parte | undefined, nome: string) => p?.headers?.find((h) => h.name.toLowerCase() === nome)?.value ?? '';

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' };
const semEntidades = (s: string) =>
  s.replace(/&(#\d+|\w+);/g, (tudo, e: string) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : (ENTIDADES[e] ?? tudo)));

function resumo(m: Mensagem): ResumoEmail {
  return {
    id: m.id,
    de: cabecalho(m.payload, 'from'),
    assunto: cabecalho(m.payload, 'subject'),
    data: cabecalho(m.payload, 'date'),
    trecho: semEntidades(m.snippet ?? ''),
    // Montado aqui a partir do id que a API devolveu: a IA não escolhe para onde este link vai.
    link: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
  };
}

/** `consulta` é a mesma sintaxe da caixa de busca do Gmail (from:, subject:, has:attachment, newer_than:7d). */
export async function buscarNoGmail(token: string, consulta: string, limite = 10): Promise<ResumoEmail[]> {
  const lista = await pedir<{ messages?: { id: string }[] }>(
    token,
    `messages?${new URLSearchParams({ q: consulta, maxResults: String(limite) })}`,
    'não buscou',
  );
  const campos = 'format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';
  const mensagens = await Promise.all(
    (lista.messages ?? []).map((m) => pedir<Mensagem>(token, `messages/${encodeURIComponent(m.id)}?${campos}`, 'não leu o resultado')),
  );
  return mensagens.map(resumo);
}

/** base64url -> texto, no charset que o próprio e-mail declara (muito e-mail brasileiro ainda é ISO-8859-1). */
function decodificar(p: Parte): string {
  const bin = atob((p.body?.data ?? '').replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const charset = /charset="?([\w-]+)/i.exec(cabecalho(p, 'content-type'))?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes); // charset que o navegador não conhece
  }
}

function achar(p: Parte | undefined, tipo: string): Parte | undefined {
  if (!p) return undefined;
  if (p.mimeType === tipo && p.body?.data && !p.filename) return p;
  for (const filha of p.parts ?? []) {
    const achada = achar(filha, tipo);
    if (achada) return achada;
  }
  return undefined;
}

const anexos = (p: Parte | undefined): string[] => (p ? [...(p.filename ? [p.filename] : []), ...(p.parts ?? []).flatMap(anexos)] : []);

/** HTML de e-mail vira texto corrido: a IA precisa do que está escrito, não da diagramação. */
export function textoDoHtml(html: string): string {
  return semEntidades(
    html
      .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export async function lerEmail(token: string, id: string): Promise<Email> {
  const m = await pedir<Mensagem>(token, `messages/${encodeURIComponent(id)}?format=full`, 'não leu o e-mail');
  const plano = achar(m.payload, 'text/plain');
  const html = plano ? undefined : achar(m.payload, 'text/html');
  const texto = plano ? decodificar(plano).trim() : html ? textoDoHtml(decodificar(html)) : '';
  return {
    ...resumo(m),
    para: cabecalho(m.payload, 'to'),
    anexos: anexos(m.payload),
    ...(texto.length > LIMITE_TEXTO ? { texto: texto.slice(0, LIMITE_TEXTO), truncado: true } : { texto }),
  };
}
