// O navegador inicia a ponte com o PATH de quando ELE foi aberto: se o agy/codex/claude foram
// instalados depois, não aparecem. Aqui entram as pastas padrão de instalação de cada sistema.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export function pastasDasIAs(): string[] {
  const home = homedir();
  const comuns = [join(home, '.local', 'bin'), join(home, '.bun', 'bin'), join(home, '.npm-global', 'bin')];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return [...comuns, join(local, 'agy', 'bin'), join(roaming, 'npm')];
  }
  return [...comuns, '/usr/local/bin', '/opt/homebrew/bin'];
}

/** PATH atual + pastas das IAs que existirem (no fim: não passa por cima da escolha do usuário). */
export function pathComIAs(pathAtual = process.env.PATH ?? ''): string {
  const atuais = pathAtual.split(delimiter).filter(Boolean);
  const extras = pastasDasIAs().filter((p) => existsSync(p) && !atuais.includes(p));
  return [...atuais, ...extras].join(delimiter);
}

/**
 * Comando pronto para Bun.spawn. No Windows, codex/claude instalados via npm são shims `.cmd`,
 * que só rodam via cmd.exe. Os argumentos que passamos não têm aspas nem & | < > ^ %
 * (o prompt vai por stdin e o JSON do MCP do claude vai por arquivo), então o cmd.exe não os altera.
 */
export function comandoExecutavel(args: string[]): string[] {
  const [nome, ...resto] = args;
  const exe = nome ? Bun.which(nome) : null;
  if (!exe) return args;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe)) return ['cmd.exe', '/d', '/c', exe, ...resto];
  return [exe, ...resto];
}
