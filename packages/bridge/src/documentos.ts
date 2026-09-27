import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArquivoAnexo } from '@browser/shared';

export type DadosExtraidos = {
  nomeArquivo: string;
  tipo: string;
  resumo: string;
  camposIdentificados: Record<string, string>;
};

/**
 * Extrator e normalizador nativo de documentos (XML, JSON, CSV, TXT).
 * Executa em poucos milissegundos sem sobrecarga de rede.
 */
export function extrairDadosDocumento(arquivo: ArquivoAnexo): DadosExtraidos {
  const campos: Record<string, string> = {};
  let resumo = '';

  const conteudo = arquivo.conteudoTexto ?? '';

  if (arquivo.tipo.includes('xml') || arquivo.nome.toLowerCase().endsWith('.xml')) {
    // Parser especializado para NF-e / NFS-e ou XMLs genéricos
    resumo = extrairXml(conteudo, campos);
  } else if (arquivo.tipo.includes('json') || arquivo.nome.toLowerCase().endsWith('.json')) {
    try {
      const obj = JSON.parse(conteudo);
      resumo = 'Arquivo JSON estruturado com sucesso.';
      achatarObjeto(obj, '', campos);
    } catch {
      resumo = 'Arquivo JSON contém dados brutos.';
    }
  } else if (arquivo.nome.toLowerCase().endsWith('.csv')) {
    resumo = extrairCsv(conteudo, campos);
  } else if (arquivo.conteudoTexto) {
    resumo = `Texto extraído (${arquivo.conteudoTexto.length} caracteres).`;
  } else if (arquivo.dadosBase64) {
    resumo = `Arquivo binário (${arquivo.tipo}, ${Math.round(arquivo.tamanho / 1024)} KB) anexado.`;
  }

  return {
    nomeArquivo: arquivo.nome,
    tipo: arquivo.tipo,
    resumo,
    camposIdentificados: campos,
  };
}

function extrairXml(xml: string, campos: Record<string, string>): string {
  // Tags típicas de NF-e (Nota Fiscal Eletrônica Brasileira)
  const tagsNfe: Record<string, string> = {
    nNF: 'Número da Nota',
    dhEmi: 'Data de Emissão',
    natOp: 'Natureza da Operação',
    vNF: 'Valor Total da Nota',
    vProd: 'Valor dos Produtos',
    vDesc: 'Valor de Desconto',
    vFrete: 'Valor do Frete',
    xNome: 'Razão Social / Nome',
    CNPJ: 'CNPJ',
    CPF: 'CPF',
    xFant: 'Nome Fantasia',
    enderEmit: 'Endereço Emitente',
    xLgr: 'Logradouro',
    nro: 'Número',
    xBairro: 'Bairro',
    xMun: 'Município',
    UF: 'UF',
    CEP: 'CEP',
    fone: 'Telefone',
    IE: 'Inscrição Estadual',
    nFat: 'Número da Fatura',
    vOrig: 'Valor Original',
    vLiq: 'Valor Líquido',
    dVenc: 'Data de Vencimento',
  };

  let encontradas = 0;
  for (const [tag, label] of Object.entries(tagsNfe)) {
    const regex = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, 'g');
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = regex.exec(xml)) !== null) {
      const val = match[1].trim();
      const key = idx === 0 ? label : `${label} (${idx + 1})`;
      campos[key] = val;
      encontradas++;
      idx++;
      if (idx > 3) break; // limite de repetições
    }
  }

  if (encontradas > 0) {
    return `XML identificado como documento fiscal com ${encontradas} campos estruturados extraídos.`;
  }

  // XML Genérico: extrai nós principais
  const genericoRegex = /<([a-zA-Z0-9_\-]+)>([^<]+)<\/\1>/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = genericoRegex.exec(xml)) !== null && count < 25) {
    const val = m[2].trim();
    if (val && !val.includes('\n')) {
      campos[m[1]] = val;
      count++;
    }
  }

  return `XML estruturado com ${count} nós principais extraídos.`;
}

function extrairCsv(csv: string, campos: Record<string, string>): string {
  const linhas = csv.split('\n').filter(l => l.trim().length > 0);
  if (linhas.length === 0) return 'CSV vazio';

  const sep = linhas[0].includes(';') ? ';' : ',';
  const cabecalhos = linhas[0].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));

  if (linhas.length > 1) {
    const primeiraLinha = linhas[1].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    cabecalhos.forEach((col, i) => {
      if (primeiraLinha[i]) {
        campos[col] = primeiraLinha[i];
      }
    });
    return `CSV com ${linhas.length - 1} registro(s) e ${cabecalhos.length} coluna(s). Primeira linha mapeada.`;
  }

  return `CSV com colunas: ${cabecalhos.join(', ')}`;
}

function achatarObjeto(obj: any, prefixo: string, saida: Record<string, string>) {
  if (typeof obj !== 'object' || obj === null) return;
  for (const [k, v] of Object.entries(obj)) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      saida[chave] = String(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      achatarObjeto(v, chave, saida);
    }
  }
}

// O prompt agora vai por stdin/arquivo (sem limite de linha de comando): texto de anexo cabe
// inteiro até aqui. Antes era 1.500, e dado depois disso sumia.
const MAX_TEXTO_ANEXO = 60_000;
const DIR_ANEXOS = 'anexos';

/**
 * Grava anexos binários (PDF, imagem) no diretório de trabalho da IA para ela ler direto
 * (Gemini e Claude leem PDF/imagem nativamente). Retorna nome original -> caminho relativo.
 */
export function salvarAnexosBinarios(dirTrabalho: string, arquivos?: ArquivoAnexo[]): Record<string, string> {
  const caminhos: Record<string, string> = {};
  const binarios = (arquivos ?? []).filter((a) => a.dadosBase64 && !a.conteudoTexto);
  if (!binarios.length) return caminhos;
  mkdirSync(join(dirTrabalho, DIR_ANEXOS), { recursive: true, mode: 0o700 });
  binarios.forEach((a, i) => {
    // Nome vem do usuário/página: nada de "../" nem separadores de caminho.
    const seguro = a.nome.replace(/[^\w.\- ]+/g, '_').replace(/\.{2,}/g, '_').replace(/^\.+/, '') || 'anexo';
    const relativo = `${DIR_ANEXOS}/${i}-${seguro}`;
    const base64 = a.dadosBase64!.replace(/^data:[^,]*,/, '');
    writeFileSync(join(dirTrabalho, relativo), Buffer.from(base64, 'base64'), { mode: 0o600 });
    caminhos[a.nome] = relativo;
  });
  return caminhos;
}

export function apagarAnexos(dirTrabalho: string): void {
  rmSync(join(dirTrabalho, DIR_ANEXOS), { recursive: true, force: true });
}

/**
 * Formata os dados de todos os arquivos anexados em uma seção Markdown rica
 * pronta para ser consumida diretamente pela IA.
 */
export function formatarContextoArquivos(arquivos?: ArquivoAnexo[], caminhos: Record<string, string> = {}): string {
  if (!arquivos || arquivos.length === 0) return '';

  const secoes = arquivos.map(arq => {
    const extraido = extrairDadosDocumento(arq);
    let texto = `#### 📎 Arquivo: ${arq.nome} (${arq.tipo}, ${(arq.tamanho / 1024).toFixed(1)} KB)\n`;
    texto += `*Status da extração:* ${extraido.resumo}\n`;

    const chaves = Object.keys(extraido.camposIdentificados);
    const caminho = caminhos[arq.nome];
    if (caminho) {
      texto += `\n**Leia o arquivo \`${caminho}\` (no diretório de trabalho) para extrair os dados.**\n`;
    } else if (chaves.length > 0) {
      texto += `\n**Dados estruturados extraídos automaticamente:**\n`;
      for (const k of chaves) {
        texto += `- **${k}**: ${extraido.camposIdentificados[k]}\n`;
      }
    } else if (arq.conteudoTexto) {
      const amostra = arq.conteudoTexto.slice(0, MAX_TEXTO_ANEXO);
      texto += `\n**Conteúdo textual:**\n\`\`\`\n${amostra}${arq.conteudoTexto.length > MAX_TEXTO_ANEXO ? '\n... [conteúdo truncado]' : ''}\n\`\`\`\n`;
    }

    return texto;
  });

  return `\n---\n### 📂 DADOS DE ARQUIVOS ANEXADOS PELO USUÁRIO\n${secoes.join('\n---\n')}\n---\n`;
}
