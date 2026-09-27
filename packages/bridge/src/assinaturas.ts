// Status real de login de cada ferramenta de IA e disparo do login OFICIAL (o usuário conclui
// no navegador; a assinatura nunca passa por nós).
import type { Ia, ItemAssinatura } from '@browser/shared';

const TIMEOUT_STATUS_MS = 15_000;

const CATALOGO: Record<Ia, { nome: string; subtitulo: string; status: string[]; login: string[] }> = {
  agy: { nome: 'Google AI Pro', subtitulo: 'Gemini via Antigravity CLI', status: ['agy', 'models'], login: ['agy'] },
  codex: { nome: 'ChatGPT Plus / Pro', subtitulo: 'OpenAI via Codex CLI', status: ['codex', 'login', 'status'], login: ['codex', 'login'] },
  claude: { nome: 'Claude Pro / Max', subtitulo: 'Anthropic via Claude Code', status: ['claude', 'auth', 'status'], login: ['claude', 'auth', 'login', '--claudeai'] },
};

async function estaLogado(ia: Ia): Promise<boolean> {
  const proc = Bun.spawn(CATALOGO[ia].status, { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  const timer = setTimeout(() => proc.kill(), TIMEOUT_STATUS_MS);
  const saida = await new Response(proc.stdout).text();
  const codigo = await proc.exited;
  clearTimeout(timer);
  if (codigo !== 0) return false;
  if (ia === 'claude') {
    try {
      return JSON.parse(saida).loggedIn === true;
    } catch {
      return false;
    }
  }
  return true;
}

export async function obterStatusAssinaturas(preferida?: Ia): Promise<ItemAssinatura[]> {
  const ias = Object.keys(CATALOGO) as Ia[];
  const lista = await Promise.all(ias.map(async (ia): Promise<ItemAssinatura> => {
    const instalado = Boolean(Bun.which(ia));
    return { ia, nome: CATALOGO[ia].nome, subtitulo: CATALOGO[ia].subtitulo, instalado, conectado: instalado && (await estaLogado(ia)), ativo: false };
  }));
  const ativa = lista.find((i) => i.ia === preferida && i.conectado) ?? lista.find((i) => i.conectado);
  return lista.map((i) => ({ ...i, ativo: i === ativa }));
}

// Login é interativo (OAuth no navegador; o agy ainda pede uma tela no terminal): abre uma janela
// de terminal com o comando oficial.
// ponytail: Windows/macOS escritos mas só testados no Linux; validar no teste do laptop Windows.
export function abrirLoginOficial(ia: Ia): string | undefined {
  const cmd = CATALOGO[ia].login;
  if (!Bun.which(cmd[0]!)) return `${cmd[0]} não está instalado.`;
  const linha = cmd.join(' ');
  let terminal: string[] | undefined;
  if (process.platform === 'win32') {
    terminal = ['cmd', '/c', 'start', 'bRowser login', 'cmd', '/k', linha];
  } else if (process.platform === 'darwin') {
    terminal = ['osascript', '-e', `tell application "Terminal" to do script "${linha}"`];
  } else {
    const opcoes: [string, string[]][] = [
      ['x-terminal-emulator', ['-e']], ['gnome-terminal', ['--']], ['konsole', ['-e']],
      ['kitty', []], ['alacritty', ['-e']], ['xterm', ['-e']],
    ];
    const achado = opcoes.find(([bin]) => Bun.which(bin));
    if (achado) terminal = [achado[0], ...achado[1], ...cmd];
  }
  if (!terminal) return `Não achei um terminal para abrir. Rode manualmente: ${linha}`;
  Bun.spawn(terminal, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }).unref();
  return undefined;
}
