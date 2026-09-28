// Quem decide que um clique é envio irreversível é a PONTE, não o prompt.
//
// O prompt manda a IA parar e perguntar (ias.ts), mas prompt não é garantia: uma página hostil,
// um rótulo malicioso ou uma alucinação passam por cima. Aqui a recusa vira código.
//
// Regra deliberadamente estreita: só recusa nomes de ação final e claramente irreversível
// (enviar, pagar, finalizar, assinar...). "Próximo", "Avançar", "Continuar", "Salvar rascunho"
// continuam liberados — engessar a navegação quebraria o produto inteiro, que é justamente o
// que a IA precisa fazer.
//
// Isto estreita a janela; não a fecha. O fecho real continua sendo a pessoa clicar no botão
// da página com a própria mão (docs/termos-e-privacidade.md §7.2).
import type { Campo } from '@browser/shared';

// "enviar" sozinho; e expressões compostas que só fazem sentido no fim do fluxo.
const IRREVERSIVEL = [
  // pt
  /\benviar\b/i,
  /\bsubmit\b/i,
  /\bfinalizar\b/i,
  /\bconcluir\b/i,
  /\bpagar\b/i,
  /\bconfirmar\s+(o\s+)?(pagamento|compra|pedido|pagina[cç]o|inscri[cç][aã]o|matr[ií]cula)/i,
  /\befetuar\b/i,
  /\btransmitir\b/i,
  /\bassinar\b/i,
  /\bcadastrar(-se)?\b/i,
  /\bcriar\s+conta\b/i,
  // en
  /\bsubmit\b/i,
  /\bsend\b/i,
  /\bfinish\b/i,
  /\bplace\s+(the\s+)?order\b/i,
  /\bpay\s+now\b/i,
  /\bconfirm\s+payment\b/i,
  /\bcheckout\b/i,
];

// Navegação intermediária que NÃO pode ser barrada, mesmo contendo palavra parecida.
const PERMITIDO = [
  /pr[óo]xim[oa]/i,
  /avançar|avanca/i,
  /continuar|continue|next\b/i,
  /voltar|back\b|anterior/i,
  /buscar|pesquisar|search\b/i,
  /filtrar|filter\b/i,
  /calcular|simular|estimar/i,
  /adicionar|incluir|novo|nova|add\b/i,
  /selecionar|escolher|select\b/i,
  /salvar\s+(rascunho|modelo|como)/i,
  /revisar|conferir|revis[ãa]o/i,
  /aplicar|limpar|fechar|cancelar/i,
];

/** Motivo da recusa, ou null quando o clique pode seguir. */
export function motivoEnvioIrreversivel(campo: Pick<Campo, 'nome' | 'papel'>): string | null {
  // Só faz sentido barrar ação; um campo de texto chamado "Assinatura" não é botão de envio.
  if (campo.papel !== 'button' && campo.papel !== 'link' && campo.papel !== 'menuitem') return null;

  const nome = (campo.nome ?? '').replace(/\s+/g, ' ').trim();
  if (!nome || nome.length > 60) return null; // rótulo gigante é conteúdo, não controle

  if (PERMITIDO.some((r) => r.test(nome))) return null;
  if (!IRREVERSIVEL.some((r) => r.test(nome))) return null;
  return nome;
}

/**
 * Resposta que a ferramenta `clicar` devolve à IA quando o clique é barrado.
 * Não é só um "não": diz o que fazer, para a IA perguntar em vez de insistir.
 */
export function recusaEnvio(nome: string): { ok: false; motivo: string; pedirConfirmacao: true } {
  return {
    ok: false,
    motivo:
      `Clique em "${nome}" NÃO foi executado: é um botão de envio/transmissão final e o BrOWSER ` +
      'nunca transmite nada em nome do usuário. Isso vale mesmo com autorização em contrário. ' +
      'Chame perguntar_ao_usuario para o usuário conferir os dados na página; quem aperta o botão ' +
      'de envio é a pessoa, na página, com a própria mão.',
    pedirConfirmacao: true,
  };
}
