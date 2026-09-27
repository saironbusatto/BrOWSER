// Desenvolvimento (Linux/macOS): registra a ponte rodando do código-fonte via bun.
// Usuário final usa o executável compilado: `bridge --install` (ver packages/bridge/src/instalar.ts).
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { registrarHost } from '../src/instalar';

if (process.platform === 'win32') {
  console.error('No Windows, compile e rode: bun run --cwd packages/bridge build:win && dist\\bridge.exe --install');
  process.exit(1);
}

const dir = join(homedir(), '.config', 'browser-bridge');
const wrapper = join(dir, 'bridge.sh');
const main = resolve(import.meta.dir, '../src/main.ts');

mkdirSync(dir, { recursive: true, mode: 0o700 });
// Caminho absoluto do bun (o navegador não tem o PATH do shell); o PATH das IAs a ponte completa sozinha.
writeFileSync(wrapper, `#!/bin/sh\nexport PATH="${process.env.PATH}"\nexec "${process.execPath}" "${main}"\n`);
chmodSync(wrapper, 0o755);

for (const r of registrarHost(wrapper)) console.log(`✓ ${r.navegador}: ${r.destino}`);
console.log(`\nwrapper: ${wrapper}\nReinicie o navegador para ativar.`);
