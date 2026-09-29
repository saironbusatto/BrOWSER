// UI dos conectores: o bloco que aparece debaixo do card do Google AI Pro e o seletor de
// arquivos do Drive. Fica isolado aqui de propósito — main.ts só chama iniciarConectores() e
// mete o bloco na lista, porque main.ts é o arquivo que mais muda neste repo.

import {
  CONECTORES,
  baixarDrive,
  conectorConfigurado,
  desconectarGoogle,
  formatarTamanho,
  listarDrive,
  tokenGoogle,
  type ArquivoDrive,
} from '../../utils/conectores';

type Deps = {
  aoAnexar: (arquivos: File[]) => void; // reaproveita processarArquivos() do painel
  avisar: (mensagem: string, erro?: boolean) => void;
};

let deps: Deps;
let conectado = false;
let conectando = false;
let tokenAtual = '';

// Ícones do seletor. Pastas abrem, arquivo baixa, documento nativo exporta — o usuário precisa
// distinguir os três, senão clica esperando anexo e recebe uma navegação.
const ICONE_PASTA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/></svg>';
const ICONE_ARQUIVO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 2h7l5 5v15a0 0 0 0 1 0 0H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5Z"/></svg>';
const ICONE_DOC = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 2h7l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5ZM8 11h8v1.5H8V11Zm0 3.5h8V16H8v-1.5Z"/></svg>';

/** true quando dá para usar o Drive agora: client_id no manifest + token válido. */
export async function drivePronto(): Promise<boolean> {
  if (!conectorConfigurado()) return false;
  try {
    tokenAtual = await tokenGoogle([escopoDoDrive()], false);
    conectado = true;
  } catch {
    conectado = false;
  }
  return conectado;
}

function escopoDoDrive(): string {
  return CONECTORES[0]!.escopo;
}

export function blocoConectores(): HTMLElement {
  const bloco = document.createElement('div');
  bloco.className = 'conectores-bloco';
  bloco.innerHTML = `
    <div class="conectores-titulo">Conectores do Google</div>
    <div class="conector-linha">
      <div class="conector-icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8.47 2.88 1.57 15.31a1.34 1.34 0 0 0 1.16 2.01h16.54a1.34 1.34 0 0 0 1.16-2.01L15.53 2.88a1.34 1.34 0 0 0-2.32 0L12.08 5.5H7.79L8.47 2.88Zm-2.4 5.06H3.2l6.13-10.98 2.87 5.15v5.83H6.07Zm5.6 5.83V7.11L8.8 1.98l3.73 6.67v5.12h-.86Z"/></svg>
      </div>
      <div class="conector-info">
        <span class="conector-nome">${CONECTORES[0]!.nome}</span>
        <span class="conector-status" data-conectado="nao">Não conectado</span>
      </div>
      <button type="button" class="plan-switch" role="switch" aria-checked="false"
              aria-label="Conectar o Google Drive"></button>
    </div>
    <p class="conectores-nota" hidden></p>
  `;

  const status = bloco.querySelector<HTMLElement>('.conector-status')!;
  const nota = bloco.querySelector<HTMLElement>('.conectores-nota')!;
  const sw = bloco.querySelector<HTMLButtonElement>('.plan-switch')!;

  if (!conectorConfigurado()) {
    // Sem client_id não há botão: OAuth sem client_id falha com erro de console inútil.
    sw.replaceWith(Object.assign(document.createElement('span'), {
      className: 'conector-vazio',
      textContent: 'Em breve',
    }));
    nota.hidden = false;
    nota.textContent = 'Conector em preparação. Só leitura: o Google nunca enxerga seus arquivos.';
    return bloco;
  }

  sw.addEventListener('click', () => void alternar(sw, status));
  void drivePronto().then((ok) => pintar(sw, status, ok));
  return bloco;
}

function pintar(sw: HTMLButtonElement, status: HTMLElement, ligado: boolean) {
  conectado = ligado;
  sw.setAttribute('aria-checked', String(ligado));
  status.dataset.conectado = ligado ? 'sim' : 'nao';
  status.textContent = ligado ? 'Conectado' : 'Não conectado';
}

async function alternar(sw: HTMLButtonElement, status: HTMLElement) {
  if (conectando) return;
  conectando = true;
  sw.setAttribute('aria-busy', 'true');
  try {
    if (conectado) {
      await desconectarGoogle();
      pintar(sw, status, false);
      deps.avisar('Google Drive desconectado.');
    } else {
      tokenAtual = await tokenGoogle([escopoDoDrive()], true);
      pintar(sw, status, true);
      deps.avisar('Google Drive conectado. Use o botão do clipe no campo de mensagem.');
    }
  } catch (e) {
    pintar(sw, status, false);
    deps.avisar(e instanceof Error ? e.message : 'Falha ao conectar o Google Drive.', true);
  } finally {
    conectando = false;
    sw.removeAttribute('aria-busy');
  }
}

// ── Botão "anexar do Drive" no campo de mensagem ──

export async function iniciarConectores(d: Deps): Promise<void> {
  deps = d;
  if (!(await drivePronto())) return;
  const acoes = document.querySelector<HTMLElement>('.input-actions-left');
  if (!acoes || acoes.querySelector('.drive-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'attach-btn drive-btn';
  btn.title = 'Anexar do Google Drive';
  btn.setAttribute('aria-label', 'Anexar arquivo do Google Drive');
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8.47 2.88 1.57 15.31a1.34 1.34 0 0 0 1.16 2.01h16.54a1.34 1.34 0 0 0 1.16-2.01L15.53 2.88a1.34 1.34 0 0 0-2.32 0L12.08 5.5H7.79L8.47 2.88Zm-2.4 5.06H3.2l6.13-10.98 2.87 5.15v5.83H6.07Zm5.6 5.83V7.11L8.8 1.98l3.73 6.67v5.12h-.86Z"/></svg>`;
  btn.addEventListener('click', () => void abrirSeletor());
  acoes.prepend(btn);
}

// ── Seletor de arquivos ──

/** Uma pasta na pilha de navegação; o fim é a raiz ("Meu Drive"). */
type Trilho = { id: string; nome: string }[];

async function abrirSeletor() {
  const fundo = document.createElement('div');
  fundo.className = 'sheet-modal-backdrop';
  fundo.setAttribute('role', 'dialog');
  fundo.setAttribute('aria-modal', 'true');
  fundo.setAttribute('aria-label', 'Arquivos do Google Drive');
  fundo.innerHTML = `
    <div class="sheet-content">
      <div class="sheet-grabber"></div>
      <div class="sheet-header">
        <div class="sheet-title-group">
          <h2>Google Drive</h2>
          <p>Escolha o arquivo para anexar ao pedido.</p>
        </div>
        <button type="button" class="icon-close-btn" title="Fechar" aria-label="Fechar">✕</button>
      </div>
      <nav class="drive-trilho" aria-label="Caminho da pasta"></nav>
      <div class="drive-lista" role="list"></div>
    </div>
  `;
  document.body.appendChild(fundo);
  // .sheet-modal-backdrop nasce com opacity:0 e pointer-events:none. Sem a classe .open o modal
  // existe mas é invisível e não recebe clique. O rAF dá um frame para o estado inicial
  // registrar, senão a transição de opacity não roda e o sheet salta sem animação.
  requestAnimationFrame(() => fundo.classList.add('open'));

  const lista = fundo.querySelector<HTMLElement>('.drive-lista')!;
  const trilho = fundo.querySelector<HTMLElement>('.drive-trilho')!;
  const fechar = () => {
    fundo.classList.remove('open');
    fundo.addEventListener('transitionend', () => fundo.remove(), { once: true });
    setTimeout(() => fundo.remove(), 300); // rede de segurança se transitionend não vier
  };
  fundo.querySelector('.icon-close-btn')!.addEventListener('click', fechar);
  fundo.addEventListener('click', (e) => {
    if (e.target === fundo) fechar();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      fechar();
      document.removeEventListener('keydown', esc);
    }
  });
  fundo.querySelector<HTMLButtonElement>('.icon-close-btn')!.focus();

  const caminho: Trilho = [];

  const pintarTrilho = () => {
    trilho.innerHTML = '';
    const passos = [{ id: '', nome: 'Meu Drive' }, ...caminho];
    passos.forEach((p, i) => {
      const ultimo = i === passos.length - 1;
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'drive-sep';
        sep.textContent = '/';
        trilho.appendChild(sep);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `drive-crumb${ultimo ? ' atual' : ''}`;
      b.textContent = p.nome;
      b.disabled = ultimo;
      b.addEventListener('click', () => {
        caminho.length = i; // corta a partir daqui
        void carregar();
      });
      trilho.appendChild(b);
    });
  };

  const carregar = async () => {
    pintarTrilho();
    lista.textContent = 'Carregando…';
    const atual = caminho.at(-1);
    let arquivos: ArquivoDrive[];
    try {
      arquivos = await listarDrive(tokenAtual, atual?.id);
    } catch (e) {
      lista.textContent = e instanceof Error ? e.message : 'Não deu para listar o Drive.';
      return;
    }
    if (!fundo.isConnected) return; // a pessoa fechou enquanto a lista voltava
    lista.innerHTML = '';
    if (arquivos.length === 0) {
      lista.innerHTML = `<p class="drive-vazio">${atual ? 'Esta pasta está vazia.' : 'Nada no seu Drive.'}</p>`;
      return;
    }
    // Pastas primeiro: quem abre o seletor quer navegar, não descer arquivo na lista.
    for (const arq of [...arquivos].sort((a, b) => Number(b.pasta) - Number(a.pasta))) {
      lista.appendChild(await linhaDe(arq));
    }
  };

  const linhaDe = async (arq: ArquivoDrive): Promise<HTMLElement> => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'drive-item';
    b.setAttribute('role', 'listitem');
    const icone = arq.pasta ? ICONE_PASTA : arq.exportavel ? ICONE_DOC : ICONE_ARQUIVO;
    b.innerHTML = `
      <span class="drive-item-icone" aria-hidden="true">${icone}</span>
      <span class="drive-item-nome" title="${escapeHtml(arq.nome)}">${escapeHtml(arq.nome)}</span>
      <span class="drive-item-tamanho">${arq.pasta ? '' : formatarTamanho(arq.tamanho)}</span>
    `;
    b.setAttribute('aria-label', arq.pasta ? `Abrir pasta ${arq.nome}` : `Anexar ${arq.nome}`);
    b.addEventListener('click', async () => {
      if (arq.pasta) {
        caminho.push({ id: arq.id, nome: arq.nome });
        await carregar();
        return;
      }
      b.disabled = true;
      try {
        deps.aoAnexar([await baixarDrive(tokenAtual, arq)]);
        fechar();
        deps.avisar(`${arq.nome} anexado do Drive.`);
      } catch (e) {
        b.disabled = false;
        deps.avisar(e instanceof Error ? e.message : 'Falha ao baixar o arquivo.', true);
      }
    });
    return b;
  };

  await carregar();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
