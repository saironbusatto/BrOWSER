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
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M9.4 3.3a2 2 0 0 1 2.9 0l1.4 2.4h4.1a2 2 0 0 1 1.9 2.6l-2.1 7.1a2 2 0 0 1-1.9 1.4H7.3a2 2 0 0 1-1.9-1.4l-2.1-7.1a2 2 0 0 1 1.9-2.6h2.5l1.7-2.4Z"/>
        </svg>
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
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M9.4 3.3a2 2 0 0 1 2.9 0l1.4 2.4h4.1a2 2 0 0 1 1.9 2.6l-2.1 7.1a2 2 0 0 1-1.9 1.4H7.3a2 2 0 0 1-1.9-1.4l-2.1-7.1a2 2 0 0 1 1.9-2.6h2.5l1.7-2.4Z"/></svg>`;
  btn.addEventListener('click', () => void abrirSeletor());
  acoes.prepend(btn);
}

// ── Seletor de arquivos ──

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
          <p>Arquivos recentes que o BrOWSER sabe ler.</p>
        </div>
        <button type="button" class="icon-close-btn" title="Fechar" aria-label="Fechar">✕</button>
      </div>
      <div class="drive-lista" role="list"></div>
    </div>
  `;
  document.body.appendChild(fundo);

  const lista = fundo.querySelector<HTMLElement>('.drive-lista')!;
  const fechar = () => fundo.remove();
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

  lista.textContent = 'Carregando…';
  let arquivos: ArquivoDrive[];
  try {
    arquivos = await listarDrive(tokenAtual);
  } catch (e) {
    lista.textContent = e instanceof Error ? e.message : 'Não deu para listar o Drive.';
    return;
  }
  if (!fundo.isConnected) return; // a pessoa fechou enquanto a lista voltava
  if (arquivos.length === 0) {
    lista.innerHTML = '<p class="drive-vazio">Nenhum arquivo legível no Drive.</p>';
    return;
  }

  for (const arq of arquivos) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'drive-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <span class="drive-item-nome" title="${escapeHtml(arq.nome)}">${escapeHtml(arq.nome)}</span>
      <span class="drive-item-tamanho">${formatarTamanho(arq.tamanho)}</span>
    `;
    item.addEventListener('click', async () => {
      item.disabled = true;
      try {
        deps.aoAnexar([await baixarDrive(tokenAtual, arq)]);
        fechar();
        deps.avisar(`${arq.nome} anexado do Drive.`);
      } catch (e) {
        item.disabled = false;
        deps.avisar(e instanceof Error ? e.message : 'Falha ao baixar o arquivo.', true);
      }
    });
    lista.appendChild(item);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
