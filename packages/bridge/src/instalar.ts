// Registra a ponte como host de Native Messaging nos navegadores Chromium (Linux, macOS, Windows).
// Usado por `bridge --install` (usuário final) e por scripts/install-host.ts (desenvolvimento).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HOST_NAME } from '@browser/shared';

export const EXTENSION_ID = 'kofljccjbobcbcfnnolfgbobkckmiboe'; // derivado da key em packages/extension/wxt.config.ts

export type Registro = { navegador: string; destino: string };

function manifesto(executavel: string): string {
  return JSON.stringify({
    name: HOST_NAME,
    description: 'BrOWSER bridge',
    path: executavel,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  }, null, 2);
}

// Pasta de config de cada navegador; o manifesto vai em <pasta>/NativeMessagingHosts.
function pastasUnix(): [string, string][] {
  const home = homedir();
  if (process.platform === 'darwin') {
    const base = join(home, 'Library', 'Application Support');
    return [['Chrome', join(base, 'Google', 'Chrome')], ['Brave', join(base, 'BraveSoftware', 'Brave-Browser')],
      ['Edge', join(base, 'Microsoft Edge')], ['Chromium', join(base, 'Chromium')]];
  }
  const base = join(home, '.config');
  return [['Chrome', join(base, 'google-chrome')], ['Brave', join(base, 'BraveSoftware', 'Brave-Browser')],
    ['Edge', join(base, 'microsoft-edge')], ['Chromium', join(base, 'chromium')],
    ['Vivaldi', join(base, 'vivaldi')], ['Opera', join(base, 'opera')]];
}

function registrarUnix(executavel: string): Registro[] {
  const corpo = manifesto(executavel);
  return pastasUnix()
    // Registra onde o navegador existe; Chrome e Brave sempre (podem ser instalados depois).
    .filter(([nome, pasta]) => existsSync(pasta) || nome === 'Chrome' || nome === 'Brave')
    .map(([navegador, pasta]) => {
      const dir = join(pasta, 'NativeMessagingHosts');
      mkdirSync(dir, { recursive: true });
      const destino = join(dir, `${HOST_NAME}.json`);
      writeFileSync(destino, corpo);
      return { navegador, destino };
    });
}

const CHAVES_WINDOWS: [string, string][] = [
  ['Chrome', 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts'],
  ['Brave', 'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts'],
  ['Edge', 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts'],
  ['Chromium', 'HKCU\\Software\\Chromium\\NativeMessagingHosts'],
];

function registrarWindows(executavel: string): Registro[] {
  const dir = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'BrOWSER');
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, `${HOST_NAME}.json`);
  writeFileSync(arquivo, manifesto(executavel));
  return CHAVES_WINDOWS.map(([navegador, base]) => {
    const chave = `${base}\\${HOST_NAME}`;
    const r = Bun.spawnSync(['reg', 'add', chave, '/ve', '/t', 'REG_SZ', '/d', arquivo, '/f']);
    if (r.exitCode !== 0) throw new Error(`reg add ${chave} falhou: ${r.stderr.toString()}`);
    return { navegador, destino: chave };
  });
}

export function registrarHost(executavel: string): Registro[] {
  return process.platform === 'win32' ? registrarWindows(executavel) : registrarUnix(executavel);
}

/** Desfaz registrarHost: tira o host de todos os navegadores (o que não existir é ignorado). */
export function removerHost(): string[] {
  if (process.platform === 'win32') {
    const removidos = CHAVES_WINDOWS
      .filter(([, base]) => Bun.spawnSync(['reg', 'delete', `${base}\\${HOST_NAME}`, '/f']).exitCode === 0)
      .map(([navegador]) => navegador);
    rmSync(join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'BrOWSER', `${HOST_NAME}.json`), { force: true });
    return removidos;
  }
  return pastasUnix()
    .map(([navegador, pasta]) => [navegador, join(pasta, 'NativeMessagingHosts', `${HOST_NAME}.json`)] as const)
    .filter(([, arquivo]) => existsSync(arquivo))
    .map(([navegador, arquivo]) => {
      rmSync(arquivo, { force: true });
      return navegador;
    });
}
