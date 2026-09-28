// Registra a ponte como host de Native Messaging nos navegadores Chromium (Linux, macOS, Windows).
// Usado por `bridge --install` (usuário final) e por scripts/install-host.ts (desenvolvimento).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HOST_NAME } from '@browser/shared';

export const EXTENSION_ID = 'kofljccjbobcbcfnnolfgbobkckmiboe'; // derivado da key em packages/extension/wxt.config.ts

export type Registro = { navegador: string; destino: string };

function manifesto(executavel: string): string {
  return JSON.stringify(
    {
      name: HOST_NAME,
      description: 'BrOWSER bridge',
      path: executavel,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
    },
    null,
    2,
  );
}

// Pastas de config de cada navegador; o manifesto vai em <pasta>/NativeMessagingHosts.
// Exportada porque o diagnóstico (`--doctor`) precisa exatamente da mesma lista: duas fontes de
// verdade fariam o doctor dizer que o navegador existe quando o instalador não registrou nele.
export function pastasDeNavegador(base?: string): [string, string][] {
  const home = base ?? homedir();
  if (process.platform === 'darwin') {
    const appSupport = join(home, 'Library', 'Application Support');
    return [
      ['Chrome', join(appSupport, 'Google', 'Chrome')],
      ['Brave', join(appSupport, 'BraveSoftware', 'Brave-Browser')],
      ['Edge', join(appSupport, 'Microsoft Edge')],
      ['Chromium', join(appSupport, 'Chromium')],
    ];
  }
  const config = join(home, '.config');
  return [
    ['Chrome', join(config, 'google-chrome')],
    ['Brave', join(config, 'BraveSoftware', 'Brave-Browser')],
    ['Edge', join(config, 'microsoft-edge')],
    ['Chromium', join(config, 'chromium')],
    ['Vivaldi', join(config, 'vivaldi')],
    ['Opera', join(config, 'opera')],
  ];
}

function registrarUnix(executavel: string, base?: string): Registro[] {
  const corpo = manifesto(executavel);
  return (
    pastasDeNavegador(base)
      // Registra onde o navegador existe; Chrome e Brave sempre (podem ser instalados depois).
      .filter(([nome, pasta]) => existsSync(pasta) || nome === 'Chrome' || nome === 'Brave')
      .map(([navegador, pasta]) => {
        const dir = join(pasta, 'NativeMessagingHosts');
        mkdirSync(dir, { recursive: true });
        const destino = join(dir, `${HOST_NAME}.json`);
        writeFileSync(destino, corpo);
        return { navegador, destino };
      })
  );
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

export function registrarHost(executavel: string, base?: string): Registro[] {
  return process.platform === 'win32' ? registrarWindows(executavel) : registrarUnix(executavel, base);
}

/** Desfaz registrarHost: tira o host de todos os navegadores (o que não existir é ignorado). */
export function removerHost(base?: string): string[] {
  if (process.platform === 'win32') {
    const removidos = CHAVES_WINDOWS.filter(
      ([, chave]) => Bun.spawnSync(['reg', 'delete', `${chave}\\${HOST_NAME}`, '/f']).exitCode === 0,
    ).map(([navegador]) => navegador);
    rmSync(join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'BrOWSER', `${HOST_NAME}.json`), { force: true });
    return removidos;
  }
  return pastasDeNavegador(base)
    .map(([navegador, pasta]) => [navegador, join(pasta, 'NativeMessagingHosts', `${HOST_NAME}.json`)] as const)
    .filter(([, arquivo]) => existsSync(arquivo))
    .map(([navegador, arquivo]) => {
      rmSync(arquivo, { force: true });
      // Tira a pasta `NativeMessagingHosts` se ela esvaziou, senão a desinstalação deixa
      // pastas fantasma no perfil. Só ela: apagar a pasta do navegador (ex.: `~/.config/
      // google-chrome`) levaria junto o perfil inteiro da pessoa.
      const dir = join(arquivo, '..');
      if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
      return navegador;
    });
}
