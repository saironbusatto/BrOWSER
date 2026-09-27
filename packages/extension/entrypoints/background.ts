import { HOST_NAME, type Campo, type Comandos, type Pedido, type Resposta } from '@browser/shared';

// Papéis da árvore de acessibilidade que o LLM pode preencher ou clicar.
const PAPEIS = new Set([
  'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch',
  'spinbutton', 'slider', 'button', 'date', 'DateTime', 'InputTime',
]);
const RECONEXAO_MS = 2000;

let alvo: number | undefined; // aba em que a IA está trabalhando
const anexadas = new Set<number>();

export default defineBackground(() => {
  conectar();
  chrome.debugger.onDetach.addListener(({ tabId }) => tabId && anexadas.delete(tabId));
});

function conectar() {
  const porta = chrome.runtime.connectNative(HOST_NAME);
  porta.onMessage.addListener(async (p: Pedido) => {
    let r: Resposta;
    try {
      r = { id: p.id, ok: true, result: await executar(p) };
    } catch (e) {
      r = { id: p.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    porta.postMessage(r);
  });
  porta.onDisconnect.addListener(() => {
    console.warn('ponte desconectada:', chrome.runtime.lastError?.message);
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

async function lerCampos() {
  await cdp('DOM.getDocument', { depth: -1, pierce: true }); // habilita backendNodeIds dos iframes
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
      if (n.ignored || !PAPEIS.has(papel) || !n.backendDOMNodeId) continue;
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
