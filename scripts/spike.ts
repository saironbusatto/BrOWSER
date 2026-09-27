// bun run spike <agy|codex|claude>
// Abre o formulário de teste, pede à ponte para preencher (mesmo caminho do painel lateral)
// com a IA escolhida e confere o resultado na página.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { IAS, type Ia } from '@browser/shared';

const FORM_URL = 'http://localhost:5173/';

const ia = process.argv[2] as Ia;
if (!IAS.includes(ia)) {
  console.error(`uso: bun run spike <${IAS.join('|')}>`);
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

async function controle(cmd: string, args: object = {}) {
  const r = await fetch(`http://127.0.0.1:${ponte.port}/control`, {
    method: 'POST', headers: { Authorization: `Bearer ${ponte.token}` }, body: JSON.stringify({ cmd, args }),
    timeout: false, // `executar` pode passar de 5 min; o limite real fica na ponte
  } as RequestInit);
  const j = await r.json();
  if (!j.ok) throw new Error(`${cmd}: ${j.error}`);
  return j.result;
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

console.log(`▶ ${ia}: preenchendo…`);
const inicio = performance.now();
const execucao = await controle('executar', { texto: pedido, ia }) as { ok: boolean; ia?: Ia; texto: string };
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
console.log(`\nresposta da IA:\n${execucao.texto.slice(0, 600)}`);

const logDir = join(raiz, '.spike-logs');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `${ia}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
writeFileSync(logFile, JSON.stringify({ ia, duracaoS, execucao, valores, esperado: expected, falhas }, null, 2));

const aprovado = execucao.ok && falhas.length === 0;
console.log(`\n${aprovado ? '✅ APROVADO' : '❌ REPROVADO'}: ${ia} em ${duracaoS}s · log: ${logFile}`);
servidor?.kill();
process.exit(aprovado ? 0 : 1);
