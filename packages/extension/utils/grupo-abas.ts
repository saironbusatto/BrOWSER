// O grupo de abas "BrOWSER" é o espaço de trabalho da IA.
//
// Dentro dele a IA vê, abre, troca e fecha abas sem perguntar nada; fora dele as abas são da
// pessoa, e a IA nem lista. A permissão é um gesto que todo mundo já conhece: arrastar a aba para
// dentro do grupo. O pedido feito numa aba também a traz para o grupo (a pessoa pediu ali).
//
// O painel acompanha: ao ativar uma aba fora do grupo, ele recolhe. O Chrome não deixa reabrir sem
// um clique (sidePanel.open exige gesto), então voltar ao grupo pede um clique no ícone, e a
// conversa reaparece inteira porque mora no background (conversa-log.ts).

const TITULO = 'BrOWSER';
const COR = 'blue';
const SESSAO_GRUPO = 'grupo';

let grupo: number | undefined; // espelho de SESSAO_GRUPO

async function grupoAtual(): Promise<number | undefined> {
  if (grupo === undefined) {
    const r = await chrome.storage.session.get(SESSAO_GRUPO).catch(() => ({}) as Record<string, unknown>);
    // Storage é dado externo: só um id inteiro vale. O tabGroups.get lança (não rejeita) com
    // qualquer outra coisa, e isso derrubava o pedido inteiro.
    const guardado = r[SESSAO_GRUPO];
    grupo = Number.isInteger(guardado) ? (guardado as number) : undefined;
  }
  if (grupo === undefined) return undefined;
  // A pessoa pode ter fechado ou desagrupado tudo: um id morto não é grupo.
  const vivo = await chrome.tabGroups.get(grupo).then(
    () => true,
    () => false,
  );
  if (!vivo) await esquecerGrupo();
  return vivo ? grupo : undefined;
}

export async function esquecerGrupo(): Promise<void> {
  grupo = undefined;
  await chrome.storage.session.remove(SESSAO_GRUPO).catch(() => {});
}

/** Põe a aba no grupo da IA, criando o grupo na janela dela se ainda não existir. */
export async function trazerParaOGrupo(tabId: number): Promise<number> {
  const tab = await chrome.tabs.get(tabId);
  const atual = await grupoAtual();
  if (atual !== undefined && tab.groupId === atual) return atual;
  const mesmaJanela = atual !== undefined && (await chrome.tabGroups.get(atual)).windowId === tab.windowId;
  if (atual !== undefined && mesmaJanela) {
    await chrome.tabs.group({ groupId: atual, tabIds: [tabId] });
    return atual;
  }
  // ponytail: um grupo só, na janela do pedido mais recente. Pedido noutra janela leva o grupo
  // para lá (o antigo fica como grupo comum). Um grupo por janela, se alguém usar duas ao mesmo tempo.
  const novo = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } });
  await chrome.tabGroups.update(novo, { title: TITULO, color: COR });
  grupo = novo;
  await chrome.storage.session.set({ [SESSAO_GRUPO]: novo }).catch(() => {});
  return novo;
}

/** true se a aba está no grupo da IA. Sem grupo ainda, nenhuma está. */
export async function noGrupo(tabId: number): Promise<boolean> {
  const g = await grupoAtual();
  if (g === undefined) return false;
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  return tab?.groupId === g;
}

/** A IA tem grupo, mas esta aba não está nele (a pessoa a arrastou para fora). */
export async function foraDoGrupo(tabId: number): Promise<boolean> {
  return (await grupoAtual()) !== undefined && !(await noGrupo(tabId));
}

/** Abas do grupo, na ordem da barra. */
export async function abasDoGrupo(): Promise<chrome.tabs.Tab[]> {
  const g = await grupoAtual();
  if (g === undefined) return [];
  return chrome.tabs.query({ groupId: g });
}

/** Liga o recolhimento do painel: ativou aba fora do grupo, o painel fecha. */
export function vigiarPainel(): void {
  chrome.tabGroups.onRemoved.addListener((g) => {
    if (g.id === grupo) void esquecerGrupo();
  });
  chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    const g = await grupoAtual();
    if (g === undefined) return; // sem tarefa em curso, o painel fica onde a pessoa deixou
    const doGrupo = await chrome.tabGroups.get(g);
    if (doGrupo.windowId !== windowId || (await noGrupo(tabId))) return;
    // sidePanel.close existe a partir do Chrome 141; antes disso, o painel só não recolhe.
    const painel = chrome.sidePanel as typeof chrome.sidePanel & { close?: (o: { windowId: number }) => Promise<void> };
    await painel.close?.({ windowId }).catch(() => {});
  });
}
