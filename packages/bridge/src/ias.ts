import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { IAS, type ArquivoAnexo, type Ia, type ItemAssinatura, type PapelAgente, type SiteBlueprint } from '@browser/shared';
import { formatarContextoArquivos } from './documentos';
import { formatarBlueprintParaIa } from './blueprints';

const TIMEOUT_MS = 5 * 60_000;
const TOOLS = ['ler_campos', 'preencher', 'clicar', 'perguntar_ao_usuario', 'consultar_blueprint'];
const CHAVES_API = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];

export type Mcp = { url: string; token: string };
export type Execucao = { ok: boolean; ia?: Ia; texto: string };

export function instrucoes(pedido: string, arquivos?: ArquivoAnexo[], blueprint?: SiteBlueprint | null) {
  const contextoArquivos = formatarContextoArquivos(arquivos);
  const contextoBlueprint = blueprint ? formatarBlueprintParaIa(blueprint) : '';
  return `Você é o bRowser AI, um copiloto ultra-conciso e rápido no painel lateral do navegador.
Você tem acesso à aba ativa do usuário através do servidor MCP "browser" (ferramentas: ler_campos, preencher, clicar, perguntar_ao_usuario, consultar_blueprint).
Essas são as ÚNICAS ferramentas disponíveis. Você NÃO tem terminal, comandos de shell nem acesso a arquivos do computador: qualquer tentativa é bloqueada e encerra o atendimento. Tudo o que precisa (incluindo anexos) já está neste texto.


Instrução ou mensagem do usuário:
"${pedido}"
${contextoBlueprint}
${contextoArquivos}

Diretrizes de atuação:
1. NAVEGAÇÃO E AÇÕES NA PÁGINA:
   - Chame 'ler_campos' para inspecionar os elementos visíveis na página ativa.
   - MENUS E FERRAMENTAS OCULTAS (ex.: Gemini, ChatGPT, ERPs):
     * Se a opção, ferramenta (ex.: "+", "Nano Banana", modo) não estiver visível inicialmente, clique no botão disparador do menu/gaveta e chame 'ler_campos' de novo.
   - Preencha cada campo necessário usando 'preencher' (ou 'clicar' para botões, switches, checkboxes e itens de menu).
   - NUNCA clique em botões de envio final irrevogável ("Enviar", "Submit", "Finalizar") sem autorização explícita do usuário.
   - Ao concluir: responda em no MÁXIMO 1 a 2 frases curtas. ZERO prolixidade.

2. MEMÓRIA DO SITE (BLUEPRINTS):
   * Se houver "MAPA DO SITE CONHECIDO", use os gatilhos e campos como guia acelerador.

3. DADOS DE DOCUMENTOS ANEXADOS:
   * Mapeie os dados estruturados dos anexos para os campos da página e preencha diretamente sem rodeios.

4. SE FALTAR DADO ESSENCIAL:
   * Chame 'perguntar_ao_usuario' apenas para dados faltantes indispensáveis (ex.: CPF, senha, confirmação de escolha).
   * Após a resposta, aplique e finalize rapidamente.

5. PROMPTS E TEXTOS SOLICITADOS:
   - Se o usuário pediu um prompt (ex.: para criar logo, gerar imagem, etc.): exiba APENAS o bloco de código com o texto do prompt e preencha a caixa de comando na página se houver.
   - NUNCA crie explicações conceituais, justificativas de estilo, introduções longas ou listas de variações adicionais que não foram pedidas.

6. REGRA ABSOLUTA DE CONCISÃO (CORTE 80% DA FALAÇÃO):
   - SEJA CIRÚRGICO, MINIMALISTA E ULTRA-DIRETO. Responda em no MÁXIMO 1 a 2 frases curtas (menos de 35 palavras).
   - ESTRITAMENTE PROIBIDO:
     * Saudações de abertura ("Olá!", "Com certeza!", "Preparei um prompt especial para você...", "Com prazer...").
     * Disclaimers repetitivos ("Como medida de segurança e seguindo nossas diretrizes, não cliquei em Enviar...").
     * Relatórios longos ou listas detalhando o que você já fez.
     * Despedidas, votos de cortesia ou sugestões não solicitadas.
   - Exemplo de preenchimento: "Preenchi os campos na página. Confira e clique em enviar quando desejar."
   - Exemplo de prompt criado: "Prompt gerado e configurado no campo de mensagem da página. Só conferir e enviar."`;
}

// O prompt vai pelo stdin, nunca como argumento: a linha de comando do Windows tem ~32 mil
// caracteres, e prompt com blueprint + anexos passa disso.
// O agy descarta calado mensagens de stdin acima de ~20-40 mil caracteres (responde SUCCESS sem
// chamar o modelo); acima desse limite o pedido vai num arquivo que ele lê do diretório de trabalho.
const AGY_MAX_STDIN = 20_000;
const ARQUIVO_PEDIDO = 'pedido.md';

type Invocacao = { args: string[]; stdin: string; manterStdinAberto?: boolean };

function comando(ia: Ia, prompt: string, mcp: Mcp, env: Record<string, string | undefined>, cwd: string): Invocacao {
  switch (ia) {
    case 'agy': {
      let conteudo = prompt;
      if (prompt.length > AGY_MAX_STDIN) {
        writeFileSync(join(cwd, ARQUIVO_PEDIDO), prompt, { mode: 0o600 });
        conteudo = `Leia o arquivo ${ARQUIVO_PEDIDO} neste diretório: ele contém o pedido completo do usuário e as regras. Siga-o à risca.`;
      }
      return {
        // Sem --dangerously-skip-permissions: só mcp(browser/*) é liberado (garantirPermissaoAgy);
        // terminal e arquivos são negados. Com ele, o agy chegou a rodar `find /` e ler a config
        // que guarda o token da ponte para "achar um anexo".
        args: ['agy', '--input-format', 'stream-json', '--output-format', 'stream-json', '-p', ''],
        stdin: `${JSON.stringify({ event: 'user', message: { content: conteudo } })}\n`,
        manterStdinAberto: true, // fechar antes do "result" encerra a sessão sem chamar o modelo
      };
    }
    case 'codex':
      env.BROWSER_TOKEN = mcp.token;
      return {
        args: ['codex', 'exec', '--json', '--skip-git-repo-check',
          '-c', `mcp_servers.browser.url="${mcp.url}"`,
          '-c', 'mcp_servers.browser.bearer_token_env_var="BROWSER_TOKEN"',
          // Aprova só as ferramentas do nosso MCP; comandos de shell seguem bloqueados.
          '-c', 'mcp_servers.browser.default_tools_approval_mode="approve"',
          '-c', 'approval_policy="never"', '-'],
        stdin: prompt,
      };
    case 'claude':
      return {
        args: ['claude', '-p', '--output-format', 'json', '--strict-mcp-config', '--no-chrome',
          '--mcp-config', JSON.stringify({ mcpServers: { browser: { type: 'http', url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } } } }),
          '--allowedTools', TOOLS.map((t) => `mcp__browser__${t}`).join(',')],
        stdin: prompt,
      };
  }
}

// Libera no agy só as ferramentas do nosso MCP (aditivo: não mexe nas outras regras do usuário).
const AGY_SETTINGS = join(homedir(), '.gemini', 'antigravity-cli', 'settings.json');
const REGRA_MCP = 'mcp(browser/*)';

function garantirPermissaoAgy(): string | undefined {
  try {
    const cfg = existsSync(AGY_SETTINGS) ? JSON.parse(readFileSync(AGY_SETTINGS, 'utf8')) : {};
    const allow: string[] = cfg.permissions?.allow ?? [];
    if (allow.includes(REGRA_MCP)) return undefined;
    const novo = { ...cfg, permissions: { ...cfg.permissions, allow: [...allow, REGRA_MCP] } };
    mkdirSync(dirname(AGY_SETTINGS), { recursive: true });
    writeFileSync(AGY_SETTINGS, JSON.stringify(novo, null, 2));
    return undefined;
  } catch (e) {
    return `não consegui liberar o MCP no agy (${AGY_SETTINGS}): ${e}`;
  }
}

function eventoResultadoAgy(saida: string): { status?: string; response?: string } | undefined {
  for (const linha of saida.trim().split('\n').reverse()) {
    try {
      const e = JSON.parse(linha);
      if (e.event === 'result') return e.result;
    } catch {}
  }
  return undefined;
}

// Texto final da IA, a partir da saída JSON de cada ferramenta.
export function respostaFinal(ia: Ia, saida: string): string | undefined {
  try {
    if (ia === 'agy') return eventoResultadoAgy(saida)?.response || undefined;
    if (ia === 'claude') return JSON.parse(saida).result;
    const msgs = saida.trim().split('\n').map((l) => JSON.parse(l))
      .filter((e) => e.type === 'item.completed' && e.item?.type === 'agent_message');
    return msgs.at(-1)?.item.text;
  } catch {
    return undefined;
  }
}

async function rodar(ia: Ia, pedido: string, mcp: Mcp, arquivos?: ArquivoAnexo[], blueprint?: SiteBlueprint | null): Promise<Execucao> {
  // Sem chaves de API no ambiente: garante que a IA roda pela assinatura.
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of CHAVES_API) delete env[k];

  if (ia === 'agy') {
    // agy não aceita MCP por sessão: grava (ou atualiza) o servidor "browser" na config global.
    const add = Bun.spawnSync(['agy', 'mcp', 'add', '--header', `Authorization: Bearer ${mcp.token}`, 'browser', mcp.url], { env });
    if (add.exitCode !== 0) return { ok: false, ia, texto: `agy mcp add falhou: ${add.stderr}` };
    const erro = garantirPermissaoAgy();
    if (erro) return { ok: false, ia, texto: erro };
  }

  const cwd = join(tmpdir(), 'browser-ia'); // fora de qualquer projeto: a IA não mexe em arquivos do usuário
  mkdirSync(cwd, { recursive: true, mode: 0o700 });
  const inv = comando(ia, instrucoes(pedido, arquivos, blueprint), mcp, env, cwd);
  const proc = Bun.spawn(inv.args, { cwd, env, stdout: 'pipe', stderr: 'pipe', stdin: 'pipe' });
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
  proc.stdin.write(inv.stdin);
  proc.stdin.flush();
  if (!inv.manterStdinAberto) proc.stdin.end();

  const lerSaida = async () => {
    let texto = '';
    const dec = new TextDecoder();
    for await (const pedaco of proc.stdout) {
      texto += dec.decode(pedaco, { stream: true });
      if (inv.manterStdinAberto && texto.includes('"event":"result"')) proc.stdin.end();
    }
    return texto;
  };
  const [saida, erros] = await Promise.all([lerSaida(), new Response(proc.stderr).text()]);
  const codigo = await proc.exited;
  clearTimeout(timer);
  rmSync(join(cwd, ARQUIVO_PEDIDO), { force: true }); // pode conter dados de anexos do usuário

  const texto = respostaFinal(ia, saida);
  if (codigo !== 0 || !texto) return { ok: false, ia, texto: `${ia} saiu com código ${codigo}: ${erros.slice(-500) || saida.slice(-500)}` };
  return { ok: true, ia, texto };
}

// Failover (Q8): tenta as IAs instaladas na ordem; passa para a próxima quando uma falha.
export async function executar(
  pedido: string,
  mcp: Mcp,
  avisar: (t: string, agente?: PapelAgente) => void,
  arquivos?: ArquivoAnexo[],
  blueprint?: SiteBlueprint | null,
  ordem: readonly Ia[] = IAS
): Promise<Execucao> {
  const instaladas = ordem.filter((ia) => Bun.which(ia));
  if (!instaladas.length) return { ok: false, texto: `Nenhuma IA instalada. Instale uma destas: ${ordem.join(', ')}.` };
  const falhas: string[] = [];
  for (const ia of instaladas) {
    avisar(`Conectando ${ia}…`, 'geral');
    const r = await rodar(ia, pedido, mcp, arquivos, blueprint);
    if (r.ok) return r;
    falhas.push(r.texto);
    avisar(`${ia} falhou; tentando a próxima IA…`, 'geral');
  }
  return { ok: false, texto: `Todas as IAs falharam:\n${falhas.join('\n')}` };
}

export function obterStatusAssinaturas(iaAtivaPreferencial?: Ia): ItemAssinatura[] {
  const lista: ItemAssinatura[] = [
    {
      ia: 'agy',
      nome: 'Google AI Pro',
      subtitulo: 'Gemini Advanced & Google One AI Premium',
      instalado: Boolean(Bun.which('agy')),
      conectado: Boolean(Bun.which('agy')),
      ativo: false,
    },
    {
      ia: 'codex',
      nome: 'ChatGPT Plus / Pro',
      subtitulo: 'OpenAI ChatGPT Subscription',
      instalado: Boolean(Bun.which('codex')),
      conectado: Boolean(Bun.which('codex')),
      ativo: false,
    },
    {
      ia: 'claude',
      nome: 'Claude Pro',
      subtitulo: 'Anthropic Claude Pro Subscription',
      instalado: Boolean(Bun.which('claude')),
      conectado: Boolean(Bun.which('claude')),
      ativo: false,
    },
  ];

  const ativa =
    lista.find((item) => item.ia === iaAtivaPreferencial && item.conectado) ||
    lista.find((item) => item.conectado) ||
    lista[0];

  if (ativa) ativa.ativo = true;
  return lista;
}

export function iniciarLoginAssinatura(ia: Ia): { comando: string[]; urlExterna?: string } {
  switch (ia) {
    case 'agy':
      return { comando: ['agy'], urlExterna: 'https://gemini.google.com' };
    case 'codex':
      return { comando: ['codex', 'login'], urlExterna: 'https://chatgpt.com' };
    case 'claude':
      return { comando: ['claude', 'login'], urlExterna: 'https://claude.ai/login' };
  }
}
