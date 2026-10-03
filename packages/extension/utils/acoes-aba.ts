// Nível 1: o que um humano faz no navegador, a IA também faz — navegar, voltar, trocar de aba,
// ver a tela, esperar, teclar e rolar. Fica fora do background.ts para ele não passar das 800
// linhas; o background entrega o que só ele sabe (a aba alvo, o CDP, a troca de alvo).
//
// Quem decide PARA ONDE navegar é a ponte (navegacao.ts). Aqui é a segunda trava: nada que não seja
// http/https chega ao chrome.tabs.

import type { InfoAba, Tecla } from '@browser/shared';
import { abasDoGrupo, noGrupo, trazerParaOGrupo } from './grupo-abas';

export type DepsAba = {
  abaAlvo: () => Promise<number>;
  trocarAlvo: (tabId: number) => Promise<void>;
  cdp: <T = any>(method: string, params?: Record<string, unknown>) => Promise<T>;
  semDebugger: (tabId: number) => boolean;
};

// Abaixo dos 30 s do `enviar` da ponte: senão a ponte desiste antes e a resposta da aba se perde.
const TIMEOUT_NAVEGACAO_MS = 25_000;
const ESPERA_PADRAO_S = 5;
const ESPERA_MAXIMA_S = 15;
const INTERVALO_ESPERA_MS = 400;
const ID_TEIA = 'browser-teia-host'; // utils/teia.ts
const MAX_LINKS = 3000;

const ehWeb = (url: string | undefined) => /^https?:\/\//i.test(url ?? '');

function exigirWeb(url: string) {
  if (!ehWeb(url)) throw new Error(`só páginas http/https: ${url.slice(0, 80)}`);
}

/** Espera a aba carregar. O listener sempre sai: se nunca completar, um timer encerra. */
export function esperarAbaCarregar(tabId: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const sair = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(ouvir);
      resolve();
    };
    const ouvir = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') sair();
    };
    // Sem teto, uma aba que nunca carrega deixava o listener registrado para sempre — e cada
    // navegação empilhava mais um.
    const timer = setTimeout(sair, TIMEOUT_NAVEGACAO_MS);
    chrome.tabs.onUpdated.addListener(ouvir);
  });
}

export async function infoAba(tabId: number): Promise<InfoAba> {
  const t = await chrome.tabs.get(tabId);
  return { url: t.url ?? '', titulo: t.title ?? '' };
}

/** O ouvinte entra ANTES da ação: uma página rápida podia completar antes de ele existir. */
async function agirECarregar(tabId: number, acao: () => Promise<unknown>): Promise<InfoAba> {
  const carregou = esperarAbaCarregar(tabId);
  await acao();
  await carregou;
  return infoAba(tabId);
}

export async function navegar(d: DepsAba, url: string): Promise<InfoAba> {
  exigirWeb(url);
  const tabId = await d.abaAlvo();
  return agirECarregar(tabId, () => chrome.tabs.update(tabId, { url }));
}

export async function voltar(d: DepsAba): Promise<InfoAba> {
  const tabId = await d.abaAlvo();
  return agirECarregar(tabId, () => chrome.tabs.goBack(tabId));
}

/** Só o grupo da IA. Das abas da pessoa vai só a contagem: título pode ser assunto de e-mail. */
export async function listarAbas(d: DepsAba) {
  // Sem exigir alvo válido: se a pessoa tirou a aba da vez do grupo, listar é justamente como a IA
  // acha outra aba do grupo para continuar.
  const alvo = await d.abaAlvo().catch(() => undefined);
  const grupo = await abasDoGrupo();
  const todas = await chrome.tabs.query({ windowId: grupo[0]?.windowId ?? chrome.windows.WINDOW_ID_CURRENT });
  return {
    abas: grupo.filter((t) => t.id !== undefined).map((t) => ({ id: t.id!, url: t.url ?? '', titulo: t.title ?? '', alvo: t.id === alvo })),
    foraDoGrupo: todas.length - grupo.length,
  };
}

const FORA_DO_GRUPO = 'essa aba é da pessoa (fora do grupo BrOWSER). Se ela quiser que você use, ela arrasta a aba para dentro do grupo.';

export async function abrirAba(d: DepsAba, url: string): Promise<InfoAba & { id: number }> {
  exigirWeb(url);
  const tab = await chrome.tabs.create({ url, active: true });
  await trazerParaOGrupo(tab.id!); // o que a IA abre é dela
  await esperarAbaCarregar(tab.id!);
  await d.trocarAlvo(tab.id!);
  return { id: tab.id!, ...(await infoAba(tab.id!)) };
}

export async function usarAba(d: DepsAba, id: number): Promise<InfoAba> {
  if (!(await noGrupo(id))) throw new Error(FORA_DO_GRUPO);
  const tab = await chrome.tabs.get(id);
  exigirWeb(tab.url ?? '');
  // Fica na frente: a pessoa precisa ver em que aba a IA está mexendo.
  await chrome.tabs.update(id, { active: true });
  await d.trocarAlvo(id);
  return infoAba(id);
}

/** Fecha uma aba do grupo. Se era a da vez, a IA passa para outra do grupo; a última não fecha. */
export async function fecharAba(d: DepsAba, id: number): Promise<{ ok: true }> {
  if (!(await noGrupo(id))) throw new Error(FORA_DO_GRUPO);
  if ((await d.abaAlvo().catch(() => undefined)) === id) {
    const outra = (await abasDoGrupo()).find((t) => t.id !== id && t.id !== undefined);
    if (!outra) throw new Error('é a última aba do grupo; abra outra antes de fechar esta');
    await chrome.tabs.update(outra.id!, { active: true });
    await d.trocarAlvo(outra.id!);
  }
  await chrome.tabs.remove(id);
  return { ok: true };
}

function mostrarTeia(tabId: number, visivel: boolean) {
  return chrome.scripting
    .executeScript({
      target: { tabId },
      func: (id: string, v: boolean) => {
        const el = document.getElementById(id);
        if (el) el.style.visibility = v ? '' : 'hidden';
      },
      args: [ID_TEIA, visivel],
    })
    .catch(() => {});
}

/** Screenshot do que está visível, sem o efeito da teia por cima (a IA veria a teia, não a página). */
export async function verTela(d: DepsAba): Promise<{ mime: string; base64: string }> {
  const tabId = await d.abaAlvo();
  await mostrarTeia(tabId, false);
  try {
    if (!d.semDebugger(tabId)) {
      const r = await d.cdp<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
      return { mime: 'image/jpeg', base64: r.data };
    }
    // Sem debugger (política de empresa, extensão de segurança): só dá para fotografar a aba da frente.
    const { windowId } = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 60 });
    return { mime: 'image/jpeg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    await mostrarTeia(tabId, true);
  }
}

async function naPagina<A extends unknown[], R>(tabId: number, func: (...a: A) => R, args: A): Promise<R> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return r?.result as R;
}

/** Espera um texto aparecer (SPA que carrega depois) ou só o tempo pedido. Teto de 15 s. */
export async function esperar(d: DepsAba, texto?: string, segundos?: number): Promise<{ achou: boolean; esperouMs: number }> {
  const tabId = await d.abaAlvo();
  const teto = Math.min(Math.max(segundos ?? ESPERA_PADRAO_S, 1), ESPERA_MAXIMA_S) * 1000;
  const t0 = Date.now();
  const procurado = texto?.trim().toLowerCase();
  while (Date.now() - t0 < teto) {
    if (procurado) {
      const tem = await naPagina(tabId, (p: string) => (document.body?.innerText ?? '').toLowerCase().includes(p), [procurado]).catch(
        () => false, // página no meio da navegação: tenta de novo
      );
      if (tem) return { achou: true, esperouMs: Date.now() - t0 };
    }
    await new Promise((r) => setTimeout(r, INTERVALO_ESPERA_MS));
  }
  return { achou: !procurado, esperouMs: Date.now() - t0 };
}

// key, code e virtual key code: o CDP precisa dos três para o site receber a tecla como real.
const CODIGOS: Record<Tecla, number> = {
  Tab: 9,
  Escape: 27,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  PageUp: 33,
  PageDown: 34,
  Home: 36,
  End: 35,
  Backspace: 8,
};

export async function teclar(d: DepsAba, tecla: Tecla): Promise<{ ok: true }> {
  const vk = CODIGOS[tecla];
  if (vk === undefined) throw new Error(`tecla não permitida: ${tecla}`);
  const tabId = await d.abaAlvo();
  // Evento sintético por script é ignorado pela maioria dos sites (isTrusted=false): sem o
  // debugger não há tecla de verdade, e é melhor dizer isso do que fingir.
  if (d.semDebugger(tabId)) throw new Error('teclar precisa do modo completo; esta aba está sem acesso de depuração');
  for (const type of ['rawKeyDown', 'keyUp']) {
    await d.cdp('Input.dispatchKeyEvent', { type, key: tecla, code: tecla, windowsVirtualKeyCode: vk });
  }
  return { ok: true };
}

export async function rolar(d: DepsAba, direcao: 'cima' | 'baixo' | 'topo' | 'fim') {
  const tabId = await d.abaAlvo();
  return naPagina(
    tabId,
    (dir: string) => {
      const passo = window.innerHeight * 0.85;
      if (dir === 'topo') window.scrollTo(0, 0);
      else if (dir === 'fim') window.scrollTo(0, document.documentElement.scrollHeight);
      else window.scrollBy(0, dir === 'cima' ? -passo : passo);
      return { y: Math.round(window.scrollY), alturaTotal: document.documentElement.scrollHeight };
    },
    [direcao],
  );
}

export async function links(d: DepsAba): Promise<{ links: string[] }> {
  const tabId = await d.abaAlvo();
  const lista = await naPagina(tabId, (max: number) => [...new Set(Array.from(document.links, (a) => a.href))].slice(0, max), [
    MAX_LINKS,
  ]).catch(() => [] as string[]);
  return { links: lista ?? [] };
}
