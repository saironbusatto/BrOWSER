import { describe, expect, it } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Ia, SiteBlueprint } from '@browser/shared';
import { CATALOGO, lerComPrazo, statusConectado } from '../src/assinaturas';
import {
  acoesNegadas,
  cancelarExecucao,
  comando,
  executar,
  instrucoes,
  type Mcp,
  marcarAtividade,
  PRAZOS,
  respostaFinal,
  sessaoDaSaida,
  TOOLS,
} from '../src/ias';

const MCP: Mcp = { url: 'http://127.0.0.1:51234/mcp', token: 'a'.repeat(64) };
const tmp = () => mkdtempSync(join(tmpdir(), 'ias-teste-'));

describe('instrucoes: as garantias que a ponte promete ao prompt', () => {
  it('declara que a IA não tem terminal nem shell (o prompt não pode sugerir o contrário)', () => {
    const p = instrucoes('preencher o formulário');
    expect(p).toContain('NÃO tem terminal');
    expect(p).toContain('comandos de shell');
  });

  it('proíbe explicitamente o clique de envio final', () => {
    const p = instrucoes('enviar a nota');
    expect(p).toMatch(/NUNCA clique em botões de envio final/i);
  });

  it('proíbe resolver captcha (a pessoa resolve)', () => {
    expect(instrucoes('x')).toMatch(/NUNCA tente resolver captchas/i);
  });

  it('inclui o pedido do usuário e o mapa do site quando existem', () => {
    const bp = {
      $schema: '',
      dominio: 'exemplo.com',
      versao: '1.0.0',
      titulo: 'Exemplo',
      atualizadoEm: '2026-01-01T00:00:00Z',
      campos: [{ idSemantico: 'nome', rotulo: 'Nome', papel: 'textbox', seletorAcessivel: 'Nome' }],
    } as SiteBlueprint;
    const p = instrucoes('meu pedido', undefined, bp);
    expect(p).toContain('meu pedido');
    // O marcador do mapa injetado — o prompt sempre cita a palavra "MAPA" nas diretrizes, então
    // só o cabeçalho real prova que o mapa entrou.
    expect(p).toContain('🗺️ MAPA DO SITE CONHECIDO');
    expect(p).toContain('Nome');
  });

  it('sem blueprint, não injeta nenhum mapa', () => {
    expect(instrucoes('x', undefined, null)).not.toContain('🗺️ MAPA DO SITE CONHECIDO');
  });

  it('leva o arquivo anexado para a IA ler (e não o texto inteiro no argv)', () => {
    const p = instrucoes('x', [{ nome: 'nota.xml', tipo: 'application/xml', tamanho: 10, conteudoTexto: '<nNF>1</nNF>' }], null, {
      'nota.xml': 'anexos/0-nota.xml',
    });
    expect(p).toContain('anexos/0-nota.xml');
    expect(p).toContain('nota.xml');
  });
});

describe('comando: como cada CLI é chamado', () => {
  const invoked = (ia: Ia) => comando(ia, 'PROMPT', MCP, {}, tmp(), []);

  it('nunca usa --dangerously-skip-permissions no agy (foi assim que ele leu o token da ponte)', () => {
    expect(invoked('agy').args.join(' ')).not.toContain('dangerously-skip-permissions');
  });

  it('agy recebe o prompt por stdin, nunca por argumento', () => {
    const inv = invoked('agy');
    expect(inv.args).not.toContain('PROMPT');
    expect(inv.stdin).toContain('PROMPT');
  });

  it('claude só pode usar as ferramentas do MCP e a pasta de anexos (--allowedTools)', () => {
    const args = invoked('claude').args.join(' ');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('mcp__browser__ler_campos');
    expect(args).toContain('mcp__browser__preencher');
    expect(args).toContain('mcp__browser__clicar');
    // Nada de Bash/Read no disco inteiro: essa é a trava contra prompt injection chegar ao shell.
    expect(args).not.toMatch(/mcp__browser__\w+,Bash/);
    expect(args).not.toMatch(/,\s*Bash\b/);
  });

  it('claude usa --strict-mcp-config e --no-chrome (as extensões dele não entram na aba)', () => {
    const args = invoked('claude').args.join(' ');
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--no-chrome');
  });

  it('claude grava a config do MCP em arquivo 0600, não na linha de comando', () => {
    const cwd = tmp();
    const inv = comando('claude', 'PROMPT', MCP, {}, cwd, []);
    const idx = inv.args.indexOf('--mcp-config');
    const arquivo = inv.args[idx + 1]!;
    expect(arquivo.startsWith(cwd)).toBe(true);
    const cfg = JSON.parse(readFileSync(arquivo, 'utf8'));
    expect(cfg.mcpServers.browser.url).toBe(MCP.url);
    expect(cfg.mcpServers.browser.headers.Authorization).toBe(`Bearer ${MCP.token}`);
  });

  it('codex leva o token por variável de ambiente, não na linha de comando', () => {
    const env: Record<string, string | undefined> = {};
    const inv = comando('codex', 'PROMPT', MCP, env, tmp(), []);
    expect(env.BROWSER_TOKEN).toBe(MCP.token);
    expect(inv.args.join(' ')).not.toContain(MCP.token);
    expect(inv.args).toContain('mcp_servers.browser.bearer_token_env_var=BROWSER_TOKEN');
  });

  it('codex nunca aprova shell: só as ferramentas do MCP', () => {
    const args = invoked('codex').args.join(' ');
    expect(args).toContain('mcp_servers.browser.default_tools_approval_mode=approve');
    expect(args).toContain('approval_policy=never');
  });

  it('codex só recebe imagem como anexo por flag; PDF vai pelo caminho no prompt', () => {
    const comImagem = comando('codex', 'P', MCP, {}, tmp(), ['anexos/0-a.png']).args;
    expect(comImagem).toContain('-i');
    expect(comImagem).toContain('anexos/0-a.png');

    const sem = comando('codex', 'P', MCP, {}, tmp(), ['anexos/0-nota.pdf']).args;
    expect(sem).not.toContain('anexos/0-nota.pdf');
  });

  it('o prompt vai sempre por stdin nas três CLIs (argv do Windows corta em ~32k)', () => {
    for (const ia of ['agy', 'codex', 'claude'] as Ia[]) {
      const inv = invoked(ia);
      expect(inv.args).not.toContain('PROMPT');
      expect(inv.stdin).toContain('PROMPT');
    }
  });
});

describe('respostaFinal: o texto que chega ao usuário', () => {
  it('agy: pega o response do evento result', () => {
    const saida = '{"event":"assistant","x":1}\n{"event":"result","result":{"response":"Preenchido."}}\n';
    expect(respostaFinal('agy', saida)).toBe('Preenchido.');
  });

  it('claude: o campo result do json', () => {
    expect(respostaFinal('claude', '{"result":"Pronto."}')).toBe('Pronto.');
  });

  it('codex: a última agent_message concluída', () => {
    const saida = [
      '{"type":"item.completed","item":{"type":"agent_message","text":"primeira"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"última"}}',
    ].join('\n');
    expect(respostaFinal('codex', saida)).toBe('última');
  });

  it('saída inútil vira undefined, nunca texto quebrado para o usuário', () => {
    expect(respostaFinal('agy', 'lixo solto\nnao é json')).toBeUndefined();
    expect(respostaFinal('claude', '{quebrado')).toBeUndefined();
    expect(respostaFinal('codex', '')).toBeUndefined();
  });
});

describe('lerComPrazo: uma CLI travada não pode travar o diagnóstico', () => {
  // Este é o defeito que o job do Windows encontrou. No Windows, codex e claude instalados por
  // npm são shims .cmd: o comandoExecutavel os chama por cmd.exe, o cmd.exe roda a linha e o node
  // fica como processo NETO com a saída padrão herdada. Matar o pai não fecha o pipe, então a
  // leitura ficava esperando para sempre e o --doctor não voltava.
  const sh = 'sh';

  it('devolve a saída quando o processo responde a tempo', async () => {
    const proc = Bun.spawn([sh, '-c', 'printf \'{"loggedIn":true}\'; exit 0'], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    const r = await lerComPrazo(proc, 5_000);
    expect(r.expirou).toBe(false);
    expect(r.saida).toContain('loggedIn');
    expect(r.codigo).toBe(0);
  });

  // Ignorar o TERM é o que o shim .cmd faz: o processo direto não morre, e um neto que segura o
  // pipe é o que impedia a leitura de terminar. Aqui o prazo é a única garantia.
  it('desiste no prazo mesmo com um processo que ignora o kill e segura o pipe', async () => {
    const proc = Bun.spawn([sh, '-c', 'trap "" TERM; printf "parcial"; sleep 120'], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    const inicio = Date.now();
    const r = await lerComPrazo(proc, 700);
    const decorrido = Date.now() - inicio;

    expect(r.expirou).toBe(true);
    // O prazo tem de valer: sem ele esta espera seria de dois minutos, e era isso que travava o
    // painel de quem tem uma CLI empacada.
    expect(decorrido).toBeLessThan(15_000);
    expect(r.saida).toContain('parcial');
  }, 20_000);

  it('não vaza o processo pendurado para a próxima verificação', async () => {
    const primeiro = Bun.spawn([sh, '-c', 'trap "" TERM; sleep 60'], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    await lerComPrazo(primeiro, 400);
    // A segunda leitura tem que ser normal: se o prazo se aplicasse só à primeira, o diagnóstico
    // ficaria contaminado para sempre depois do primeiro travamento.
    const segundo = Bun.spawn([sh, '-c', 'printf \'{"loggedIn":false}\'; exit 0'], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    const r = await lerComPrazo(segundo, 5_000);
    expect(r.expirou).toBe(false);
    expect(r.saida).toContain('loggedIn');
  }, 20_000);
});

describe('statusConectado: a tela não pode mentir sobre o que está conectado', () => {
  // Saídas reais, copiadas das ferramentas nesta máquina. O defeito era a ponte afirmar
  // "conectado" sem olhar a saída: o agy deslogado diz "Please sign in" e sai com código 0, e o
  // codex nem recebia um comando válido — `login --status` não existe, e ele sai com 0 mesmo
  // errando o argumento. Nos dois casos o resultado era "conectado" para sempre.
  it('agy: "Please sign in" é NÃO conectado, mesmo saindo com código 0', () => {
    expect(statusConectado('agy', 'Please sign in to continue.')).toEqual({ conectado: false });
    expect(statusConectado('agy', 'Please sign in').conectado).toBe(false);
  });

  it('agy: a lista de modelos é conectada', () => {
    const saida = 'Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)';
    expect(statusConectado('agy', saida).conectado).toBe(true);
  });

  it('codex: "Logged in using ChatGPT" é conectado; erro de argumento NÃO é', () => {
    expect(statusConectado('codex', 'Logged in using ChatGPT').conectado).toBe(true);
    // A saída que `codex login --status` devolve, e que saía com código 0:
    const errado = "error: unexpected argument '--status' found\nUsage: codex login [OPTIONS] [COMMAND]";
    expect(statusConectado('codex', errado).conectado).toBe(false);
  });

  it('claude: o JSON que o claude devolve', () => {
    expect(statusConectado('claude', '{"loggedIn": true}').conectado).toBe(true);
    expect(statusConectado('claude', '{"loggedIn": false}').conectado).toBe(false);
  });

  // O invariante que impede a mentira voltar: toda ferramenta adicionada precisa ter como
  // conferir o próprio status. Sem isso, alguém cadastra uma IA nova e ela aparece como
  // conectada desde o primeiro dia, sem nunca ter sido perguntada.
  it('toda ferramenta do catálogo sabe conferir o próprio status', () => {
    for (const [ia, entrada] of Object.entries(CATALOGO)) {
      expect(`${ia}:${entrada.lerStatus ? 'ok' : 'SEM PARSER'}`).toBe(`${ia}:ok`);
    }
  });

  // E o comando de status precisa existir de verdade. `codex login --status` não existe e sai
  // com 0, o que passava por conectado.
  it('o comando de status é um subcomando que existe, não uma flag inventada', () => {
    for (const [ia, entrada] of Object.entries(CATALOGO)) {
      const status = entrada.status.join(' ');
      expect(`${ia}: ${status}`).not.toMatch(/--(status|logged|auth)$/);
    }
  });
});

describe('sessão: a segunda mensagem lembra da primeira', () => {
  const ID = '958c7f7e-9957-4a74-8894-5e7a1b23c254';
  const com = (ia: Ia, sessao?: string) => comando(ia, 'P', MCP, {}, tmp(), [], '', sessao).args;

  it('cada CLI retoma pela flag dele', () => {
    expect(com('claude', ID).join(' ')).toContain(`--resume ${ID}`);
    expect(com('agy', ID).join(' ')).toContain(`--conversation ${ID}`);
    const codex = com('codex', ID);
    expect(codex.slice(0, 3)).toEqual(['codex', 'exec', 'resume']);
    expect(codex.slice(-2)).toEqual([ID, '-']); // `codex exec resume [OPÇÕES] <id> -`
  });

  it('sem sessão, nada de retomar', () => {
    for (const ia of ['agy', 'codex', 'claude'] as Ia[]) {
      const a = com(ia).join(' ');
      expect(a).not.toMatch(/--resume|--conversation| resume /);
    }
  });

  it('id que não é UUID não vira argumento (injeção de flag)', () => {
    const mal = '--dangerously-skip-permissions';
    for (const ia of ['agy', 'codex', 'claude'] as Ia[]) expect(com(ia, mal)).not.toContain(mal);
  });

  it('lê o id na saída real de cada CLI (capturada em 03/10/2026)', () => {
    expect(sessaoDaSaida('claude', `{"result":"ok","session_id":"${ID}"}`)).toBe(ID);
    expect(sessaoDaSaida('codex', `{"type":"thread.started","thread_id":"${ID}"}\n{"type":"turn.started"}`)).toBe(ID);
    expect(
      sessaoDaSaida(
        'agy',
        `{"event":"init","conversation_id":"${ID}"}\n{"event":"result","result":{"conversation_id":"${ID}","response":"ok"}}`,
      ),
    ).toBe(ID);
    expect(sessaoDaSaida('claude', '{"session_id":"; rm -rf /"}')).toBeUndefined();
    expect(sessaoDaSaida('agy', 'lixo')).toBeUndefined();
  });

  it('mensagem seguinte não repete as regras, mas leva a página e os anexos novos', () => {
    const p = instrucoes('agora o segundo', undefined, null, {}, true);
    expect(p).toContain('agora o segundo');
    expect(p).not.toContain('REGRA ABSOLUTA');
  });
});

describe('TOOLS: o allowlist do Claude bate com o MCP', () => {
  it('toda tool registrada na ponte está liberada, e nada além delas', () => {
    const fonte = ['main.ts', 'tools-pagina.ts', 'tools-passos.ts', 'tools-navegador.ts', 'tools-drive.ts', 'tools-gmail.ts']
      .map((f) => readFileSync(join(import.meta.dir, '../src', f), 'utf8'))
      .join('\n');
    const registradas = [...fonte.matchAll(/registerTool\(\s*'(\w+)'/g)].map((m) => m[1]).sort();
    expect([...TOOLS].sort()).toEqual(registradas);
  });
});

describe('Parar: vale para o pedido inteiro', () => {
  it.skipIf(process.platform === 'win32')('depois do Parar, o failover não chama a próxima IA', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'cli-falso-'));
    const marca = join(bin, 'codex-rodou');
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexec sleep 30\n');
    writeFileSync(join(bin, 'codex'), `#!/bin/sh\ntouch ${marca}\n`);
    chmodSync(join(bin, 'claude'), 0o755);
    chmodSync(join(bin, 'codex'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      setTimeout(cancelarExecucao, 300);
      const r = await executar('x', MCP, () => {}, undefined, null, ['claude', 'codex']);
      expect(r.ok).toBe(false);
      expect(existsSync(marca)).toBe(false);
    } finally {
      process.env.PATH = path;
    }
  });
});

describe('Prazo: inatividade mata, trabalho em andamento não', () => {
  it.skipIf(process.platform === 'win32')('IA que continua agindo passa do prazo; quando para de agir, é encerrada', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'cli-lento-'));
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexec sleep 30\n');
    chmodSync(join(bin, 'claude'), 0o755);
    const path = process.env.PATH;
    const prazos = { ...PRAZOS };
    process.env.PATH = `${bin}:${path}`;
    PRAZOS.paradoMs = 400;
    try {
      // Três ações, uma a cada 250 ms: sem renovar, o prazo de 400 ms mataria no meio delas.
      for (const ms of [250, 500, 750]) setTimeout(marcarAtividade, ms);
      const t0 = performance.now();
      const r = await executar('x', MCP, () => {}, undefined, null, ['claude']);
      expect(performance.now() - t0).toBeGreaterThan(1000);
      expect(r.ok).toBe(false);
      expect(r.texto).toContain('sem agir no navegador');
    } finally {
      process.env.PATH = path;
      Object.assign(PRAZOS, prazos);
    }
  });

  it.skipIf(process.platform === 'win32')('o teto total vale mesmo com a IA agindo', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'cli-eterno-'));
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexec sleep 30\n');
    chmodSync(join(bin, 'claude'), 0o755);
    const path = process.env.PATH;
    const prazos = { ...PRAZOS };
    process.env.PATH = `${bin}:${path}`;
    PRAZOS.totalMs = 300;
    try {
      const r = await executar('x', MCP, () => {}, undefined, null, ['claude']);
      expect(r.texto).toContain('minutos de trabalho');
    } finally {
      process.env.PATH = path;
      Object.assign(PRAZOS, prazos);
    }
  });
});

describe('agy: comando negado não pode matar a tarefa', () => {
  it('lê as ações negadas na saída real do agy (capturada em 03/10/2026)', () => {
    const saida =
      '{"event":"init","conversation_id":"5870262c-ddc8-447b-9817-d709f8f1c316"}\n' +
      '{"event":"result","result":{"conversation_id":"5870262c-ddc8-447b-9817-d709f8f1c316","status":"SUCCESS","response":"","denied_actions":[{"action":"command","display_name":"RunCommand"}]}}';
    expect(acoesNegadas('agy', saida)).toEqual(['command']);
    expect(sessaoDaSaida('agy', saida)).toBe('5870262c-ddc8-447b-9817-d709f8f1c316');
  });

  it('rodada normal não tem negação', () => {
    expect(acoesNegadas('agy', '{"event":"result","result":{"response":"ok"}}')).toEqual([]);
    expect(acoesNegadas('claude', 'qualquer coisa')).toEqual([]);
  });
});

describe('agy: retomada depois de comando negado', () => {
  it.skipIf(process.platform === 'win32')('retoma a mesma sessão e a tarefa termina com resposta', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'agy-falso-'));
    const ID = '5870262c-ddc8-447b-9817-d709f8f1c316';
    // 1ª rodada: a trava nega o comando e o agy encerra sem resposta. Retomada (--conversation): conclui.
    writeFileSync(
      join(bin, 'agy'),
      `#!/bin/sh
case "$*" in mcp*) exit 0;; esac
case "$*" in *--conversation*) echo '{"event":"result","result":{"conversation_id":"${ID}","response":"Feito so com o navegador."}}'; exit 0;; esac
echo '{"event":"result","result":{"conversation_id":"${ID}","response":"","denied_actions":[{"action":"command"}]}}'
`,
    );
    chmodSync(join(bin, 'agy'), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      const avisos: string[] = [];
      const r = await executar('x', MCP, (t) => avisos.push(t), undefined, null, ['agy']);
      expect(r).toMatchObject({ ok: true, texto: 'Feito so com o navegador.' });
      expect(avisos.some((a) => a.includes('terminal'))).toBe(true);
    } finally {
      process.env.PATH = path;
    }
  });
});
