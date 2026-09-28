// Etapa do indicador de progresso do painel.
//
// O texto de status vem da ponte (que o repassa da IA). A IA é péssima em dizer "onde está", então
// hoje a etapa é deduzida do texto. Extrair a função é o que permite testar a dedução — e ela erra
// o bastante para merecer: sem isso, "Preenchendo" e "Conferindo" viram o mesmo passo.

export const ETAPAS = ['Lendo', 'Preenchendo', 'Conferindo'] as const;
export type Etapa = 0 | 1 | 2 | 3; // 3 = concluído

/** Deduz a etapa a partir do texto de status. Regra por palavra-chave, do mais tarde pro começo. */
export function inferirEtapa(textoStatus: string): Etapa {
  const t = textoStatus.toLowerCase();
  if (t.includes('conferindo') || t.includes('verificando') || t.includes('conferir')) return 2;
  if (t.includes('preenchendo') || t.includes('preencher') || t.includes('escrevendo') || t.includes('clicando')) return 1;
  return 0;
}

/** Quem mostra a etapa: o texto do "scout" (leitura) ou do "synthesizer" (dados/anexos). */
export function agenteDaMensagem(agente: string | undefined): 'scout' | 'synthesizer' | 'ambos' {
  if (agente === 'scout') return 'scout';
  if (agente === 'synthesizer') return 'synthesizer';
  return 'ambos';
}
