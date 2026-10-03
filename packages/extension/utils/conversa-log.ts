// A conversa do painel mora aqui, no background, e não no DOM do painel.
//
// O painel recolhe quando a pessoa sai do grupo de abas da IA, e fechar o painel destrói o
// documento dele: com o chat só no DOM, recolher apagava a conversa (até um pedido em andamento).
// Agora o background anota cada fato, e o painel, ao abrir, repassa os fatos pelas mesmas funções
// que desenham o chat ao vivo. O conversaId mora junto: a memória da IA (sessão do CLI) também
// sobrevive ao painel fechar.

import type { Evento } from '@browser/shared';

export type EventoDoPedido = Extract<Evento, { tipo: 'status' | 'pergunta' | 'parado' | 'resultado' }>;

export type Registro =
  | { tipo: 'eu'; texto: string; anexos?: { nome: string; tamanho: number }[] }
  | { tipo: 'inicio'; pedidoId: string }
  | { tipo: 'resposta'; perguntaId: string; texto: string }
  | EventoDoPedido;

export type ConversaGuardada = { conversaId: string; registros: Registro[] };

// Painel -> background (não vão para a ponte).
export type MensagemPainel = { tipo: 'historico' } | { tipo: 'limpar_conversa' };

// chrome.storage.session tem 10 MB. Uma conversa longa com muito status passa disso; os mais
// velhos saem primeiro (o painel mostra o fim da conversa, que é o que importa).
export const MAX_REGISTROS = 400;
const CHAVE = 'conversa';

export function novaConversa(): ConversaGuardada {
  return { conversaId: crypto.randomUUID(), registros: [] };
}

/** Devolve a conversa com o registro novo, sem mexer na anterior. */
export function anotar(c: ConversaGuardada, r: Registro): ConversaGuardada {
  const registros = [...c.registros, r];
  return { ...c, registros: registros.length > MAX_REGISTROS ? registros.slice(-MAX_REGISTROS) : registros };
}

/** Pedido que começou e ainda não terminou: o painel reabre ocupado, com o Parar. */
export function pedidoEmAndamento(registros: readonly Registro[]): string | undefined {
  let emCurso: string | undefined;
  for (const r of registros) {
    if (r.tipo === 'inicio') emCurso = r.pedidoId;
    else if ((r.tipo === 'resultado' || r.tipo === 'parado') && r.pedidoId === emCurso) emCurso = undefined;
  }
  return emCurso;
}

export function ehEventoDoPedido(e: { tipo?: string }): e is EventoDoPedido {
  return e.tipo === 'status' || e.tipo === 'pergunta' || e.tipo === 'parado' || e.tipo === 'resultado';
}

// ---- Guarda (background) ----
// Espelho em memória + fila de escrita: dois eventos seguidos (status, status) faziam
// ler-alterar-gravar ao mesmo tempo e um apagava o outro.

let espelho: ConversaGuardada | undefined;
let fila: Promise<unknown> = Promise.resolve();

export async function lerConversa(): Promise<ConversaGuardada> {
  if (espelho) return espelho;
  const r = await chrome.storage.session.get(CHAVE).catch(() => ({}) as Record<string, unknown>);
  const guardada = r[CHAVE] as ConversaGuardada | undefined;
  espelho = guardada?.conversaId && Array.isArray(guardada.registros) ? guardada : novaConversa();
  return espelho;
}

function gravar(muda: (c: ConversaGuardada) => ConversaGuardada): Promise<ConversaGuardada> {
  const vez = fila.then(async () => {
    espelho = muda(await lerConversa());
    await chrome.storage.session.set({ [CHAVE]: espelho }).catch(() => {});
    return espelho;
  });
  fila = vez.catch(() => {});
  return vez;
}

export const anotarNaConversa = (r: Registro) => gravar((c) => anotar(c, r));
export const recomecarConversa = () => gravar(() => novaConversa());
