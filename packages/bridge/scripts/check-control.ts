// Compila a ponte para a plataforma deste runner e prova, por comportamento, que o /control
// (rota de teste) só existe no build de dev.
//
//   bun scripts/check-control.ts release   → build de release, precisa responder 404
//   bun scripts/check-control.ts dev       → build de dev, precisa responder
//
// Compilar aqui, e não antes, é o ponto: o CI roda em Windows e em Linux, e a ponte é compilada
// para o host. Quando o passo "build" e o passo "check" ficam separados, acontece do que
// aconteceu aqui — no Windows o check recebia o caminho do .exe e testava um binário velho, ou um
// Linux, sem ninguém perceber.
//
// A prova é comportamental, e não `grep` no executável: o compilador não remove a string
// "/control" do binário mesmo com o ramo constante-falso, então procurar texto daria "presente" nos
// dois build. O teste sobe a ponte, manda um POST com token válido e compara o status.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const sabor = process.argv[2] === 'dev' ? 'dev' : 'release';
// scripts -> bridge -> packages -> raiz do repositório
const raiz = join(import.meta.dir, '..', '..', '..');
const dirPonte = join(raiz, 'packages', 'bridge');
const PONTE_JSON = join(homedir(), '.config', 'browser-bridge', 'bridge.json');
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

function falhar(msg: string): never {
  console.error(`check-control: ${msg}`);
  try {
    spawnSync(exe, ['--uninstall'], { stdio: 'ignore', shell: process.platform === 'win32' });
  } catch {}
  rmSync(join(tmpdir(), 'browser-ia'), { recursive: true, force: true });
  process.exit(1);
}

// 1) compila para ESTE host.
//
// O script comp compilado depende do alvo, não da plataforma: `build:win` é o que produz o
// executável do Windows. Escolher pelo `process.platform` sem trocar o script é o caminho do
// bug: no runner Windows, compilar com o alvo default (Linux) e depois procurar o `bridge.exe`
// que ninguém produziu.
const paraWindows = process.platform === 'win32';
const exe = join(dirPonte, 'dist', paraWindows ? 'bridge.exe' : 'bridge');
const script = paraWindows ? (sabor === 'dev' ? 'build:win:dev' : 'build:win') : sabor === 'dev' ? 'build:dev' : 'build';

const build = spawnSync('bun', ['run', '--cwd', dirPonte, script], {
  cwd: raiz,
  stdio: 'inherit',
  shell: paraWindows,
});
if (build.status !== 0) falhar(`a compilação (${script}) falhou`);
if (!existsSync(exe)) falhar(`o executável não apareceu em ${exe}`);

// 2) sobe a ponte. BROWSE_DEV=1 no ambiente é o ponto do teste: se existisse qualquer fallback de
// runtime, o /control voltaria a existir no binário de release.
//
// O bridge.json anterior é apagado antes: sem isso o script lia a porta de uma execução que já
// morreu e falhava com "unable to connect" — sem ter relações com o binário sob teste.
rmSync(PONTE_JSON, { force: true });
const proc = spawn(exe, [], {
  env: { ...process.env, BROWSE_DEV: '1' },
  stdio: ['pipe', 'ignore', 'pipe'],
  shell: paraWindows,
});
let stderr = '';
proc.stderr?.on('data', (p: Buffer) => {
  stderr += p.toString();
});

let status = 0;
try {
  let dados: { port: number; token: string } | null = null;
  for (let i = 0; i < 60 && !dados; i++) {
    await espera(100);
    try {
      dados = JSON.parse(readFileSync(PONTE_JSON, 'utf8'));
    } catch {}
  }
  if (!dados) throw new Error('a ponte não subiu (bridge.json não apareceu)');

  const resposta = await fetch(`http://127.0.0.1:${dados.port}/control`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dados.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ cmd: 'abrir', args: { url: 'https://exemplo.com' } }),
  });
  status = resposta.status;
} catch (e) {
  falhar(`não deu para consultar /control: ${(e as Error).message}${stderr ? `\nponte disse: ${stderr.slice(-400)}` : ''}`);
} finally {
  proc.stdin?.end();
  proc.kill();
  // No Windows o processo foi lançado por cmd.exe, e matar o cmd não leva a ponte junto: ela
  // ficaria órfã segurando a porta e escrevendo no bridge.json. /T mata a árvore.
  if (process.platform === 'win32' && proc.pid) {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' });
  }
  await espera(paraWindows ? 400 : 150);
  rmSync(join(tmpdir(), 'browser-ia'), { recursive: true, force: true });
}

// Release precisa ser 404. Dev precisa responder qualquer coisa que NÃO seja 404: 500 é o
// resultado esperado sem navegador conectado (a rota existe e tenta falar com a extensão), e é
// justamente isso que prova que a marca entrou. Um dev que responde 404 quebraria o `bun run spike`.
const ok = sabor === 'release' ? status === 404 : status !== 404;
if (!ok) {
  falhar(`/control respondeu ${status} no build ${sabor} (esperado ${sabor === 'release' ? '404' : '!= 404'})`);
}
console.log(`check-control: ${sabor} → /control ${status} (${sabor === 'release' ? 'ausente' : 'presente'}), com BROWSE_DEV=1 no ambiente`);
