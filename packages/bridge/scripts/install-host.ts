// Registra a ponte como host de Native Messaging em todos os navegadores Chromium instalados (Linux).
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { HOST_NAME } from '@browser/shared';

const EXTENSION_ID = 'kofljccjbobcbcfnnolfgbobkckmiboe'; // derivado da key em packages/extension/wxt.config.ts
const dir = join(homedir(), '.config', 'browser-bridge');
const wrapper = join(dir, 'bridge.sh');
const main = resolve(import.meta.dir, '../src/main.ts');

mkdirSync(dir, { recursive: true, mode: 0o700 });
// Chrome inicia o host sem o PATH do shell: caminho absoluto do bun + PATH atual (onde estão agy/codex/claude).
writeFileSync(wrapper, `#!/bin/sh\nexport PATH="${process.env.PATH}"\nexec "${process.execPath}" "${main}"\n`);
chmodSync(wrapper, 0o755);

const manifestBody = JSON.stringify({
  name: HOST_NAME,
  description: 'bRowser bridge',
  path: wrapper,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
}, null, 2);

// Todos os navegadores Chromium no Linux usam NativeMessagingHosts dentro do seu config dir.
const BROWSERS = [
  { name: 'Chrome',    dir: join(homedir(), '.config', 'google-chrome', 'NativeMessagingHosts') },
  { name: 'Brave',     dir: join(homedir(), '.config', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts') },
  { name: 'Edge',      dir: join(homedir(), '.config', 'microsoft-edge', 'NativeMessagingHosts') },
  { name: 'Chromium',  dir: join(homedir(), '.config', 'chromium', 'NativeMessagingHosts') },
  { name: 'Vivaldi',   dir: join(homedir(), '.config', 'vivaldi', 'NativeMessagingHosts') },
  { name: 'Opera',     dir: join(homedir(), '.config', 'opera', 'NativeMessagingHosts') },
];

let registrados = 0;
for (const browser of BROWSERS) {
  // Registra se o navegador está instalado (diretório pai existe) ou se é Chrome/Brave (sempre).
  const parentDir = join(browser.dir, '..');
  if (!existsSync(parentDir) && browser.name !== 'Chrome' && browser.name !== 'Brave') continue;

  mkdirSync(browser.dir, { recursive: true });
  const manifest = join(browser.dir, `${HOST_NAME}.json`);
  writeFileSync(manifest, manifestBody);
  console.log(`✓ ${browser.name}: ${manifest}`);
  registrados++;
}

console.log(`\nwrapper: ${wrapper}`);
console.log(`${registrados} navegador(es) registrado(s). Reinicie o navegador para ativar.`);
