import type { ArquivoAnexo, Evento, ItemAssinatura, PapelAgente, Pedir, RespostaUsuario } from '@browser/shared';
import { iniciarCampoPontos } from '../../utils/campo-pontos';
import { markdownSeguro } from '../../utils/markdown';
import { bandejaHtml, classificarArquivos, ehArquivoTexto, mensagemAnexos } from './anexos';
import { botaoVisivel, type EstadoBotao } from './botao';
import { blocoConectores, iniciarConectores } from './conectores-ui';
import { escapeHtml, urlSegura } from './escape';
import { type Etapa, inferirEtapa } from './etapa';
import { iconeMarca } from './icones';
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

iniciarCampoPontos(document.getElementById('campo-pontos') as HTMLCanvasElement);

// ── DOM refs ──
const chatStream = document.getElementById('chat-stream')!;
const welcomeCard = document.getElementById('welcome-card')!;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const texto = document.getElementById('texto') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const btnLimpar = document.getElementById('btn-limpar')!;
const toast = document.getElementById('toast')!;
const toastMsg = document.getElementById('toast-msg')!;
const attachmentTray = document.getElementById('attachment-tray')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const attachBtn = document.getElementById('attach-btn') as HTMLButtonElement;
const dropOverlay = document.getElementById('drop-overlay')!;
const trabalhoBarra = document.getElementById('trabalho-barra')!;

// ── Subscription Modal Refs (Apple Design) ──
const btnSubscriptions = document.getElementById('btn-subscriptions')!;
const subscriptionsModal = document.getElementById('subscriptions-modal')!;
const closeSubscriptionsBtn = document.getElementById('close-subscriptions-btn')!;
const activeSubscriptionName = document.getElementById('active-subscription-name')!;
const plansContainer = document.getElementById('plans-container')!;

// ── Termos Modal & Consent Refs ──
const btnTermos = document.getElementById('btn-termos');
const termosModal = document.getElementById('termos-modal');
const closeTermosBtn = document.getElementById('close-termos-btn');
const btnConcordarModal = document.getElementById('btn-concordar-modal');
const linkTermosFooter = document.getElementById('link-termos-footer');
const linkTermosBanner = document.getElementById('link-termos-banner');
const firstRunBanner = document.getElementById('first-run-banner');
const btnConcordarTermos = document.getElementById('btn-concordar-termos');

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
  const { aceitos, recusados } = classificarArquivos(Array.from(files).map((f) => ({ nome: f.name, tamanho: f.size, tipo: f.type })));

  for (const f of Array.from(files).filter((x) => !recusados.some((r) => r.nome === x.name))) {
    const tipo = ehArquivoTexto(f.name, f.type);
    arquivosAnexados.push(
      tipo
        ? { nome: f.name, tipo: f.type || 'text/plain', tamanho: f.size, conteudoTexto: await f.text() }
        : { nome: f.name, tipo: f.type || 'application/octet-stream', tamanho: f.size, dadosBase64: await lerComoBase64(f) },
    );
  }

  renderAttachmentTray();
  const aviso = mensagemAnexos(aceitos.length, recusados);
  if (aviso) showToast(aviso, recusados.length > 0 ? 'error' : 'success');
}

function renderAttachmentTray() {
  attachmentTray.style.display = arquivosAnexados.length === 0 ? 'none' : 'flex';
  attachmentTray.innerHTML = bandejaHtml(arquivosAnexados);
  attachmentTray.querySelectorAll<HTMLButtonElement>('.chip-remove').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      arquivosAnexados.splice(Number(btn.dataset.remove), 1);
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
  texto.style.height = `${Math.min(texto.scrollHeight, 160)}px`;
});

// ── Ctrl+Enter / Cmd+Enter ──
texto.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    chatForm.requestSubmit();
  }
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

// Estado do botão enviar/parar. A regra em si está em botao.ts (testada); aqui é só o reflexo
// no DOM.
let estadoBotao: EstadoBotao = { tipo: 'ocioso' };

function setEstadoBotao(estado: EstadoBotao) {
  estadoBotao = estado;
  const v = botaoVisivel(estado);
  sendBtn.hidden = !v.enviar.visivel;
  sendBtn.disabled = v.enviar.desabilitado;
  sendBtn.title = v.enviar.titulo;
  stopBtn.hidden = !v.parar.visivel;
  stopBtn.disabled = v.parar.desabilitado;
  stopBtn.title = v.parar.titulo;
  // A captura de tela/anúncio do leitor de tela precisa saber que o controle mudou de propósito.
  stopBtn.setAttribute('aria-busy', String(estado.tipo === 'parando'));
}

function setBusy(busy: boolean) {
  texto.disabled = busy;
  attachBtn.disabled = busy;
  // A barra mora no footer, mas o busy é decidedor do card — por isso o mesmo setBusy serve pros
  // dois. Se algum dia ela voltar pro card, é daqui que sai.
  trabalhoBarra.hidden = !busy;
  if (busy) setEstadoBotao({ tipo: 'rodando' });
  else if (estadoBotao.tipo === 'erro') setEstadoBotao({ tipo: 'ocioso' });
  else setEstadoBotao({ tipo: 'ocioso' });
  if (!busy) {
    texto.focus();
  }
}

// Botão Parar: pede o cancelamento e trava o botão até a ponte confirmar. Sem isto, a pessoa ficava
// esperando o timeout de 5 minutos sem nenhuma forma de interromper (docs §7.3.1).
stopBtn.addEventListener('click', () => {
  if (estadoBotao.tipo !== 'rodando' || !pedidoAtual) return;
  setEstadoBotao({ tipo: 'parando' });
  chrome.runtime
    .sendMessage({ tipo: 'parar', pedidoId: pedidoAtual } satisfies MensagemExtensaoParar)
    .catch(() => setEstadoBotao({ tipo: 'rodando' }));
});
type MensagemExtensaoParar = { tipo: 'parar'; pedidoId: string };

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
  setEstadoBotao({ tipo: 'rodando' });
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
    showToast('Informações enviadas! Continuando preenchimento…');

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
  if (e.tipo === 'login_ia') {
    loginPendente.add(e.ia);
    renderizarAssinaturas(ultimasAssinaturas, iaAtivaAtual);
    renderizarLogin(e);
    return;
  }
  if (e.tipo === 'login_fim') {
    loginTimer && clearInterval(loginTimer);
    loginTimer = null;
    loginPendente.delete(e.ia);
    const box = document.getElementById('login-container')!;
    box.innerHTML = `<div class="login-card login-${e.ok ? 'ok' : 'erro'}">
      <div class="login-titulo">${e.ok ? '✓' : '⚠'} ${escapeHtml(e.nome)}</div>
      <div class="login-msg">${escapeHtml(e.mensagem)}</div></div>`;
    showToast(e.mensagem, e.ok ? 'success' : 'error');
    return;
  }
  if (e.tipo === 'logout_fim') {
    fecharDesconectar();
    if (e.ok === 0 && e.falhou.length === 0) {
      showToast('Nenhuma conta estava conectada.', 'success');
    } else if (e.falhou.length === 0) {
      showToast(e.ok === 1 ? '1 conta desconectada.' : `${e.ok} contas desconectadas.`, 'success');
    } else {
      // Falha parcial é o caso comum (secret-tool sem D-Bus, CLI ausente): diz o que falhou em vez
      // de dizer "desconectado" quando não foi.
      showToast(`Desconectadas: ${e.ok}. Não deu para: ${e.falhou.join(' · ')}`, 'error');
    }
    return;
  }
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
    showToast('Pedido parado. Nada foi enviado.', 'success');
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
  if (ev.key === 'Escape') {
    if (subscriptionsModal.classList.contains('open')) subscriptionsModal.classList.remove('open');
    if (termosModal?.classList.contains('open')) fecharTermos();
  }
});

// ── Termos Modal Interactions & Consent Gate ──
function abrirTermos() {
  if (!termosModal) return;
  termosModal.classList.add('open');
  termosModal.setAttribute('aria-hidden', 'false');
}

function fecharTermos() {
  if (!termosModal) return;
  termosModal.classList.remove('open');
  termosModal.setAttribute('aria-hidden', 'true');
}

function concordarTermos() {
  localStorage.setItem('browser_termos_aceitos_v2', 'true');
  if (firstRunBanner) firstRunBanner.style.display = 'none';
  fecharTermos();
  showToast('Termos aceitos. Uso assistivo liberado.');
}

if (btnTermos) btnTermos.addEventListener('click', abrirTermos);
if (closeTermosBtn) closeTermosBtn.addEventListener('click', fecharTermos);
if (linkTermosFooter) linkTermosFooter.addEventListener('click', abrirTermos);
if (linkTermosBanner) linkTermosBanner.addEventListener('click', abrirTermos);
if (btnConcordarModal) btnConcordarModal.addEventListener('click', concordarTermos);
if (btnConcordarTermos) btnConcordarTermos.addEventListener('click', concordarTermos);

if (termosModal) {
  termosModal.addEventListener('click', (ev) => {
    if (ev.target === termosModal) fecharTermos();
  });
}

// Banner de consentimento no primeiro uso
if (!localStorage.getItem('browser_termos_aceitos_v2') && firstRunBanner) {
  firstRunBanner.style.display = 'block';
}

// Card de login oficial: só o link e o código que a ponte extraiu do CLI escondido.
let loginTimer: ReturnType<typeof setInterval> | null = null;

function renderizarLogin(e: Extract<Evento, { tipo: 'login_ia' }>) {
  loginTimer && clearInterval(loginTimer);
  loginTimer = null;
  const box = document.getElementById('login-container')!;
  const codigo = e.codigo
    ? `<div class="login-codigo-row">
         <code class="login-codigo">${escapeHtml(e.codigo)}</code>
         <button class="login-mini-btn" data-copiar="${escapeHtml(e.codigo)}">copiar</button>
         <span class="login-prazo" data-prazo="${e.expiraEmSegundos ?? ''}"></span>
       </div>`
    : '';
  const campo = e.pedeCodigo
    ? `<div class="login-campo-row">
         <input class="login-input" type="text" placeholder="cole aqui o código" autocomplete="off" spellcheck="false">
         <button class="login-mini-btn login-enviar">enviar</button>
       </div>
       <div class="login-dica">A página vai mostrar um código; cole ele aqui.</div>`
    : '';

  // A URL vem da ponte (extraída do texto do CLI oficial). `escapeHtml` protege o atributo, mas
  // não o esquema: um `javascript:` escapado ainda executa ao clicar. `urlSegura` fecha isso, e o
  // mesmo objeto validado alimenta o link e a aba nova — não dá para um passar e o outro não.
  const url = urlSegura(e.url);
  if (!url) {
    showToast('O CLI devolveu um endereço de login inesperado. Tente conectar de novo.', 'error');
    return;
  }

  box.innerHTML = `<div class="login-card">
    <div class="login-titulo">Conectando ${escapeHtml(e.nome)}</div>
    <a class="login-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Abrir login no navegador</a>
    <div class="login-dica">Login oficial da sua assinatura. Nenhuma chave de API passa pelo BrOWSER.</div>
    ${codigo}${campo}
  </div>`;

  box.querySelector('[data-copiar]')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget as HTMLElement;
    await navigator.clipboard.writeText(b.dataset.copiar!);
    b.textContent = 'copiado ✓';
    setTimeout(() => {
      b.textContent = 'copiar';
    }, 1500);
  });

  if (e.pedeCodigo) {
    const input = box.querySelector<HTMLInputElement>('.login-input')!;
    const enviar = () => {
      const v = input.value.trim();
      if (!v) return;
      chrome.runtime.sendMessage({ tipo: 'login_codigo', ia: e.ia, codigo: v }).catch(() => {});
      input.value = '';
      input.placeholder = 'código enviado ✓';
    };
    box.querySelector('.login-enviar')?.addEventListener('click', enviar);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') enviar();
    });
    setTimeout(() => input.focus(), 50);
  }

  // O agy dá 60s e não estende: abrir a aba na hora é o que cabe nesses 60s. O botão continua
  // valendo pra quem preferir abrir depois.
  chrome.tabs.create({ url, active: true }).catch(() => {});

  const prazo = box.querySelector<HTMLElement>('[data-prazo]');
  if (prazo && e.expiraEmSegundos) {
    let restante = e.expiraEmSegundos;
    const tick = () => {
      if (restante <= 0) {
        prazo.textContent = 'expirou';
        prazo.classList.add('expirado');
        clearInterval(loginTimer!);
        loginTimer = null;
        return;
      }
      const m = Math.floor(restante / 60);
      prazo.textContent = `expira em ${m}:${String(restante % 60).padStart(2, '0')}`;
      restante--;
    };
    tick();
    loginTimer = setInterval(tick, 1000);
  }
}

// ---- Desconectar todas as contas: botão quieto + alert de confirmação ----
//
// O botão que abre o alert é o destrutivo (vermelho). O botão de confirmação do alert não é:
// ele executa exatamente o que a pessoa acabou de pedir (alerts.md › Buttons). Cancel nunca é o
// default, e Esc também cancela (alerts.md › Buttons).

const desconectarModal = () => document.getElementById('desconectar-modal')!;
let gatilhoDesconectar: HTMLElement | null = null;

function abrirDesconectar(e: Event) {
  gatilhoDesconectar = e.currentTarget as HTMLElement;
  const m = desconectarModal();
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
  // Cancelar em foco: quem não quer o alert fecha sem ler os botões.
  document.getElementById('btn-desconectar-cancelar')!.focus();
}

function fecharDesconectar() {
  const m = desconectarModal();
  if (!m.classList.contains('open')) return;
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
  gatilhoDesconectar?.focus();
  gatilhoDesconectar = null;
}

document.getElementById('btn-desconectar-todas')?.addEventListener('click', abrirDesconectar);
document.getElementById('btn-desconectar-cancelar')?.addEventListener('click', fecharDesconectar);
document.getElementById('btn-desconectar-confirmar')!.addEventListener('click', () => {
  chrome.runtime.sendMessage({ tipo: 'desconectar_todos' }).catch(() => {});
  showToast('Desconectando as contas…');
});
// Clique fora cancela, como em qualquer modal.
desconectarModal().addEventListener('click', (e) => {
  if (e.target === desconectarModal()) fecharDesconectar();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !desconectarModal().classList.contains('open')) return;
  e.preventDefault();
  fecharDesconectar();
});

// Estado do card de planos, para a UI se redesenhar sozinha quando um login começa/termina.
let ultimasAssinaturas: ItemAssinatura[] = [];
let iaAtivaAtual = 'agy';
const loginPendente = new Set<string>();

function renderizarAssinaturas(assinaturas: ItemAssinatura[], iaAtiva: string) {
  ultimasAssinaturas = assinaturas;
  iaAtivaAtual = iaAtiva;
  const ativa = assinaturas.find((a) => a.ia === iaAtiva) || assinaturas.find((a) => a.ativo);
  if (ativa) {
    activeSubscriptionName.textContent = ativa.nome;
  }

  plansContainer.innerHTML = '';
  for (const plano of assinaturas) {
    const card = document.createElement('div');
    const isActive = plano.ia === iaAtiva;
    const isConnected = plano.conectado;
    const pendente = loginPendente.has(plano.ia);

    card.className = `plan-card ${isActive ? 'active com-ativo' : ''}`;
    card.dataset.ia = plano.ia;

    const iconSvg = iconeMarca(plano.ia);

    card.innerHTML = `
      <div class="plan-left">
        <div class="plan-icon-wrap" title="${escapeHtml(plano.nome)}">
          ${iconSvg}
        </div>
        <div class="plan-details">
          <div class="plan-name-row">
            <span class="plan-name">${escapeHtml(plano.nome)}</span>
          </div>
          <div class="plan-status" data-conectado="${isConnected ? 'sim' : 'nao'}">
            ${escapeHtml(pendente ? 'Conectando…' : isConnected ? 'Conectado' : plano.detalhe || 'Não conectado')}
          </div>
          <input
            type="text"
            class="plan-model"
            list="modelos-${plano.ia}"
            placeholder="Modelo (padrão do CLI)"
            aria-label="Modelo do ${escapeHtml(plano.nome)}"
            value="${escapeHtml(plano.modelo ?? '')}"
            ${isConnected ? '' : 'disabled'}
          />
          <datalist id="modelos-${plano.ia}">
            ${(plano.modelos ?? []).map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nome)}</option>`).join('')}
          </datalist>
        </div>
      </div>
      <div class="plan-action-container"></div>
    `;

    // input+datalist em vez de <select>: dá o dropdown com os modelos DESTA ia e aceita texto
    // livre no mesmo controle. A lista envelhece (o codex não tem como se listar), e com <select>
    // um id fora da lista seria impossível de escolher.
    const modelInput = card.querySelector<HTMLInputElement>('.plan-model')!;
    const enviarModelo = () => {
      const modelo = modelInput.value.trim();
      if (modelo === (plano.modelo ?? '')) return;
      chrome.runtime.sendMessage({ tipo: 'definir_modelo', ia: plano.ia, modelo }).catch(() => {});
      showToast(`Modelo do ${plano.nome}: ${modelo || 'padrão do CLI'}.`);
    };
    modelInput.addEventListener('change', enviarModelo);
    modelInput.addEventListener('blur', enviarModelo);

    const actionContainer = card.querySelector('.plan-action-container')!;
    // Switch, não botão: "usar este plano" é um estado, não uma ação pontual (toggles.md).
    // Desligar o que está ligado não desconecta a conta — só volta a usar outro plano.
    const sw = document.createElement('button');
    sw.className = 'plan-switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(isActive));
    sw.setAttribute('aria-label', `Usar o plano ${plano.nome}`);
    if (pendente) sw.setAttribute('aria-busy', 'true');
    sw.disabled = pendente;
    sw.addEventListener('click', () => {
      if (isActive) return; // já é o plano em uso: nada a fazer
      if (isConnected) {
        chrome.runtime.sendMessage({ tipo: 'ativar_assinatura', ia: plano.ia }).catch(() => {});
        showToast(`Plano alterado para ${plano.nome}.`);
      } else {
        // Ligar um plano que nunca foi conectado exige o login: a linha já diz "Não conectado",
        // e o switch entra em "Conectando…" para o clique não parecer perdido.
        loginPendente.add(plano.ia);
        chrome.runtime.sendMessage({ tipo: 'conectar_assinatura', ia: plano.ia }).catch(() => {});
        renderizarAssinaturas(ultimasAssinaturas, iaAtivaAtual);
      }
    });
    actionContainer.appendChild(sw);
    plansContainer.appendChild(card);
    // Conectores do Google moram debaixo do card do Google, não no fim da lista.
    if (plano.ia === 'agy') plansContainer.appendChild(blocoConectores());
  }
}

// O botão "anexar do Drive" só nasce se já houver token: sem client_id ou sem login, some.
iniciarConectores({
  aoAnexar: (arquivos) => void processarArquivos(arquivos),
  avisar: (mensagem, erro) => showToast(mensagem, erro ? 'error' : 'success'),
});

// Consulta status inicial das assinaturas
chrome.runtime.sendMessage({ tipo: 'consultar_assinaturas' }).catch(() => {});

// ── Aprendizado passivo (liga/desliga; o background respeita a mesma chave) ──
//
// Default agora é DESLIGADO. Antes, "ausente = ligado" significava que instalar a extensão já
// autorizava a coleta de estrutura de formulário de todas as páginas — consentimento por omissão,
// que é o contrário do que os Termos prometem (privacy by default).
const CHAVE_APRENDIZADO = 'aprendizadoPassivo';
const toggleAprendizado = document.getElementById('toggle-aprendizado') as HTMLInputElement;
const ligarAprendizado = (ligado: boolean) => chrome.storage.local.set({ [CHAVE_APRENDIZADO]: ligado });

(async () => {
  const { aprendizadoPassivo } = await chrome.storage.local.get(CHAVE_APRENDIZADO);
  const ligado = aprendizadoPassivo === true; // opt-in: só liga quem já escolheu ligar
  toggleAprendizado.checked = ligado;
  if (aprendizadoPassivo === undefined) await ligarAprendizado(false);
})();

toggleAprendizado.addEventListener('change', () => {
  ligarAprendizado(toggleAprendizado.checked);
  showToast(
    toggleAprendizado.checked
      ? 'Aprendizado de formulários ligado (só a estrutura dos campos, nunca valores)'
      : 'Aprendizado de formulários desligado',
  );
});
