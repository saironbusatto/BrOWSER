// Compila a ponte em dois sabores.
//
//   release (padrão)     → sem --define: o binário do usuário final NÃO tem as rotas /control.
//   dev (--dev)          → com --define: mantém /control, que o `bun run spike` e o smoke do CI usam.
//
// A marca é resolvida em tempo de compilação, então no release o código de /control nem entra no
// binário — não é uma checagem que pode ser contornada, é código ausente.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const raiz = join(import.meta.dir, '..');
const dev = process.argv.includes('--dev');
// --target=... (não env var: `FOO=bar bun ...` não funciona no cmd.exe do Windows, que é onde
// metade destes binários é compilada).
const alvo = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length) ?? 'bun-linux-x64';

const destino = join(raiz, 'dist', process.platform === 'win32' ? 'bridge.exe' : 'bridge');
// `--define` substitui o identificador por texto puro. Tem de ser `true` (o identificador), e não
// `"1"` (a string): com a string, `BROWSE_DEV === true` dá falso e o build de dev sai sem /control
// em silêncio. O typeof em build.ts protege o build de release; este comentário protege o de dev.
const define = dev ? ['--define', 'BROWSE_DEV=true'] : [];

mkdirSync(dirname(destino), { recursive: true });
const r = spawnSync('bun', ['build', '--compile', `--target=${alvo}`, ...define, 'src/main.ts', '--outfile', destino], {
  cwd: raiz,
  stdio: 'inherit',
});

if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`${dev ? 'ponte (dev, /control ligado)' : 'ponte (release, /control ausente)'} → ${destino}`);
