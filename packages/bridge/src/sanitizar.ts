// Separa ESTRUTURA do site (o mapa: botões, menus, campos) de CONTEÚDO do usuário
// (conta, endereço, resultados de busca). Todo blueprint passa por aqui antes de ser gravado.
import type { AcaoGatilho, CampoBlueprint, SiteBlueprint } from '@browser/shared';

// Rótulo maior que isso é conteúdo (resultado de busca, post, mensagem), não um controle do site.
const MAX_ROTULO = 80;
const MAX_OPCAO = 60;
const MAX_OPCOES = 50;

// Ordem importa: CNPJ antes de CPF, CPF antes de CEP.
const MASCARAS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]'],
  [/\b\d{5}-?\d{3}\b/g, '[cep]'],
  [/(\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]'],
  [/\b\d{6,}\b/g, '[número]'],
];
const URL = /https?:\/\/|\bwww\.\S+\.\S+/i;
const PAGINACAO = /^(page|p[áa]gina|pag\.?)?\s*\d{1,3}$/i;
const MASCARADO = /\[(email|cnpj|cpf|cep|telefone|número)\]/;

function mascarar(texto: string): string {
  return MASCARAS.reduce((t, [re, rep]) => t.replace(re, rep), texto);
}

/** Rótulo seguro para o mapa, ou null quando o texto é conteúdo do usuário. */
export function sanitizarRotulo(bruto: string | null | undefined): string | null {
  // Rótulo ausente não é erro: quem chama (inclusive o validador de arquivo remoto) descarta o
  // campo. Antes, um `undefined` derrubava a ponte inteira.
  if (typeof bruto !== 'string') return null;
  const texto = bruto.replace(/\s+/g, ' ').trim();
  if (!texto) return null;
  if (texto.length > MAX_ROTULO || URL.test(texto)) return null; // resultado/conteúdo, não controle
  if (PAGINACAO.test(texto)) return 'paginação';

  const m = mascarar(texto);
  // Controle de conta ("Conta do Google: Fulano (fulano@x.com)"): mantém o controle, some a pessoa.
  if (m.includes('[email]')) {
    const prefixo = m.split(/[:(]/)[0].trim();
    return prefixo && !MASCARADO.test(prefixo) ? `${prefixo}: [conta]` : '[conta]';
  }
  // Qualquer coisa com CEP é endereço (bairro/cidade junto): vira um marcador só.
  if (m.includes('[cep]')) return '[localização]';
  return m;
}

function idSemantico(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'campo'
  );
}

function sanitizarOpcoes(opcoes?: string[]): string[] | undefined {
  if (!opcoes?.length || opcoes.length > MAX_OPCOES) return undefined;
  // Opção com dado pessoal (endereço salvo, conta, documento) é descartada, não mascarada.
  const limpas = opcoes.map((o) => o.trim()).filter((o) => o && o.length <= MAX_OPCAO && !URL.test(o) && mascarar(o) === o);
  return limpas.length ? limpas : undefined;
}

function sanitizarCampo(c: CampoBlueprint): CampoBlueprint | null {
  const rotulo = sanitizarRotulo(c.rotulo);
  if (!rotulo) return null;
  const { opcoes: _o, ...resto } = c;
  const opcoes = sanitizarOpcoes(c.opcoes);
  return {
    ...resto,
    idSemantico: idSemantico(rotulo),
    rotulo,
    seletorAcessivel: sanitizarRotulo(c.seletorAcessivel) ?? rotulo,
    ...(opcoes && { opcoes }),
  };
}

function sanitizarGatilho(g: AcaoGatilho): AcaoGatilho | null {
  const descricao = sanitizarRotulo(g.descricao);
  const seletorOuNome = sanitizarRotulo(g.seletorOuNome);
  return descricao && seletorOuNome ? { ...g, descricao, seletorOuNome } : null;
}

// "nobara wallpaper - Pesquisa Google" -> "Pesquisa Google"; a busca do usuário fica de fora.
function sanitizarTitulo(titulo: string, dominio: string): string {
  const ultimo = titulo.split(/\s[-–|·]\s/).at(-1) ?? '';
  return sanitizarRotulo(ultimo) ?? dominio;
}

export function sanitizarBlueprint(bp: SiteBlueprint): SiteBlueprint {
  const vistos = new Set<string>();
  const campos = bp.campos.map(sanitizarCampo).filter((c): c is CampoBlueprint => {
    if (!c) return false;
    const chave = `${c.papel}:${c.idSemantico}`; // "Traduzir esta página" x10 vira um só
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  const gatilhos = (bp.gatilhos ?? []).map(sanitizarGatilho).filter((g): g is AcaoGatilho => g !== null);
  return { ...bp, titulo: sanitizarTitulo(bp.titulo, bp.dominio), campos, gatilhos };
}
