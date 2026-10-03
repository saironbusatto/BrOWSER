import { type Campo, type Comandos, type Evento, HOST_NAME, type MensagemExtensao, type Pedido, type Resposta } from '@browser/shared';
import * as acoes from '../utils/acoes-aba';
import { codigoDaUrl, codigoNoTexto, pareceCodigo, redirectDe } from '../utils/codigo-oauth';
import { clicarDom, fecharLeitura, type LeituraDom, lerCamposDom, preencherDom } from '../utils/dom-fallback';
import { extrairTextoDaPagina, LIMITE_PADRAO } from '../utils/pagina-texto';
import { expressaoIniciar, expressoesInjetar, gerarScriptStatus, PARES_TEIA, SCRIPT_PARAR_TEIA } from '../utils/teia';

// ---- Plano B (Q13): quando o chrome.debugger é bloqueado na aba, lê e preenche pelo DOM ----
// refs do plano B começam aqui para nunca colidirem com backendNodeIds do CDP.
const REF_BASE_DOM = 1_000_000;
const BLOQUEIO_DEBUGGER = /cannot access|cannot attach|another debugger|already attached|not allowed|chrome-extension:\/\//i;
let abasSemDebugger = new Set<number>(); // espelho de SESSAO_SEM_DEBUGGER
let refsDom = new Map<number, { frameId: number; refLocal: number }>(); // espelho de SESSAO_REFS

// Iframe http(s) de OUTRA origem (formulário HubSpot, Typeform, pagamento…) roda em outro processo:
// a sessão do chrome.debugger na aba não enxerga dentro dele. Esses frames vão pelo DOM; o resto, CDP.
function ehOutraOrigem(urlFrame: string | undefined, origemTopo: string): boolean {
  if (!urlFrame || !/^https?:/.test(urlFrame)) return false;
  try {
    return new URL(urlFrame).origin !== origemTopo;
  } catch {
    return false;
  }
}

async function lerViaDom(tabId: number, frameIds?: number[]): Promise<{ principal?: LeituraDom; campos: Campo[] }> {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  const resultados = await chrome.scripting.executeScript({ target, func: lerCamposDom });
  const campos: Campo[] = [];
  let principal: LeituraDom | undefined;
  for (const { frameId, result } of resultados) {
    const leitura = result as LeituraDom | undefined;
    if (!leitura) continue;
    if (frameId === 0) principal = leitura;
    for (const c of leitura.campos) {
      const ref = REF_BASE_DOM + refsDom.size + 1;
      refsDom.set(ref, { frameId, refLocal: c.ref });
      campos.push({ ...c, ref });
    }
  }
  return { principal, campos };
}

// Captcha é medida de segurança: fica com o usuário. A IA nem vê os controles dele.
const CAPTCHA = /(^|\.)(recaptcha\.net|hcaptcha\.com|challenges\.cloudflare\.com)$|google\.com\/recaptcha|gstatic\.com\/recaptcha/i;
const ehCaptcha = (url: string) => {
  try {
    const u = new URL(url);
    return CAPTCHA.test(u.hostname) || CAPTCHA.test(u.hostname + u.pathname);
  } catch {
    return false;
  }
};

async function lerIframesDeOutraOrigem(tabId: number, urlTopo: string): Promise<Campo[]> {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null)) ?? [];
  const origemTopo = new URL(urlTopo).origin;
  const ids = frames.filter((f) => f.frameId !== 0 && ehOutraOrigem(f.url, origemTopo) && !ehCaptcha(f.url)).map((f) => f.frameId);
  if (!ids.length) return [];
  return (await lerViaDom(tabId, ids).catch(() => ({ campos: [] as Campo[] }))).campos;
}

/** refs marcadas como sensíveis na última leitura: impede ecoar a senha no HUD e no retorno. */
let sensiveis = new Set<number>();

async function lerCamposComPlanoB() {
  const tabId = await abaAlvo();
  await reidratarRefs();
  refsDom = new Map();
  if (!abasSemDebugger.has(tabId)) {
    try {
      const leitura = await lerCampos();
      const deOutraOrigem = await lerIframesDeOutraOrigem(tabId, leitura.url);
      const fechada = fecharLeitura(leitura, deOutraOrigem);
      sensiveis = new Set(fechada.sensiveis);
      return fechada.leitura;
    } catch (e) {
      if (!BLOQUEIO_DEBUGGER.test(String(e))) throw e;
      abasSemDebugger.add(tabId); // não insiste no CDP nesta aba
      await salvarRefs();
    }
  }
  const { principal, campos } = await lerViaDom(tabId);
  await salvarRefs();
  const fechada = fecharLeitura({ url: principal?.url ?? '', titulo: principal?.titulo ?? '', campos }, [], 'dom');
  sensiveis = new Set(fechada.sensiveis);
  return fechada.leitura;
}

async function naPaginaDom<A extends unknown[], R>(ref: number, func: (refLocal: number, ...args: A) => R, args: A): Promise<R> {
  // O service worker do MV3 é encerrado pelo Chrome quando ocioso; refsDom volta vazio depois
  // disso. A busca já é assíncrona, então recarrega do storage antes de desistir.
  let alvoRef = refsDom.get(ref);
  if (!alvoRef) {
    await reidratarRefs();
    alvoRef = refsDom.get(ref);
  }
  if (!alvoRef) throw new Error(`ref ${ref} desconhecida: chame ler_campos de novo`);
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: await abaAlvo(), frameIds: [alvoRef.frameId] },
    func: func as (...a: unknown[]) => R,
    args: [alvoRef.refLocal, ...args],
  });
  return r?.result as R;
}

// Papéis da árvore de acessibilidade que o LLM pode preencher ou clicar.
const PAPEIS = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'switch',
  'spinbutton',
  'slider',
  'button',
  'date',
  'DateTime',
  'InputTime',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'link',
  'option',
  'treeitem',
]);

// Estado do service worker.
//
// O MV3 encerra o worker ocioso (~30 s). Tudo que precisa sobreviver a isso mora em
// chrome.storage.session (some quando o navegador fecha, não quando o worker morre):
// `alvo` (aba em que a IA trabalha), `refsDom` (mapa ref -> frame+ref local do plano B) e
// `vigias` (login OAuth em andamento). Sem isso, um pedido que passa do meio minuto morria com
// "ref desconhecida" e a captura do código de autenticação se perdia silenciosamente.
// Mesma chave do painel lateral: o content script liga/desliga o aprendizado de formulário e este
// lado decide se o blueprint chega à ponte.
const CHAVE_APRENDIZADO = 'aprendizadoPassivo';

const SESSAO_ALVO = 'alvo';
const SESSAO_REFS = 'refsDom';
const SESSAO_VIGIAS = 'vigias';
const SESSAO_SEM_DEBUGGER = 'abasSemDebugger';

const lerSessao = <T>(chave: string, padrao: T): Promise<T> => chrome.storage.session.get(chave).then((r) => (r[chave] as T) ?? padrao);
const gravarSessao = (objeto: Record<string, unknown>): Promise<void> => chrome.storage.session.set(objeto).catch(() => {});

let alvo: number | undefined; // aba em que a IA está trabalhando (espelho em memória do storage)
const anexadas = new Set<number>();
// Comandos em fila: a IA pode chamar ferramentas em paralelo (o Claude faz isso), e
// foco + seleção + digitação de dois campos ao mesmo tempo se misturam.
let fila: Promise<unknown> = Promise.resolve();

let porta: chrome.runtime.Port | undefined;

/** Recarrega do storage o que o worker perdeu. Barato: só quando o espelho está vazio. */
async function reidratarRefs(): Promise<void> {
  if (refsDom.size) return;
  const [refs, semDebugger] = await Promise.all([
    lerSessao<[number, { frameId: number; refLocal: number }][]>(SESSAO_REFS, []),
    lerSessao<number[]>(SESSAO_SEM_DEBUGGER, []),
  ]);
  refsDom = new Map(refs.map(([r, v]) => [r, v]));
  abasSemDebugger = new Set(semDebugger);
}

function salvarRefs() {
  return gravarSessao({
    [SESSAO_REFS]: [...refsDom],
    [SESSAO_SEM_DEBUGGER]: [...abasSemDebugger],
  });
}

async function definirAlvo(tabId: number | undefined): Promise<void> {
  alvo = tabId;
  if (tabId === undefined) await chrome.storage.session.remove(SESSAO_ALVO).catch(() => {});
  else await gravarSessao({ [SESSAO_ALVO]: tabId });
}

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

const salvarVigias = () => gravarSessao({ [SESSAO_VIGIAS]: [...vigias] });
async function carregarVigias() {
  if (vigias.size) return;
  const guardado = await lerSessao<[string, string][]>(SESSAO_VIGIAS, []);
  for (const [redirect, ia] of guardado) vigias.set(redirect, ia);
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

function armarVigia(ia: string, urlAuth: string, pedeCodigo: boolean) {
  if (!pedeCodigo) return; // o codex entrega o código no painel, não numa página
  const redirect = redirectDe(urlAuth);
  if (!redirect) return;
  vigias.set(redirect, ia);
  salvarVigias();
}

async function entregarCodigo(tabId: number, base: string, ia: string) {
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
  porta?.postMessage({ tipo: 'login_codigo', ia, codigo } as MensagemExtensao);
  await chrome.tabs.remove(tabId).catch(() => {});
}

export default defineBackground(() => {
  conectar();
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    const url = tab?.pendingUrl || info.url || '';
    if (info.status !== 'complete' || !url) return;
    if (!vigias.size) {
      // Só paga o custo do storage quando há vigia; e recarrega antes de desistir.
      carregarVigias()
        .then(() => {
          for (const [redirect, ia] of vigias) {
            if (!url.startsWith(redirect.split('?')[0]!)) continue;
            entregarCodigo(tabId, redirect, ia).catch(console.warn);
            return;
          }
        })
        .catch(() => {});
      return;
    }
    for (const [redirect, ia] of vigias) {
      if (!url.startsWith(redirect.split('?')[0]!)) continue;
      entregarCodigo(tabId, redirect, ia).catch(console.warn);
      return;
    }
  });
  chrome.debugger.onDetach.addListener(({ tabId }) => {
    if (tabId) {
      anexadas.delete(tabId);
      desligarTeia(tabId).catch(() => {});
    }
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  // Painel lateral -> ponte.
  chrome.runtime.onMessage.addListener((msg: MensagemExtensao, _remetente, responder) => {
    if (msg?.tipo === 'pedido') {
      if (!porta) {
        responder({ ok: false, erro: 'Ponte não conectada. Rode o instalador do BrOWSER.' });
        return;
      }
      // Não pode ser `async`: o Chrome não aceita Promise como resposta síncrona do listener.
      // Persistir o alvo antes de seguir garante que a aba não se perca se o worker morrer agora.
      definirAlvo(msg.tabId)
        .then(() => {
          ligarTeia(msg.tabId, 'IA conectada. Assumindo controle…').catch(() => {});
          porta?.postMessage(msg);
        })
        .catch(() => {});
      responder({ ok: true });
      return;
    }
    if (msg?.tipo === 'parar') {
      // Parar é soberania do usuário (docs §7.3): a ponte mata o processo da IA, e aqui sai a
      // matriz da tela imediatamente — a pessoa não fica olhando "assumindo controle" para sempre.
      if (alvo !== undefined) {
        desligarTeia(alvo).catch(() => {});
        chrome.debugger.detach({ tabId: alvo }).catch(() => {});
        anexadas.delete(alvo);
      }
      porta?.postMessage(msg);
      responder({ ok: true });
      return;
    }
    if (msg?.tipo === 'resposta_usuario') {
      if (alvo) ligarTeia(alvo, 'Resposta recebida! Continuando na página…').catch(() => {});
      porta?.postMessage(msg);
      responder({ ok: true });
      return;
    }
    if (msg?.tipo === 'telemetria_blueprint') {
      // Opt-in: só repassa para a ponte se a pessoa tiver ligado no painel. A chave precisa ser
      // `=== true` (e não `!== false`), senão um valor ausente valida como ligado.
      chrome.storage.local.get(CHAVE_APRENDIZADO).then(({ aprendizadoPassivo }) => {
        if (aprendizadoPassivo === true) porta?.postMessage(msg);
      });
      responder({ ok: true });
      return;
    }
    if (
      msg?.tipo === 'consultar_assinaturas' ||
      msg?.tipo === 'conectar_assinatura' ||
      msg?.tipo === 'ativar_assinatura' ||
      msg?.tipo === 'login_codigo' ||
      msg?.tipo === 'desconectar_todos' ||
      msg?.tipo === 'desconectar_assinatura'
    ) {
      porta?.postMessage(msg);
      responder({ ok: true });
      return;
    }
  });
});

async function garantirAnexado(tabId: number) {
  if (anexadas.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    anexadas.add(tabId);
  } catch (err: any) {
    if (err?.message?.includes('already attached')) {
      anexadas.add(tabId);
    } else {
      throw err;
    }
  }
}

/**
 * Publica as funções do módulo como globais da aba.
 *
 * `Runtime.evaluate` roda um trecho por vez e não guarda estado entre chamadas, então a
 * alternativa seria concatenar as duas em uma string só — que quebra a linha de 80 colunas e
 * deixa a matemática testável do lado do host inacessível ao teia.test.ts. Globais na aba é o
 * que permite a config ser calculada no lugar certo: dentro da página, que é quem tem `window`.
 *
 * O texto das expressões mora em `utils/teia.ts`, junto com o contrato, para que o harness visual
 * injete exatamente o mesmo que a extensão injeta.
 */
async function injetarFuncoesDaPagina(tabId: number, pares: [string, (...a: never[]) => unknown][]) {
  await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
    expression: expressoesInjetar(pares),
  });
}

async function ligarTeia(tabId: number, status?: string) {
  try {
    await garantirAnexado(tabId);
    // O service worker não tem `window`, então as funções que dependem da página vão por
    // EvaluatingGlobalProperties: injetadas uma vez e chamadas de dentro do outro evaluate.
    // A alternativa — ler window.innerWidth aqui — dá ReferenceError (o matrix antigo media
    // dentro da aba, e a inversão quebrou o efeito inteiro sem erro visível).
    await injetarFuncoesDaPagina(tabId, PARES_TEIA);
    const r = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: expressaoIniciar(),
      returnByValue: true,
    })) as any;
    if (r?.exceptionDetails) {
      console.warn('Erro ao avaliar iniciarTeia:', r.exceptionDetails);
    }
    if (status) {
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: gerarScriptStatus(status),
      });
    }
  } catch (err) {
    console.warn('Tecido não pôde ser injetado:', err);
  }
}

async function atualizarTeia(tabId: number, status: string) {
  try {
    if (!anexadas.has(tabId)) return;
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: gerarScriptStatus(status),
    });
  } catch {}
}

async function desligarTeia(tabId: number) {
  try {
    if (!anexadas.has(tabId)) return;
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: SCRIPT_PARAR_TEIA,
    });
  } catch {}
}

// Reconexão com folga exponencial e teto. Antes era um `setTimeout(conectar, 2000)` que nunca
// desistia: sem a ponte instalada, a extensão ficava acordando a cada 2 s para sempre.
const RECONEXAO_MS = 2_000;
const RECONEXAO_MAX_MS = 60_000;
let tentativa = 0;
let reconexaoTimer: ReturnType<typeof setTimeout> | undefined;

function conectar() {
  porta = chrome.runtime.connectNative(HOST_NAME);
  porta.onMessage.addListener(async (p: Pedido | Evento) => {
    // A ponte respondeu: a folga volta ao início, senão uma queda isolada deixaria a extensão
    // esperando 60 s para reconectar nas próximas.
    if (tentativa > 0) tentativa = 0;
    if ('tipo' in p) {
      // Evento da ponte -> painel (se o painel estiver fechado, ninguém recebe; tudo bem).
      if (p.tipo === 'login_ia') armarVigia(p.ia, p.url, p.pedeCodigo);
      chrome.runtime.sendMessage(p).catch(() => {});
      if (alvo) {
        if (p.tipo === 'status') {
          atualizarTeia(alvo, p.texto);
        } else if (p.tipo === 'pergunta') {
          atualizarTeia(alvo, 'Aguardando suas informações no painel lateral…');
        } else if (p.tipo === 'resultado') {
          desligarTeia(alvo);
        }
      }
      return;
    }
    let r: Resposta;
    try {
      const vez = fila.then(() => executar(p));
      fila = vez.catch(() => {});
      r = { id: p.id, ok: true, result: await vez };
    } catch (e) {
      const frames = alvo === undefined ? [] : ((await chrome.webNavigation.getAllFrames({ tabId: alvo }).catch(() => null)) ?? []);
      const aba = alvo === undefined ? 'nenhuma' : `${alvo} frames=${frames.map((f) => f.url).join(' , ')}`;
      r = { id: p.id, ok: false, error: `${e instanceof Error ? e.message : String(e)} [aba alvo: ${aba}]` };
    }
    porta?.postMessage(r);
  });
  porta.onDisconnect.addListener(() => {
    console.warn('ponte desconectada:', chrome.runtime.lastError?.message);
    porta = undefined;
    // Folga exponencial: 2s, 4s, 8s… até 60s. A primeira mensagem recebida zera a contador.
    const espera = Math.min(RECONEXAO_MS * 2 ** tentativa, RECONEXAO_MAX_MS);
    tentativa++;
    reconexaoTimer = setTimeout(conectar, espera);
    reconexaoTimer.unref?.();
  });
}

async function executar(p: Pedido): Promise<unknown> {
  switch (p.cmd) {
    case 'abrir':
      return abrir((p.args as Comandos['abrir']['args']).url);
    case 'ler_campos':
      return lerCamposComPlanoB();
    case 'preencher': {
      const a = p.args as Comandos['preencher']['args'];
      return a.ref >= REF_BASE_DOM ? naPaginaDom(a.ref, preencherDom, [a.valor]) : preencher(a.ref, a.valor, sensiveis.has(a.ref));
    }
    case 'clicar': {
      const ref = (p.args as Comandos['clicar']['args']).ref;
      return ref >= REF_BASE_DOM ? naPaginaDom(ref, clicarDom, []) : clicar(ref);
    }
    case 'ler_pagina': {
      const a = p.args as Comandos['ler_pagina']['args'];
      return lerPagina(a.limite);
    }
    case 'navegar':
      return acoes.navegar(depsAba, (p.args as Comandos['navegar']['args']).url);
    case 'voltar':
      return acoes.voltar(depsAba);
    case 'listar_abas':
      return acoes.listarAbas(depsAba);
    case 'abrir_aba':
      return acoes.abrirAba(depsAba, (p.args as Comandos['abrir_aba']['args']).url);
    case 'usar_aba':
      return acoes.usarAba(depsAba, (p.args as Comandos['usar_aba']['args']).id);
    case 'ver_tela':
      return acoes.verTela(depsAba);
    case 'esperar': {
      const a = p.args as Comandos['esperar']['args'];
      return acoes.esperar(depsAba, a.texto, a.segundos);
    }
    case 'teclar':
      return acoes.teclar(depsAba, (p.args as Comandos['teclar']['args']).tecla);
    case 'rolar':
      return acoes.rolar(depsAba, (p.args as Comandos['rolar']['args']).direcao);
    case 'links':
      return acoes.links(depsAba);
    case 'avaliar':
      return avaliar((p.args as Comandos['avaliar']['args']).expr);
    case 'recarregar':
      setTimeout(() => chrome.runtime.reload(), 100);
      return { ok: true };
    case 'forcar_modo_dom':
      abasSemDebugger.add(await abaAlvo());
      await salvarRefs();
      return { ok: true };
    default:
      throw new Error(`comando desconhecido: ${p.cmd}`);
  }
}

async function abrir(url: string) {
  const tab = await chrome.tabs.create({ url, active: true });
  await acoes.esperarAbaCarregar(tab.id!);
  await definirAlvo(tab.id!);
  return { tabId: tab.id! };
}

async function abaAlvo(): Promise<number> {
  if (alvo !== undefined) return alvo;
  // O worker pode ter morrido com `alvo` só na memória; o storage.session sabe qual era.
  const guardado = await lerSessao<number | undefined>(SESSAO_ALVO, undefined);
  if (guardado !== undefined) {
    alvo = guardado;
    return guardado;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('nenhuma aba ativa');
  alvo = tab.id;
  await definirAlvo(tab.id);
  return tab.id;
}

/**
 * A IA passou a trabalhar em outra aba (abriu uma nova ou escolheu uma existente). A teia sai da
 * velha e entra na nova: o efeito marca onde a IA está mexendo, e duas abas marcadas confundiriam.
 */
async function trocarAlvo(tabId: number): Promise<void> {
  if (alvo === tabId) return;
  if (alvo !== undefined) await desligarTeia(alvo).catch(() => {});
  await definirAlvo(tabId);
  await ligarTeia(tabId, 'IA trabalhando nesta aba…').catch(() => {});
}

const depsAba: acoes.DepsAba = {
  abaAlvo: () => abaAlvo(),
  trocarAlvo,
  cdp: (m, params) => cdp(m, params),
  semDebugger: (tabId) => abasSemDebugger.has(tabId),
};

async function cdp<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const tabId = await abaAlvo();
  await garantirAnexado(tabId);
  return (await chrome.debugger.sendCommand({ tabId }, method, params)) as T;
}

// Executa `fn` com `this` = elemento do backendNodeId.
async function noElemento<T>(ref: number, fn: string, args: unknown[] = []): Promise<T> {
  const { object } = await cdp('DOM.resolveNode', { backendNodeId: ref });
  const r = await cdp('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: fn,
    arguments: args.map((value) => ({ value })),
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erro no elemento');
  return r.result.value as T;
}

const WIDGETS = ['date', 'time', 'datetime-local', 'month', 'week'];

// Peças internas do navegador (ex.: Dia/Mês/Ano de um input date) ficam em shadow root
// "user-agent": são escondidas, e o input em si entra como um campo só.
function varrerDom(root: any, origemTopo: string) {
  const internos = new Set<number>();
  const widgets: { ref: number; tipo: string }[] = [];
  const andar = (n: any, interno: boolean) => {
    if (interno) internos.add(n.backendNodeId);
    if (n.nodeName === 'INPUT') {
      const attrs: string[] = n.attributes ?? [];
      const tipo = attrs[attrs.indexOf('type') + 1] ?? '';
      if (attrs.includes('type') && WIDGETS.includes(tipo)) widgets.push({ ref: n.backendNodeId, tipo });
    }
    n.children?.forEach((c: any) => {
      andar(c, interno);
    });
    n.shadowRoots?.forEach((s: any) => {
      andar(s, interno || s.shadowRootType === 'user-agent');
    });
    if (n.contentDocument && !ehOutraOrigem(n.contentDocument.documentURL, origemTopo)) andar(n.contentDocument, interno);
  };
  andar(root, false);
  return { internos, widgets };
}

/**
 * Texto da página inteira, por código: o DOM, sem renderizar e sem rolar.
 *
 * O CDP é o caminho normal. O plano B (injetar na aba) existe pelo mesmo motivo do `ler_campos`:
 * quando o chrome.debugger está bloqueado — política de empresa, extensão de segurança, navegador
 * sem permissão — a leitura continua funcionando por `executeScript`.
 */
async function lerPagina(limite?: number): Promise<{ url: string; titulo: string; texto: string; truncado: boolean; caracteres: number }> {
  const teto = typeof limite === 'number' && limite > 0 ? Math.min(limite, 200_000) : LIMITE_PADRAO;
  const tabId = await abaAlvo();
  // A aba alvo, não a ativa: com abas, a IA pode estar lendo uma que não é a da frente.
  const url = (await chrome.tabs.get(tabId).catch(() => undefined))?.url ?? '';

  if (!abasSemDebugger.has(tabId)) {
    try {
      // A função é serializada e roda dentro da página; por isso vai por string, e não como
      // chamada direta.
      const expr = `(${extrairTextoDaPagina.toString()})(${teto})`;
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erro ao ler a página');
      return { url, ...(r.result.value as { titulo: string; texto: string; truncado: boolean; caracteres: number }) };
    } catch (e) {
      if (!BLOQUEIO_DEBUGGER.test(String(e))) throw e;
      abasSemDebugger.add(tabId); // não insiste no CDP nesta aba
      await salvarRefs();
    }
  }

  const [injetado] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extrairTextoDaPagina,
    args: [teto],
  });
  const r = injetado?.result as { titulo: string; texto: string; truncado: boolean; caracteres: number } | undefined;
  if (!r) throw new Error('a página não devolveu texto (a aba pode ter mudado no meio do pedido)');
  return { url, ...r };
}

async function lerCampos(): Promise<LeituraDom> {
  // Só atualiza o texto: ligar/desligar o efeito é do ciclo do pedido. Religar aqui deixava o
  // Tecido preso depois do fim (a ponte lê a página de novo para salvar o blueprint).
  if (alvo) atualizarTeia(alvo, 'Mapeando campos do formulário…');
  const { root } = await cdp('DOM.getDocument', { depth: -1, pierce: true }); // pierce: inclui iframes
  const { frameTree } = await cdp('Page.getFrameTree');
  const origemTopo = new URL(frameTree.frame.url).origin;
  const { internos, widgets } = varrerDom(root, origemTopo);
  const frames: string[] = [];
  const andar = (t: any) => {
    if (ehOutraOrigem(t.frame.url, origemTopo)) return; // lido pelo DOM em lerIframesDeOutraOrigem
    frames.push(t.frame.id);
    t.childFrames?.forEach(andar);
  };
  andar(frameTree);

  const campos: Campo[] = [];
  for (const frameId of frames) {
    const { nodes } = await cdp('Accessibility.getFullAXTree', { frameId }).catch(() => ({ nodes: [] }));
    for (const n of nodes) {
      const papel = n.role?.value;
      // `password` sai da lista junto com os papéis de ação: o campo continua encontrável pelo
      // DOM (o plano B e o preenchimento funcionam), mas a árvore de acessibilidade, que expõe o
      // valor, não é consultada para ele. É a linha que impede a senha de chegar à IA pelo CDP.
      if (papel === 'password') continue;
      if (n.ignored || !PAPEIS.has(papel) || !n.backendDOMNodeId || internos.has(n.backendDOMNodeId)) continue;
      const prop = (k: string) => n.properties?.find((p: any) => p.name === k)?.value?.value;
      const campo: Campo = { ref: n.backendDOMNodeId, papel, nome: n.name?.value ?? '' };
      // `protected` cobre o caso de um campo marcado sensível fora do papel `password`. O valor é
      // omitido; o campo continua preenchível (docs/termos-e-privacidade.md §4.2.2).
      if (prop('protected') === true) campo.sensivel = true;
      else if (n.value?.value !== undefined) campo.valor = String(n.value.value);
      if (prop('checked') !== undefined) campo.marcado = prop('checked') === 'true' || prop('checked') === true;
      if (prop('required')) campo.obrigatorio = true;
      if (papel === 'combobox' || papel === 'listbox') {
        campo.opcoes = await noElemento<string[]>(
          n.backendDOMNodeId,
          'function(){return this.options?Array.from(this.options).map(o=>o.text):[]}',
        );
      }
      campos.push(campo);
    }
  }
  for (const w of widgets) {
    if (campos.some((c) => c.ref === w.ref)) continue;
    const info = await noElemento<{ nome: string; valor: string; obrigatorio: boolean }>(
      w.ref,
      'function(){return {nome: (this.labels?.[0]?.innerText || this.getAttribute("aria-label") || this.name || "").trim(), valor: this.value, obrigatorio: this.required}}',
    );
    campos.push({
      ref: w.ref,
      papel: w.tipo,
      nome: info.nome,
      ...(info.valor && { valor: info.valor }),
      ...(info.obrigatorio && { obrigatorio: true }),
    });
  }
  // O `cdp` volta `any`, e o spread desse `any` transformava a leitura inteira em `any` — foi o
  // que deixou o TypeScript calar sobre o formato de retorno errado de `ler_campos`. Aqui o
  // título vem nomeado, e o tipo declara o que a leitura de fato é.
  const titulo = await cdp<{ result: { value: { url: string; titulo: string } } }>('Runtime.evaluate', {
    expression: '({url: location.href, titulo: document.title})',
    returnByValue: true,
  });
  return { url: titulo.result.value.url, titulo: titulo.result.value.titulo, campos };
}

/** `valor` com a senha trocada por um marcador: nunca ecoa o segredo no HUD da página. */
function mascararSecreto(valor: string, sensivel: boolean): string {
  return sensivel ? '[senha]' : valor.length > 20 ? `${valor.slice(0, 18)}…` : valor;
}

async function preencher(ref: number, valor: string, sensivel = false) {
  if (alvo) atualizarTeia(alvo, `Preenchendo: ${mascararSecreto(valor, sensivel)}`);
  const tipo = await noElemento<string>(ref, 'function(){return this.tagName==="SELECT"?"select":(this.type||"text")}');

  if (tipo === 'select') {
    await noElemento(
      ref,
      `function(v){
      const alvo = v.trim().toLowerCase();
      const o = Array.from(this.options).find(o => o.value.toLowerCase() === alvo || o.text.trim().toLowerCase() === alvo);
      if (!o) throw new Error('opção não encontrada: ' + v);
      this.value = o.value;
      this.dispatchEvent(new Event('input', {bubbles: true}));
      this.dispatchEvent(new Event('change', {bubbles: true}));
    }`,
      [valor],
    );
  } else if (tipo === 'checkbox' || tipo === 'radio') {
    const querido = !/^(false|não|nao|0|off|desmarcar)$/i.test(valor.trim());
    const marcado = () => noElemento<boolean>(ref, 'function(){return this.checked}');
    if ((await marcado()) !== querido) await clicar(ref);
    // O clique por coordenada falha ~1 em 8 quando o layout ainda está mudando (iframe/React
    // carregando): confere e, se não pegou, usa o click() do próprio elemento.
    if ((await marcado()) !== querido) await noElemento(ref, 'function(){this.click()}');
  } else if (['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range'].includes(tipo)) {
    // Inputs com widget nativo não aceitam Input.insertText: setter nativo + eventos.
    await noElemento(
      ref,
      `function(v){
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(this, v);
      this.dispatchEvent(new Event('input', {bubbles: true}));
      this.dispatchEvent(new Event('change', {bubbles: true}));
    }`,
      [valor],
    );
  } else {
    // Texto: foco + seleciona tudo + digitação "real" (funciona com React controlado).
    await cdp('DOM.focus', { backendNodeId: ref });
    await noElemento(ref, 'function(){this.select?.()}');
    await cdp('Input.insertText', { text: valor });
    await noElemento(ref, 'function(){this.dispatchEvent(new Event("change",{bubbles:true}))}');
  }
  // Campo sensível: confirma que gravou, sem devolver o texto. A IA precisa da confirmação, não
  // do segredo — e o retorno também é registrado no log da ponte.
  if (sensivel) return { valor: '[senha preenchida]' };
  return {
    valor: await noElemento<string>(ref, 'function(){return this.type==="checkbox"||this.type==="radio"?String(this.checked):this.value}'),
  };
}

async function clicar(ref: number) {
  if (alvo) atualizarTeia(alvo, 'Clicando no elemento…');
  try {
    await cdp('DOM.scrollIntoViewIfNeeded', { backendNodeId: ref });
    const { model } = await cdp('DOM.getBoxModel', { backendNodeId: ref });
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0, x4 = 0, y4 = 0]: number[] = model.content;
    const x = (x1 + x2 + x3 + x4) / 4;
    const y = (y1 + y2 + y3 + y4) / 4;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  } catch {
    // Fallback: se o elemento não tem boxModel direto (ex.: SVG, botão customizado), clica via DOM direto
    await noElemento(ref, 'function(){ this.click?.(); }');
  }
  return { ok: true as const };
}

async function avaliar(expr: string) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erro ao avaliar');
  return r.result.value;
}
