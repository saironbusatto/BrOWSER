// UI dos conectores: o bloco que aparece debaixo do card do Google AI Pro e o seletor de
// arquivos do Drive. Fica isolado aqui de propósito — main.ts só chama iniciarConectores() e
// mete o bloco na lista, porque main.ts é o arquivo que mais muda neste repo.

import {
  type ArquivoDrive,
  baixarDrive,
  CONECTORES,
  type Conector,
  conectorConfigurado,
  conectoresLigados,
  desconectarConector,
  formatarTamanho,
  listarDrive,
  tokenDoConector,
} from '../../utils/conectores';

type Deps = {
  aoAnexar: (arquivos: File[]) => void; // reaproveita processarArquivos() do painel
  avisar: (titulo: string, erro?: boolean, detalhe?: string) => void;
};

let deps: Deps;
let conectando = false;
let tokenAtual = '';

// Ícones oficiais do Google Material Symbols (fonts.google.com/icons), fill currentColor.
// viewBox 0 -960 960 960 é o sistema de coordenadas deles — não é o 0 0 24 24 do resto.
const ICONE_PASTA = `<svg class="ms ms-folder" viewBox="0 -960 960 960" width="16" height="16" aria-hidden="true"><path d="M140-160q-24 0-42-18.5T80-220v-520q0-23 18-41.5t42-18.5h281l60 60h339q23 0 41.5 18.5T880-680v460q0 23-18.5 41.5T820-160H140Zm0-60h680v-460H456l-60-60H140v520Zm0 0v-520 520Z"/></svg>`;
const ICONE_ARQUIVO = `<svg class="ms ms-description" viewBox="0 -960 960 960" width="16" height="16" aria-hidden="true"><path d="M319-250h322v-60H319v60Zm0-170h322v-60H319v60ZM220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h361l219 219v521q0 24-18 42t-42 18H220Zm331-554v-186H220v680h520v-494H551ZM220-820v186-186 680-680Z"/></svg>`;
// Nativo do Google sai por /export, então parece documento com texto — draft tem as linhas.
const ICONE_DOC = `<svg class="ms ms-draft" viewBox="0 -960 960 960" width="16" height="16" aria-hidden="true"><path d="M220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h361l219 219v521q0 24-18 42t-42 18H220Zm331-554v-186H220v680h520v-494H551ZM220-820v186-186 680-680Z"/></svg>`;

const ICONE_DRIVE = `<svg class="icone-drive" viewBox="0 0 87.3 78" aria-hidden="true">
<path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
<path d="M43.65 25 13.75 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.45z" fill="#00ac47"/>
<path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L56.75 46.55 43.65 69.2z" fill="#ea4335"/>
<path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
<path d="M59.8 53.3 56.75 46.55 43.65 69.2 30.55 46.55 27.45 53.3l-13.7 23.7c1.35.8 2.9 1.2 4.5 1.2h50.3c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
</svg>`;
const ICONE_GMAIL = `<svg class="icone-drive" viewBox="52 42 88 66" aria-hidden="true">
<path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/>
<path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/>
<path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/>
<path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/>
<path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/>
</svg>`;
const ICONES: Record<string, string> = { drive: ICONE_DRIVE, gmail: ICONE_GMAIL };
// O que a pessoa lê ao ligar: o que muda para ela, não o nome do escopo.
const AO_LIGAR: Record<string, string> = {
  drive: 'Use o botão do Drive, ao lado do clipe, para anexar arquivos.',
  gmail: 'A IA já pode buscar e ler seus e-mails. Ela não envia nem apaga nada.',
};

/** true quando dá para usar o Drive agora: client_id no manifest + token válido. */
export async function drivePronto(): Promise<boolean> {
  if (!conectorConfigurado()) return false;
  try {
    tokenAtual = await tokenDoConector('drive', false);
    return true;
  } catch {
    return false;
  }
}

export function blocoConectores(): HTMLElement {
  const bloco = document.createElement('div');
  bloco.className = 'conectores-bloco';
  bloco.innerHTML = `
    <div class="conectores-titulo">Conectores do Google</div>
    ${CONECTORES.map(
      (c) => `<div class="conector-linha" data-conector="${c.id}">
      <div class="conector-icone" aria-hidden="true">${ICONES[c.id] ?? ''}</div>
      <div class="conector-info">
        <span class="conector-nome">${c.nome}</span>
        <span class="conector-status" data-conectado="nao">Não conectado</span>
      </div>
      <button type="button" class="plan-switch" role="switch" aria-checked="false"
              aria-label="Conectar o ${c.nome}"></button>
    </div>`,
    ).join('')}
    <p class="conectores-nota" hidden></p>
  `;

  const nota = bloco.querySelector<HTMLElement>('.conectores-nota')!;
  const semClientId = !conectorConfigurado();
  for (const c of CONECTORES) {
    const linha = bloco.querySelector<HTMLElement>(`[data-conector="${c.id}"]`)!;
    const sw = linha.querySelector<HTMLButtonElement>('.plan-switch')!;
    if (semClientId) {
      // Sem client_id não há botão: OAuth sem client_id falha com erro de console inútil.
      sw.replaceWith(Object.assign(document.createElement('span'), { className: 'conector-vazio', textContent: 'Em breve' }));
      continue;
    }
    sw.addEventListener('click', () => void alternar(c, linha));
  }
  if (semClientId) {
    nota.hidden = false;
    nota.textContent = 'Conectores em preparação. Só leitura: a IA nunca altera nada na sua conta do Google.';
    return bloco;
  }
  void conectoresLigados().then((ligados) => {
    for (const c of CONECTORES) pintar(bloco.querySelector<HTMLElement>(`[data-conector="${c.id}"]`)!, ligados.includes(c.id));
  });
  return bloco;
}

function pintar(linha: HTMLElement, ligado: boolean) {
  const status = linha.querySelector<HTMLElement>('.conector-status')!;
  linha.querySelector('.plan-switch')!.setAttribute('aria-checked', String(ligado));
  status.dataset.conectado = ligado ? 'sim' : 'nao';
  status.textContent = ligado ? 'Conectado' : 'Não conectado';
}

async function alternar(c: Conector, linha: HTMLElement) {
  if (conectando) return;
  conectando = true;
  const sw = linha.querySelector<HTMLElement>('.plan-switch')!;
  sw.setAttribute('aria-busy', 'true');
  try {
    if (sw.getAttribute('aria-checked') === 'true') {
      await desconectarConector(c.id);
      pintar(linha, false);
      if (c.id === 'drive') document.querySelector('.drive-btn')?.remove();
      deps.avisar(`${c.nome} desconectado`);
    } else {
      const token = await tokenDoConector(c.id, true);
      pintar(linha, true);
      if (c.id === 'drive') {
        tokenAtual = token;
        await iniciarConectores(deps);
      }
      deps.avisar(`${c.nome} conectado`, false, AO_LIGAR[c.id]);
    }
  } catch (e) {
    pintar(linha, false);
    deps.avisar(`Não deu para conectar o ${c.nome}`, true, e instanceof Error ? e.message : 'Tente de novo.');
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
  btn.innerHTML = ICONE_DRIVE;
  btn.addEventListener('click', () => void abrirSeletor());
  acoes.prepend(btn);
}

// ── Seletor de arquivos ──

/** Uma pasta na pilha de navegação; o fim é a raiz ("Meu Drive"). */
type Trilho = { id: string; nome: string }[];

async function abrirSeletor() {
  const fundo = document.createElement('div');
  fundo.className = 'sheet-modal-backdrop drive-folha';
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
        deps.avisar('Arquivo anexado', false, arq.nome);
      } catch (e) {
        b.disabled = false;
        deps.avisar(`Não deu para anexar ${arq.nome}`, true, e instanceof Error ? e.message : 'Tente de novo.');
      }
    });
    return b;
  };

  await carregar();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
