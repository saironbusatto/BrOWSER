// Status real de login de cada ferramenta de IA e login OFICIAL sem janela de terminal.
//
// A janela existia porque `Bun.spawn` puro não dá um TTY ao CLI. Mas nenhum dos CLIs
// oficiais exige janela: `codex login --device-auth` imprime link + código e `claude auth
// login` imprime o link e lê uma linha do stdin. A ponte esconde o processo e repassa só a
// parte útil pro painel. A assinatura nunca passa por nós (ver docs/decisoes.md).

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Ia, ItemAssinatura } from '@browser/shared';
import { comandoExecutavel } from './caminhos';

const DIR_BRIDGE = join(homedir(), '.config', 'browser-bridge');
const log = (...a: unknown[]) => {
  try {
    appendFileSync(join(DIR_BRIDGE, 'bridge.log'), `${new Date().toISOString()} ${a.join(' ')}\n`);
  } catch {}
};

const TIMEOUT_STATUS_MS = 15_000;
const TIMEOUT_LOGOUT_MS = 20_000;
// Sequências ANSI dos CLIs. O `\u001B` está escrito como escape (e não como o caractere cru) porque
// um byte de controle no meio do source é invisível e quebra com o encoding do editor.
const ANSI = /\u001B\[[0-9;?]*[a-zA-Z]/g;

type Entrada = {
  nome: string;
  status: string[];
  login: string[];
  // Extrai do stdout o que o painel precisa mostrar. Ausente = CLI sem login programático.
  extrair?: (texto: string) => { url?: string; codigo?: string; expiraEmSegundos?: number };
  // O CLI espera uma linha no stdin depois do login (código colado pelo usuário).
  pedeCodigo?: boolean;
  // Roda o comando dentro de um pty (scripts/pty_login.py). Necessário quando o CLI recusa
  // stdin pipeado ou exige /dev/tty. Custa: precisa de python3 na máquina.
  viaPty?: boolean;
  // Interpreta a saída de `status`. Ausente = conectado se o exit code for 0.
  lerStatus?: (texto: string) => boolean;
  // Como sair da conta. Ausente = a CLI não tem logout; o erro explica o que fazer.
  logout?: string[];
};

const CATALOGO: Record<Ia, Entrada> = {
  agy: {
    nome: 'Google AI Pro',
    status: ['agy', 'models'],
    // O OAuth só acontece no print mode: `agy` sem args abre a TUI e morre sem /dev/tty, e
    // `agy models` só diz "Please sign in" e sai. Com -p ele imprime a URL do Google OAuth,
    // espera 60s e aceita o código de autorização no stdin — é o device-code manual do Google.
    login: ['agy', '-p', 'ok'],
    extrair: (t) => ({
      url: t.match(/https:\/\/accounts\.google\.com\S*/)?.[0],
      expiraEmSegundos: 60,
    }),
    pedeCodigo: true,
    // Com stdin pipeado o agy recusa ("Run 'agy' to log in, then retry"): ele detecta que está
    // sendo dirigido por script. E sem pty ele morre tentando abrir /dev/tty. viaPty resolve os dois.
    viaPty: true,
    // O agy não tem flag de logout (só `AuthLogout` no protocolo, usado pela TUI). O token fica
    // no keyring do sistema, então o logout é apagar a chave. ponytail: em container o agy grava
    // em arquivo e essa chave não existe — nesse caso o comando falha e o erro diz para usar /logout.
    logout: ['secret-tool', 'clear', 'service', 'gemini', 'username', 'antigravity'],
  },
  codex: {
    nome: 'ChatGPT Plus / Pro',
    status: ['codex', 'login', 'status'],
    login: ['codex', 'login', '--device-auth'],
    logout: ['codex', 'logout'],
    extrair: (t) => ({
      url: t.match(/https:\/\/auth\.openai\.com\S*/)?.[0],
      // O lado direito tem 4 ou 5 chars nos códigos reais (ex.: 1R1Y-NFXEE): 4 exatos erra.
      codigo: t.match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0],
      expiraEmSegundos: 15 * 60,
    }),
  },
  claude: {
    nome: 'Claude Pro / Max',
    status: ['claude', 'auth', 'status'],
    login: ['claude', 'auth', 'login', '--claudeai'],
    logout: ['claude', 'auth', 'logout'],
    extrair: (t) => ({ url: t.match(/visit:\s*(https:\/\/\S+)/)?.[1] }),
    pedeCodigo: true,
    lerStatus: (t) => JSON.parse(t).loggedIn === true,
  },
};

async function estaLogado(ia: Ia): Promise<{ conectado: boolean; detalhe?: string }> {
  const proc = Bun.spawn(comandoExecutavel(CATALOGO[ia].status), { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  let expirou = false;
  const timer = setTimeout(() => {
    expirou = true;
    proc.kill();
  }, TIMEOUT_STATUS_MS);
  let saida = '';
  try {
    saida = await new Response(proc.stdout).text();
  } catch {
    // o kill() cortou o pipe; `expirou` distingue isso de "a CLI respondeu que não tem sessão"
  }
  const codigo = await proc.exited;
  clearTimeout(timer);
  if (expirou) return { conectado: false, detalhe: 'demorou para responder' };
  if (codigo !== 0) return { conectado: false };
  const parser = CATALOGO[ia].lerStatus;
  if (!parser) return { conectado: true };
  try {
    return { conectado: parser(saida.replace(ANSI, '')) };
  } catch {
    return { conectado: false, detalhe: 'status ilegível' };
  }
}

export async function obterStatusAssinaturas(preferida?: Ia): Promise<ItemAssinatura[]> {
  const ias = Object.keys(CATALOGO) as Ia[];
  const lista = await Promise.all(
    ias.map(async (ia): Promise<ItemAssinatura> => {
      const instalado = Boolean(Bun.which(ia));
      if (!instalado)
        return { ia, nome: CATALOGO[ia].nome, instalado, conectado: false, ativo: false, detalhe: 'ferramenta local não encontrada' };
      const st = await estaLogado(ia);
      return { ia, nome: CATALOGO[ia].nome, instalado, conectado: st.conectado, ativo: false, ...(st.detalhe && { detalhe: st.detalhe }) };
    }),
  );
  const ativa = lista.find((i) => i.ia === preferida && i.conectado) ?? lista.find((i) => i.conectado);
  return lista.map((i) => ({ ...i, ativo: i === ativa }));
}

// ---- Login oficial sem janela ----

const emAndamento = new Map<Ia, Bun.Subprocess<'pipe', 'pipe', 'pipe'>>();

export type DescobertaLogin = { url: string; codigo?: string; pedeCodigo: boolean; expiraEmSegundos?: number };

/** Aplica o extrator da IA sobre a saída (ANSI removido). Devolve null se o login é manual. */
export function extrairLogin(ia: Ia, texto: string): DescobertaLogin | null {
  const entrada = CATALOGO[ia];
  if (!entrada.extrair) return null;
  const achado = entrada.extrair(texto.replace(ANSI, ''));
  if (!achado.url) return null;
  return {
    url: achado.url,
    codigo: achado.codigo,
    pedeCodigo: !!entrada.pedeCodigo,
    ...(achado.expiraEmSegundos && { expiraEmSegundos: achado.expiraEmSegundos }),
  };
}

/**
 * Sobe o login oficial do CLI em segundo plano e entrega o link/código assim que aparecer.
 * `aoDescobrir` é chamado no máximo uma vez; depois o processo só espera o login terminar.
 */
// O `agy` recusa a autenticação quando o stdin é um pipe (detecta que está sendo dirigido por
// script) e morre sem /dev/tty quando não há terminal. Um pty resolve os dois: pty é file
// descriptor, não janela. O fonte vai embutido porque a ponte é um executável único
// (bun build --compile) e não existe pasta de scripts ao lado dele.
const FONTE_PTY = `#!/usr/bin/env python3
import os
import pty
import sys

sys.exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))
`;

let caminhoPty: string | undefined;
function scriptPty(): string | undefined {
  if (caminhoPty) return caminhoPty;
  const destino = join(DIR_BRIDGE, 'pty_login.py');
  try {
    // Reescreve se faltar o shebang: sem ele, quem executar o arquivo direto cai no fallback
    // do shell e o Python nunca roda.
    const atual = existsSync(destino) ? readFileSync(destino, 'utf8') : '';
    if (!atual.startsWith('#!')) writeFileSync(destino, FONTE_PTY, { mode: 0o700 });
    caminhoPty = destino;
    return destino;
  } catch (e) {
    log(`não consegui preparar o pty: ${e}`);
    return undefined;
  }
}

/** Comando de login: o oficial, ou embrulhado num pty quando o CLI exige terminal. */
function comandoLogin(entrada: Entrada): string[] | string {
  const exe = Bun.which(entrada.login[0]!);
  if (!exe) return entrada.login;
  const resto = entrada.login.slice(1);
  if (!entrada.viaPty) return [exe, ...resto];
  if (!Bun.which('python3')) return 'python3 não está instalado (necessário para o login interativo).';
  const pty = scriptPty();
  if (!pty) return 'não consegui preparar o pty para o login.';
  return ['python3', pty, exe, ...resto];
}

export function iniciarLogin(ia: Ia, aoDescobrir: (d: DescobertaLogin) => void): { erro?: string } {
  const entrada = CATALOGO[ia];
  if (emAndamento.has(ia)) return { erro: `${entrada.nome}: login já em andamento.` };
  if (!Bun.which(entrada.login[0]!)) return { erro: `${entrada.login[0]} não está instalado.` };
  if (!entrada.extrair) {
    return { erro: `${entrada.nome} não expõe login programático. Rode \`${entrada.login.join(' ')}\` uma vez no terminal.` };
  }
  const cmd = comandoLogin(entrada);
  if (typeof cmd === 'string') return { erro: cmd };

  const proc = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe', // o claude e o agy leem a linha do código aqui
  });
  emAndamento.set(ia, proc);

  // O codex escreve o device code no stdout; o agy escreve a URL do Google OAuth no stderr
  // (a doc: "authentication prompts ... go to stderr"). Lemos os dois, porque o login só
  // precisa que o link apareça em algum deles.
  let acumulado = '';
  let enviado = false;
  const dec = new TextDecoder();
  const consumir = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      acumulado += dec.decode(chunk, { stream: true });
      if (enviado) continue;
      const achado = extrairLogin(ia, acumulado);
      if (!achado) continue; // a URL e o código chegam em chunks diferentes
      enviado = true;
      aoDescobrir(achado);
    }
  };
  Promise.all([consumir(proc.stdout), consumir(proc.stderr)]).catch(() => {});
  return {};
}

export function responderCodigo(ia: Ia, codigo: string): string | undefined {
  const proc = emAndamento.get(ia);
  if (!proc) return `${CATALOGO[ia].nome}: não há login esperando código.`;
  proc.stdin.write(`${codigo.trim()}\n`);
  proc.stdin.flush();
  return undefined;
}

export function encerrarLogin(ia: Ia) {
  emAndamento.get(ia)?.kill();
}

/** Resolve quando o processo de login termina. `ok` = exit code 0. */
export function fimDoLogin(ia: Ia): Promise<{ ok: boolean; codigo: number }> {
  const proc = emAndamento.get(ia);
  if (!proc) return Promise.resolve({ ok: false, codigo: -1 });
  return proc.exited.then((codigo) => {
    emAndamento.delete(ia);
    return { ok: codigo === 0, codigo };
  });
}

export function loginEmAndamento(ia: Ia): boolean {
  return emAndamento.has(ia);
}

// ---- Desconectar ----

/** Comando de logout da IA, ou null se a CLI não tem. */
export function comandoLogout(ia: Ia): string[] | null {
  return CATALOGO[ia].logout ?? null;
}

export type ResultadoLogout = { ok: Ia[]; falhou: { ia: Ia; nome: string; erro: string }[] };

/**
 * Sai de todas as contas. Só toca em quem está realmente conectado: rodar `codex logout` numa
 * máquina sem codex logado só gera barulho. Roda em paralelo e nunca lança — quem falhou vem
 * no resultado para o painel falar o que aconteceu em vez de fingir que deu certo.
 */
export async function desconectarTodas(preferida?: Ia): Promise<ResultadoLogout> {
  const lista = await obterStatusAssinaturas(preferida);
  const conectadas = lista.filter((a) => a.conectado);
  if (conectadas.length === 0) return { ok: [], falhou: [] };

  const resultados = await Promise.all(
    conectadas.map(async (a): Promise<{ ia: Ia; ok: boolean; erro: string }> => {
      const cmd = comandoLogout(a.ia);
      if (!cmd) return { ia: a.ia, ok: false, erro: `sem comando de logout: rode \`${CATALOGO[a.ia].login.join(' ')}\` e depois /logout` };
      if (!Bun.which(cmd[0]!)) return { ia: a.ia, ok: false, erro: `${cmd[0]} não está instalado` };
      const proc = Bun.spawn(cmd, { stdout: 'ignore', stderr: 'pipe', stdin: 'ignore' });
      const timer = setTimeout(() => proc.kill(), TIMEOUT_LOGOUT_MS);
      const err = await new Response(proc.stderr).text().catch(() => '');
      const codigo = await proc.exited;
      clearTimeout(timer);
      return { ia: a.ia, ok: codigo === 0, erro: codigo === 0 ? '' : err.trim().slice(-200) || `saiu com código ${codigo}` };
    }),
  );

  const ok = resultados.filter((r) => r.ok).map((r) => r.ia);
  const falhou = resultados.filter((r) => !r.ok).map((r) => ({ ia: r.ia, nome: lista.find((a) => a.ia === r.ia)!.nome, erro: r.erro }));
  log(`desconectar: ${ok.length} ok, ${falhou.length} falharam`);
  return { ok, falhou };
}
