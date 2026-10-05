// Portas de bastidor (roteiro, fase 1.4): o que o site oferece ALÉM da tela, para a IA escolher a
// rota mais curta. É o que os manuais por site do browser-harness registram (API, sitemap, endereço
// direto) e o que Firecrawl e Scrapling fazem ao mapear um site; aqui a descoberta é automática.
//
// Regra que não se negocia, em código: bastidor SÓ LÊ.
//   - nenhuma requisição que altera estado: só GET, e só de endereço que a própria página já
//     buscou (está na lista de recursos dela). Escrever, enviar e pagar continuam pela tela, onde
//     vale a guarda de envio da ponte.
//   - só corpo de resposta: nunca cabeçalho, cookie nem token.
//   - página de login, de pagamento ou com campo de senha fica de fora.

import type { Comandos } from '@browser/shared';
import { siteSensivel } from './content-regra';

const MAX_EMBUTIDO = 1_500_000;
const MAX_RESPOSTA = 3_000_000;
export const LIMITE_DADOS = 40_000;

export type Bruto = {
  url: string;
  temSenha: boolean;
  embutidos: { nome: string; texto: string }[];
  rede: string[];
  links: string[];
  sitemap: string;
  robots: string;
  exportar: string[];
};

/** Roda DENTRO da página (isolada do script do site). Só junta o material; o resumo é feito fora. */
export async function coletarBastidor(maxEmbutido: number): Promise<Bruto> {
  const embutidos = Array.from(
    document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"],script#__NEXT_DATA__'),
  )
    .slice(0, 20)
    .map((s) => ({ nome: s.id || s.getAttribute('type') || 'json', texto: (s.textContent ?? '').slice(0, maxEmbutido) }));
  // Só o que a página pediu por código (fetch/XHR): é onde moram os dados. Imagem e CSS não entram.
  const rede = [
    ...new Set(
      (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((e) => e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest')
        .map((e) => e.name),
    ),
  ].slice(-60);
  const pegar = async (caminho: string) => {
    try {
      const r = await fetch(new URL(caminho, location.origin), { credentials: 'omit' });
      return r.ok ? (await r.text()).slice(0, 200_000) : '';
    } catch {
      return '';
    }
  };
  const [sitemap, robots] = await Promise.all([pegar('/sitemap.xml'), pegar('/robots.txt')]);
  const exportar = Array.from(document.querySelectorAll('a,button,[role=button],[role=menuitem]'))
    .map((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length < 60 && /\b(exportar|export|baixar|download|csv|xlsx?|planilha|imprimir)\b/i.test(t));
  return {
    url: location.href,
    temSenha: !!document.querySelector('input[type=password]'),
    embutidos,
    rede,
    links: [...new Set(Array.from(document.links, (a) => a.href))].slice(0, 3000),
    sitemap,
    robots,
    exportar: [...new Set(exportar)].slice(0, 10),
  };
}

/** Roda DENTRO da página. `rede:` só relê, por GET, um endereço que a página já buscou. */
export async function lerFonteNaPagina(
  fonte: string,
  maxEmbutido: number,
  maxResposta: number,
): Promise<{ texto?: string; erro?: string }> {
  const [tipo, ...resto] = fonte.split(':');
  const alvo = resto.join(':');
  if (tipo === 'embutido') {
    const s = document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"],script#__NEXT_DATA__')[
      Number(alvo)
    ];
    return s ? { texto: (s.textContent ?? '').slice(0, maxEmbutido) } : { erro: `não existe ${fonte}: chame sondar_site de novo` };
  }
  if (tipo !== 'rede') return { erro: 'fonte desconhecida: use uma das que sondar_site listou' };
  const buscadas = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((e) => e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest')
    .map((e) => e.name);
  if (!buscadas.includes(alvo))
    return { erro: 'esse endereço não está entre os que a página buscou: bastidor só relê o que a própria página já pediu' };
  try {
    const r = await fetch(alvo, { method: 'GET', credentials: 'include', headers: { accept: 'application/json' } });
    if (!r.ok) return { erro: `o site respondeu ${r.status} (pode ser um endereço que só aceita envio, e bastidor não envia)` };
    return { texto: (await r.text()).slice(0, maxResposta) };
  } catch (e) {
    return { erro: `não deu para reler: ${String(e)}` };
  }
}

// ---- Resumo (fora da página, funções puras) ----

const tipoDe = (v: unknown) =>
  v === null
    ? 'nulo'
    : Array.isArray(v)
      ? `lista[${v.length}]`
      : typeof v === 'object'
        ? 'objeto'
        : typeof v === 'string'
          ? 'texto'
          : typeof v === 'number'
            ? 'número'
            : typeof v;

/** O formato de um JSON, sem os valores: chaves, tipos e tamanho das listas. É o que a IA precisa para pedir o pedaço certo. */
export function formatoJson(v: unknown, profundidade = 3, recuo = ''): string {
  if (Array.isArray(v))
    return v.length && typeof v[0] === 'object' && v[0] !== null && profundidade > 0
      ? `lista[${v.length}] de:\n${formatoJson(v[0], profundidade - 1, `${recuo}  `)}`
      : `${recuo}${tipoDe(v)}`;
  if (typeof v !== 'object' || v === null) return `${recuo}${tipoDe(v)}`;
  return Object.entries(v)
    .slice(0, 40)
    .map(([k, x]) => {
      const dentro =
        typeof x === 'object' && x !== null && profundidade > 0 && (Array.isArray(x) ? typeof x[0] === 'object' && x[0] !== null : true);
      return dentro
        ? `${recuo}${k}: ${Array.isArray(x) ? `lista[${x.length}] de:` : 'objeto'}\n${formatoJson(Array.isArray(x) ? x[0] : x, profundidade - 1, `${recuo}  `)}`
        : `${recuo}${k}: ${tipoDe(x)}`;
    })
    .join('\n');
}

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
const simples = (v: unknown) => v === null || typeof v !== 'object';

/** Lista de registros iguais vira tabela (um cabeçalho, uma linha por item): o mesmo dado em menos da metade do texto. */
function comoTabela(itens: unknown[]): { cabecalho: string; linhas: string[] } | undefined {
  const primeiro = itens[0];
  if (typeof primeiro !== 'object' || primeiro === null || Array.isArray(primeiro)) return undefined;
  const colunas = Object.keys(primeiro);
  const igual = (x: unknown) =>
    typeof x === 'object' && x !== null && !Array.isArray(x) && Object.keys(x).join() === colunas.join() && Object.values(x).every(simples);
  if (!colunas.length || !itens.every(igual)) return undefined;
  return {
    cabecalho: colunas.join(' | '),
    linhas: itens.map((x) =>
      Object.values(x as object)
        .map((v) => String(v ?? '').replace(/\s+/g, ' '))
        .join(' | '),
    ),
  };
}

export type Recorte = { caminho?: string; filtro?: string; desde?: number; limite?: number };

/**
 * O pedaço de um JSON em `caminho` ("dados.itens" ou "itens[0].nome"), cortado para caber.
 * Em lista: `filtro` fica só com os itens que contêm o texto, e `desde` continua de onde parou.
 * Recortar aqui, antes de entregar à IA, é o que o Scrapling faz com o seletor.
 */
export function recortarJson(v: unknown, r: Recorte = {}): { texto: string; truncado: boolean } | { erro: string } {
  const { caminho = '', limite = LIMITE_DADOS } = r;
  let atual: unknown = v;
  for (const parte of caminho.split(/[.[\]]+/).filter(Boolean)) {
    if (atual === null || typeof atual !== 'object' || !(parte in (atual as object)))
      return { erro: `"${parte}" não existe em "${caminho}". Formato:\n${formatoJson(atual, 1)}` };
    atual = (atual as Record<string, unknown>)[parte];
  }
  if (!Array.isArray(atual)) {
    const inteiro = JSON.stringify(atual);
    if (inteiro.length <= limite) return { texto: inteiro, truncado: false };
    return {
      texto: `${inteiro.slice(0, limite)}\n… cortado: peça uma parte menor pelo caminho. Formato:\n${formatoJson(atual, 2)}`,
      truncado: true,
    };
  }

  const alvo = r.filtro?.trim() ? semAcento(r.filtro.trim()) : '';
  const escolhidos = alvo ? atual.filter((x) => semAcento(JSON.stringify(x)).includes(alvo)) : atual;
  const desde = Math.max(0, r.desde ?? 0);
  const tabela = comoTabela(escolhidos);
  const linhas = (tabela?.linhas ?? escolhidos.map((x) => JSON.stringify(x))).slice(desde);
  const saida: string[] = [];
  let tamanho = tabela ? tabela.cabecalho.length : 0;
  for (const l of linhas) {
    if (tamanho + l.length + 1 > limite) break;
    saida.push(l);
    tamanho += l.length + 1;
  }
  const quantos = alvo ? `${escolhidos.length} de ${atual.length} itens contêm "${r.filtro}"` : `${atual.length} itens`;
  const resto = linhas.length - saida.length;
  const cabecalho = `${quantos}${desde ? `, a partir do ${desde}º` : ''}${tabela ? `. Colunas: ${tabela.cabecalho}` : ''}`;
  const aviso = resto ? `\n… faltam ${resto}: chame de novo com desde=${desde + saida.length} (ou use filtro)` : '';
  return { texto: [cabecalho, ...saida].join('\n') + aviso, truncado: resto > 0 };
}

/** Links do mesmo site agrupados por formato: `/notas/{n}`, `/busca?q=&pagina=`. É por onde dá para ir direto. */
export function padroesDeUrl(links: string[], pagina: string): { padrao: string; quantos: number; exemplo: string }[] {
  const origem = new URL(pagina).origin;
  const grupos = new Map<string, { quantos: number; exemplo: string }>();
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l);
    } catch {
      continue;
    }
    if (u.origin !== origem) continue;
    const caminho = u.pathname.replace(/\/\d+(?=\/|$)/g, '/{n}').replace(/\/[0-9a-f-]{16,}(?=\/|$)/gi, '/{id}');
    const chaves = [...new Set(u.searchParams.keys())].sort();
    const padrao = `${caminho}${chaves.length ? `?${chaves.map((k) => `${k}=`).join('&')}` : ''}`;
    const g = grupos.get(padrao) ?? { quantos: 0, exemplo: l };
    grupos.set(padrao, { quantos: g.quantos + 1, exemplo: g.exemplo });
  }
  return [...grupos.entries()]
    .map(([padrao, g]) => ({ padrao, ...g }))
    .filter((g) => g.padrao.includes('{') || g.padrao.includes('?'))
    .sort((a, b) => b.quantos - a.quantos)
    .slice(0, 12);
}

const analisar = (texto: string): unknown => {
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
};

/** O relatório da sondagem, em texto para a IA. */
export function montarSondagem(b: Bruto): string {
  const host = new URL(b.url).hostname;
  if (b.temSenha || siteSensivel(host))
    return 'Esta é uma página de login, pagamento ou banco: o bastidor fica fechado aqui. Trabalhe pela tela.';
  const partes: string[] = [];
  const embutidos = b.embutidos.map((e, i) => ({ i, e, v: analisar(e.texto) })).filter((x) => x.v !== undefined);
  if (embutidos.length) {
    partes.push(
      `DADOS JÁ EMBUTIDOS NA PÁGINA (leia com ler_dados, sem nenhuma requisição):\n${embutidos.map((x) => `- fonte "embutido:${x.i}" (${x.e.nome}, ${x.e.texto.length} caracteres)\n${formatoJson(x.v, 2, '    ')}`).join('\n')}`,
    );
  }
  if (b.rede.length) {
    partes.push(
      `DADOS QUE A PÁGINA BUSCOU NO SERVIDOR (ler_dados relê por GET; é o dado exato de tabela que só carrega ao rolar e de tela desenhada):\n${b.rede.map((u) => `- fonte "rede:${u}"`).join('\n')}`,
    );
  }
  const padroes = padroesDeUrl(b.links, b.url);
  if (padroes.length)
    partes.push(
      `ENDEREÇOS DIRETOS (use navegar em vez de clicar menu por menu):\n${padroes.map((p) => `- ${p.padrao}  (${p.quantos} links, ex.: ${p.exemplo})`).join('\n')}`,
    );
  const noMapa = [...b.sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
  if (noMapa.length)
    partes.push(
      `MAPA DO SITE (sitemap.xml, ${noMapa.length} endereços):\n${noMapa
        .slice(0, 15)
        .map((u) => `- ${u}`)
        .join('\n')}${noMapa.length > 15 ? '\n- …' : ''}`,
    );
  if (b.exportar.length) partes.push(`O SITE OFERECE EXPORTAR/BAIXAR: ${b.exportar.map((t) => `"${t}"`).join(', ')}`);
  return partes.length
    ? partes.join('\n\n')
    : 'Nenhuma porta de bastidor nesta página (sem dados embutidos, sem busca de dados por código, sem endereços com padrão, sem mapa do site). Trabalhe pela tela.';
}

type Sondagem = Comandos['sondar_site']['result'];
type Dados = Comandos['ler_dados']['result'];

async function naAba<A extends unknown[], R>(tabId: number, func: (...a: A) => R | Promise<R>, args: A): Promise<R> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: func as (...a: unknown[]) => R, args });
  return r?.result as R;
}

export async function sondarSite(tabId: number): Promise<Sondagem> {
  const b = await naAba(tabId, coletarBastidor, [MAX_EMBUTIDO]);
  if (!b) throw new Error('a página não respondeu à sondagem (pode ter mudado no meio do pedido)');
  return { url: b.url, texto: montarSondagem(b) };
}

export async function lerDados(tabId: number, fonte: string, recorte: Recorte = {}): Promise<Dados> {
  const { url } = await chrome.tabs.get(tabId);
  const sensivel =
    siteSensivel(new URL(url ?? 'https://x').hostname) || (await naAba(tabId, () => !!document.querySelector('input[type=password]'), []));
  if (sensivel) throw new Error('página de login, pagamento ou banco: o bastidor fica fechado aqui');
  const r = await naAba(tabId, lerFonteNaPagina, [fonte, MAX_EMBUTIDO, MAX_RESPOSTA]);
  if (!r?.texto) throw new Error(r?.erro ?? 'a página não devolveu nada');
  const v = analisar(r.texto);
  if (v === undefined) throw new Error('essa fonte não é JSON; para página de texto use ler_estrutura ou ler_pagina');
  const pedaco = recortarJson(v, recorte);
  if ('erro' in pedaco) throw new Error(pedaco.erro);
  return { fonte, ...pedaco };
}
