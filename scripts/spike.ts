// bun run spike <agy|codex|claude>
// Abre o formulário de teste, manda a IA preencher via MCP da ponte e confere o resultado.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const FORM_URL = 'http://localhost:5173/';
const TIMEOUT_MS = 5 * 60_000;
const CLIS = ['agy', 'codex', 'claude'] as const;
type Cli = (typeof CLIS)[number];

const cli = process.argv[2] as Cli;
if (!CLIS.includes(cli)) {
  console.error(`uso: bun run spike <${CLIS.join('|')}>`);
  process.exit(2);
}

const raiz = join(import.meta.dir, '..');
const { prompt: pedido, expected } = JSON.parse(readFileSync(join(raiz, 'fixtures/form/expected.json'), 'utf8'));
let ponte: { port: number; token: string };
try {
  ponte = JSON.parse(readFileSync(join(homedir(), '.config/browser-bridge/bridge.json'), 'utf8'));
} catch {
  console.error('ponte não encontrada: a extensão bRowser está carregada no Chrome?');
  process.exit(1);
}
const MCP_URL = `http://127.0.0.1:${ponte.port}/mcp`;
const AUTH = `Bearer ${ponte.token}`;

async function controle(cmd: string, args: object = {}) {
  const r = await fetch(`http://127.0.0.1:${ponte.port}/control`, {
    method: 'POST', headers: { Authorization: AUTH }, body: JSON.stringify({ cmd, args }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${cmd}: ${j.error}`);
  return j.result;
}

const INSTRUCOES = `Você controla o navegador do usuário pelas ferramentas do servidor MCP "browser" (ler_campos, preencher, clicar). A aba com o formulário já está aberta.

Tarefa: ${pedido}

Regras:
1. Chame ler_campos primeiro.
2. Preencha cada campo com preencher (use clicar só se preencher não resolver).
3. NÃO envie o formulário: nunca clique em "Enviar" ou equivalente.
4. No fim, chame ler_campos de novo para conferir, responda com um resumo do que foi preenchido e peça confirmação para enviar.
Não use nenhuma outra ferramenta além das do servidor "browser".`;

// Sem chaves de API no ambiente: garante que a IA roda pela assinatura.
const env = { ...process.env };
for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY']) delete env[k];

function comando(): string[] {
  const tools = ['ler_campos', 'preencher', 'clicar'];
  switch (cli) {
    case 'agy':
      return ['agy', '-p', INSTRUCOES, '--dangerously-skip-permissions', '--output-format', 'json'];
    case 'codex':
      env.BROWSER_TOKEN = ponte.token;
      return ['codex', 'exec', '--json', '--skip-git-repo-check',
        '-c', `mcp_servers.browser.url="${MCP_URL}"`,
        '-c', 'mcp_servers.browser.bearer_token_env_var="BROWSER_TOKEN"',
        // Aprova só as ferramentas do nosso MCP; comandos de shell seguem bloqueados.
        '-c', 'mcp_servers.browser.default_tools_approval_mode="approve"',
        '-c', 'approval_policy="never"', INSTRUCOES];
    case 'claude':
      return ['claude', '-p', INSTRUCOES, '--output-format', 'json', '--strict-mcp-config', '--no-chrome',
        '--mcp-config', JSON.stringify({ mcpServers: { browser: { type: 'http', url: MCP_URL, headers: { Authorization: AUTH } } } }),
        '--allowedTools', tools.map((t) => `mcp__browser__${t}`).join(',')];
  }
}

async function garantirFormulario() {
  if (await fetch(FORM_URL).then((r) => r.ok, () => false)) return undefined;
  const p = Bun.spawn(['bun', 'run', 'form'], { cwd: raiz, stdout: 'ignore', stderr: 'ignore' });
  for (let i = 0; i < 20 && !(await fetch(FORM_URL).then((r) => r.ok, () => false)); i++) await Bun.sleep(250);
  return p;
}

const normalizar = (k: string, v: unknown) => (k === 'telefone' || k === 'cep' ? String(v ?? '').replace(/\D/g, '') : v);

// ---- execução ----
const servidor = await garantirFormulario();
await controle('abrir', { url: FORM_URL });

if (cli === 'agy') {
  // agy não aceita config de MCP por sessão: grava (ou atualiza) o servidor "browser" na config global.
  const add = Bun.spawnSync(['agy', 'mcp', 'add', '--header', `Authorization: ${AUTH}`, 'browser', MCP_URL], { env });
  if (add.exitCode !== 0) throw new Error(`agy mcp add falhou: ${add.stderr}`);
}

const cwd = join(tmpdir(), 'browser-spike'); // fora do repo: a IA não mexe no projeto
mkdirSync(cwd, { recursive: true });
console.log(`▶ ${cli}: preenchendo…`);
const inicio = performance.now();
const proc = Bun.spawn(comando(), { cwd, env, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
const [saida, erros] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
const codigoSaida = await proc.exited;
clearTimeout(timer);
const duracaoS = Math.round((performance.now() - inicio) / 1000);

let valores: Record<string, unknown> = {};
try {
  valores = await controle('avaliar', { expr: 'window.formValues()' });
} catch (e) {
  console.error(`⚠ não consegui conferir a página: ${(e as Error).message}`);
}
const falhas = Object.keys(expected).filter((k) => normalizar(k, valores[k]) !== normalizar(k, expected[k]));

console.log(`\n${'campo'.padEnd(12)} ${'esperado'.padEnd(26)} obtido`);
for (const k of Object.keys(expected)) {
  console.log(`${falhas.includes(k) ? '❌' : '✅'} ${k.padEnd(10)} ${String(expected[k]).padEnd(26)} ${valores[k]}`);
}

const logDir = join(raiz, '.spike-logs');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `${cli}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
writeFileSync(logFile, JSON.stringify({ cli, duracaoS, codigoSaida, saida, erros, valores, esperado: expected, falhas }, null, 2));

const aprovado = codigoSaida === 0 && falhas.length === 0;
console.log(`\n${aprovado ? '✅ APROVADO' : '❌ REPROVADO'}: ${cli} em ${duracaoS}s (saída ${codigoSaida}) · log: ${logFile}`);
servidor?.kill();
process.exit(aprovado ? 0 : 1);
