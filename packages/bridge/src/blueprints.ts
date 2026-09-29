import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AcaoGatilho, Campo, CampoBlueprint, SiteBlueprint } from '@browser/shared';
import { sanitizarBlueprint } from './sanitizar';

const CACHE_DIR = join(homedir(), '.config', 'browser-bridge', 'blueprints');
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/saironbusatto/BrOWSER/main/blueprints';
const TIMEOUT_FETCH_MS = 2500;

mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });

/**
 * Normaliza uma URL ou string de host para o nome padrão de arquivo de blueprint.
 * Ex: "http://localhost:5173/form" -> "localhost-5173"
 * Ex: "https://gemini.google.com/app/xyz?token=123" -> "gemini.google.com"
 */
export function normalizarDominio(urlOuHost: string): string {
  try {
    const url = new URL(urlOuHost.startsWith('http') ? urlOuHost : `http://${urlOuHost}`);
    const host = url.host;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return host.replace(':', '-');
    }
    return host.toLowerCase();
  } catch {
    return urlOuHost.replace(/[:\/\\?#]/g, '-').toLowerCase();
  }
}

/**
 * Busca o blueprint no cache local ou na pasta blueprints/ do repositório.
 */
export function carregarBlueprintLocal(dominio: string): SiteBlueprint | null {
  const norm = normalizarDominio(dominio);
  const caminhoCache = join(CACHE_DIR, `${norm}.json`);

  if (existsSync(caminhoCache)) {
    try {
      return JSON.parse(readFileSync(caminhoCache, 'utf8'));
    } catch {}
  }

  // Verifica pasta de blueprints local do projeto se existir
  const caminhoRepo = join(process.cwd(), 'blueprints', `${norm}.json`);
  if (existsSync(caminhoRepo)) {
    try {
      return JSON.parse(readFileSync(caminhoRepo, 'utf8'));
    } catch {}
  }

  return null;
}

/**
 * Busca o blueprint no repositório público do GitHub (Raw / CDN).
 * Se encontrar, grava no cache local para acesso instantâneo futuro.
 */
// Só pede ao GitHub o blueprint de um domínio que esteja no índice público. Sem isso, cada site
// novo virava uma requisição `.../{domínio}.json`, e o GitHub ficava sabendo onde o usuário navega.
const INDICE_CACHE = join(CACHE_DIR, '_indice.json');
const INDICE_VALIDADE_MS = 24 * 60 * 60_000;

async function dominiosPublicados(): Promise<string[]> {
  try {
    const cache = JSON.parse(readFileSync(INDICE_CACHE, 'utf8')) as { em: number; dominios: string[] };
    if (Date.now() - cache.em < INDICE_VALIDADE_MS) return cache.dominios;
  } catch {}
  try {
    const res = await fetch(`${GITHUB_RAW_BASE}/index.json`, { signal: AbortSignal.timeout(TIMEOUT_FETCH_MS) });
    if (!res.ok) return [];
    const dominios = ((await res.json()) as { dominios?: unknown }).dominios;
    if (!Array.isArray(dominios)) return [];
    writeFileSync(INDICE_CACHE, JSON.stringify({ em: Date.now(), dominios }), { mode: 0o600 });
    return dominios as string[];
  } catch {
    return [];
  }
}

export async function buscarBlueprintRemoto(dominio: string): Promise<SiteBlueprint | null> {
  const norm = normalizarDominio(dominio);
  if (!(await dominiosPublicados()).includes(norm)) return null;
  const url = `${GITHUB_RAW_BASE}/${norm}.json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_FETCH_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = (await res.json()) as SiteBlueprint;
    if (data && data.dominio && Array.isArray(data.campos)) {
      salvarBlueprintLocal(data);
      return data;
    }
  } catch {}

  return null;
}

/**
 * Obtém blueprint com estratégia híbrida:
 * 1. Cache local em disco (instantâneo ~1ms)
 * 2. Repositório comunitário no GitHub Raw (~200ms)
 */
export async function obterBlueprint(urlOuDominio: string): Promise<SiteBlueprint | null> {
  const norm = normalizarDominio(urlOuDominio);
  const local = carregarBlueprintLocal(norm);
  if (local) return local;

  return await buscarBlueprintRemoto(norm);
}

/**
 * Salva um blueprint no cache local do usuário. Único ponto de gravação: tudo que chega
 * (auto-aprendizado, telemetria passiva, GitHub) passa pelo sanitizador aqui.
 */
export function salvarBlueprintLocal(blueprint: SiteBlueprint): void {
  const norm = normalizarDominio(blueprint.dominio);
  const caminho = join(CACHE_DIR, `${norm}.json`);
  try {
    writeFileSync(caminho, JSON.stringify(sanitizarBlueprint(blueprint), null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {}
}

/**
 * Mescla um blueprint recém-aprendido com um existente (se houver),
 * evitando duplicação de campos e acumulando novos gatilhos e tipos esperados.
 */
export function mesclarBlueprints(existente: SiteBlueprint, novo: SiteBlueprint): SiteBlueprint {
  const mapaCampos = new Map<string, CampoBlueprint>();
  for (const c of existente.campos) {
    mapaCampos.set(c.idSemantico || c.rotulo, c);
  }
  for (const c of novo.campos) {
    const chave = c.idSemantico || c.rotulo;
    const anterior = mapaCampos.get(chave);
    if (!anterior) {
      mapaCampos.set(chave, c);
    } else {
      mapaCampos.set(chave, {
        ...anterior,
        ...c,
        tipoEsperado: c.tipoEsperado || anterior.tipoEsperado,
        opcoes: c.opcoes && c.opcoes.length > 0 ? c.opcoes : anterior.opcoes,
      });
    }
  }

  const mapaGatilhos = new Map<string, AcaoGatilho>();
  for (const g of existente.gatilhos ?? []) {
    mapaGatilhos.set(g.seletorOuNome, g);
  }
  for (const g of novo.gatilhos ?? []) {
    mapaGatilhos.set(g.seletorOuNome, g);
  }

  return {
    ...existente,
    titulo: novo.titulo || existente.titulo,
    atualizadoEm: new Date().toISOString(),
    campos: Array.from(mapaCampos.values()),
    gatilhos: Array.from(mapaGatilhos.values()),
  };
}

/**
 * Salva ou mescla um blueprint no cache local do usuário.
 */
export function salvarOuAtualizarBlueprint(novo: SiteBlueprint): SiteBlueprint {
  const existente = carregarBlueprintLocal(novo.dominio);
  const final = existente ? mesclarBlueprints(existente, novo) : novo;
  salvarBlueprintLocal(final);
  return final;
}

/**
 * Sanitiza e gera um blueprint a partir do estado da página lida pelo BrOWSER.
 * GARANTIA DE PRIVACIDADE:
 * - Remove 100% dos valores digitados ou sensíveis.
 * - Captura apenas metadados estruturais do DOM (rótulos, papéis ARIA, seletores).
 */
export function gerarBlueprintAnonimizado(dados: {
  url: string;
  titulo: string;
  campos: Campo[];
  gatilhos?: AcaoGatilho[];
}): SiteBlueprint {
  const dominio = normalizarDominio(dados.url);

  // Mapeia os campos sem nenhum dado do usuário
  const camposMapeados: CampoBlueprint[] = dados.campos.map((c) => {
    const rotuloLimpo = (c.nome || '').trim();
    const idSemantico = gerarIdSemantico(rotuloLimpo || c.papel);

    const bp: CampoBlueprint = {
      idSemantico,
      rotulo: rotuloLimpo || c.papel,
      papel: c.papel,
      seletorAcessivel: rotuloLimpo || c.papel,
    };

    if (c.obrigatorio) bp.obrigatorio = true;
    if (c.opcoes && c.opcoes.length > 0) bp.opcoes = c.opcoes;

    // Detecta tipo esperado a partir do rótulo
    const rotuloLower = rotuloLimpo.toLowerCase();
    if (rotuloLower.includes('cnpj')) bp.tipoEsperado = 'cnpj';
    else if (rotuloLower.includes('cpf')) bp.tipoEsperado = 'cpf';
    else if (rotuloLower.includes('email') || rotuloLower.includes('e-mail')) bp.tipoEsperado = 'email';
    else if (rotuloLower.includes('telefone') || rotuloLower.includes('celular') || rotuloLower.includes('fone')) bp.tipoEsperado = 'telefone';
    else if (rotuloLower.includes('data') || rotuloLower.includes('nascimento') || rotuloLower.includes('vencimento')) bp.tipoEsperado = 'data';
    else if (rotuloLower.includes('cep')) bp.tipoEsperado = 'cep';
    else if (rotuloLower.includes('valor') || rotuloLower.includes('preço') || rotuloLower.includes('preco')) bp.tipoEsperado = 'moeda';

    return bp;
  });

  return sanitizarBlueprint({
    $schema: 'https://browser.ai/schemas/blueprint.v1.json',
    dominio,
    versao: '1.0.0',
    titulo: dados.titulo.replace(/[\n\r\t]/g, ' ').trim() || dominio,
    atualizadoEm: new Date().toISOString(),
    gatilhos: dados.gatilhos ?? [],
    campos: camposMapeados,
  });
}

function gerarIdSemantico(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'campo';
}

// Papéis que o mapa precisa nomear. `link` ficou de fora de propósito: no Spotify são 237 de 596
// linhas (40%) e no AliExpress 76 de 92 (83%), e nenhum deles é preenchível — `preencher` nunca
// os usa. Botão e item de menu continuam, porque `clicar` é como a IA navega. Links a IA lê ao
// vivo em ler_campos, que é a fonte da verdade de qualquer forma.
const LINK = 'link';
const ORCAMENTO_CAMPOS = 6_000; // folga dentro de AGY_MAX_STDIN (20k), contando o resto do prompt

/**
 * Formata um blueprint em Markdown para ser injetado nas instruções da IA.
 *
 * O mapa é cortado por orçamento, não por site: o Spotify sozinho dava 25k caracteres e estourava
 * o AGY_MAX_STDIN, o que jogava o pedido inteiro num arquivo e custava uma tool call só para ler o
 * que já tinha vindo no prompt. Cortar por orçamento é o que resolve sem precisar saber, antes,
 * quantos campos cada site tem.
 */
export function formatarBlueprintParaIa(blueprint: SiteBlueprint): string {
  let md = `\n---\n### 🗺️ MAPA DO SITE CONHECIDO (SITE BLUEPRINT)\n`;
  md += `**Domínio:** \`${blueprint.dominio}\` (${blueprint.titulo}) - Versão ${blueprint.versao}\n`;

  if (blueprint.gatilhos && blueprint.gatilhos.length > 0) {
    md += `\n**Gatilhos e menus conhecidos:**\n`;
    for (const g of blueprint.gatilhos) {
      md += `- **${g.descricao}**: disparador \`${g.seletorOuNome}\` (${g.tipo})\n`;
    }
  }

  const linha = (c: CampoBlueprint) => {
    const obr = c.obrigatorio ? ' *(obrigatório)*' : '';
    const tipo = c.tipoEsperado ? ` [tipo: ${c.tipoEsperado}]` : '';
    return `- **${c.rotulo}** (${c.papel})${tipo}${obr}\n`;
  };
  // Prioridade: preenchível > obrigatório > o resto. O que sobra é o que a IA consegue usar.
  const ordenados = [...blueprint.campos].sort((a, b) => rank(a) - rank(b));
  const cabem: string[] = [];
  const cortados: string[] = [];
  let gasto = 0;
  for (const c of ordenados) {
    const l = linha(c);
    if (gasto + l.length > ORCAMENTO_CAMPOS) {
      cortados.push(c.rotulo);
      continue;
    }
    gasto += l.length;
    cabem.push(l);
  }

  md += `\n**Campos estruturados na página:**\n`;
  md += cabem.join('');
  if (cortados.length > 0) {
    // Diz o que faltou em vez de truncar calado: mapa incompleto sem aviso é pior que mapa grande,
    // porque a IA passa a achar que o campo não existe.
    md += `- _e mais ${cortados.length} campos não listados (links e duplicados) — use ler_campos_\n`;
  }
  md += `\n*Dica para o BrOWSER:* Use estes campos e gatilhos para guiar a navegação rapidamente.\n---\n`;
  return md;
}

function rank(c: CampoBlueprint): number {
  if (c.papel === LINK) return 2;
  return c.obrigatorio ? 0 : 1;
}
