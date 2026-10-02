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
  console.error('ponte não encontrada: a extensão BrOWSER está carregada no Chrome?');
  process.exit(1);
}

async function controle(cmd: string, args: object = {}) {
  const r = await fetch(`http://127.0.0.1:${ponte.port}/control`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ponte.token}` },
    body: JSON.stringify({ cmd, args }),
    timeout: false, // `executar` pode passar de 5 min; o limite real fica na ponte
  } as RequestInit);
  const j = (await r.json().catch(() => null)) as { ok: boolean; result?: any; error?: string } | null;
  if (!j?.ok) throw new Error(`${cmd}: ${j?.error ?? `HTTP ${r.status} sem corpo`}`);
  return j.result;
}

async function garantirFormulario() {
  if (
    await fetch(FORM_URL).then(
      (r) => r.ok,
      () => false,
    )
  )
    return undefined;
  const p = Bun.spawn(['bun', 'run', 'form'], { cwd: raiz, stdout: 'ignore', stderr: 'ignore' });
  for (
    let i = 0;
    i < 20 &&
    !(await fetch(FORM_URL).then(
      (r) => r.ok,
      () => false,
    ));
    i++
  )
    await Bun.sleep(250);
  return p;
}

const normalizar = (k: string, v: unknown) => (k === 'telefone' || k === 'cep' ? String(v ?? '').replace(/\D/g, '') : v);

// Conta pixels acesos do canvas da teia, numa faixa no meio da tela.
//
// Sem isto o spike passa com a teia morta, e foi assim que o defeito da `deformacao` passou:
// `iniciarTeia` é serializada e a chamada por nome levantava ReferenceError dentro da página,
// o erro subia até `passo()` e abortava o quadro no primeiro laço da trama. O fundo e o HUD
// apareciam, nenhum fio. A tela ficava bonita e vazia, o formulário era preenchido certo, e o
// spike approving. Contar pixel aceso é o que pega esse caso.
const PROBE_TEIA = `(function(){
  const h = document.getElementById('browser-teia-host');
  if (!h || !h.shadowRoot) return { acesos: -1, host: false };
  const c = h.shadowRoot.querySelector('canvas');
  if (!c) return { acesos: -1, host: true };
  const w = Math.min(c.width, 800), hh = Math.min(c.height, 500);
  const x0 = (c.width - w) / 2 | 0, y0 = (c.height - hh) / 2 | 0;
  const d = c.getContext('2d').getImageData(x0, y0, w, hh).data;
  let acesos = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 210) acesos++;
  return { acesos: acesos, host: true };
})()`;

type Teia = { pico: number; viuHost: boolean; sondas: number };

/**
 * Vigia a teia enquanto a IA trabalha. Ela só existe durante o pedido — o background liga no
 * começo e desliga no fim — então medir depois não prova nada. `avaliar` não entra na fila do
 * pedido: vai direto por CDP, então dá para sondar durante.
 */
function vigiarTeia(): { vivo: Promise<Teia>; parar(): void } {
  const estado = { parado: false };
  const vivo = (async (): Promise<Teia> => {
    let pico = 0;
    let viuHost = false;
    let sondas = 0;
    while (!estado.parado) {
      try {
        const r = (await controle('avaliar', { expr: PROBE_TEIA })) as { acesos: number; host: boolean };
        viuHost = viuHost || r.host;
        pico = Math.max(pico, r.acesos);
        sondas++;
      } catch {
        // A aba pode estar navegando; sondar de novo é o certo.
      }
      if (!estado.parado) await Bun.sleep(700);
    }
    return { pico, viuHost, sondas };
  })();
  return {
    vivo,
    parar() {
      estado.parado = true;
    },
  };
}

// ---- execução ----
const servidor = await garantirFormulario();
await controle('abrir', { url: FORM_URL });
// O dev server do Bun às vezes fica preso num erro de bundle ("Failed to load bundled module"):
// o campo React não aparece e o overlay de erro engole os cliques. Falhar aqui, com a causa.
if (!(await controle('avaliar', { expr: '!!document.querySelector("[name=telefone]")' }))) {
  console.error('formulário de teste quebrado (campo React não renderizou). Reinicie: fuser -k 5173/tcp; bun run form');
  process.exit(1);
}

console.log(`▶ ${ia}: preenchendo…`);
const inicio = performance.now();
const vigia = vigiarTeia();
const execucao = (await controle('executar', { texto: pedido, ia })) as { ok: boolean; ia?: Ia; texto: string };
vigia.parar();
const teia = await vigia.vivo;
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

// A teia precisa ter aparecido E pintado trama. `pico` é o maior número de pixels acesos visto
// numa faixa de 800x500 px de dispositivo no meio da tela.
//
// Limiar calibrado, não chutado: com a trama parada pelo ReferenceError a faixa dá 0; com a
// trama viva, o pior caso medido em 1920x1080, 1366x768 e 2560x1440 foi 22.024. O 2.000 fica
// uma ordem de grandeza abaixo do pior caso e muito acima do zero, então não dá falso negativo
// nem falso positivo.
const teiaDesenhou = teia.pico >= 2000;
console.log(
  `\nteia: ${teia.viuHost ? '✓ apareceu' : '✗ nunca apareceu'} · ` +
    `${teia.sondas} sondas · pico de ${teia.pico} px acesos ${teiaDesenhou ? '✓' : '✗ (trama não desenhou)'}`,
);

const logDir = join(raiz, '.spike-logs');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `${ia}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
writeFileSync(logFile, JSON.stringify({ ia, duracaoS, execucao, valores, esperado: expected, falhas, teia }, null, 2));

const aprovado = execucao.ok && falhas.length === 0 && teia.viuHost && teiaDesenhou;
console.log(`\n${aprovado ? '✅ APROVADO' : '❌ REPROVADO'}: ${ia} em ${duracaoS}s · log: ${logFile}`);
servidor?.kill();
process.exit(aprovado ? 0 : 1);
