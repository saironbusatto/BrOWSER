// Aceite dos Termos: nada do painel funciona antes dele.
//
// Mora no chrome.storage.local (não no localStorage do painel) porque o background também precisa
// ler, e porque some junto com a extensão: reinstalou, aceita de novo. A versão no registro é o que
// permite pedir um aceite novo quando os Termos mudarem — basta subir VERSAO_TERMOS.

export const CHAVE_TERMOS = 'termosAceitos';
// 3: o texto passou a incluir o aprendizado de formulários. Quem clicou "Entendi" no banner antigo
// (localStorage browser_termos_aceitos_v2) aceitou um texto sem isso, então aceita de novo.
// 4: entraram os conectores (§6.4): com o Gmail, texto de e-mail passa a ir para a IA escolhida.
export const VERSAO_TERMOS = 4;

export type RegistroTermos = { versao: number; em: string };

/** O storage é dado externo: só vale um registro da versão atual. */
export function termosAceitos(registro: unknown): boolean {
  const r = registro as Partial<RegistroTermos> | null | undefined;
  return typeof r === 'object' && r !== null && r.versao === VERSAO_TERMOS && typeof r.em === 'string';
}

export function registroDeAceite(agora: Date): RegistroTermos {
  return { versao: VERSAO_TERMOS, em: agora.toISOString() };
}
