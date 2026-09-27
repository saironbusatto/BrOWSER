import type { Evento, Pedir } from '@browser/shared';

const form = document.getElementById('form') as HTMLFormElement;
const texto = document.getElementById('texto') as HTMLTextAreaElement;
const botao = document.getElementById('botao') as HTMLButtonElement;
const status = document.getElementById('status')!;
const resultado = document.getElementById('resultado')!;

let pedidoAtual: string | undefined;

function ocupado(sim: boolean) {
  botao.disabled = sim;
  botao.textContent = sim ? 'Preenchendo…' : 'Preencher';
}

function mostrar(msg: string, classe: 'ok' | 'erro') {
  resultado.textContent = msg;
  resultado.className = classe;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba?.id || !/^https?:/.test(aba.url ?? '')) {
    mostrar('Abra a página com o formulário numa aba normal (http/https) e tente de novo.', 'erro');
    return;
  }
  pedidoAtual = crypto.randomUUID();
  const pedido: Pedir = { tipo: 'pedido', pedidoId: pedidoAtual, texto: texto.value.trim(), tabId: aba.id };
  resultado.textContent = '';
  status.textContent = 'Enviando pedido…';
  ocupado(true);
  const r = await chrome.runtime.sendMessage(pedido).catch((err) => ({ ok: false, erro: String(err) }));
  if (!r?.ok) {
    status.textContent = '';
    mostrar(r?.erro ?? 'Falha ao falar com a extensão.', 'erro');
    ocupado(false);
  }
});

chrome.runtime.onMessage.addListener((e: Evento) => {
  if (e.pedidoId !== pedidoAtual) return;
  if (e.tipo === 'status') {
    status.textContent = e.texto;
    return;
  }
  status.textContent = e.ok ? `Pronto (${e.ia}). Confira e envie você mesmo.` : '';
  mostrar(e.texto, e.ok ? 'ok' : 'erro');
  ocupado(false);
});
