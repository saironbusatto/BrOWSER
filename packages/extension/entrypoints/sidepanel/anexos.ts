// Anexos do painel: leitura de arquivo, limite de tamanho, e a bandeja de chips.
//
// Extraído do main.ts porque tem regra de negócio própria (o que é aceito, o que é grande demais,
// como um nome de arquivo vira texto seguro) e porque era a parte do painel mais difícil de
// testar dentro do arquivo de 900 linhas.

import type { ArquivoAnexo } from '@browser/shared';
import { escapeHtml } from './escape';

export const TAMANHO_MAXIMO = 25 * 1024 * 1024; // 25 MB por arquivo
const EXTENSAO_TXT = /\.(xml|json|csv|txt|html|md)$/i;

/** Nome + tamanho legíveis para o chip. */
export function rotuloAnexo(arq: ArquivoAnexo): { icone: string; kb: string; nome: string } {
  const nome = arq.nome.toLowerCase();
  const icone = nome.endsWith('.xml') ? '📄' : nome.endsWith('.pdf') ? '📑' : nome.endsWith('.json') ? '📦' : '📎';
  return { icone, kb: `${(arq.tamanho / 1024).toFixed(1)} KB`, nome: arq.nome };
}

/** Decide se o arquivo entra como texto (lido aqui) ou como base64 (sobe bruto). */
export function ehArquivoTexto(nome: string, tipo: string): boolean {
  return EXTENSAO_TXT.test(nome) || tipo.startsWith('text/') || tipo.includes('xml') || tipo.includes('json');
}

export type ResultadoAnexo = { aceitos: ArquivoAnexo[]; recusados: { nome: string; motivo: string }[] };

/**
 * Prepara os anexos. Separar "aceitos" de "recusados" (em vez de só avisar) é o que permite ao
 * painel dizer *qual* arquivo passou do limite — o aviso antigo citava todos de uma vez.
 */
export function classificarArquivos(lista: { nome: string; tamanho: number; tipo: string }[]): ResultadoAnexo {
  const aceitos: ArquivoAnexo[] = [];
  const recusados: { nome: string; motivo: string }[] = [];
  for (const f of lista) {
    if (f.tamanho > TAMANHO_MAXIMO) {
      recusados.push({ nome: f.nome, motivo: `passa de ${TAMANHO_MAXIMO / 1024 / 1024} MB` });
      continue;
    }
    aceitos.push({ nome: f.nome, tipo: f.tipo, tamanho: f.tamanho });
  }
  return { aceitos, recusados };
}

/** HTML do chip. O nome vem do usuário: entra escapado em title e conteúdo. */
export function chipHtml(arq: ArquivoAnexo, indice: number): string {
  const { icone, kb, nome } = rotuloAnexo(arq);
  const seguro = escapeHtml(nome);
  return `
      <div class="attachment-chip" data-idx="${indice}">
        <span>${icone}</span>
        <span class="chip-name" title="${seguro}">${seguro}</span>
        <span class="chip-size">(${kb})</span>
        <button type="button" class="chip-remove" data-remove="${indice}" title="Remover anexo">✕</button>
      </div>
    `;
}

/** Monta a bandeja inteira. Vazio = esconde. */
export function bandejaHtml(anexos: ArquivoAnexo[]): string {
  if (anexos.length === 0) return '';
  return anexos.map(chipHtml).join('');
}

/** "3 arquivo(s) preparado(s)" / mensagem com os recusados. */
export function mensagemAnexos(aceitos: number, recusados: { nome: string; motivo?: string }[]): string | null {
  const partes: string[] = [];
  if (aceitos > 0) partes.push(aceitos === 1 ? '1 arquivo anexado' : `${aceitos} arquivos anexados`);
  if (recusados.length > 0)
    partes.push(`não deu para anexar ${recusados.map((r) => (r.motivo ? `${r.nome} (${r.motivo})` : r.nome)).join(', ')}`);
  const texto = partes.join('; ');
  return texto ? texto[0]!.toUpperCase() + texto.slice(1) : null;
}
