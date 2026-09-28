// Confere, no binário de release, que as rotas de teste (/control) realmente não existem.
//
// Por que este script e não um `grep` no executável: o compilador não remove a string "/control"
// do binário mesmo quando o ramo é constante-falso, então procurar texto no arquivo dá um falso
// "presente". O que precisa ser provado é o comportamento: com um token válido, /control precisa
// responder 404 — inclusive com BROWSE_DEV=1 no ambiente, que era exatamente o furo (um fallback de
// env faria a rota voltar a existir no binário de release).
//
// Uso: bun scripts/check-control.ts <caminho-do-bridge> [dev|release]
// Release precisa responder 404. Dev precisa responder qualquer coisa que NÃO seja 404 — 500 é o
// resultado esperado sem navegador conectado (a rota existe e tenta falar com a extensão), e é
// justamente isso que prova que a marca entrou. Um dev que responde 404 quebraria o `bun run spike`
// sem ninguém perceber.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.argv[2];
const esperado = process.argv[3] === 'dev' ? 200 : 404;
if (!exe || !existsSync(exe)) {
  console.error(`check-control: executável não encontrado: ${exe}`);
  process.exit(1);
}

const PONTE_JSON = join(homedir(), '.config', 'browser-bridge', 'bridge.json');
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// BROWSE_DEV=1 é o ponto do teste: se existir qualquer fallback de runtime, /control volta.
const proc = spawn(exe, [], {
  env: { ...process.env, BROWSE_DEV: '1' },
  stdio: ['pipe', 'ignore', 'ignore'],
});

let saida = 404;
try {
  let dados: { port: number; token: string } | null = null;
  for (let i = 0; i < 40 && !dados; i++) {
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
  saida = resposta.status;
} finally {
  proc.stdin?.end();
  proc.kill();
  await espera(100);
  try {
    rmSync(join(tmpdir(), 'browser-ia'), { recursive: true, force: true });
  } catch {}
}

const ok = esperado === 404 ? saida === 404 : saida !== 404;
if (!ok) {
  console.error(`check-control: /control respondeu ${saida} em ${exe} — ${esperado === 404 ? 'esperava 404' : 'esperava != 404'}`);
  process.exit(1);
}
console.log(`check-control: /control → ${saida} (${esperado === 404 ? 'ausente' : 'presente'}), com BROWSE_DEV=1 no ambiente`);
