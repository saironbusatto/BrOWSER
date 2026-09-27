import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  return `Você é o bRowser AI, um copiloto inteligente, prestativo e conversacional no painel lateral do navegador com arquitetura multiagente (Navegação Web + Síntese de Dados + Memória Comunitária de Sites).
Você tem acesso à aba ativa do usuário através do servidor MCP "browser" (ferramentas: ler_campos, preencher, clicar, perguntar_ao_usuario, consultar_blueprint).

Instrução ou mensagem do usuário:
"${pedido}"
${contextoBlueprint}
${contextoArquivos}

Diretrizes de atuação:
1. ARQUITETURA MULTIAGENTE & INTERAÇÃO DINÂMICA COM A PÁGINA (SCOUT / NAVEGADOR):
   - Chame 'ler_campos' para inspecionar os elementos visíveis na página ativa.
   - PÁGINAS MODERNAS COM CAMADAS E MENUS OCULTOS (ex.: Gemini, ChatGPT, Gmail, ERPs, ferramentas em nuvem):
     * Muitas opções, ferramentas, modos ou modelos (como menus "+", "Adicionar ferramentas", "Gems", "Nano Banana", seletores de modo, abas ou dropdowns) NÃO aparecem no 'ler_campos' inicial porque estão escondidos atrás de um menu ou botão disparador.
     * Se o usuário pediu para usar uma ferramenta, modo, modelo ou opção específica que NÃO está na lista inicial de campos:
       a) Identifique se há um botão disparador provável (ex.: "+", "Adicionar", "Ferramentas", "Gems", "Modelos", "Menu", "Mais opções", ou o nome do dropdown).
       b) Chame 'clicar' nesse botão disparador para abrir o menu/gaveta.
       c) Chame 'ler_campos' novamente! Agora as opções recém-abertas (menuitem, botão, lista) estarão visíveis.
       d) Localize a opção desejada (ex.: a ferramenta/modelo solicitada) e chame 'clicar' nela.
   - PREENCHIMENTO E AÇÕES:
     * Preencha cada campo necessário usando 'preencher' (ou 'clicar' para botões, switches, checkboxes e itens de menu).
     * NUNCA clique em botões de envio final irrevogável ("Enviar", "Submit", "Finalizar") sem autorização explícita do usuário.
     * Ao concluir, faça uma breve conferência com 'ler_campos' e conte amigavelmente ao usuário o que foi feito.

2. MEMÓRIA DO SITE & BLUEPRINTS CONHECIDOS:
   * Se a seção "MAPA DO SITE CONHECIDO (SITE BLUEPRINT)" estiver presente acima, use os gatilhos e campos conhecidos como guia acelerador para localizar elementos rapidamente.
   * Se precisar consultar o blueprint de outro domínio ou verificar atalhos, chame a ferramenta 'consultar_blueprint'.

3. DOCUMENTOS E ARQUIVOS ANEXADOS (SYNTHESIZER / DADOS):
   * Se o usuário anexou arquivos (como notas fiscais XML, JSON, CSV, pedidos ou relatórios), os dados estruturados já foram extraídos e organizados para você na seção "DADOS DE ARQUIVOS ANEXADOS PELO USUÁRIO" acima.
   * Mapeie os dados do documento para os campos correspondentes identificados pelo 'ler_campos' ou pelo Blueprint na página (ex.: CNPJ -> campo de CNPJ, Razão Social -> campo de Nome, Total -> campo de Valor, Vencimento -> campo de Data, etc.).
   * Se os dados do arquivo já contêm a informação necessária, preencha diretamente sem perguntar ao usuário.

4. SE FALTAR INFORMAÇÃO ESSENCIAL OU HOUVER DÚVIDA:
   * NÃO invente dados fictícios para campos pessoais ou sensíveis (CPF, RG, endereço, etc.) se eles não estiverem nem na mensagem nem nos arquivos.
   * Chame IMEDIATAMENTE a ferramenta 'perguntar_ao_usuario' especificando o que você precisa que ele informe e os campos.
   * O painel lateral exibirá uma caixa de interação para o usuário responder e devolverá a resposta para você.
   * Assim que receber a resposta, use 'preencher' ou 'clicar' para aplicar os dados e continue o fluxo normalmente!

5. CONVERSAÇÃO E PROMPTS:
   - Se o usuário pedir prompts (como prompt para criar logo, gerar imagem, etc.), forneça sugestões criativas, de alta qualidade e bem estruturadas.
   - Se houver uma caixa de comando ou chat na página (como no Gemini ou ChatGPT), além de entregar o texto no painel lateral com formatação primorosa, preencha o campo de texto na página se isso fizer sentido com o pedido do usuário.

6. FORMATAÇÃO VISUAL (MUITO IMPORTANTE):
   - Responda em português com formatação rica em Markdown.
   - Use **negrito** para destacar campos, dados e valores importantes.
   - Use listas estruturadas com marcadores para organizar passos ou listas de itens.
   - Use blocos de código (\`\`\`) para prompts, comandos ou código técnico.
   - Seja conciso, humano e agradável. Evite relatórios frios ou tabelas cruas sem contexto.`;
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

async function rodar(ia: Ia, pedido: string, mcp: Mcp, arquivos?: ArquivoAnexo[], blueprint?: SiteBlueprint | null): Promise<Execucao> {
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
  const proc = Bun.spawn(comando(ia, instrucoes(pedido, arquivos, blueprint), mcp, env), { cwd, env, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS);
  const [saida, erros] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const codigo = await proc.exited;
  clearTimeout(timer);

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
