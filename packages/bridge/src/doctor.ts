// Diagnóstico: `bridge --doctor`.
//
// A pergunta que a pessoa faz antes de começar é "isso vai funcionar na minha
// máquina?", e o BrOWSER só respondia depois de instalar, carregar a extensão e
// abrir o painel — quando já tinha dado errado. Este comando responde antes, e
// diz o que fazer quando a resposta é não.
//
// Ele não registra, não escreve e não abre servidor: sai depois de imprimir.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HOST_NAME, type Ia } from '@browser/shared';
import { obterStatusAssinaturas } from './assinaturas';
import { pastasDasIAs, which } from './caminhos';
import { EXTENSION_ID, pastasDeNavegador } from './instalar';

const ok = (t: string) => `  ✓ ${t}`;
const aviso = (t: string) => `  ! ${t}`;
const erro = (t: string) => `  ✗ ${t}`;

export type Diagnostico = {
  // `pasta` vem junto porque o nome de exibição ("Chrome") não é o nome da pasta
  // ("google-chrome"): reconstruir o caminho a partir do nome acusava navegador ausente em
  // máquina que tem Chrome.
  navegador: { nome: string; pasta: string; existe: boolean; registrado: boolean; caminhoOk: boolean }[];
  temNavegador: boolean;
  extensaoRegistrada: boolean;
  ias: { ia: Ia; instalado: boolean; conectado: boolean; detalhe?: string }[];
  python3: boolean;
  /** `agy` precisa de pty (python3) para o login; as outras não. */
  precisaPty: boolean;
  /** Há pelo menos uma IA instalada e conectada: dá para preencher. */
  pronto: boolean;
  /** Há pelo menos uma IA instalada, mas nenhuma conectada: funciona depois do login. */
  temComoConectar: boolean;
};

// Como descobrir se o navegador ESTÁ instalado. A pasta de configuração não serve para isso: o
// instalador cria `~/.config/google-chrome/` mesmo sem Chrome nenhum, de propósito, para o registro
// já existir caso o navegador seja instalado depois. O que não mente é o executável.
const EXECUTAVEIS: Record<string, string[]> = {
  // Cada navegador tem a SUA lista: uma lista global de caminhos faria o doctor dizer que Edge,
  // Vivaldi e Opera estão instalados em qualquer máquina que tenha o Chrome.
  Chrome: [
    'google-chrome',
    'google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/google-chrome',
  ],
  Brave: ['brave-browser', 'brave-browser-stable', '/opt/brave.com/brave/brave-browser', '/usr/bin/brave-browser'],
  Edge: ['microsoft-edge', 'microsoft-edge-stable', '/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge'],
  Chromium: ['chromium', 'chromium-browser', '/usr/bin/chromium', '/snap/bin/chromium', '/usr/lib/chromium/chromium'],
  Vivaldi: ['vivaldi', 'vivaldi-stable', '/opt/vivaldi/vivaldi', '/usr/bin/vivaldi'],
  Opera: ['opera', '/opt/opera/opera', '/usr/lib/x86_64-linux-gnu/opera/opera'],
};

export type Ambiente = { which: (exe: string) => string | null; existe: (c: string) => boolean };

const AMBIENTE_REAL: Ambiente = { which: (exe) => which(exe), existe: (c) => existsSync(c) };

export function navegadorInstalado(nome: string, amb: Ambiente = AMBIENTE_REAL): boolean {
  return (EXECUTAVEIS[nome] ?? []).some((exe) => amb.which(exe) !== null || amb.existe(exe));
}

/**
 * O pty do login do Google AI Pro depende de python3. A busca por caminhos `/usr/...` fixos
 * nunca encontrava nada no Windows, então o aviso sobre a dependência faltante simplesmente não
 * existia lá — a pessoa descobria do nada, no meio do login.
 */
function python3Instalado(): boolean {
  if (process.env.PYTHON !== undefined) return true;
  return ['python3', 'python'].some((exe) => which(exe) !== null);
}

export function diagnosticar(base = homedir()): Diagnostico {
  const manifestoWindows = join(process.env.LOCALAPPDATA ?? join(base, 'AppData', 'Local'), HOST_NAME, `${HOST_NAME}.json`);

  const navegador = pastasDeNavegador(base).map(([nome, pasta]) => {
    const manifesto = join(pasta, 'NativeMessagingHosts', `${HOST_NAME}.json`);
    const existe = navegadorInstalado(nome);
    if (process.platform === 'win32' && nome === 'Chrome' && !existsSync(manifesto) && existsSync(manifestoWindows)) {
      // No Windows o manifesto vive em LOCALAPPDATA e o registro está no HKCU, que não é
      // legível como arquivo. A ponte instalada é a referência: se o registro existe, funciona.
      return {
        nome,
        pasta,
        existe: true,
        registrado: true,
        caminhoOk: existsSync(join(homedir(), 'AppData', 'Local', 'BrOWSER', 'bridge.exe')),
      };
    }
    if (!existsSync(manifesto)) return { nome, pasta, existe, registrado: false, caminhoOk: false };
    // Registrado não basta: o manifesto aponta para um executável. Se esse caminho sumiu
    // (repositório apagado, pasta movida), a extensão vai reclamar "Ponte não conectada" sem
    // dizer o motivo.
    let caminhoOk = false;
    try {
      caminhoOk = existsSync(JSON.parse(readFileSync(manifesto, 'utf8')).path);
    } catch {
      caminhoOk = false;
    }
    return { nome, pasta, existe, registrado: true, caminhoOk };
  });

  const temManifesto = navegador.some((b) => b.registrado);
  const temNavegador = navegador.some((b) => b.existe);
  return {
    navegador,
    temNavegador,
    extensaoRegistrada: temManifesto,
    ias: [], // preenchido por quem chama (o status exige executar as CLIs)
    python3: python3Instalado(),
    precisaPty: false,
    pronto: false,
    temComoConectar: false,
  };
}

/** Preenche a parte que exige rodar as CLIs. Separado para poder testar sem subprocesso. */
export function juntar(diag: Diagnostico, status: { ia: Ia; instalado: boolean; conectado: boolean; detalhe?: string }[]): Diagnostico {
  return {
    ...diag,
    ias: status,
    // O pty é só para o login do agy; sem python3 dá para usar ChatGPT ou Claude.
    precisaPty: status.some((s) => s.ia === 'agy' && s.instalado) && !diag.python3,
    pronto: status.some((s) => s.instalado && s.conectado),
    temComoConectar: status.some((s) => s.instalado),
  };
}

/**
 * O texto que a pessoa lê. Função pura de propósito: o valor do `--doctor` é o que ele diz, e um
 * relatório com `console.log` no meio não se testa — quem installation com a mensagem errada não
 * descobre o erro antes de a pessoa rodar. Passa o diagnóstico pronto, devolve as linhas e o
 * código de saída.
 */
export function relatorio(d: Diagnostico): { linhas: string[]; saida: 0 | 1 } {
  const linhas: string[] = [];
  // Registro existe não é ponte funcionando: um manifesto apontando para um executável apagado
  // é exatamente o caso em que a extensão só diz "Ponte não conectada". Dizer "Tudo pronto"
  // nesse estado seria a resposta errada na hora errada.
  const ponteQuebrada = d.navegador.some((n) => n.registrado && !n.caminhoOk);
  const pronto = d.pronto && d.extensaoRegistrada && d.temNavegador && !ponteQuebrada;
  linhas.push(`BrOWSER — diagnóstico (${process.platform}/${process.arch})`, '');

  linhas.push('Navegador e ponte');
  if (!d.temNavegador) {
    linhas.push(erro('nenhum navegador Chromium encontrado neste computador'));
    linhas.push(aviso('instale o Chrome, Brave, Edge, Chromium, Vivaldi ou Opera'));
    linhas.push(aviso('a extensão é para navegadores Chromium: Firefox não é suportado'));
  }
  for (const n of d.navegador) {
    if (n.registrado && n.caminhoOk) linhas.push(ok(`${n.nome}: ponte registrada`));
    else if (n.registrado && !n.caminhoOk) linhas.push(erro(`${n.nome}: registrada, mas o executável da ponte não está mais no lugar`));
    else if (n.existe) linhas.push(aviso(`${n.nome}: ponte ainda não registrada`));
    else if (process.platform !== 'win32') linhas.push(ok(`${n.nome}: não instalado (pulando)`));
  }
  if (!d.extensaoRegistrada) {
    linhas.push('', erro('a ponte não está registrada em nenhum navegador'));
    linhas.push('  rode:  ./bridge --install');
    linhas.push('  e reinicie o navegador depois disso');
  }

  linhas.push('', 'Assinaturas de IA (o BrOWSER usa a sua, sem chave de API)');
  for (const ia of d.ias) {
    if (!ia.instalado) {
      linhas.push(aviso(`${NOMES[ia.ia]}: ferramenta não instalada neste computador`));
      continue;
    }
    if (ia.conectado) {
      linhas.push(ok(`${NOMES[ia.ia]}: instalada e conectada`));
    } else {
      linhas.push(aviso(`${NOMES[ia.ia]}: instalada, ainda não conectada${ia.detalhe ? ` (${ia.detalhe})` : ''}`));
    }
  }
  // O agy é a primeira opção e a única com login OAuth. Se a pessoa está com codex ou claude
  // e sem o agy, o diagnóstico say "Tudo pronto" — o que é verdade — mas ela fica sem saber que
  // está usando o plano secundário. Dizer em qual ordem as ferramentas são usadas é o que o
  // --doctor existe para esclarecer.
  const temPrincipal = d.ias.some((i) => i.ia === 'agy' && i.conectado);
  const temSecundaria = d.ias.some((i) => i.ia !== 'agy' && i.conectado);
  if (temSecundaria && !temPrincipal) {
    linhas.push('');
    linhas.push(aviso('Você está usando uma alternativa. O plano principal do BrOWSER é o Google AI Pro (agy),'));
    linhas.push(aviso('instalador oficial do Google: https://antigravity.google/cli/install.sh'));
  }

  if (!d.temComoConectar) {
    linhas.push('');
    linhas.push(erro('nenhuma ferramenta de IA instalada — sem ela o BrOWSER não preenche nada'));
    linhas.push('  instale uma delas e faça o login oficial dela no terminal:');
    linhas.push('    agy     (Google AI Pro) · codex  (ChatGPT) · claude (Claude Pro/Max)');
  } else if (!d.pronto) {
    linhas.push('');
    linhas.push('  próximo passo: abra o BrOWSER no navegador e vá em Assinaturas > Conectar');
  }

  if (d.precisaPty) {
    linhas.push('');
    linhas.push(erro('o login do Google AI Pro precisa de python3 (pty), que não está instalado'));
    linhas.push('  sudo apt install python3   ·   ou use ChatGPT (codex) / Claude, que não precisam');
  }

  linhas.push('', 'Onde procurar se algo falhar', `  log da ponte:  ${join(homedir(), '.config', 'browser-bridge', 'bridge.log')}`);
  linhas.push(`  id da extensão esperado: ${EXTENSION_ID}`);
  linhas.push(`  pastas de IA procuradas: ${pastasDasIAs().slice(0, 4).join(', ')}…`);

  linhas.push('');
  if (pronto) {
    linhas.push('Tudo pronto. Se a extensão ainda não estiver carregada:');
    linhas.push('  chrome://extensions → Modo do desenvolvedor → Carregar sem compactação');
  } else {
    linhas.push('Ainda não dá para usar. Resolva o que está marcado acima.');
  }
  return { linhas, saida: pronto ? 0 : 1 };
}

export async function rodarDiagnostico(): Promise<number> {
  const status = (await obterStatusAssinaturas()).map((a) => ({
    ia: a.ia,
    instalado: a.instalado,
    conectado: a.conectado,
    ...(a.detalhe ? { detalhe: a.detalhe } : {}),
  }));
  const { linhas, saida } = relatorio(juntar(diagnosticar(), status));
  console.log(linhas.join('\n'));
  return saida;
}

const NOMES: Record<Ia, string> = {
  agy: 'Google AI Pro (agy)',
  codex: 'ChatGPT (codex)',
  claude: 'Claude (claude)',
};
