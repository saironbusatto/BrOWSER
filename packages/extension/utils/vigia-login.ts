import type { MensagemExtensao } from '@browser/shared';
import { codigoDaUrl, codigoNoTexto, pareceCodigo, redirectDe } from './codigo-oauth';

// ---- Login oficial sem terminal: a aba de callback entrega o código sozinha ----
//
// O OAuth do Google/Claude não é device-code nativo: o CLI imprime uma URL com redirect_uri
// apontando para uma página web. Depois do consentimento essa página mostra (ou traz na query)
// o authorization code que o CLI espera no stdin. Em vez de pedir pra pessoa copiar e colar, a
// extensão lê essa aba e entrega o código na ponte. É a aba dela, na sessão dela, na máquina dela.

// redirect_uri -> ia. Vive no storage.session porque o login OAuth leva mais de 30 s com certeza:
// se ficasse só em memória, o worker morreria no meio da autenticação e o código nunca chegaria
// à ponte.
const vigias = new Map<string, string>();

const SESSAO_VIGIAS = 'vigias';
const salvarVigias = () => chrome.storage.session.set({ [SESSAO_VIGIAS]: [...vigias] }).catch(() => {});
async function carregarVigias() {
  if (vigias.size) return;
  const r = await chrome.storage.session.get(SESSAO_VIGIAS).catch(() => ({}) as Record<string, unknown>);
  for (const [redirect, ia] of (r[SESSAO_VIGIAS] as [string, string][] | undefined) ?? []) vigias.set(redirect, ia);
}

/** Lê o código de autorização na página de callback. Roda dentro da aba. */
function rasparCodigo(): string | null {
  const daUrl = codigoDaUrl(location.href);
  if (daUrl) return daUrl;
  for (const el of document.querySelectorAll('input')) {
    const v = (el.value || el.textContent || '').trim();
    if (pareceCodigo(v)) return v;
  }
  for (const sel of ['code', 'pre', '[data-code]', '[data-testid*="code" i]', '[class*="code" i]', '[id*="code" i]']) {
    for (const el of document.querySelectorAll(sel)) {
      const achado = codigoNoTexto(el.textContent || '');
      if (achado) return achado;
    }
  }
  return null;
}

export function armarVigia(ia: string, urlAuth: string, pedeCodigo: boolean) {
  if (!pedeCodigo) return; // o codex entrega o código no painel, não numa página
  const redirect = redirectDe(urlAuth);
  if (!redirect) return;
  vigias.set(redirect, ia);
  salvarVigias();
}

async function entregarCodigo(tabId: number, base: string, ia: string, entregar: (m: MensagemExtensao) => void) {
  let codigo: string | null = null;
  // A página pode renderizar o código depois do load; uma segunda tentativa cobre isso.
  for (const espera of [0, 1200]) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    codigo = await chrome.scripting
      .executeScript({ target: { tabId }, func: rasparCodigo })
      .then((r) => (r[0]?.result as string | null) ?? null)
      .catch(() => null);
    if (codigo) break;
  }
  vigias.delete(base);
  await salvarVigias();
  if (!codigo) return;
  // O código não é logado nem gravado: só viaja aba -> ponte -> stdin do CLI.
  entregar({ tipo: 'login_codigo', ia, codigo } as MensagemExtensao);
  await chrome.tabs.remove(tabId).catch(() => {});
}

/** Aba terminou de carregar: se é o callback de um login em andamento, entrega o código à ponte. */
export async function vigiarCallback(tabId: number, url: string, entregar: (m: MensagemExtensao) => void) {
  await carregarVigias(); // o worker pode ter morrido no meio do login: recarrega antes de desistir
  for (const [redirect, ia] of vigias) {
    if (!url.startsWith(redirect.split('?')[0]!)) continue;
    await entregarCodigo(tabId, redirect, ia, entregar);
    return;
  }
}
