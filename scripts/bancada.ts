// bun run bancada <agy|codex|claude> [tarefa …]
//
// Bancada de medição (docs/handoff-roteiro.md, fase 1.1): roda as tarefas de fixtures/bancada com
// uma IA de verdade e diz, por tarefa, se acertou, quantas ferramentas chamou (cada uma é uma ida e
// volta à IA) e quanto demorou. É a régua de toda mudança que promete deixar a IA mais esperta.
//
// Tudo isolado, para não tocar no navegador nem na ponte que a pessoa usa:
//   - Chromium do Playwright, perfil temporário, com a extensão REAL (.output/chrome-mv3);
//   - a ponte nativa registrada DENTRO do perfil temporário (<perfil>/NativeMessagingHosts);
//   - a ponte de desenvolvimento (com /control) gravando estado em pasta temporária
//     (BROWSER_BRIDGE_DIR): sem blueprint aprendido de antes, toda rodada começa igual.
// As IAs são as de verdade, com o login que já existe na máquina.
//
// Não entra no CI: precisa das IAs logadas e custa uso da assinatura.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOST_NAME, IAS, type Ia } from '@browser/shared';
import { chromium, type Page } from 'playwright-core';
import { TAREFAS } from '../fixtures/bancada/tarefas';
import { EXTENSION_ID } from '../packages/bridge/src/instalar';
import type { Medida } from '../packages/bridge/src/latencia';

const [ia, ...escolhidas] = process.argv.slice(2) as [Ia, ...string[]];
if (!IAS.includes(ia)) {
  console.error(`uso: bun run bancada <${IAS.join('|')}> [${TAREFAS.map((t) => t.id).join(' ')}]`);
  process.exit(2);
}
const tarefas = escolhidas.length ? TAREFAS.filter((t) => escolhidas.includes(t.id)) : TAREFAS;

const raiz = join(import.meta.dir, '..');
const paginas = join(raiz, 'fixtures', 'bancada');
const extensao = join(raiz, 'packages', 'extension', '.output', 'chrome-mv3');
const binario = join(raiz, 'packages', 'bridge', 'dist', 'bridge');

function construir(pacote: string, script: string) {
  const r = Bun.spawnSync(['bun', 'run', '--cwd', join(raiz, 'packages', pacote), script], { stdout: 'ignore', stderr: 'inherit' });
  if (r.exitCode !== 0) throw new Error(`build de ${pacote} falhou`);
}
if (!process.env.BANCADA_SEM_BUILD) {
  construir('extension', 'build');
  construir('bridge', 'build:dev'); // só o build de desenvolvimento tem a rota /control
}

function chromiumDoPlaywright(): string {
  const base = join(homedir(), '.cache', 'ms-playwright');
  const versoes = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort();
  if (!versoes.length) throw new Error('sem Chromium do Playwright: rode `bunx playwright install chromium`');
  return join(base, versoes.at(-1)!, 'chrome-linux64', 'chrome');
}

const dir = mkdtempSync(join(tmpdir(), 'bancada-'));
const perfil = join(dir, 'perfil');
const estadoPonte = join(dir, 'ponte');
const lancador = join(dir, 'ponte.sh');
mkdirSync(join(perfil, 'NativeMessagingHosts'), { recursive: true });
writeFileSync(lancador, `#!/bin/sh\nexport BROWSER_BRIDGE_DIR='${estadoPonte}'\nexec '${binario}' "$@"\n`);
chmodSync(lancador, 0o755);
writeFileSync(
  join(perfil, 'NativeMessagingHosts', `${HOST_NAME}.json`),
  JSON.stringify({
    name: HOST_NAME,
    description: 'bancada',
    path: lancador,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  }),
);

const srv = Bun.serve({
  port: 0,
  fetch: (r) => {
    const arquivo = join(paginas, new URL(r.url).pathname.replace(/[^\w.-]/g, ''));
    return existsSync(arquivo) && arquivo.endsWith('.html') ? new Response(Bun.file(arquivo)) : new Response('não existe', { status: 404 });
  },
});
const A = `http://127.0.0.1:${srv.port}`;
const B = `http://localhost:${srv.port}`;

const ctx = await chromium.launchPersistentContext(perfil, {
  executablePath: process.env.GRUPO_CHROME || chromiumDoPlaywright(),
  headless: !process.env.BANCADA_VER,
  viewport: null,
  args: [`--disable-extensions-except=${extensao}`, `--load-extension=${extensao}`, '--window-size=1366,850'],
});

/** O token da ponte gira a cada pedido: lê de novo a cada chamada. */
async function controle<T = any>(cmd: string, args: object = {}): Promise<T> {
  const ponte = JSON.parse(readFileSync(join(estadoPonte, 'bridge.json'), 'utf8')) as { port: number; token: string };
  const r = await fetch(`http://127.0.0.1:${ponte.port}/control`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ponte.token}` },
    body: JSON.stringify({ cmd, args }),
    timeout: false, // um pedido pode passar de 5 min; o limite real fica na ponte
  } as RequestInit);
  const j = (await r.json().catch(() => null)) as { ok: boolean; result?: T; error?: string } | null;
  if (!j?.ok) throw new Error(`${cmd}: ${j?.error ?? `HTTP ${r.status}`}`);
  return j.result as T;
}

type Linha = {
  tarefa: string;
  exercita: string;
  acertou: boolean;
  ferramentas: number;
  segundos: number;
  segundosNavegador: number;
  porFerramenta: Record<string, number>;
  resposta: string;
  erro?: string;
};
const linhas: Linha[] = [];

try {
  ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  for (let i = 0; i < 100 && !existsSync(join(estadoPonte, 'bridge.json')); i++) await Bun.sleep(200);
  if (!existsSync(join(estadoPonte, 'bridge.json')))
    throw new Error('a extensão não subiu a ponte (Native Messaging não conectou no perfil temporário)');

  for (const t of tarefas) {
    process.stdout.write(`${t.id}… `);
    const linha: Linha = {
      tarefa: t.id,
      exercita: t.exercita,
      acertou: false,
      ferramentas: 0,
      segundos: 0,
      segundosNavegador: 0,
      porFerramenta: {},
      resposta: '',
    };
    try {
      await controle('abrir', { url: `${A}/${t.pagina}` });
      const r = await controle<{ ok: boolean; texto: string; medida: Medida }>('executar', { texto: t.pedido(B), ia });
      linha.resposta = r.texto;
      linha.ferramentas = r.medida.ferramentas;
      linha.porFerramenta = r.medida.porFerramenta;
      linha.segundos = Math.round(r.medida.msTotal / 1000);
      linha.segundosNavegador = Math.round(r.medida.msNavegador / 1000);
      if (!r.ok) linha.erro = r.texto;
      else if ('resposta' in t.confere) linha.acertou = t.confere.resposta.test(r.texto);
      else {
        const { em, expr } = t.confere;
        const aba = ctx.pages().find((p: Page) => p.url().includes(em));
        linha.acertou = aba ? (await aba.evaluate(expr)) === true : false;
        if (!aba) linha.erro = `nenhuma aba em ${em}`;
      }
    } catch (e) {
      linha.erro = e instanceof Error ? e.message : String(e);
    }
    linhas.push(linha);
    console.log(
      `${linha.acertou ? '✓' : '✗'} ${linha.ferramentas} ferramentas, ${linha.segundos}s${linha.erro ? ` (${linha.erro.slice(0, 120)})` : ''}`,
    );
    // Cada tarefa começa numa aba nova; as da anterior fecham para não confundir a próxima.
    for (const p of ctx.pages().slice(1)) await p.close().catch(() => {});
  }
} finally {
  await ctx.close().catch(() => {});
  srv.stop();
}

const certas = linhas.filter((l) => l.acertou).length;
const media = (f: (l: Linha) => number) => (linhas.length ? Math.round(linhas.reduce((s, l) => s + f(l), 0) / linhas.length) : 0);
console.log(`\n| Tarefa | Acertou | Ferramentas | Tempo | No navegador | O que mais chamou |\n|---|---|---|---|---|---|`);
for (const l of linhas) {
  const mais = Object.entries(l.porFerramenta)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => `${k} ${n}x`)
    .join(', ');
  console.log(`| ${l.tarefa} | ${l.acertou ? 'sim' : 'NÃO'} | ${l.ferramentas} | ${l.segundos}s | ${l.segundosNavegador}s | ${mais} |`);
}
console.log(
  `\n${ia}: ${certas}/${linhas.length} certas, média de ${media((l) => l.ferramentas)} ferramentas e ${media((l) => l.segundos)}s por tarefa`,
);

const saida = join(raiz, '.bancada');
mkdirSync(saida, { recursive: true });
const arquivo = join(saida, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${ia}.json`);
writeFileSync(
  arquivo,
  JSON.stringify(
    {
      ia,
      quando: new Date().toISOString(),
      commit: Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: raiz }).stdout.toString().trim(),
      linhas,
    },
    null,
    2,
  ),
);
console.log(`detalhe em ${arquivo}\nlog da ponte desta rodada: ${join(estadoPonte, 'bridge.log')}`);
