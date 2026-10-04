// Leitura única da página (roteiro, fase 1.2): texto e controles juntos, na ordem de leitura, com
// hierarquia. `ler_campos` dá os controles sem contexto (seis "Excluir" iguais) e `ler_pagina` dá
// o texto sem ref; para juntar os dois a IA tirava foto. Aqui cada controle aparece dentro da
// linha, do item ou da janela a que pertence.
//
// Entrada: os nós de `Accessibility.getFullAXTree` (CDP). Função pura, para ser testada sem
// navegador. Mesmo modelo do `take_snapshot` do Chrome DevTools MCP e do `browser_snapshot` do
// Playwright MCP; o filtro vem do browser-harness ("filter before printing").

import type { Campo } from '@browser/shared';

export type NoAX = {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: unknown };
  properties?: { name: string; value?: { value?: unknown } }[];
  childIds?: string[];
  backendDOMNodeId?: number;
};

export type OpcoesArvore = {
  /** backendNodeIds de elementos clicáveis sem papel declarado (cartão feito de <div>). */
  clicaveis?: Set<number>;
  /**
   * Campos com seletor nativo (data, hora), por backendNodeId -> tipo do input. Na árvore eles
   * aparecem desmontados em peças do navegador (Dia, Mês, Ano, botão do calendário); aqui cada um
   * volta a ser um campo só, preenchível de uma vez.
   */
  nativos?: Map<number, { tipo: string; valor?: string }>;
  /** Só as partes da página que contêm este texto (e o que há dentro delas). */
  filtro?: string;
  limite?: number;
};

export type Estrutura = { texto: string; campos: Campo[]; truncado: boolean };

export const LIMITE_ESTRUTURA = 20_000;
const MAX_LINHA = 300;
const MAX_OPCOES = 30;

// Controles: ganham ref. O nome em português é o que a IA lê; `papel` no Campo continua sendo o
// da árvore de acessibilidade, porque é por ele que a guarda de envio (envio.ts) decide.
const CONTROLES: Record<string, string> = {
  button: 'botão',
  link: 'link',
  textbox: 'campo',
  searchbox: 'busca',
  combobox: 'seleção',
  listbox: 'lista de opções',
  checkbox: 'caixa',
  radio: 'opção',
  switch: 'chave',
  spinbutton: 'número',
  slider: 'controle deslizante',
  menuitem: 'item de menu',
  menuitemcheckbox: 'item de menu',
  menuitemradio: 'item de menu',
  tab: 'aba',
  option: 'opção',
  treeitem: 'item',
};
// Inputs com seletor nativo. O formato é o que `preencher` aceita (o do atributo value do HTML).
const NATIVOS: Record<string, string> = {
  date: 'data (AAAA-MM-DD)',
  time: 'hora (HH:MM)',
  'datetime-local': 'data e hora (AAAA-MM-DDTHH:MM)',
  month: 'mês (AAAA-MM)',
  week: 'semana (AAAA-Www)',
};
// Controles que são contêiner: as opções de dentro continuam aparecendo como linhas.
const CONTROLE_COM_FILHOS = new Set(['listbox', 'treeitem']);

// Estrutura: vira linha própria e recua o que está dentro. `nomeado`: usa o nome acessível (nos
// outros o nome é só o conteúdo repetido).
const ESTRUTURA: Record<string, { rotulo: string; nomeado?: boolean }> = {
  heading: { rotulo: 'título' },
  table: { rotulo: 'tabela', nomeado: true },
  grid: { rotulo: 'tabela', nomeado: true },
  treegrid: { rotulo: 'tabela', nomeado: true },
  row: { rotulo: 'linha' },
  list: { rotulo: 'lista', nomeado: true },
  listitem: { rotulo: 'item' },
  dialog: { rotulo: 'janela', nomeado: true },
  alertdialog: { rotulo: 'janela', nomeado: true },
  menu: { rotulo: 'menu', nomeado: true },
  menubar: { rotulo: 'menu', nomeado: true },
  tablist: { rotulo: 'abas', nomeado: true },
  toolbar: { rotulo: 'barra de ferramentas', nomeado: true },
  navigation: { rotulo: 'navegação', nomeado: true },
  form: { rotulo: 'formulário', nomeado: true },
  radiogroup: { rotulo: 'grupo', nomeado: true },
  group: { rotulo: 'grupo', nomeado: true },
  alert: { rotulo: 'alerta' },
  status: { rotulo: 'aviso' },
  img: { rotulo: 'imagem', nomeado: true },
  image: { rotulo: 'imagem', nomeado: true },
};
const CELULAS = new Set(['cell', 'gridcell', 'columnheader', 'rowheader']);
const SEM_NADA = new Set(['InlineTextBox', 'LineBreak']);

/** `nome`: só em linha de controle; serve para tirar o rótulo repetido ao lado dele. */
type Linha = { texto: string; filhos: Linha[]; nome?: string };
type Item = string | Linha;

const limpar = (s: unknown) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const cortar = (s: string) => (s.length > MAX_LINHA ? `${s.slice(0, MAX_LINHA - 1)}…` : s);
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Trechos de texto vizinhos viram um só; uma linha própria interrompe a sequência. */
function juntar(itens: Item[], separador = ' '): Item[] {
  const saida: Item[] = [];
  for (const i of itens) {
    const ultimo = saida.at(-1);
    if (typeof i === 'string' && typeof ultimo === 'string') saida[saida.length - 1] = `${ultimo}${separador}${i}`;
    else saida.push(i);
  }
  return saida;
}

/** Rótulo solto colado no controle que ele nomeia ("CNPJ" + campo "CNPJ") é a mesma informação duas vezes. */
function semRotuloRepetido(itens: Item[]): Item[] {
  const igual = (a: Item | undefined, b: Item | undefined) =>
    typeof a === 'string' && typeof b === 'object' && !!b.nome && b.nome.includes(a);
  return itens.filter((i, k) => !(igual(i, itens[k + 1]) || igual(i, itens[k - 1])));
}

/** A linha de um controle, como a IA lê: `botão "Excluir" [ref=813]`. */
export function linhaDoCampo(c: Campo, rotulo = CONTROLES[c.papel] ?? c.papel): string {
  let s = `${rotulo} "${cortar(c.nome)}" [ref=${c.ref}]`;
  if (c.sensivel) s += ' (senha: valor oculto)';
  else if (c.valor) s += ` = "${cortar(c.valor)}"`;
  if (c.marcado !== undefined) s += c.marcado ? ' (marcado)' : ' (desmarcado)';
  if (c.obrigatorio) s += ' (obrigatório)';
  if (c.opcoes?.length) s += ` opções: ${c.opcoes.slice(0, MAX_OPCOES).join(' | ')}${c.opcoes.length > MAX_OPCOES ? ' | …' : ''}`;
  return s;
}

export function montarEstrutura(nos: NoAX[], opcoes: OpcoesArvore = {}): Estrutura {
  const porId = new Map(nos.map((n) => [n.nodeId, n]));
  const comPai = new Set(nos.flatMap((n) => n.childIds ?? []));
  const campos: Campo[] = [];
  const prop = (n: NoAX, k: string) => n.properties?.find((p) => p.name === k)?.value?.value;
  const filhosDe = (n: NoAX) => (n.childIds ?? []).map((id) => porId.get(id)).filter((f): f is NoAX => !!f);
  const soTexto = (itens: Item[]) => itens.filter((i): i is string => typeof i === 'string').join(' ');
  const nomesDasOpcoes = (n: NoAX): string[] =>
    filhosDe(n)
      .flatMap((f) => (f.role?.value === 'option' ? [limpar(f.name?.value)] : nomesDasOpcoes(f)))
      .filter(Boolean);

  function controle(n: NoAX, papel: string, dentro: Item[]): Linha {
    const nativo = opcoes.nativos?.get(n.backendDOMNodeId!);
    const semPapel = !nativo && !CONTROLES[papel];
    const campo: Campo = {
      ref: n.backendDOMNodeId!,
      papel: nativo ? nativo.tipo : semPapel ? 'button' : papel,
      nome: limpar(n.name?.value) || limpar(soTexto(dentro)),
    };
    if (nativo?.valor) campo.valor = nativo.valor;
    // Mesma regra de `ler_campos`: campo protegido nunca tem o valor lido.
    if (prop(n, 'protected') === true) campo.sensivel = true;
    else if (!nativo && n.value?.value !== undefined && limpar(n.value.value)) campo.valor = limpar(n.value.value);
    const marcado = prop(n, 'checked');
    if (marcado !== undefined) campo.marcado = marcado === 'true' || marcado === true;
    if (prop(n, 'required')) campo.obrigatorio = true;
    if (papel === 'combobox' || papel === 'listbox') {
      const nomes = nomesDasOpcoes(n);
      if (nomes.length) campo.opcoes = nomes;
    }
    campos.push(campo);
    const filhos = CONTROLE_COM_FILHOS.has(papel) ? dentro.filter((i): i is Linha => typeof i !== 'string') : [];
    return {
      texto: linhaDoCampo(campo, nativo ? (NATIVOS[nativo.tipo] ?? nativo.tipo) : semPapel ? 'clicável' : undefined),
      filhos,
      nome: campo.nome,
    };
  }

  // Devolve o que o nó entrega ao pai, em ordem: trechos de texto solto e linhas próprias.
  function visitar(n: NoAX): Item[] {
    const papel = n.role?.value ?? '';
    if (SEM_NADA.has(papel) || papel === 'password') return [];
    if (papel === 'StaticText') return n.ignored ? [] : [limpar(n.name?.value)].filter(Boolean);

    const id = n.backendDOMNodeId;
    // Campo nativo: as peças internas do navegador nem são visitadas.
    if (id !== undefined && opcoes.nativos?.has(id)) return [controle(n, papel, [])];
    const bruto = semRotuloRepetido(filhosDe(n).flatMap(visitar));
    const dentro = juntar(bruto);
    if (id !== undefined && ((!n.ignored && CONTROLES[papel]) || opcoes.clicaveis?.has(id))) return [controle(n, papel, dentro)];

    const e = n.ignored ? undefined : ESTRUTURA[papel];
    if (!e) {
      if (!CELULAS.has(papel)) return dentro;
      // Célula: um trecho só, para a linha separar as colunas. Vazia de verdade vira "—".
      const linhasDaCelula = dentro.filter((i) => typeof i !== 'string');
      const escrito = soTexto(dentro) || (linhasDaCelula.length ? '' : '—');
      return [...(escrito ? [escrito] : []), ...linhasDaCelula];
    }

    const filhos: Linha[] = [];
    let proprio = e.nomeado || papel === 'heading' ? limpar(n.name?.value) : '';
    // Linha de tabela: uma célula por trecho, separadas, para a IA não colar "1043" em "Padaria".
    if (papel === 'row') proprio = bruto.filter((i) => typeof i === 'string').join(' | ');
    for (const i of dentro) {
      if (typeof i !== 'string') filhos.push(i);
      else if (papel === 'row' || papel === 'heading')
        continue; // já está na própria linha
      else if (i === proprio)
        continue; // legenda que repete o nome do grupo
      else if (!proprio && !filhos.length && !e.nomeado) proprio = i;
      else filhos.push({ texto: cortar(i), filhos: [] });
    }
    if (!proprio && !filhos.length) return [];
    return [{ texto: cortar(`${e.rotulo}${proprio ? (e.nomeado ? ` "${proprio}"` : `: ${proprio}`) : ''}`), filhos }];
  }

  let linhas: Linha[] = nos
    .filter((n) => !comPai.has(n.nodeId))
    .flatMap((raiz) => juntar(semRotuloRepetido(visitar(raiz))))
    .map((i) => (typeof i === 'string' ? { texto: cortar(i), filhos: [] } : i));

  if (opcoes.filtro?.trim()) {
    const alvo = semAcento(opcoes.filtro.trim());
    const filtrar = (l: Linha): Linha | null => {
      if (semAcento(l.texto).includes(alvo)) return l; // casou: vem com tudo que tem dentro
      const filhos = l.filhos.map(filtrar).filter((f): f is Linha => !!f);
      return filhos.length ? { texto: l.texto, filhos } : null;
    };
    linhas = linhas.map(filtrar).filter((l): l is Linha => !!l);
  }

  const limite = opcoes.limite ?? LIMITE_ESTRUTURA;
  const saida: string[] = [];
  let tamanho = 0;
  let truncado = false;
  const escrever = (l: Linha, nivel: number) => {
    if (truncado) return;
    const linha = `${'  '.repeat(nivel)}${l.texto}`;
    if (tamanho + linha.length + 1 > limite) {
      truncado = true;
      return;
    }
    saida.push(linha);
    tamanho += linha.length + 1;
    for (const f of l.filhos) escrever(f, nivel + 1);
  };
  for (const l of linhas) escrever(l, 0);
  return { texto: saida.join('\n'), campos, truncado };
}
