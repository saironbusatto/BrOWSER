import type { ArquivoAnexo, Evento, ItemAssinatura, PapelAgente, Pedir, RespostaUsuario } from '@browser/shared';
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

// ── DOM refs ──
const chatStream = document.getElementById('chat-stream')!;
const welcomeCard = document.getElementById('welcome-card')!;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const texto = document.getElementById('texto') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const btnLimpar = document.getElementById('btn-limpar')!;
const toast = document.getElementById('toast')!;
const toastMsg = document.getElementById('toast-msg')!;
const attachmentTray = document.getElementById('attachment-tray')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const attachBtn = document.getElementById('attach-btn') as HTMLButtonElement;
const dropOverlay = document.getElementById('drop-overlay')!;

// ── Subscription Modal Refs (Apple Design) ──
const btnSubscriptions = document.getElementById('btn-subscriptions')!;
const subscriptionsModal = document.getElementById('subscriptions-modal')!;
const closeSubscriptionsBtn = document.getElementById('close-subscriptions-btn')!;
const activeSubscriptionName = document.getElementById('active-subscription-name')!;
const plansContainer = document.getElementById('plans-container')!;

let pedidoAtual: string | undefined;
let cardAtivo: HTMLElement | null = null;
let arquivosAnexados: ArquivoAnexo[] = [];

// ── Toast Notification ──
let toastTimer: any;
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  clearTimeout(toastTimer);
  toastMsg.textContent = msg;
  toast.className = `toast-container active ${type}`;
  toastTimer = setTimeout(() => {
    toast.classList.remove('active');
  }, 3200);
}

// ── File Attachments & Drag-and-Drop ──
function lerComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function processarArquivos(files: FileList | File[]) {
  const lista = Array.from(files);
  for (const f of lista) {
    if (f.size > 25 * 1024 * 1024) {
      showToast(`Arquivo "${f.name}" excede o limite de 25MB`, 'error');
      continue;
    }
    const isText = f.name.match(/\.(xml|json|csv|txt|html|md)$/i) || f.type.startsWith('text/') || f.type.includes('xml') || f.type.includes('json');
    if (isText) {
      const conteudoTexto = await f.text();
      arquivosAnexados.push({
        nome: f.name,
        tipo: f.type || 'text/plain',
        tamanho: f.size,
        conteudoTexto,
      });
    } else {
      const dadosBase64 = await lerComoBase64(f);
      arquivosAnexados.push({
        nome: f.name,
        tipo: f.type || 'application/octet-stream',
        tamanho: f.size,
        dadosBase64,
      });
    }
  }
  renderAttachmentTray();
  if (lista.length > 0) {
    showToast(`${arquivosAnexados.length} arquivo(s) preparado(s)`);
  }
}

function renderAttachmentTray() {
  if (arquivosAnexados.length === 0) {
    attachmentTray.style.display = 'none';
    attachmentTray.innerHTML = '';
    return;
  }

  attachmentTray.style.display = 'flex';
  attachmentTray.innerHTML = arquivosAnexados.map((arq, idx) => {
    const kb = (arq.tamanho / 1024).toFixed(1);
    const icone = arq.nome.endsWith('.xml') ? '📄' : arq.nome.endsWith('.pdf') ? '📑' : arq.nome.endsWith('.json') ? '📦' : '📎';
    return `
      <div class="attachment-chip" data-idx="${idx}">
        <span>${icone}</span>
        <span class="chip-name" title="${escapeHtml(arq.nome)}">${escapeHtml(arq.nome)}</span>
        <span class="chip-size">(${kb} KB)</span>
        <button type="button" class="chip-remove" data-remove="${idx}" title="Remover anexo">✕</button>
      </div>
    `;
  }).join('');

  attachmentTray.querySelectorAll<HTMLButtonElement>('.chip-remove').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const idx = Number(btn.dataset.remove);
      arquivosAnexados.splice(idx, 1);
      renderAttachmentTray();
    });
  });
}

attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length > 0) {
    processarArquivos(fileInput.files);
    fileInput.value = '';
  }
});

// Drag and drop global no painel
let dragCounter = 0;
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add('drag-active');
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});
document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove('drag-active');
  }
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('drag-active');
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    processarArquivos(e.dataTransfer.files);
  }
});

// ── Auto-expand Textarea ──
texto.addEventListener('input', () => {
  texto.style.height = 'auto';
  texto.style.height = Math.min(texto.scrollHeight, 160) + 'px';
});

// ── Ctrl+Enter / Cmd+Enter ──
texto.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

// ── Suggestion Chips ──
document.querySelectorAll<HTMLButtonElement>('.suggestion-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const prompt = chip.dataset.prompt;
    if (prompt) {
      texto.value = prompt;
      chatForm.requestSubmit();
    }
  });
});

// ── Clear Conversation ──
btnLimpar.addEventListener('click', () => {
  chatStream.innerHTML = '';
  chatStream.appendChild(welcomeCard);
  welcomeCard.style.display = 'flex';
  arquivosAnexados = [];
  renderAttachmentTray();
  showToast('Conversa reiniciada');
});

// ── Helpers ──
function scrollToEnd() {
  chatStream.scrollTop = chatStream.scrollHeight;
}

function inferirEtapa(textoStatus: string): number {
  const t = textoStatus.toLowerCase();
  if (t.includes('conferindo') || t.includes('verificando') || t.includes('conferir')) return 2;
  if (t.includes('preenchendo') || t.includes('preencher') || t.includes('escrevendo') || t.includes('clicando')) return 1;
  return 0;
}

function appendUserMessage(msg: string, anexos?: ArquivoAnexo[]) {
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
          <span>bRowser Multiagente</span>
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
        <div class="live-status-text">Iniciando orquestração…</div>

        <div class="multi-agent-grid">
          <div class="agent-row">
            <span class="agent-badge badge-scout">🧭 Navegador</span>
            <span class="agent-msg scout-msg">Inspecionando aba…</span>
          </div>
          <div class="agent-row">
            <span class="agent-badge badge-synth">⚡ Dados</span>
            <span class="agent-msg synth-msg">Pronto</span>
          </div>
        </div>
      </div>

      <div class="markdown-content"></div>
    </div>
  `;
  chatStream.appendChild(row);
  scrollToEnd();
  return row.querySelector('.assistant-card')!;
}

function updateStepper(card: HTMLElement, etapa: number, textoStatus: string, agente?: PapelAgente) {
  const steps = card.querySelectorAll<HTMLElement>('.step');
  const lines = card.querySelectorAll<HTMLElement>('.step-line');
  const statusEl = card.querySelector<HTMLElement>('.live-status-text');
  const scoutMsg = card.querySelector<HTMLElement>('.scout-msg');
  const synthMsg = card.querySelector<HTMLElement>('.synth-msg');

  steps.forEach((el, i) => {
    el.classList.toggle('ativo', i === etapa);
    el.classList.toggle('feito', i < etapa);
  });
  lines.forEach((el, i) => {
    el.classList.toggle('feito', i < etapa);
  });

  if (statusEl && textoStatus) {
    statusEl.textContent = textoStatus;
  }

  if (agente === 'scout' && scoutMsg) {
    scoutMsg.textContent = textoStatus;
  } else if (agente === 'synthesizer' && synthMsg) {
    synthMsg.textContent = textoStatus;
  } else {
    if (scoutMsg) scoutMsg.textContent = textoStatus;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setBusy(busy: boolean) {
  sendBtn.disabled = busy;
  texto.disabled = busy;
  attachBtn.disabled = busy;
  if (!busy) {
    texto.focus();
  }
}

// ── Submit Handler ──
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const inputTexto = texto.value.trim();
  if (!inputTexto && arquivosAnexados.length === 0) return;

  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba?.id || !/^https?:/.test(aba.url ?? '')) {
    showToast('Abra a página do formulário numa aba normal (http/https)', 'error');
    return;
  }

  const arquivosParaEnviar = [...arquivosAnexados];
  arquivosAnexados = [];
  renderAttachmentTray();

  // Clear input
  texto.value = '';
  texto.style.height = 'auto';

  // Add messages
  appendUserMessage(inputTexto, arquivosParaEnviar);
  cardAtivo = appendAssistantMessage();
  setBusy(true);

  pedidoAtual = crypto.randomUUID();
  const pedido: Pedir = {
    tipo: 'pedido',
    pedidoId: pedidoAtual,
    texto: inputTexto || 'Processe os arquivos anexados e preencha a aba aberta.',
    tabId: aba.id,
    arquivos: arquivosParaEnviar.length > 0 ? arquivosParaEnviar : undefined,
  };

  const r = await chrome.runtime.sendMessage(pedido).catch((err) => ({ ok: false, erro: String(err) }));
  if (!r?.ok) {
    if (cardAtivo) {
      cardAtivo.classList.remove('status-active');
      const stepperEl = cardAtivo.querySelector('.live-stepper');
      if (stepperEl) stepperEl.remove();
      const contentEl = cardAtivo.querySelector('.markdown-content')!;
      contentEl.innerHTML = `<p style="color:var(--error);font-weight:600;">⚠️ ${escapeHtml(r?.erro ?? 'Falha ao falar com a extensão.')}</p>`;
    }
    showToast(r?.erro ?? 'Falha ao conectar com a ponte.', 'error');
    setBusy(false);
  }
});

function renderQuestionCard(e: Extract<Evento, { tipo: 'pergunta' }>) {
  const row = document.createElement('div');
  row.className = 'message-row assistant';

  let camposHtml = '';
  if (e.campos && e.campos.length > 0) {
    camposHtml = `
      <div class="question-fields">
        ${e.campos.map(c => `
          <div class="question-field-row">
            <label class="question-field-label">${escapeHtml(c)}</label>
            <input type="text" class="question-field-input" data-campo="${escapeHtml(c)}" placeholder="Informe ${escapeHtml(c)}…" />
          </div>
        `).join('')}
      </div>
    `;
  }

  let opcoesHtml = '';
  if (e.opcoes && e.opcoes.length > 0) {
    opcoesHtml = `
      <div class="question-options">
        ${e.opcoes.map(op => `
          <button type="button" class="question-option-btn" data-opcao="${escapeHtml(op)}">${escapeHtml(op)}</button>
        `).join('')}
      </div>
    `;
  }

  let freeInputHtml = '';
  if ((!e.campos || e.campos.length === 0) && (!e.opcoes || e.opcoes.length === 0)) {
    freeInputHtml = `
      <div class="question-field-row">
        <input type="text" class="question-field-input free-answer" placeholder="Digite sua resposta…" />
      </div>
    `;
  }

  row.innerHTML = `
    <div class="question-card" id="q-${e.perguntaId}">
      <div class="question-badge">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm0-1.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM6.5 6.25a1.5 1.5 0 1 1 2.378 1.226c-.346.242-.628.53-.628.924V9h-1.5v-.5a2.25 2.25 0 0 1 1.05-1.928.75.75 0 0 0-.3-.722.75.75 0 0 0-1-.15.75.75 0 0 1-1-.15Zm1.5 5.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"/>
        </svg>
        <span>bRowser precisa de informações</span>
      </div>
      <p class="question-desc">${escapeHtml(e.pergunta)}</p>
      ${camposHtml}
      ${opcoesHtml}
      ${freeInputHtml}
      ${(!e.opcoes || e.opcoes.length === 0) ? '<button type="button" class="question-submit-btn">Enviar e Continuar</button>' : ''}
    </div>
  `;

  chatStream.appendChild(row);
  scrollToEnd();

  const card = row.querySelector('.question-card') as HTMLElement;

  async function responder(textoResposta: string, respostasCampos?: Record<string, string>) {
    card.classList.add('respondido');
    card.querySelectorAll('input, button').forEach(el => (el as HTMLInputElement | HTMLButtonElement).disabled = true);
    
    appendUserMessage(textoResposta);

    const respMsg: RespostaUsuario = {
      tipo: 'resposta_usuario',
      pedidoId: e.pedidoId,
      perguntaId: e.perguntaId,
      resposta: textoResposta,
      respostasCampos,
    };
    chrome.runtime.sendMessage(respMsg).catch(console.error);
    showToast('Informações enviadas! Continuando preenchimento…');

    if (cardAtivo) {
      const statusEl = cardAtivo.querySelector('.live-status-text');
      if (statusEl) statusEl.textContent = 'Continuando preenchimento com seus dados…';
    }
  }

  // Handle option click
  card.querySelectorAll<HTMLButtonElement>('.question-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.opcao ?? btn.textContent ?? '';
      responder(val);
    });
  });

  // Handle submit button
  const submitBtn = card.querySelector<HTMLButtonElement>('.question-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const inputs = card.querySelectorAll<HTMLInputElement>('.question-field-input');
      const respostasCampos: Record<string, string> = {};
      const partes: string[] = [];

      inputs.forEach(inp => {
        const campo = inp.dataset.campo;
        const val = inp.value.trim();
        if (campo) {
          respostasCampos[campo] = val;
          partes.push(`${campo}: ${val || '(em branco)'}`);
        } else if (val) {
          partes.push(val);
        }
      });

      const textoFinal = partes.join(', ') || 'Continuar sem dados';
      responder(textoFinal, respostasCampos);
    });

    // Enter submits
    card.querySelectorAll<HTMLInputElement>('.question-field-input').forEach(inp => {
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          submitBtn.click();
        }
      });
    });
  }

  const primeiroInput = card.querySelector<HTMLInputElement>('.question-field-input');
  if (primeiroInput) {
    setTimeout(() => primeiroInput.focus(), 100);
  }
}

// ── Bridge Events ──
chrome.runtime.onMessage.addListener((e: Evento) => {
  // Não pertence a um pedido: tratar antes da guarda abaixo (antes, a guarda a descartava sempre).
  if (e.tipo === 'status_assinaturas') {
    renderizarAssinaturas(e.assinaturas, e.iaAtiva);
    return;
  }
  if (e.pedidoId !== pedidoAtual || !cardAtivo) return;

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
      const contentEl = cardAtivo.querySelector('.markdown-content')!;
      try {
        contentEl.innerHTML = marked.parse(e.texto) as string;
      } catch {
        contentEl.textContent = e.texto;
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
        await navigator.clipboard.writeText(e.texto);
        showToast('Resposta copiada para a área de transferência!');
      });
      header.appendChild(copyBtn);

      showToast('Pronto! Confira os campos preenchidos.', 'success');
    } else {
      if (stepperEl) stepperEl.remove();
      const contentEl = cardAtivo.querySelector('.markdown-content')!;
      contentEl.innerHTML = `<p style="color:var(--error);font-weight:600;">⚠️ Erro no processamento</p><p style="color:var(--fg-secondary);font-size:13px;">${escapeHtml(e.texto)}</p>`;
      showToast('Ocorreu um erro no processamento.', 'error');
    }

    setBusy(false);
    scrollToEnd();
    return;
  }
});

// ── Subscription Modal Interactions ──
btnSubscriptions.addEventListener('click', () => {
  subscriptionsModal.classList.add('open');
  chrome.runtime.sendMessage({ tipo: 'consultar_assinaturas' }).catch(() => {});
});

closeSubscriptionsBtn.addEventListener('click', () => {
  subscriptionsModal.classList.remove('open');
});

subscriptionsModal.addEventListener('click', (ev) => {
  if (ev.target === subscriptionsModal) {
    subscriptionsModal.classList.remove('open');
  }
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && subscriptionsModal.classList.contains('open')) {
    subscriptionsModal.classList.remove('open');
  }
});

function renderizarAssinaturas(assinaturas: ItemAssinatura[], iaAtiva: string) {
  const ativa = assinaturas.find((a) => a.ia === iaAtiva) || assinaturas.find((a) => a.ativo);
  if (ativa) {
    activeSubscriptionName.textContent = ativa.nome;
  }

  plansContainer.innerHTML = '';
  for (const plano of assinaturas) {
    const card = document.createElement('div');
    const isActive = plano.ia === iaAtiva;
    const isConnected = plano.conectado;

    card.className = `plan-card ${isActive ? 'active' : ''}`;
    card.dataset.ia = plano.ia;

    let iconSvg = '';
    if (plano.ia === 'agy') {
      iconSvg = `
        <svg class="official-brand-icon" viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M12 2C12 7.523 7.523 12 2 12c4.477 0 10 4.477 10 10 0-5.523 4.477-10 10-10-5.523 0-10-4.477-10-10z" fill="url(#gemini-sparkle-card-${plano.ia})"/>
          <defs>
            <linearGradient id="gemini-sparkle-card-${plano.ia}" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#4285F4"/>
              <stop offset="0.35" stop-color="#9B72CB"/>
              <stop offset="0.7" stop-color="#D96570"/>
              <stop offset="1" stop-color="#1FA463"/>
            </linearGradient>
          </defs>
        </svg>`;
    } else if (plano.ia === 'codex') {
      iconSvg = `
        <svg class="official-brand-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.6667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813v6.7227zm1.145-2.0728l3.056-1.7616 3.056 1.7616v3.5232l-3.056 1.7616-3.056-1.7616z"/>
        </svg>`;
    } else {
      iconSvg = `
        <svg class="official-brand-icon" viewBox="0 0 24 24" width="22" height="22" fill="#D97757">
          <path d="M13.5 2C13.5 1.17157 12.8284 0.5 12 0.5C11.1716 0.5 10.5 1.17157 10.5 2V5.5C10.5 6.32843 11.1716 7 12 7C12.8284 7 13.5 6.32843 13.5 5.5V2Z"/>
          <path d="M13.5 18.5C13.5 17.6716 12.8284 17 12 17C11.1716 17 10.5 17.6716 10.5 18.5V22C10.5 22.8284 11.1716 23.5 12 23.5C12.8284 23.5 13.5 22.8284 13.5 22V18.5Z"/>
          <path d="M22 10.5C22.8284 10.5 23.5 11.1716 23.5 12C23.5 12.8284 22.8284 13.5 22 13.5H18.5C17.6716 13.5 17 12.8284 17 12C17 11.1716 17.6716 10.5 18.5 10.5H22Z"/>
          <path d="M5.5 10.5C6.32843 10.5 7 11.1716 7 12C7 12.8284 6.32843 13.5 5.5 13.5H2C1.17157 13.5 0.5 12.8284 0.5 12C0.5 11.1716 1.17157 10.5 2 10.5H5.5Z"/>
          <path d="M18.8284 3.75736C18.2426 3.17157 17.2929 3.17157 16.7071 3.75736C16.1213 4.34315 16.1213 5.29289 16.7071 5.87868L19.182 8.35355C19.7678 8.93934 20.7175 8.93934 21.3033 8.35355C21.8891 7.76777 21.8891 6.81802 21.3033 6.23223L18.8284 3.75736Z"/>
          <path d="M7.29289 15.2929C6.70711 14.7071 5.75736 14.7071 5.17157 15.2929C4.58579 15.8787 4.58579 16.8284 5.17157 17.4142L7.64645 19.8891C8.23223 20.4749 9.18198 20.4749 9.76777 19.8891C10.3536 19.3033 10.3536 18.3536 9.76777 17.7678L7.29289 15.2929Z"/>
          <path d="M16.7071 18.1213C17.2929 18.7071 18.2426 18.7071 18.8284 18.1213L21.3033 15.6464C21.8891 15.0607 21.8891 14.1109 21.3033 13.5251C20.7175 12.9393 19.7678 12.9393 19.182 13.5251L16.7071 16C16.1213 16.5858 16.1213 17.5355 16.7071 18.1213Z"/>
          <path d="M5.17157 6.58579C5.75736 7.17157 6.70711 7.17157 7.29289 6.58579C7.87868 6 7.87868 5.05025 7.29289 4.46447L4.81799 1.98959C4.23221 1.40381 3.28246 1.40381 2.69667 1.98959C2.11089 2.57538 2.11089 3.52513 2.69667 4.11091L5.17157 6.58579Z"/>
        </svg>`;
    }

    card.innerHTML = `
      <div class="plan-left">
        <div class="plan-icon-wrap" title="${escapeHtml(plano.nome)}">
          ${iconSvg}
        </div>
        <div class="plan-details">
          <div class="plan-name-row">
            <span class="plan-name">${escapeHtml(plano.nome)}</span>
            ${isActive ? '<span class="plan-badge-active">● Ativo</span>' : ''}
          </div>
          <div class="plan-sub">${escapeHtml(plano.subtitulo)}</div>
        </div>
      </div>
      <div class="plan-action-container"></div>
    `;

    const actionContainer = card.querySelector('.plan-action-container')!;
    const btn = document.createElement('button');
    btn.className = 'plan-action-btn';

    if (isActive) {
      btn.classList.add('btn-switch');
      btn.textContent = 'Ativo';
      btn.disabled = true;
    } else if (isConnected) {
      btn.classList.add('btn-switch');
      btn.textContent = 'Usar plano';
      btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ tipo: 'ativar_assinatura', ia: plano.ia }).catch(() => {});
        showToast(`Plano alterado para ${plano.nome}!`);
      });
    } else {
      btn.classList.add('btn-connect');
      btn.textContent = 'Conectar';
      btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ tipo: 'conectar_assinatura', ia: plano.ia }).catch(() => {});
        showToast(`Iniciando conexão oficial com ${plano.nome}…`);
      });
    }

    actionContainer.appendChild(btn);
    plansContainer.appendChild(card);
  }
}

// Consulta status inicial das assinaturas
chrome.runtime.sendMessage({ tipo: 'consultar_assinaturas' }).catch(() => {});
