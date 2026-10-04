// `ler_estrutura` na extensão: busca a árvore de acessibilidade pelo CDP, acha o que é clicável sem
// papel declarado e entrega tudo ao serializador (arvore.ts). Fora do background.ts pelo limite
// de 800 linhas; o background passa o que só ele sabe (o CDP da aba alvo e os dois planos B).

import type { Campo, Comandos } from '@browser/shared';
import { linhaDoCampo, montarEstrutura, type NoAX } from './arvore';

type Cdp = <T = any>(method: string, params?: Record<string, unknown>) => Promise<T>;
type Leitura = Comandos['ler_estrutura']['result'];

export type DepsEstrutura = {
  cdp: Cdp;
  /** Aba sem chrome.debugger: só há a leitura de campos pelo DOM. */
  semDebugger: boolean;
  lerCamposPeloDom: () => Promise<{ url: string; titulo: string; campos: Campo[] }>;
  /** Campos de iframes de outra origem (outro processo: o CDP da aba não entra neles). */
  camposDeOutraOrigem: (url: string) => Promise<Campo[]>;
};

const MAX_CLICAVEIS = 40;
const MAX_VARRIDOS = 6000;
const GRUPO = 'browser-estrutura';

/**
 * Roda DENTRO da página. Cartão, linha ou ícone com cursor de clique que não é (nem contém, nem
 * está dentro de) um controle de verdade: não aparece na árvore de acessibilidade como botão, e a
 * IA só chegava nele por foto + clique por ponto. Mesmo sinal que o browser-use usa.
 */
export function acharClicaveisSemPapel(max: number, maxVarridos: number): Element[] {
  const CONTROLE =
    'a[href],button,input,select,textarea,label,summary,[contenteditable],[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=radio],[role=switch],[role=option],[role=combobox],[role=textbox]';
  const achados: Element[] = [];
  let varridos = 0;
  for (const el of document.body?.querySelectorAll('*') ?? []) {
    if (achados.length >= max || ++varridos > maxVarridos) break;
    if (getComputedStyle(el).cursor !== 'pointer') continue;
    // Só o elemento mais de fora: os filhos herdam o cursor.
    if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') continue;
    if (el.closest(CONTROLE) || el.querySelector(CONTROLE)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    achados.push(el);
  }
  return achados;
}

/** backendNodeId de cada elemento que `expressao` devolve (uma lista de elementos da página), na ordem. */
async function idsDosElementos(cdp: Cdp, expressao: string): Promise<(number | undefined)[]> {
  const r = await cdp('Runtime.evaluate', { expression: expressao, objectGroup: GRUPO });
  if (!r.result?.objectId) return [];
  const { result: itens } = await cdp('Runtime.getProperties', { objectId: r.result.objectId, ownProperties: true });
  return Promise.all(
    (itens as { name: string; value?: { objectId?: string } }[])
      .filter((p) => /^\d+$/.test(p.name) && p.value?.objectId)
      .sort((a, b) => Number(a.name) - Number(b.name))
      .map((p) => cdp('DOM.describeNode', { objectId: p.value!.objectId }).then((d) => d.node?.backendNodeId as number | undefined)),
  );
}

// Na árvore de acessibilidade estes inputs vêm desmontados nas peças internas do navegador.
const SELETOR_NATIVOS = 'input[type=date],input[type=time],input[type=datetime-local],input[type=month],input[type=week]';

/** O que a árvore de acessibilidade não conta: cartões clicáveis sem papel e campos de data/hora. */
async function extrasDaPagina(cdp: Cdp): Promise<{ clicaveis: Set<number>; nativos: Map<number, { tipo: string; valor?: string }> }> {
  const nativos = new Map<number, { tipo: string; valor?: string }>();
  let clicaveis = new Set<number>();
  try {
    const sel = JSON.stringify(SELETOR_NATIVOS);
    const [idsClicaveis, idsNativos, dados] = await Promise.all([
      idsDosElementos(cdp, `(${acharClicaveisSemPapel.toString()})(${MAX_CLICAVEIS}, ${MAX_VARRIDOS})`),
      idsDosElementos(cdp, `Array.from(document.querySelectorAll(${sel}))`),
      cdp('Runtime.evaluate', {
        expression: `Array.from(document.querySelectorAll(${sel}), (e) => ({ tipo: e.type, valor: e.value }))`,
        returnByValue: true,
      }),
    ]);
    clicaveis = new Set(idsClicaveis.filter((n): n is number => n !== undefined));
    (dados.result?.value as { tipo: string; valor: string }[] | undefined)?.forEach((d, i) => {
      const id = idsNativos[i];
      if (id !== undefined) nativos.set(id, { tipo: d.tipo, ...(d.valor && { valor: d.valor }) });
    });
  } catch {
    // Sem os extras a leitura ainda vale: faltam só os cartões sem papel e a data sai em peças.
  } finally {
    cdp('Runtime.releaseObjectGroup', { objectGroup: GRUPO }).catch(() => {});
  }
  return { clicaveis, nativos };
}

const emLinhas = (titulo: string, campos: Campo[]) =>
  campos.length ? `${titulo}\n${campos.map((c) => `  ${linhaDoCampo(c)}`).join('\n')}` : '';

export async function lerEstrutura(d: DepsEstrutura, filtro?: string): Promise<Leitura> {
  if (d.semDebugger) {
    const l = await d.lerCamposPeloDom();
    return {
      url: l.url,
      titulo: l.titulo,
      campos: l.campos,
      truncado: false,
      texto: emLinhas('controles da página (leitura simples, sem estrutura):', l.campos),
    };
  }
  const [{ nodes }, extras, pagina] = await Promise.all([
    d.cdp<{ nodes: NoAX[] }>('Accessibility.getFullAXTree'),
    extrasDaPagina(d.cdp),
    d.cdp('Runtime.evaluate', { expression: '({url: location.href, titulo: document.title})', returnByValue: true }),
  ]);
  const { url, titulo } = pagina.result.value as { url: string; titulo: string };
  const e = montarEstrutura(nodes, { ...extras, ...(filtro && { filtro }) });
  const deFora = await d.camposDeOutraOrigem(url).catch(() => [] as Campo[]);
  const quadro = emLinhas('quadro de outro site (iframe):', deFora);
  return { url, titulo, truncado: e.truncado, campos: [...e.campos, ...deFora], texto: [e.texto, quadro].filter(Boolean).join('\n') };
}
