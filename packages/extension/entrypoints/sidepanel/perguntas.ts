// Card de pergunta da IA: o que a pessoa precisa responder para o pedido continuar.
//
// A IA chega até aqui quando falta um dado indispensável. É uma tela com regra própria (o que
// mostrar, o que juntar na resposta, quando o botão "Enviar" aparece) e estava enterrada no
// main.ts. O detalhe que motivou extrair: os nomes dos campos iam para um atributo `data-campo`
// já escapado e voltavam lidos do DOM *com as entidades*, então a chave enviada à IA não batia
// com o rótulo que a pessoa via na tela.

import { escapeHtml } from './escape';

export type Pergunta = {
  pedidoId: string;
  perguntaId: string;
  pergunta: string;
  campos?: string[];
  opcoes?: string[];
};

export type RespostaColetada = { texto: string; respostasCampos: Record<string, string> };

/** Um input por campo nomeado; sem campos, um input livre. */
export function temCampos(p: Pergunta): boolean {
  return !!p.campos?.length;
}

export function temOpcoes(p: Pergunta): boolean {
  return !!p.opcoes?.length;
}

/** Com opções, a pessoa clica e não digita: o botão de envio some. */
export function mostrarBotaoEnviar(p: Pergunta): boolean {
  return !temOpcoes(p);
}

export function camposHtml(campos: string[] | undefined): string {
  if (!campos?.length) return '';
  return `
      <div class="question-fields">
        ${campos
          .map(
            (c) => `
          <div class="question-field-row">
            <label class="question-field-label">${escapeHtml(c)}</label>
            <input type="text" class="question-field-input" data-campo="${escapeHtml(c)}" placeholder="Informe ${escapeHtml(c)}…" />
          </div>
        `,
          )
          .join('')}
      </div>
    `;
}

export function opcoesHtml(opcoes: string[] | undefined): string {
  if (!opcoes?.length) return '';
  return `
      <div class="question-options">
        ${opcoes
          .map((o) => `<button type="button" class="question-option-btn" data-opcao="${escapeHtml(o)}">${escapeHtml(o)}</button>`)
          .join('')}
      </div>
    `;
}

export function inputLivreHtml(p: Pergunta): string {
  if (temCampos(p) || temOpcoes(p)) return '';
  return `
      <div class="question-field-row">
        <input type="text" class="question-field-input free-answer" placeholder="Digite sua resposta…" />
      </div>
    `;
}

/**
 * Junta o que a pessoa digitou numa resposta para a IA.
 *
 * `respostasCampos` é o mapa de verdade (rótulo -> valor). `texto` é o resumo legível, para o caso
 * a IA leia só ele. Campo em branco vira "(em branco)" no resumo, para a IA não confundir "não
 * preenchido" com "não perguntado".
 */
export function juntarResposta(entradas: { campo?: string; valor: string }[]): RespostaColetada {
  const respostasCampos: Record<string, string> = {};
  const partes: string[] = [];
  for (const { campo, valor } of entradas) {
    if (campo) {
      respostasCampos[campo] = valor;
      partes.push(`${campo}: ${valor || '(em branco)'}`);
    } else if (valor) {
      partes.push(valor);
    }
  }
  return { texto: partes.join(', ') || 'Continuar sem dados', respostasCampos };
}

/** Opção escolhida: o rótulo é o valor, e não é uma resposta livre. */
export function respostaDeOpcao(opcao: string): RespostaColetada {
  return { texto: opcao, respostasCampos: {} };
}
