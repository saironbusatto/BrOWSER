// Dispara as ferramentas oficiais de IA (logadas na assinatura do usuário) apontando para o MCP da ponte.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IAS, type Ia } from '@browser/shared';

const TIMEOUT_MS = 5 * 60_000;
const TOOLS = ['ler_campos', 'preencher', 'clicar'];
const CHAVES_API = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];

export type Mcp = { url: string; token: string };
export type Execucao = { ok: boolean; ia?: Ia; texto: string };

export function instrucoes(pedido: string) {
  return `Você controla o navegador do usuário pelas ferramentas do servidor MCP "browser" (ler_campos, preencher, clicar). A aba com o formulário já está aberta.

Pedido do usuário: ${pedido}

Regras:
1. Chame ler_campos primeiro.
2. Preencha cada campo com preencher (use clicar só se preencher não resolver).
3. NÃO envie o formulário: nunca clique em "Enviar" ou equivalente. O usuário envia depois de conferir.
4. No fim, chame ler_campos de novo para conferir e responda com um resumo curto do que foi preenchido e do que ficou faltando.
Não use nenhuma outra ferramenta além das do servidor "browser".`;
}

function comando(ia: Ia, prompt: string, mcp: Mcp, env: Record<string, string | undefined>): string[] {
  switch (ia) {
    case 'agy':
      return ['agy', '-p', prompt, '--dangerously-skip-permissions', '--output-format', 'json'];
    case 'codex':
      env.BROWSER_TOKEN = mcp.token;
      return ['codex', 'exec', '--json', '--skip-git-repo-check',
        '-c', `mcp_servers.browser.url="${mcp.url}"`,
        '-c', 'mcp_servers.browser.bearer_token_env_var="BROWSER_TOKEN"',
        // Aprova só as ferramentas do nosso MCP; comandos de shell seguem bloqueados.
        '-c', 'mcp_servers.browser.default_tools_approval_mode="approve"',
        '-c', 'approval_policy="never"', prompt];
    case 'claude':
      return ['claude', '-p', prompt, '--output-format', 'json', '--strict-mcp-config', '--no-chrome',
        '--mcp-config', JSON.stringify({ mcpServers: { browser: { type: 'http', url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } }),
        '--allowedTools', TOOLS.map((t) => `mcp__browser__${t}`).join(',')];
  }
}

// Texto final da IA, a partir da saída JSON de cada ferramenta.
export function respostaFinal(ia: Ia, saida: string): string | undefined {
  try {
    if (ia === 'agy') return JSON.parse(saida.trim().split('\n').pop()!).response;
    if (ia === 'claude') return JSON.parse(saida).result;
    const msgs = saida.trim().split('\n').map((l) => JSON.parse(l))
      .filter((e) => e.type === 'item.completed' && e.item?.type === 'agent_message');
    return msgs.at(-1)?.item.text;
  } catch {
    return undefined;
  }
}

async function rodar(ia: Ia, pedido: string, mcp: Mcp): Promise<Execucao> {
  // Sem chaves de API no ambiente: garante que a IA roda pela assinatura.
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of CHAVES_API) delete env[k];

  if (ia === 'agy') {
    // agy não aceita MCP por sessão: grava (ou atualiza) o servidor "browser" na config global.
    const add = Bun.spawnSync(['agy', 'mcp', 'add', '--header', `Authorization: Bearer ${mcp.token}`, 'browser', mcp.url], { env });
    if (add.exitCode !== 0) return { ok: false, ia, texto: `agy mcp add falhou: ${add.stderr}` };
  }

  const cwd = join(tmpdir(), 'browser-ia'); // fora de qualquer projeto: a IA não mexe em arquivos do usuário
  mkdirSync(cwd, { recursive: true });
  const proc = Bun.spawn(comando(ia, instrucoes(pedido), mcp, env), { cwd, env, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
  const [saida, erros] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const codigo = await proc.exited;
  clearTimeout(timer);

  const texto = respostaFinal(ia, saida);
  if (codigo !== 0 || !texto) return { ok: false, ia, texto: `${ia} saiu com código ${codigo}: ${erros.slice(-500) || saida.slice(-500)}` };
  return { ok: true, ia, texto };
}

// Failover (Q8): tenta as IAs instaladas na ordem; passa para a próxima quando uma falha.
// ponytail: qualquer falha dispara o failover, não só erro de cota; separar quando os erros de cota de cada CLI forem mapeados.
export async function executar(pedido: string, mcp: Mcp, avisar: (t: string) => void, ordem: readonly Ia[] = IAS): Promise<Execucao> {
  const instaladas = ordem.filter((ia) => Bun.which(ia));
  if (!instaladas.length) return { ok: false, texto: `Nenhuma IA instalada. Instale uma destas: ${ordem.join(', ')}.` };
  const falhas: string[] = [];
  for (const ia of instaladas) {
    avisar(`Preenchendo com ${ia}…`);
    const r = await rodar(ia, pedido, mcp);
    if (r.ok) return r;
    falhas.push(r.texto);
    avisar(`${ia} falhou; tentando a próxima IA…`);
  }
  return { ok: false, texto: `Todas as IAs falharam:\n${falhas.join('\n')}` };
}
