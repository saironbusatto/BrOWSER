import { type ArquivoAnexo, type Evento, IAS, type Ia, type ItemAssinatura, type Pedir } from '@browser/shared';
import { iniciarCampoPontos } from '../../utils/campo-pontos';
import { type ConversaGuardada, ehEventoDoPedido } from '../../utils/conversa-log';
import { marcarAbaDoPainel } from '../../utils/grupo-abas';
import { bandejaHtml, classificarArquivos, ehArquivoTexto, mensagemAnexos } from './anexos';
import { botaoVisivel, type EstadoBotao } from './botao';
import { aplicarEvento, appendUserMessage, iniciarChat, iniciarPedido, limparChat, pedidoEmCurso, repetirConversa } from './chat';
import { blocoConectores, iniciarConectores } from './conectores-ui';
import { CHAVE_CONTAS, contaAtiva, largarConta, lerContas, usarConta, visaoConta } from './contas';
import { escapeHtml, urlSegura } from './escape';
import { iconeMarca } from './icones';
import { rodaModelo } from './roda-modelo';
import { CHAVE_TERMOS, registroDeAceite, termosAceitos } from './termos';

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
const toastDetalhe = document.getElementById('toast-detalhe')!;
const toastIcone = document.getElementById('toast-icone')!;
const toastFechar = document.getElementById('toast-fechar')!;
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
const activeSubDot = document.getElementById('active-sub-dot')!;
const welcomeHint = document.getElementById('welcome-hint')!;
const welcomeConectar = document.getElementById('welcome-conectar') as HTMLButtonElement;
const plansContainer = document.getElementById('plans-container')!;

// ── Termos Modal & Consent Refs ──
const btnTermos = document.getElementById('btn-termos');
const termosModal = document.getElementById('termos-modal');
const closeTermosBtn = document.getElementById('close-termos-btn');
const btnConcordarModal = document.getElementById('btn-concordar-modal');
const linkTermosFooter = document.getElementById('link-termos-footer');
const portaoTermos = document.getElementById('portao-termos')!;

// A conversa deste painel. Mora no background (utils/conversa-log.ts) e chega no `historico`:
// assim ela sobrevive ao painel recolher, e a IA continua lembrando (sessão do CLI). A lixeira
// começa outra.
let conversaId: string = crypto.randomUUID();
let arquivosAnexados: ArquivoAnexo[] = [];

// ── Aviso (toast) ──
//
// Só para o que a tela não mostra sozinha: resultado de algo que roda longe (login, a IA
// terminando) ou um erro. Mudar um switch não gera aviso — o switch já é a resposta.
// Título curto em linguagem de gente; o detalhe, quando existe, diz o que fazer.
const ICONES_AVISO = {
  success:
    '<path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.28-8.72-3.75 3.75a.75.75 0 0 1-1.06 0L4.72 8.28a.75.75 0 0 1 1.06-1.06L7 8.44l3.22-3.22a.75.75 0 1 1 1.06 1.06Z"/>',
  error:
    '<path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-10.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4.5Zm0 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75Z"/>',
  info: '<path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm0-9.5a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75ZM8.75 7v4a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 1.5 0Z"/>',
} as const;
type TipoAviso = keyof typeof ICONES_AVISO;
// Erro fica mais tempo: quem errou precisa ler o "como resolver", não só ver que deu errado.
const DURACAO_AVISO: Record<TipoAviso, number> = { success: 3500, info: 4500, error: 8000 };

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastRestante = 0;
let toastDesde = 0;

function esconderAviso() {
  clearTimeout(toastTimer);
  toast.classList.remove('active');
}

function agendarFim(ms: number) {
  clearTimeout(toastTimer);
  toastRestante = ms;
  toastDesde = performance.now();
  toastTimer = setTimeout(esconderAviso, ms);
}

function showToast(titulo: string, type: TipoAviso = 'success', detalhe = '') {
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toastIcone.innerHTML = ICONES_AVISO[type];
  toastMsg.textContent = titulo;
  toastDetalhe.textContent = detalhe;
  toastDetalhe.hidden = !detalhe;
  toast.className = `aviso active ${type}`;
  agendarFim(DURACAO_AVISO[type]);
}

// Ler com o mouse em cima (ou o foco no X) pausa o relógio; sair retoma de onde parou.
toast.addEventListener('pointerenter', () => {
  clearTimeout(toastTimer);
  toastRestante -= performance.now() - toastDesde;
});
toast.addEventListener('pointerleave', () => agendarFim(Math.max(toastRestante, 1500)));
toastFechar.addEventListener('click', esconderAviso);

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
  if (portaoTermos.isConnected) return; // antes do aceite, nada entra
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
  limparChat();
  arquivosAnexados = [];
  renderAttachmentTray();
  chrome.runtime
    .sendMessage({ tipo: 'limpar_conversa' })
    .then((c: ConversaGuardada) => {
      conversaId = c.conversaId; // a IA esquece junto com a tela
    })
    .catch(() => {});
});

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
  const pedidoAtual = pedidoEmCurso();
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

  if (liberadas.length === 0) {
    abrirPlanos();
    showToast('Conecte uma IA primeiro', 'info', 'Escolha a assinatura que você já tem e faça o login.');
    return;
  }

  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba?.id || !/^https?:/.test(aba.url ?? '')) {
    showToast('Abra o site que você quer preencher', 'info', 'O BrOWSER trabalha na aba ao lado, e esta não é a página de um site.');
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
  const pedidoId = crypto.randomUUID();
  const cardAtivo = iniciarPedido(pedidoId);
  setBusy(true);
  setEstadoBotao({ tipo: 'rodando' });
  const pedido: Pedir = {
    tipo: 'pedido',
    pedidoId,
    texto: inputTexto || 'Processe os arquivos anexados e preencha a aba aberta.',
    tabId: aba.id,
    arquivos: arquivosParaEnviar.length > 0 ? arquivosParaEnviar : undefined,
    ias: liberadas,
    conversaId,
  };

  const r = await chrome.runtime.sendMessage(pedido).catch((err) => ({ ok: false, erro: String(err) }));
  if (!r?.ok) {
    {
      cardAtivo.classList.remove('status-active');
      const stepperEl = cardAtivo.querySelector('.live-stepper');
      if (stepperEl) stepperEl.remove();
      const contentEl = cardAtivo.querySelector('.markdown-content')!;
      contentEl.innerHTML = `<p style="color:var(--error);font-weight:600;">⚠️ ${escapeHtml(r?.erro ?? 'Falha ao falar com a extensão.')}</p>`;
    }
    showToast('Não deu para começar', 'error', 'O BrOWSER do computador não respondeu. Feche e abra o navegador e tente de novo.');
    setBusy(false);
  }
});

// ── Bridge Events ──
chrome.runtime.onMessage.addListener((e: Evento) => {
  // Não pertence a um pedido: tratar antes da guarda abaixo (antes, a guarda a descartava sempre).
  if (e.tipo === 'status_assinaturas') {
    renderizarAssinaturas(e.assinaturas);
    return;
  }
  if (e.tipo === 'login_ia') {
    loginPendente.add(e.ia);
    renderizarAssinaturas(ultimasAssinaturas);
    renderizarLogin(e);
    return;
  }
  if (e.tipo === 'login_fim') {
    loginTimer && clearInterval(loginTimer);
    loginTimer = null;
    loginPendente.delete(e.ia);
    // Deu certo: o card vira "Em uso" e o aviso confirma; o card de login some. Deu errado: fica
    // na tela, perto do plano, com o motivo (writing.md › errors close to the problem).
    const box = document.getElementById('login-container')!;
    box.innerHTML = e.ok
      ? ''
      : `<div class="login-card login-erro">
      <div class="login-titulo">${escapeHtml(e.nome)}</div>
      <div class="login-msg">${escapeHtml(e.mensagem)}</div></div>`;
    if (e.ok) {
      liberadas = usarConta(liberadas, e.ia);
      void gravarContas();
      showToast(`${e.nome} conectado`, 'success', 'Já pode fazer pedidos.');
    } else {
      showToast(`Não deu para conectar o ${e.nome}`, 'error', 'O código de acesso pode ter expirado. Tente conectar de novo.');
    }
    renderizarAssinaturas(ultimasAssinaturas);
    return;
  }
  if (e.tipo === 'logout_fim') {
    fecharDesconectar();
    if (e.ok === 0 && e.falhou.length === 0) {
      showToast('Nenhuma conta estava conectada', 'info');
    } else if (e.falhou.length === 0) {
      showToast(e.ok === 1 ? 'Conta desconectada' : `${e.ok} contas desconectadas`, 'success', 'Sua assinatura continua ativa na empresa.');
    } else {
      // Falha parcial é o caso comum (secret-tool sem D-Bus, CLI ausente): diz o que falhou em vez
      // de dizer "desconectado" quando não foi.
      showToast(
        'Nem todas as contas saíram',
        'error',
        `O BrOWSER parou de usar todas, mas o computador ainda guarda: ${e.falhou.join(' · ')}`,
      );
    }
    return;
  }
  if (ehEventoDoPedido(e)) aplicarEvento(e);
});

// ── Subscription Modal Interactions ──
function abrirPlanos() {
  subscriptionsModal.classList.add('open');
  chrome.runtime.sendMessage({ tipo: 'consultar_assinaturas' }).catch(() => {});
}
btnSubscriptions.addEventListener('click', abrirPlanos);
welcomeConectar.addEventListener('click', abrirPlanos);

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

// O portão: primeira vez na vida da extensão, nada funciona antes do aceite. O HTML já nasce
// trancado (portão visível, resto inert); aqui só se destranca, nunca o contrário.
const TRANCADOS = ['.app-header', '#chat-stream', '.input-section'];

function liberarPainel() {
  portaoTermos.remove();
  for (const sel of TRANCADOS) document.querySelector(sel)?.removeAttribute('inert');
  texto.focus();
}

async function concordarTermos() {
  // O aprendizado faz parte dos Termos (decisão do produto): aceitar liga os dois juntos.
  await chrome.storage.local.set({ [CHAVE_TERMOS]: registroDeAceite(new Date()), aprendizadoPassivo: true });
  localStorage.removeItem('browser_termos_aceitos_v2'); // banner antigo; não vale mais
  fecharTermos();
  liberarPainel();
}

if (btnTermos) btnTermos.addEventListener('click', abrirTermos);
if (closeTermosBtn) closeTermosBtn.addEventListener('click', fecharTermos);
if (linkTermosFooter) linkTermosFooter.addEventListener('click', abrirTermos);
if (btnConcordarModal) btnConcordarModal.addEventListener('click', () => void concordarTermos());
document.getElementById('link-termos-portao')!.addEventListener('click', abrirTermos);
document.getElementById('btn-aceitar-portao')!.addEventListener('click', () => void concordarTermos());

if (termosModal) {
  termosModal.addEventListener('click', (ev) => {
    if (ev.target === termosModal) fecharTermos();
  });
}

chrome.storage.local.get(CHAVE_TERMOS).then((r) => {
  if (termosAceitos(r[CHAVE_TERMOS])) {
    liberarPainel();
    return;
  }
  // Sem aceite: o portão e o modal dos Termos são as únicas coisas clicáveis, e o "Aceitar" dos
  // dois libera do mesmo jeito.
  document.getElementById('btn-aceitar-portao')!.focus();
});

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
    showToast('O login não abriu', 'error', 'Tente conectar de novo.');
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
  // Aba do painel, não da IA: marcada para o painel não recolher enquanto a pessoa faz o login.
  chrome.tabs
    .create({ url, active: false })
    .then(async (t) => {
      if (t.id !== undefined) await marcarAbaDoPainel(t.id);
      if (t.id !== undefined) await chrome.tabs.update(t.id, { active: true });
    })
    .catch(() => {});

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
// 'todas' = o botão de desconectar tudo; uma IA = o switch daquela conta.
let desconectarAlvo: { ia: Ia } | 'todas' = 'todas';

function abrirDesconectar(e: Event, ia?: Ia, nome?: string) {
  gatilhoDesconectar = e.currentTarget as HTMLElement;
  desconectarAlvo = ia ? { ia } : 'todas';
  const m = desconectarModal();
  document.getElementById('desconectar-titulo')!.textContent = ia && nome ? `Desconectar ${nome}?` : 'Desconectar todas as contas?';
  document.getElementById('desconectar-msg')!.textContent = ia
    ? `O BrOWSER vai parar de usar essa conta. As outras continuam conectadas. Isso não cancela a assinatura em nenhuma empresa.`
    : 'O BrOWSER vai parar de usar essas assinaturas. Isso não cancela a assinatura em nenhuma empresa. Para voltar, entre em cada conta de novo.';
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
  desconectarAlvo = 'todas';
  gatilhoDesconectar?.focus();
  gatilhoDesconectar = null;
}

document.getElementById('btn-desconectar-todas')?.addEventListener('click', abrirDesconectar);
document.getElementById('btn-desconectar-cancelar')?.addEventListener('click', fecharDesconectar);
document.getElementById('btn-desconectar-confirmar')!.addEventListener('click', () => {
  // O BrOWSER larga a conta na hora, mesmo que o logout do CLI falhe depois: o que a pessoa
  // pediu foi "pare de usar". Se o computador não apagar o login, o logout_fim avisa.
  if (desconectarAlvo === 'todas') {
    liberadas = [];
    chrome.runtime.sendMessage({ tipo: 'desconectar_todos' }).catch(() => {});
  } else {
    liberadas = largarConta(liberadas, desconectarAlvo.ia);
    chrome.runtime.sendMessage({ tipo: 'desconectar_assinatura', ia: desconectarAlvo.ia }).catch(() => {});
  }
  void gravarContas();
  renderizarAssinaturas(ultimasAssinaturas);
  fecharDesconectar();
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
const loginPendente = new Set<string>();
// Contas que a pessoa conectou pelo BrOWSER (regra em contas.ts). Começa vazio: login de CLI que
// já existia na máquina não liga nada sozinho.
let liberadas: Ia[] = [];
const gravarContas = () => chrome.storage.local.set({ [CHAVE_CONTAS]: liberadas });

function pintarCabecalho(ativa: ItemAssinatura | undefined) {
  activeSubscriptionName.textContent = ativa ? ativa.nome : 'Conectar IA';
  activeSubDot.classList.toggle('active', Boolean(ativa));
  welcomeConectar.hidden = Boolean(ativa);
  welcomeHint.textContent = ativa ? 'Em que eu posso te ajudar?' : 'Para começar, conecte a IA que você já assina.';
}

function renderizarAssinaturas(assinaturas: ItemAssinatura[]) {
  ultimasAssinaturas = assinaturas;
  const iaAtiva = contaAtiva(liberadas, assinaturas);
  pintarCabecalho(assinaturas.find((a) => a.ia === iaAtiva));
  // Quem estava girando uma roda não pode perder o foco porque a ponte mandou status novo.
  const focoNaRoda = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.plan-card')?.dataset.ia;

  plansContainer.innerHTML = '';
  for (const plano of assinaturas) {
    const { conectado: isConnected, ativo: isActive } = visaoConta(plano.ia, liberadas, assinaturas);
    const pendente = loginPendente.has(plano.ia);
    const card = document.createElement('div');
    card.className = `plan-card${isActive ? ' active' : ''}`;
    card.dataset.ia = plano.ia;

    const status = pendente
      ? 'Conectando…'
      : isActive
        ? 'Em uso'
        : isConnected
          ? 'Conectado'
          : !plano.instalado
            ? 'Não instalado neste computador'
            : 'Não conectado';
    card.innerHTML = `
      <div class="plan-left">
        <div class="plan-icon-wrap" aria-hidden="true">${iconeMarca(plano.ia)}</div>
        <div class="plan-details">
          <span class="plan-name">${escapeHtml(plano.nome)}</span>
          <span class="plan-status" data-conectado="${isConnected ? 'sim' : 'nao'}">${escapeHtml(status)}</span>
        </div>
      </div>
    `;

    // Switch, não botão: "usar este plano" é um estado, não uma ação pontual (toggles.md).
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'plan-switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(isActive));
    sw.setAttribute('aria-label', isConnected ? `Usar ${plano.nome}` : `Conectar ${plano.nome}`);
    if (pendente) sw.setAttribute('aria-busy', 'true');
    sw.disabled = pendente || !plano.instalado;
    sw.addEventListener('click', (e) => {
      if (isActive) {
        // O switch do plano em uso abre a confirmação de desconectar, não "desliga" em silêncio.
        abrirDesconectar(e, plano.ia, plano.nome);
        return;
      }
      if (isConnected) {
        liberadas = usarConta(liberadas, plano.ia);
        void gravarContas();
        renderizarAssinaturas(ultimasAssinaturas);
        return;
      }
      // Conectar é sempre o login completo, mesmo se o CLI já tiver sessão: é a pessoa dizendo
      // "pode usar esta conta". O switch entra em "Conectando…" para o clique não parecer perdido.
      loginPendente.add(plano.ia);
      chrome.runtime.sendMessage({ tipo: 'conectar_assinatura', ia: plano.ia }).catch(() => {});
      renderizarAssinaturas(ultimasAssinaturas);
    });
    card.appendChild(sw);

    // A roda só aparece em conta conectada: escolher modelo de conta sem login não leva a nada.
    if (isConnected) {
      card.appendChild(
        rodaModelo({
          rotulo: `Modelo do ${plano.nome}`,
          modelos: plano.modelos ?? [],
          atual: plano.modelo ?? '',
          aoEscolher: (modelo) => {
            chrome.runtime.sendMessage({ tipo: 'definir_modelo', ia: plano.ia, modelo }).catch(() => {});
          },
        }),
      );
    }
    plansContainer.appendChild(card);
    if (focoNaRoda === plano.ia) card.querySelector<HTMLElement>('.roda-lista')?.focus({ preventScroll: true });
    // Conectores do Google moram debaixo do card do Google, não no fim da lista.
    if (plano.ia === 'agy') plansContainer.appendChild(blocoConectores());
  }
}

// O botão "anexar do Drive" só nasce se já houver token: sem client_id ou sem login, some.
iniciarConectores({
  aoAnexar: (arquivos) => void processarArquivos(arquivos),
  avisar: (titulo, erro, detalhe) => showToast(titulo, erro ? 'error' : 'success', detalhe),
});

// Contas liberadas primeiro, status depois: sem isso o primeiro status pintava tudo desconectado.
chrome.storage.local.get(CHAVE_CONTAS).then((r) => {
  liberadas = lerContas(r[CHAVE_CONTAS], IAS);
  pintarCabecalho(undefined);
  chrome.runtime.sendMessage({ tipo: 'consultar_assinaturas' }).catch(() => {});
});

// ── Conversa guardada ──
// O chat sobe vazio e se refaz com o que o background guardou: recolher o painel (sair do grupo
// de abas da IA) fecha este documento, e a conversa não pode ir junto.
iniciarChat({ chatStream, welcomeCard, showToast, setBusy, setEstadoBotao });
chrome.runtime
  .sendMessage({ tipo: 'historico' })
  .then((c: ConversaGuardada | undefined) => {
    if (!c?.conversaId) return;
    conversaId = c.conversaId;
    repetirConversa(c.registros);
  })
  .catch(() => {});
