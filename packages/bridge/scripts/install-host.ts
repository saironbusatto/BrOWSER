// Registra a ponte como host de Native Messaging no Chrome (Linux).
// ponytail: só Linux/Chrome; macOS, Windows (registro) e Edge/Brave entram no instalador de verdade.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
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

const hostsDir = join(homedir(), '.config', 'google-chrome', 'NativeMessagingHosts');
mkdirSync(hostsDir, { recursive: true });
const manifest = join(hostsDir, `${HOST_NAME}.json`);
writeFileSync(manifest, JSON.stringify({
  name: HOST_NAME,
  description: 'bRowser bridge',
  path: wrapper,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
}, null, 2));

console.log(`host registrado: ${manifest}\nwrapper: ${wrapper}`);
