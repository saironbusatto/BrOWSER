// O que a ponte lembra de uma conversa do painel (a lixeira do painel começa outra).
//
// ponytail: só em memória, até 50 conversas; some quando a ponte reinicia (fechar o navegador).
// Persistir em disco só se "reabri o navegador e ela esqueceu" virar reclamação.

import type { Ia } from '@browser/shared';
import { hostsMencionados } from './navegacao';

export type Conversa = {
  sessoes: Partial<Record<Ia, string>>; // id da sessão de cada CLI, para retomar
  hostsDaPessoa: Set<string>; // sites que a pessoa citou: a IA navega para eles sem perguntar
  hostsAprovados: Set<string>; // sites que a pessoa aprovou no painel
  abasPermitidas: Set<number>; // a aba de onde a pessoa pediu, as que a IA abriu e as aprovadas
};

export const MAX_CONVERSAS = 50;

/** Pega (ou cria) a conversa e a marca como a mais recente; a mais velha sai quando passa do teto. */
export function conversaDe(mapa: Map<string, Conversa>, id: string): Conversa {
  const c = mapa.get(id) ?? { sessoes: {}, hostsDaPessoa: new Set(), hostsAprovados: new Set(), abasPermitidas: new Set() };
  mapa.delete(id); // reinsere no fim: o Map vira uma fila do mais velho ao mais novo
  mapa.set(id, c);
  if (mapa.size > MAX_CONVERSAS) mapa.delete(mapa.keys().next().value!);
  return c;
}

/** Cada mensagem da pessoa amplia o que ela autorizou: os sites que citou e a aba de onde falou. */
export function registrarMensagem(c: Conversa, texto: string, tabId: number): void {
  for (const h of hostsMencionados(texto)) c.hostsDaPessoa.add(h);
  c.abasPermitidas.add(tabId);
}
