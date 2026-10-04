// Status real de login de cada ferramenta de IA e login OFICIAL sem janela de terminal.
//
// A janela existia porque `Bun.spawn` puro não dá um TTY ao CLI. Mas nenhum dos CLIs
// oficiais exige janela: `codex login --device-auth` imprime link + código e `claude auth
// login` imprime o link e lê uma linha do stdin. A ponte esconde o processo e repassa só a
// parte útil pro painel. A assinatura nunca passa por nós (ver docs/decisoes.md).

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ia, ItemAssinatura } from '@browser/shared';
import { comandoExecutavel, DIR_PONTE, which } from './caminhos';

const DIR_BRIDGE = DIR_PONTE;
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

// Exportado para o teste garantir o invariante de que toda entrada tem `lerStatus`.
export const CATALOGO: Record<Ia, Entrada> = {
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
    // Deslogado, `agy models` imprime "Please sign in" e sai com código 0 — igualzinho quando
    // está logado. Só o texto separa os dois, então é o texto que decide. Sem este parser a ponte
    // devolvia "conectado" sempre que o binário existia, e o painel mostrava Gemini conectado
    // sem nunca ter perguntado ao agy.
    lerStatus: (t) => !/please sign in|not signed in|sign in to continue/i.test(t),
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
    // `codex login status` imprime "Logged in using ChatGPT" quando há sessão. O --status com
    // traço não existe, e o codex devolve código 0 mesmo errando o argumento — o que dava
    // "conectado" para sempre, sem nunca perguntar nada ao codex.
    lerStatus: (t) => /logged in|already logged in/i.test(t),
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

/**
 * Mata o processo e tudo que ele gerou.
 *
 * No Windows, `codex` e `claude` instalados por npm são shims `.cmd`, e o comandoExecutavel os
 * chama por `cmd.exe`. O `cmd.exe` roda a linha e o node vira um processo NETO que herda a saída
 * padrão. Matar só o pai deixa o neto vivo segurando o pipe, então a leitura abaixo não termina
 * nunca. `/T` mata a árvore; no Unix, o kill direto basta.
 */
function matarArvore(proc: { pid: number; kill: () => void }): void {
  if (process.platform === 'win32') {
    Bun.spawnSync(['taskkill', '/pid', String(proc.pid), '/T', '/F'], { stdout: 'ignore', stderr: 'ignore' });
    return;
  }
  proc.kill();
}

/**
 * Lê a saída de um processo com prazo fechado, matando a árvore se ele não terminar.
 *
 * Existe porque matar o processo não basta para liberar a leitura: enquanto um processo neto
 * estiver com a saída padrão aberta, o pipe não fecha e a espera não resolve. Sem o prazo, uma
 * CLI travada deixava o `--doctor` e o painel sem resposta nenhuma — o que foi exatamente o que
 * aconteceu no Windows, onde toda CLI de npm é um shim.
 */
export async function lerComPrazo(
  proc: { stdout: ReadableStream<Uint8Array>; exited: Promise<number>; kill: () => void; pid: number },
  ms: number,
): Promise<{ saida: string; codigo: number; expirou: boolean }> {
  let expirou = false;
  const relogio = setTimeout(() => {
    expirou = true;
    matarArvore(proc);
  }, ms);
  // A espera pela saída tem prazo próprio, maior que o do kill: se o processo já morreu mas o
  // neto ainda segura o pipe, é a leitura que precisa desistir, não o kill.
  const Desistir = new Promise<null>((r) => setTimeout(() => r(null), ms + 2_000));
  // Consome os trechos conforme chegam, em vez de esperar o texto inteiro: um processo que trava
  // no meio não pode levar junto o que já respondeu, que é a diferença entre "demorou para
  // responder" e "respondeu algo, mas não terminou".
  const dec = new TextDecoder();
  let saida = '';
  const consumir = (async () => {
    const leitor = proc.stdout.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      saida += dec.decode(value, { stream: true });
    }
  })().catch(() => {});
  await Promise.race([consumir, Desistir]);
  const codigo = await Promise.race([proc.exited, Desistir.then(() => -1)]);
  clearTimeout(relogio);
  return { saida, codigo: codigo ?? -1, expirou };
}

/**
 * Julga se a saída da ferramenta significa "conectado".
 *
 * Extraído de `estaLogado` para poder ser testado com saída real: o defeito que corrigimos foi
 * justamente uma regra que ninguém podia exercitar, porque estava escondida dentro de uma função
 * que executa processo.
 */
export function statusConectado(ia: Ia, texto: string): { conectado: boolean; detalhe?: string } {
  const parser = CATALOGO[ia].lerStatus;
  if (!parser) return { conectado: false, detalhe: 'status não verificado: a ferramenta não expõe como conferir' };
  try {
    return { conectado: parser(texto.replace(ANSI, '')) };
  } catch {
    return { conectado: false, detalhe: 'status ilegível' };
  }
}

async function estaLogado(ia: Ia): Promise<{ conectado: boolean; detalhe?: string }> {
  const proc = Bun.spawn(comandoExecutavel(CATALOGO[ia].status), { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  const { saida, codigo, expirou } = await lerComPrazo(proc, TIMEOUT_STATUS_MS);
  if (expirou) return { conectado: false, detalhe: 'demorou para responder' };
  if (codigo !== 0) return { conectado: false };
  return statusConectado(ia, saida);
}

export async function obterStatusAssinaturas(preferida?: Ia): Promise<ItemAssinatura[]> {
  const ias = Object.keys(CATALOGO) as Ia[];
  const lista = await Promise.all(
    ias.map(async (ia): Promise<ItemAssinatura> => {
      const instalado = Boolean(which(ia));
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
  const exe = which(entrada.login[0]!);
  if (!exe) return entrada.login;
  const resto = entrada.login.slice(1);
  if (!entrada.viaPty) return [exe, ...resto];
  if (!which('python3')) return 'python3 não está instalado (necessário para o login interativo).';
  const pty = scriptPty();
  if (!pty) return 'não consegui preparar o pty para o login.';
  return ['python3', pty, exe, ...resto];
}

export function iniciarLogin(ia: Ia, aoDescobrir: (d: DescobertaLogin) => void): { erro?: string } {
  const entrada = CATALOGO[ia];
  if (emAndamento.has(ia)) return { erro: `${entrada.nome}: login já em andamento.` };
  if (!which(entrada.login[0]!)) return { erro: `${entrada.login[0]} não está instalado.` };
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

export type PlanoLogout = { ok: true; cmd: string[] } | { ok: false; erro: string };

/**
 * Decide o logout sem executar nada. Existe separado do `desconectar` para que o "vai rodar
 * isto ou vai reclamar" possa ser testado sem disparar um logout de verdade na máquina de
 * quem roda o teste.
 */
export function planejarLogout(ia: Ia): PlanoLogout {
  const cmd = comandoLogout(ia);
  if (!cmd) return { ok: false, erro: `sem comando de logout: rode \`${CATALOGO[ia].login.join(' ')}\` e depois /logout` };
  if (!which(cmd[0]!)) return { ok: false, erro: `${cmd[0]} não está instalado` };
  return { ok: true, cmd };
}

/**
 * Sai de UMA conta. Não lança: quem falhou vem no resultado, para o painel falar o que
 * aconteceu em vez de fingir que deu certo.
 */
export async function desconectar(ia: Ia): Promise<{ ok: boolean; erro: string }> {
  const plano = planejarLogout(ia);
  if (!plano.ok) return plano;
  const proc = Bun.spawn(plano.cmd, { stdout: 'ignore', stderr: 'pipe', stdin: 'ignore' });
  const timer = setTimeout(() => proc.kill(), TIMEOUT_LOGOUT_MS);
  const err = await new Response(proc.stderr).text().catch(() => '');
  const codigo = await proc.exited;
  clearTimeout(timer);
  return { ok: codigo === 0, erro: codigo === 0 ? '' : err.trim().slice(-200) || `saiu com código ${codigo}` };
}

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
    conectadas.map(async (a): Promise<{ ia: Ia; ok: boolean; erro: string }> => ({ ia: a.ia, ...(await desconectar(a.ia)) })),
  );

  const ok = resultados.filter((r) => r.ok).map((r) => r.ia);
  const falhou = resultados.filter((r) => !r.ok).map((r) => ({ ia: r.ia, nome: lista.find((a) => a.ia === r.ia)!.nome, erro: r.erro }));
  log(`desconectar: ${ok.length} ok, ${falhou.length} falharam`);
  return { ok, falhou };
}
