// O chat do painel: desenha mensagens, cartões da IA e perguntas.
//
// Saiu do main.ts por dois motivos: ele passava de 800 linhas, e o chat agora tem dois modos. Ao
// vivo, os eventos chegam da ponte; ao abrir, o painel repassa a conversa guardada no background
// (utils/conversa-log.ts) pelas MESMAS funções. `repetindo` é a única diferença: sem avisos e sem
// mexer nos botões, porque aquilo já aconteceu.

import type { ArquivoAnexo, Evento, PapelAgente, RespostaUsuario } from '@browser/shared';
import { type EventoDoPedido, pedidoEmAndamento, type Registro } from '../../utils/conversa-log';
import { markdownSeguro } from '../../utils/markdown';
import type { EstadoBotao } from './botao';
import { escapeHtml } from './escape';
import { type Etapa, inferirEtapa } from './etapa';
import {
  camposHtml,
  inputLivreHtml,
  juntarResposta,
  mostrarBotaoEnviar,
  opcoesHtml,
  type Pergunta,
  type RespostaColetada,
  respostaDeOpcao,
} from './perguntas';

export type DepsChat = {
  chatStream: HTMLElement;
  welcomeCard: HTMLElement;
  showToast: (titulo: string, tipo?: 'success' | 'error' | 'info', detalhe?: string) => void;
  setBusy: (busy: boolean) => void;
  setEstadoBotao: (estado: EstadoBotao) => void;
};

let d: DepsChat;
let chatStream: HTMLElement;
let welcomeCard: HTMLElement;
let pedidoAtual: string | undefined;
let cardAtivo: HTMLElement | null = null;
let repetindo = false;

const showToast: DepsChat['showToast'] = (...a) => {
  if (!repetindo) d.showToast(...a);
};
const setBusy = (b: boolean) => {
  if (!repetindo) d.setBusy(b);
};
const setEstadoBotao = (e: EstadoBotao) => {
  if (!repetindo) d.setEstadoBotao(e);
};

export function iniciarChat(deps: DepsChat) {
  d = deps;
  chatStream = deps.chatStream;
  welcomeCard = deps.welcomeCard;
  // Abrir/fechar o log de pensamento. Delegated porque o card é recriado a cada pergunta, então não
  // dá pra ligar o listener uma vez só no load.
  chatStream.addEventListener('click', (ev) => {
    const toggle = (ev.target as HTMLElement).closest('.pensar');
    if (!toggle) return;
    const log = toggle.nextElementSibling as HTMLElement | null;
    if (!log) return;
    const aberto = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!aberto));
    log.hidden = aberto;
    if (!aberto) scrollToEnd();
  });
}

export const pedidoEmCurso = () => pedidoAtual;

/** Começa o cartão da IA para um pedido novo (ao vivo ou repetindo). */
export function iniciarPedido(pedidoId: string): HTMLElement {
  pedidoAtual = pedidoId;
  cardAtivo = appendAssistantMessage();
  return cardAtivo;
}

/** Lixeira: a tela volta ao começo. Quem zera a conversa guardada é o main.ts (no background). */
export function limparChat() {
  chatStream.innerHTML = '';
  chatStream.appendChild(welcomeCard);
  welcomeCard.style.display = 'flex';
  pedidoAtual = undefined;
  cardAtivo = null;
}

/**
 * Redesenha a conversa guardada. Devolve o pedido que ainda está rodando (se houver), para o
 * painel reabrir ocupado e com o Parar.
 */
export function repetirConversa(registros: readonly Registro[]): string | undefined {
  repetindo = true;
  try {
    for (const r of registros) {
      if (r.tipo === 'eu') appendUserMessage(r.texto, r.anexos as ArquivoAnexo[] | undefined);
      else if (r.tipo === 'inicio') iniciarPedido(r.pedidoId);
      else if (r.tipo === 'resposta') marcarRespondida(r.perguntaId, r.texto);
      else aplicarEvento(r);
    }
  } finally {
    repetindo = false;
  }
  const emCurso = pedidoEmAndamento(registros);
  if (emCurso) setBusy(true);
  scrollToEnd();
  return emCurso;
}

function marcarRespondida(perguntaId: string, texto: string) {
  const card = document.getElementById(`q-${perguntaId}`);
  card?.classList.add('respondido');
  card?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach((el) => {
    el.disabled = true;
  });
  appendUserMessage(texto);
}

function scrollToEnd() {
  chatStream.scrollTop = chatStream.scrollHeight;
}

export function appendUserMessage(msg: string, anexos?: ArquivoAnexo[]) {
  welcomeCard.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'message-row user';
  let anexosHtml = '';
  if (anexos && anexos.length > 0) {
    anexosHtml = `
      <div class="user-attachments">
        ${anexos.map((a) => `<span class="user-attachment-tag">📎 ${escapeHtml(a.nome)} (${(a.tamanho / 1024).toFixed(0)}KB)</span>`).join('')}
      </div>
    `;
  }
  const textContent = msg ? escapeHtml(msg) : '<em>Processar arquivos anexados</em>';
  row.innerHTML = `<div class="user-bubble">${textContent}${anexosHtml}</div>`;
  chatStream.appendChild(row);
  scrollToEnd();
}

function appendAssistantMessage(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  row.innerHTML = `
    <div class="assistant-card status-active">
      <div class="assistant-header">
        <div class="assistant-meta">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 2Zm4.243 2.757a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 1 1-1.06 1.062l-1.061-1.061a.75.75 0 0 1 0-1.06ZM14 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 14 8ZM2 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 2 8Zm1.697-3.243a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.062l-1.061-1.061a.75.75 0 0 1 0-1.06ZM8 12a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 12Z"/>
            <circle cx="8" cy="8" r="3"/>
          </svg>
          <span>BrOWSER Multiagente</span>
        </div>
      </div>

      <div class="live-stepper">
        <div class="stepper-track">
          <div class="step ativo" data-step="0">
            <div class="step-dot"></div>
            <span class="step-label">Lendo</span>
          </div>
          <div class="step-line" data-line="0"></div>
          <div class="step" data-step="1">
            <div class="step-dot"></div>
            <span class="step-label">Preenchendo</span>
          </div>
          <div class="step-line" data-line="1"></div>
          <div class="step" data-step="2">
            <div class="step-dot"></div>
            <span class="step-label">Conferindo</span>
          </div>
        </div>
        <button type="button" class="pensar" aria-expanded="false">
          <span class="pensar-titulo">Pensando</span>
          <span class="pensar-atual">Iniciando orquestração…</span>
          <svg class="pensar-seta" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3.65 5.84a.75.75 0 0 1 1.09-1.02l3.26 3.48a.75.75 0 0 1 0 1l-3.26 3.48a.75.75 0 0 1-1.09-1.02L6.14 8.5 3.65 5.84Z"/>
          </svg>
        </button>
        <ol class="pensar-log" hidden></ol>
      </div>

      <div class="markdown-content"></div>
    </div>
  `;
  chatStream.appendChild(row);
  scrollToEnd();
  return row.querySelector('.assistant-card')!;
}

function updateStepper(card: HTMLElement, etapa: Etapa, textoStatus: string, agente?: PapelAgente) {
  const steps = card.querySelectorAll<HTMLElement>('.step');
  const lines = card.querySelectorAll<HTMLElement>('.step-line');
  const atualEl = card.querySelector<HTMLElement>('.pensar-atual');
  const logEl = card.querySelector<HTMLElement>('.pensar-log');

  steps.forEach((el, i) => {
    el.classList.toggle('ativo', i === etapa);
    el.classList.toggle('feito', i < etapa);
  });
  lines.forEach((el, i) => {
    el.classList.toggle('feito', i < etapa);
  });

  if (!textoStatus) return;
  if (atualEl) atualEl.textContent = textoStatus;

  // O log é a memória do card: cada status vira uma linha, na ordem. Sem isso o card só mostra o
  // último pensamento e a pessoa não tem como saber o que a IA já fez — que é exatamente o
  // interesse que faz ela querer abrir.
  if (!logEl) return;
  const ultima = logEl.lastElementChild;
  if (ultima?.textContent === textoStatus) return; // status repetido não polui o log
  const li = document.createElement('li');
  li.textContent = textoStatus;
  if (agente) li.dataset.agente = agente;
  logEl.appendChild(li);
}

function renderQuestionCard(e: Extract<Evento, { tipo: 'pergunta' }>) {
  const p: Pergunta = e;
  const row = document.createElement('div');
  row.className = 'message-row assistant';

  row.innerHTML = `
    <div class="question-card" id="q-${escapeHtml(e.perguntaId)}">
      <div class="question-badge">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm0-1.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM6.5 6.25a1.5 1.5 0 1 1 2.378 1.226c-.346.242-.628.53-.628.924V9h-1.5v-.5a2.25 2.25 0 0 1 1.05-1.928.75.75 0 0 0-.3-.722.75.75 0 0 0-1-.15.75.75 0 0 1-1-.15Zm1.5 5.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
        </svg>
        <span>BrOWSER precisa de informações</span>
      </div>
      <p class="question-desc">${escapeHtml(e.pergunta)}</p>
      ${camposHtml(p.campos)}
      ${opcoesHtml(p.opcoes)}
      ${inputLivreHtml(p)}
      ${mostrarBotaoEnviar(p) ? '<button type="button" class="question-submit-btn">Enviar e Continuar</button>' : ''}
    </div>
  `;

  chatStream.appendChild(row);
  scrollToEnd();

  const card = row.querySelector('.question-card') as HTMLElement;

  function responder(coletada: RespostaColetada) {
    card.classList.add('respondido');
    card.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach((el) => {
      el.disabled = true;
    });

    appendUserMessage(coletada.texto);

    const respMsg: RespostaUsuario = {
      tipo: 'resposta_usuario',
      pedidoId: e.pedidoId,
      perguntaId: e.perguntaId,
      resposta: coletada.texto,
      respostasCampos: coletada.respostasCampos,
    };
    chrome.runtime.sendMessage(respMsg).catch(console.error);

    if (cardAtivo) {
      const statusEl = cardAtivo.querySelector('.pensar-atual');
      if (statusEl) statusEl.textContent = 'Continuando preenchimento com seus dados…';
    }
  }

  // Opção: um clique já é a resposta.
  card.querySelectorAll<HTMLButtonElement>('.question-option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      responder(respostaDeOpcao(btn.dataset.opcao ?? btn.textContent ?? ''));
    });
  });

  const submitBtn = card.querySelector<HTMLButtonElement>('.question-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      // `dataset.campo` já vem decodificado pelo DOM; a chave que a IA recebe é a que a pessoa viu.
      const entradas = Array.from(card.querySelectorAll<HTMLInputElement>('.question-field-input')).map((inp) => ({
        campo: inp.dataset.campo,
        valor: inp.value.trim(),
      }));
      responder(juntarResposta(entradas));
    });

    card.querySelectorAll<HTMLInputElement>('.question-field-input').forEach((inp) => {
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          submitBtn.click();
        }
      });
    });
  }

  const primeiroInput = card.querySelector<HTMLInputElement>('.question-field-input');
  if (primeiroInput && !repetindo) {
    setTimeout(() => primeiroInput.focus(), 100);
  }
}

/** Um evento da ponte que pertence a um pedido (status, pergunta, parado, resultado). */
export function aplicarEvento(e: EventoDoPedido) {
  if (e.pedidoId !== pedidoAtual || !cardAtivo) return;
  // A conversa pode ter sido limpa (lixeira) com o pedido em andamento: o cartão saiu da tela e a
  // resposta ia para um elemento invisível — só o aviso de "Pronto" aparecia. Recria o cartão.
  if (!cardAtivo.isConnected) {
    welcomeCard.style.display = 'none';
    cardAtivo = appendAssistantMessage();
  }

  if (e.tipo === 'status') {
    const etapa = inferirEtapa(e.texto);
    updateStepper(cardAtivo, etapa, e.texto, e.agente);
    scrollToEnd();
    return;
  }

  if (e.tipo === 'pergunta') {
    renderQuestionCard(e);
    return;
  }

  if (e.tipo === 'parado') {
    // Parado a pedido da pessoa: encerra o cartão com a mensagem dela, não com erro da IA.
    cardAtivo.classList.remove('status-active');
    cardAtivo.querySelector('.live-stepper')?.remove();
    const conteudo = cardAtivo.querySelector('.markdown-content')!;
    conteudo.innerHTML = `<p style="color:var(--fg-secondary);font-weight:600;">■ Parado</p><p style="font-size:13px;">${escapeHtml(e.texto)}</p>`;
    setEstadoBotao({ tipo: 'ocioso' });
    setBusy(false);
    scrollToEnd();
    return;
  }

  if (e.tipo === 'resultado') {
    cardAtivo.classList.remove('status-active');
    const stepperEl = cardAtivo.querySelector('.live-stepper');

    if (e.ok) {
      // Mark all steps complete
      if (stepperEl) {
        updateStepper(cardAtivo, 3, 'Concluído');
        // Smoothly fade stepper after finish
        setTimeout(() => stepperEl.remove(), 1200);
      }

      // Render Rich Markdown
      // Sempre deixa um texto no chat: a IA às vezes termina sem resposta escrita.
      const resumo = e.texto.trim() || 'Pronto. Confira a página e envie quando quiser.';
      const contentEl = cardAtivo.querySelector('.markdown-content')!;
      try {
        contentEl.innerHTML = markdownSeguro(resumo);
      } catch {
        contentEl.textContent = resumo;
      }

      // Add Copy Button to Assistant Card
      const header = cardAtivo.querySelector('.assistant-header')!;
      const copyBtn = document.createElement('button');
      copyBtn.className = 'msg-copy-btn';
      copyBtn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5Z"/>
          <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5Z"/>
        </svg>
        <span>Copiar</span>
      `;
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(resumo);
        showToast('Copiado');
      });
      header.appendChild(copyBtn);

      showToast('Pronto', 'success', 'Confira os campos na página antes de enviar.');
    } else {
      if (stepperEl) stepperEl.remove();
      const contentEl = cardAtivo.querySelector('.markdown-content')!;
      contentEl.innerHTML = `<p style="color:var(--error);font-weight:600;">⚠️ Erro no processamento</p><p style="color:var(--fg-secondary);font-size:13px;">${escapeHtml(e.texto)}</p>`;
      showToast('Não deu para terminar', 'error', 'O motivo está na conversa.');
    }

    setBusy(false);
    scrollToEnd();
    return;
  }
}
