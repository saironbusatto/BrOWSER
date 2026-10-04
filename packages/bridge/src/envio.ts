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
import type { Campo, Ponto } from '@browser/shared';

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

// ---- Clique por ponto (clicar_ponto) ----
// Existe para a tela desenhada (grade e gráfico de planilha, mapa, canvas), que não tem ref. Sem
// trava, viraria um atalho por cima da guarda acima: bastava apontar para o botão "Enviar".

const TAGS_COM_REF = new Set(['a', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'option']);
const PAPEIS_COM_REF = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'checkbox',
  'radio',
  'switch',
  'option',
  'combobox',
  'textbox',
  'searchbox',
]);

/** Recusa pronta para devolver à IA, ou null quando o clique no ponto pode seguir. */
export function recusaPonto(p: Ponto): { ok: false; motivo: string } | null {
  const controle = p.cadeia.find((n) => TAGS_COM_REF.has(n.tag) || PAPEIS_COM_REF.has(n.papel ?? '') || n.editavel);
  if (controle) {
    return {
      ok: false,
      motivo:
        `Nesse ponto há um controle da página (${controle.papel || controle.tag}), não uma área desenhada. ` +
        'clicar_ponto não clica em botão, link nem campo: chame ler_campos e use clicar (ou preencher) com a ref.',
    };
  }
  // Botão feito de <div>, sem papel: não aparece em ler_campos, então a guarda olha o texto dele.
  const nome = motivoEnvioIrreversivel({ nome: p.texto, papel: 'button' });
  return nome ? recusaEnvio(nome) : null;
}
