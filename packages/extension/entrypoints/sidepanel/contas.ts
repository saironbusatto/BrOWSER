// Quais contas de IA o BrOWSER pode usar.
//
// "Conectado" na ponte só quer dizer que o CLI da IA tem login na máquina — e isso pode vir de
// antes, de outro programa. Usar essa conta sem a pessoa ter pedido fazia o painel abrir com o
// Google já ligado na primeira vez. Agora só vale a conta que a pessoa conectou por aqui: a lista
// mora no chrome.storage.local, então começa vazia a cada instalação. O primeiro da lista é o
// plano em uso; os outros são o failover, na ordem.

import type { Ia, ItemAssinatura } from '@browser/shared';

export const CHAVE_CONTAS = 'contasLiberadas';

export type VisaoConta = { conectado: boolean; ativo: boolean };

/** A conta em uso: a primeira liberada que o CLI ainda confirma como logada. */
export function contaAtiva(liberadas: readonly Ia[], assinaturas: readonly ItemAssinatura[]): Ia | undefined {
  return liberadas.find((ia) => assinaturas.some((a) => a.ia === ia && a.conectado));
}

/** Como o card de um plano aparece: conectado só se a pessoa liberou E o CLI confirma. */
export function visaoConta(ia: Ia, liberadas: readonly Ia[], assinaturas: readonly ItemAssinatura[]): VisaoConta {
  const conectado = liberadas.includes(ia) && assinaturas.some((a) => a.ia === ia && a.conectado);
  return { conectado, ativo: conectado && contaAtiva(liberadas, assinaturas) === ia };
}

/** Põe a conta na frente (vira a ativa) sem duplicar. Devolve lista nova. */
export function usarConta(liberadas: readonly Ia[], ia: Ia): Ia[] {
  return [ia, ...liberadas.filter((x) => x !== ia)];
}

/** Tira a conta da lista. Devolve lista nova. */
export function largarConta(liberadas: readonly Ia[], ia: Ia): Ia[] {
  return liberadas.filter((x) => x !== ia);
}

/** O storage é dado externo: só aceita o que for uma IA conhecida. */
export function lerContas(valor: unknown, conhecidas: readonly Ia[]): Ia[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((v): v is Ia => conhecidas.includes(v as Ia)))];
}
