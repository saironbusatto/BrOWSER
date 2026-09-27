import { HOST_NAME, type Campo, type Comandos, type Evento, type Pedido, type Pedir, type Resposta } from '@browser/shared';

// Papéis da árvore de acessibilidade que o LLM pode preencher ou clicar.
const PAPEIS = new Set([
  'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch',
  'spinbutton', 'slider', 'button', 'date', 'DateTime', 'InputTime',
]);
const RECONEXAO_MS = 2000;

let alvo: number | undefined; // aba em que a IA está trabalhando
const anexadas = new Set<number>();
// Comandos em fila: a IA pode chamar ferramentas em paralelo (o Claude faz isso), e
// foco + seleção + digitação de dois campos ao mesmo tempo se misturam.
let fila: Promise<unknown> = Promise.resolve();

let porta: chrome.runtime.Port | undefined;

export default defineBackground(() => {
  conectar();
  chrome.debugger.onDetach.addListener(({ tabId }) => tabId && anexadas.delete(tabId));
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  // Painel lateral -> ponte. A aba ativa quando o usuário pediu vira a aba alvo.
  chrome.runtime.onMessage.addListener((msg: Pedir, _remetente, responder) => {
    if (msg?.tipo !== 'pedido') return;
    if (!porta) {
      responder({ ok: false, erro: 'Ponte não conectada. Rode o instalador do bRowser.' });
      return;
    }
    alvo = msg.tabId;
    porta.postMessage(msg);
    responder({ ok: true });
  });
});

function conectar() {
  porta = chrome.runtime.connectNative(HOST_NAME);
  porta.onMessage.addListener(async (p: Pedido | Evento) => {
    if ('tipo' in p) {
      // Evento da ponte -> painel (se o painel estiver fechado, ninguém recebe; tudo bem).
      chrome.runtime.sendMessage(p).catch(() => {});
      return;
    }
    let r: Resposta;
    try {
      const vez = fila.then(() => executar(p));
      fila = vez.catch(() => {});
      r = { id: p.id, ok: true, result: await vez };
    } catch (e) {
      const frames = alvo === undefined ? [] : (await chrome.webNavigation.getAllFrames({ tabId: alvo }).catch(() => null)) ?? [];
      const aba = alvo === undefined ? 'nenhuma' : `${alvo} frames=${frames.map((f) => f.url).join(' , ')}`;
      r = { id: p.id, ok: false, error: `${e instanceof Error ? e.message : String(e)} [aba alvo: ${aba}]` };
    }
    porta?.postMessage(r);
  });
  porta.onDisconnect.addListener(() => {
    console.warn('ponte desconectada:', chrome.runtime.lastError?.message);
    porta = undefined;
    setTimeout(conectar, RECONEXAO_MS);
  });
}

async function executar(p: Pedido): Promise<unknown> {
  switch (p.cmd) {
    case 'abrir': return abrir((p.args as Comandos['abrir']['args']).url);
    case 'ler_campos': return lerCampos();
    case 'preencher': { const a = p.args as Comandos['preencher']['args']; return preencher(a.ref, a.valor); }
    case 'clicar': return clicar((p.args as Comandos['clicar']['args']).ref);
    case 'avaliar': return avaliar((p.args as Comandos['avaliar']['args']).expr);
    case 'recarregar': setTimeout(() => chrome.runtime.reload(), 100); return { ok: true };
    default: throw new Error(`comando desconhecido: ${p.cmd}`);
  }
}

async function abrir(url: string) {
  const tab = await chrome.tabs.create({ url, active: true });
  await new Promise<void>((ok) => {
    const ouvir = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(ouvir); ok(); }
    };
    chrome.tabs.onUpdated.addListener(ouvir);
  });
  alvo = tab.id!;
  return { tabId: alvo };
}

async function abaAlvo(): Promise<number> {
  if (alvo !== undefined) return alvo;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('nenhuma aba ativa');
  return (alvo = tab.id);
}

async function cdp<T = any>(method: string, params: object = {}): Promise<T> {
  const tabId = await abaAlvo();
  if (!anexadas.has(tabId)) {
    await chrome.debugger.attach({ tabId }, '1.3');
    anexadas.add(tabId);
  }
  return chrome.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
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
function varrerDom(root: any) {
  const internos = new Set<number>();
  const widgets: { ref: number; tipo: string }[] = [];
  const andar = (n: any, interno: boolean) => {
    if (interno) internos.add(n.backendNodeId);
    if (n.nodeName === 'INPUT') {
      const attrs: string[] = n.attributes ?? [];
      const tipo = attrs[attrs.indexOf('type') + 1];
      if (attrs.includes('type') && WIDGETS.includes(tipo)) widgets.push({ ref: n.backendNodeId, tipo });
    }
    n.children?.forEach((c: any) => andar(c, interno));
    n.shadowRoots?.forEach((s: any) => andar(s, interno || s.shadowRootType === 'user-agent'));
    if (n.contentDocument) andar(n.contentDocument, interno);
  };
  andar(root, false);
  return { internos, widgets };
}

async function lerCampos() {
  const { root } = await cdp('DOM.getDocument', { depth: -1, pierce: true }); // pierce: inclui iframes
  const { internos, widgets } = varrerDom(root);
  const { frameTree } = await cdp('Page.getFrameTree');
  const frames: string[] = [];
  const andar = (t: any) => { frames.push(t.frame.id); t.childFrames?.forEach(andar); };
  andar(frameTree);

  const campos: Campo[] = [];
  for (const frameId of frames) {
    // ponytail: só iframes do mesmo processo; iframes cross-origin (OOPIF) exigem sessão CDP própria.
    const { nodes } = await cdp('Accessibility.getFullAXTree', { frameId }).catch(() => ({ nodes: [] }));
    for (const n of nodes) {
      const papel = n.role?.value;
      if (n.ignored || !PAPEIS.has(papel) || !n.backendDOMNodeId || internos.has(n.backendDOMNodeId)) continue;
      const prop = (k: string) => n.properties?.find((p: any) => p.name === k)?.value?.value;
      const campo: Campo = { ref: n.backendDOMNodeId, papel, nome: n.name?.value ?? '' };
      if (n.value?.value !== undefined) campo.valor = String(n.value.value);
      if (prop('checked') !== undefined) campo.marcado = prop('checked') === 'true' || prop('checked') === true;
      if (prop('required')) campo.obrigatorio = true;
      if (papel === 'combobox' || papel === 'listbox') {
        campo.opcoes = await noElemento<string[]>(n.backendDOMNodeId, 'function(){return this.options?Array.from(this.options).map(o=>o.text):[]}');
      }
      campos.push(campo);
    }
  }
  for (const w of widgets) {
    if (campos.some((c) => c.ref === w.ref)) continue;
    const info = await noElemento<{ nome: string; valor: string; obrigatorio: boolean }>(w.ref,
      'function(){return {nome: (this.labels?.[0]?.innerText || this.getAttribute("aria-label") || this.name || "").trim(), valor: this.value, obrigatorio: this.required}}');
    campos.push({ ref: w.ref, papel: w.tipo, nome: info.nome, valor: info.valor, ...(info.obrigatorio && { obrigatorio: true }) });
  }
  const { result } = await cdp('Runtime.evaluate', { expression: '({url: location.href, titulo: document.title})', returnByValue: true });
  return { ...result.value, campos };
}

async function preencher(ref: number, valor: string) {
  const tipo = await noElemento<string>(ref, 'function(){return this.tagName==="SELECT"?"select":(this.type||"text")}');

  if (tipo === 'select') {
    await noElemento(ref, `function(v){
      const alvo = v.trim().toLowerCase();
      const o = Array.from(this.options).find(o => o.value.toLowerCase() === alvo || o.text.trim().toLowerCase() === alvo);
      if (!o) throw new Error('opção não encontrada: ' + v);
      this.value = o.value;
      this.dispatchEvent(new Event('input', {bubbles: true}));
      this.dispatchEvent(new Event('change', {bubbles: true}));
    }`, [valor]);
  } else if (tipo === 'checkbox' || tipo === 'radio') {
    const querido = !/^(false|não|nao|0|off|desmarcar)$/i.test(valor.trim());
    const atual = await noElemento<boolean>(ref, 'function(){return this.checked}');
    if (atual !== querido) await clicar(ref);
  } else if (['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range'].includes(tipo)) {
    // Inputs com widget nativo não aceitam Input.insertText: setter nativo + eventos.
    await noElemento(ref, `function(v){
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(this, v);
      this.dispatchEvent(new Event('input', {bubbles: true}));
      this.dispatchEvent(new Event('change', {bubbles: true}));
    }`, [valor]);
  } else {
    // Texto: foco + seleciona tudo + digitação "real" (funciona com React controlado).
    await cdp('DOM.focus', { backendNodeId: ref });
    await noElemento(ref, 'function(){this.select?.()}');
    await cdp('Input.insertText', { text: valor });
    await noElemento(ref, 'function(){this.dispatchEvent(new Event("change",{bubbles:true}))}');
  }
  return { valor: await noElemento<string>(ref, 'function(){return this.type==="checkbox"||this.type==="radio"?String(this.checked):this.value}') };
}

async function clicar(ref: number) {
  await cdp('DOM.scrollIntoViewIfNeeded', { backendNodeId: ref });
  const { model } = await cdp('DOM.getBoxModel', { backendNodeId: ref });
  const q: number[] = model.content;
  const x = (q[0] + q[2] + q[4] + q[6]) / 4;
  const y = (q[1] + q[3] + q[5] + q[7]) / 4;
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  return { ok: true as const };
}

async function avaliar(expr: string) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erro ao avaliar');
  return r.result.value;
}
