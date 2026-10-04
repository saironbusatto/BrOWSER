// Ponte: host de Native Messaging (iniciado pelo Chrome) + servidor MCP HTTP em 127.0.0.1.
// stdout é exclusivo do protocolo do Chrome: todo log vai para arquivo.

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
  type Campo,
  type Cmd,
  type Comandos,
  type Evento,
  IAS,
  type Ia,
  type MensagemExtensao,
  type PapelAgente,
  type Pedir,
  type Resposta,
  type SiteBlueprint,
} from '@browser/shared';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { desconectar, desconectarTodas, fimDoLogin, iniciarLogin, obterStatusAssinaturas, responderCodigo } from './assinaturas';
import { gerarBlueprintAnonimizado, obterBlueprint, salvarOuAtualizarBlueprint } from './blueprints';
import { CONTROLE_ATIVO } from './build';
import { DIR_PONTE, pathComIAs } from './caminhos';
import { type Conversa, conversaDe, registrarMensagem } from './conversas';
import { rodarDiagnostico } from './doctor';
import { motivoEnvioIrreversivel, recusaEnvio } from './envio';
import { cancelarExecucao, definirCancelamento, type Execucao, executar, marcarAtividade, removerIntegracaoAgy } from './ias';
import { registrarHost, removerHost } from './instalar';
import { Relogio } from './latencia';
import { listarModelos } from './modelos';
import { motivoPerguntaVaga } from './perguntas';
import { escolherSkills, type Skill } from './skills';
import { registrarToolsDrive } from './tools-drive';
import { registrarToolsGmail } from './tools-gmail';
import { registrarToolsNavegador } from './tools-navegador';

process.env.PATH = pathComIAs(); // o navegador passa o PATH de quando foi aberto

// `bridge --install`: registra o próprio executável no Chrome/Brave/Edge e sai (usuário final, sem Bun).
if (process.argv.includes('--install')) {
  for (const r of registrarHost(process.execPath)) console.log(`✓ ${r.navegador}: ${r.destino}`);
  console.log('Pronto. Reinicie o navegador para ativar a ponte.');
  process.exit(0);
}

// `bridge --doctor`: a pergunta "isso funciona na minha máquina?", respondida antes de instalar.
if (process.argv.includes('--doctor')) {
  process.exit(await rodarDiagnostico());
}

// `bridge --uninstall`: desfaz tudo o que o --install e o uso da ponte criaram fora da pasta dela.
if (process.argv.includes('--uninstall')) {
  for (const n of removerHost()) console.log(`✓ removido do ${n}`);
  for (const f of removerIntegracaoAgy()) console.log(`✓ ${f}`);
  rmSync(DIR_PONTE, { recursive: true, force: true });
  console.log('✓ dados do BrOWSER apagados (estado, log e cache de blueprints)');
  console.log('Pronto. Remova também a extensão BrOWSER do navegador.');
  process.exit(0);
}

export const DIR = DIR_PONTE;
const TIMEOUT_MS = 30_000;
const CONTROLE: Cmd[] = ['abrir', 'avaliar', 'ler_campos', 'ler_estrutura', 'recarregar', 'forcar_modo_dom']; // comandos do runner do teste

mkdirSync(DIR, { recursive: true, mode: 0o700 });
// Log nunca derruba a ponte: stdout é exclusivo do protocolo do Chrome e o arquivo pode sumir
// (home removido, disco cheio, limpeza de ambiente). Perder um log é aceitável; perder o processo
// no meio de um pedido, não.
const log = (...a: unknown[]) => {
  try {
    appendFileSync(join(DIR, 'bridge.log'), `${new Date().toISOString()} ${a.join(' ')}\n`);
  } catch {}
};

// ---- Native Messaging: mensagens com prefixo uint32 little-endian ----
let seq = 0;
const pendentes = new Map<number, { ok: (v: unknown) => void; falha: (e: Error) => void }>();
const perguntasPendentes = new Map<
  string,
  {
    resolver: (r: { resposta: string; respostasCampos?: Record<string, string> }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
// Pedidos que o usuário mandaram parar: o processo da IA já foi morto, então o `resultado` que
// sair em seguida é ruído e o evento certo é `parado`.
const paradoEm = new Set<string>();
// Qual CLI estava rodando, para o `parado` dizer "parado durante o agy". Cosmético, mas ajuda a
// pessoa a entender por que a resposta parou no meio.
let iaEmCurso: Ia | undefined;
let iaAtivaPreferencial: Ia = 'agy';
// O que a ponte lembra de cada conversa do painel (sessões dos CLIs, sites e abas liberados).
const conversas = new Map<string, Conversa>();
// A conversa do pedido em curso: as tools de navegação consultam e ampliam o que está liberado.
let conversaAtual: Conversa | undefined;
// Modelo escolhido por IA. Ausente = default do CLI (que é o rápido).
const modelosEscolhidos: Partial<Record<Ia, string>> = {};

function escrever(msg: object) {
  const corpo = Buffer.from(JSON.stringify(msg));
  const cab = Buffer.alloc(4);
  cab.writeUInt32LE(corpo.length);
  process.stdout.write(Buffer.concat([cab, corpo]));
}

// ---- Instrumentação: onde vai o tempo de um pedido? ----
// `enviar` é o único funil por onde passa TODO comando de browser, então é o ponto certo de
// medição: uma edição em vez de instrumentar tool por tool. Um pedido por vez (rodarPedido trava
// em `ocupado`), então um relógio de módulo basta.
const relogio = new Relogio();

function enviar<C extends Cmd>(cmd: C, args: Comandos[C]['args']): Promise<Comandos[C]['result']> {
  const id = ++seq;
  escrever({ id, cmd, args });
  marcarAtividade(); // a IA agiu: o prazo de inatividade dela recomeça (ias.ts)
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    // O timer é sempre limpo: sem isso cada comando deixava um setTimeout de 30s vivo e prendia
    // o event loop (pior no timer de 5 min das perguntas).
    const timer = setTimeout(() => {
      if (pendentes.delete(id)) reject(new Error(`timeout em ${cmd}`));
    }, TIMEOUT_MS);
    timer.unref?.();
    pendentes.set(id, {
      ok: (v) => {
        clearTimeout(timer);
        marcarAtividade();
        relogio.registrar(cmd, performance.now() - t0);
        resolve(v as Comandos[C]['result']);
      },
      falha: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
  });
}

async function lerStdin() {
  let buf = Buffer.alloc(0);
  for await (const pedaco of Bun.stdin.stream()) {
    buf = Buffer.concat([buf, Buffer.from(pedaco)]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
      const tam = buf.readUInt32LE(0);
      const msg = JSON.parse(buf.subarray(4, 4 + tam).toString()) as Resposta | MensagemExtensao;
      buf = buf.subarray(4 + tam);
      if ('tipo' in msg) {
        if (msg.tipo === 'pedido') {
          atenderPedido(msg);
        } else if (msg.tipo === 'parar') {
          encerrarPedido(msg.pedidoId, iaEmCurso);
        } else if (msg.tipo === 'resposta_usuario') {
          const p = perguntasPendentes.get(msg.perguntaId);
          if (p) {
            perguntasPendentes.delete(msg.perguntaId);
            clearTimeout(p.timer);
            p.resolver({ resposta: msg.resposta, respostasCampos: msg.respostasCampos });
          }
        } else if (msg.tipo === 'telemetria_blueprint') {
          if (msg.blueprint?.dominio && Array.isArray(msg.blueprint.campos)) {
            const atualizado = salvarOuAtualizarBlueprint(msg.blueprint);
            log(
              `[telemetria] Blueprint passivo atualizado para ${atualizado.dominio} (${atualizado.campos.length} campos, ${atualizado.gatilhos?.length ?? 0} gatilhos)`,
            );
          }
        } else if (msg.tipo === 'consultar_assinaturas') {
          emitirStatusAssinaturas();
        } else if (msg.tipo === 'definir_modelo') {
          // Aceita id fora do catálogo de propósito: a lista envelhece, o campo de texto não trava.
          modelosEscolhidos[msg.ia] = msg.modelo;
          log(`modelo de ${msg.ia}: ${msg.modelo || '(default do CLI)'}`);
          emitirStatusAssinaturas();
        } else if (msg.tipo === 'ativar_assinatura') {
          iaAtivaPreferencial = msg.ia;
          emitirStatusAssinaturas();
        } else if (msg.tipo === 'conectar_assinatura') {
          conectarAssinatura(msg.ia).catch((e) => log(`login ${msg.ia} erro: ${e}`));
        } else if (msg.tipo === 'desconectar_todos') {
          desconectarTodas(iaAtivaPreferencial)
            .then((r) => {
              for (const f of r.falhou) log(`desconectar ${f.ia} falhou: ${f.erro}`);
              return emitirStatusAssinaturas().then(() =>
                escrever({
                  tipo: 'logout_fim',
                  ok: r.ok.length,
                  falhou: r.falhou.map((f) => `${f.nome}: ${f.erro}`),
                } satisfies Evento),
              );
            })
            .catch((e) => log(`desconectar erro: ${String(e)}`));
        } else if (msg.tipo === 'desconectar_assinatura') {
          desconectar(msg.ia)
            .then((r) => {
              if (!r.ok) log(`desconectar ${msg.ia} falhou: ${r.erro}`);
              return emitirStatusAssinaturas().then(() =>
                escrever({
                  tipo: 'logout_fim',
                  ok: r.ok ? 1 : 0,
                  falhou: r.ok ? [] : [r.erro],
                } satisfies Evento),
              );
            })
            .catch((e) => log(`desconectar ${msg.ia} erro: ${String(e)}`));
        } else if (msg.tipo === 'login_codigo') {
          const erro = responderCodigo(msg.ia, msg.codigo);
          if (erro) log(`login_codigo ${msg.ia}: ${erro}`);
        }
        continue;
      }
      const r = msg;
      const p = pendentes.get(r.id);
      pendentes.delete(r.id);
      if (!p) continue;
      r.ok ? p.ok(r.result) : p.falha(new Error(r.error));
    }
  }
  log('stdin fechado: Chrome desconectou, encerrando');
  process.exit(0);
}

// ---- Assinaturas ----

async function emitirStatusAssinaturas() {
  const assinaturas = await obterStatusAssinaturas(iaAtivaPreferencial);
  // Cada card leva só os modelos da própria IA: agy não oferece modelo do claude.
  for (const a of assinaturas) {
    a.modelos = await listarModelos(a.ia);
    a.modelo = modelosEscolhidos[a.ia] ?? '';
  }
  const iaAtiva = assinaturas.find((a) => a.ativo)?.ia ?? iaAtivaPreferencial;
  escrever({ tipo: 'status_assinaturas', assinaturas, iaAtiva } satisfies Evento);
  return assinaturas;
}

// Login oficial sem janela: o CLI roda escondido, a ponte manda pro painel o link e o código,
// e o "conectou" vem do próprio processo terminar (proc.exited). Sem polling e sem correlação:
// quem quiser outro plano clica em Conectar no outro card — não é preciso logar nos três.
const NOMES: Record<Ia, string> = { agy: 'Google AI Pro', codex: 'ChatGPT Plus / Pro', claude: 'Claude Pro / Max' };

async function conectarAssinatura(ia: Ia) {
  const nome = NOMES[ia];
  const { erro } = iniciarLogin(ia, (d) => escrever({ tipo: 'login_ia', ia, nome, ...d } satisfies Evento));
  if (erro) {
    escrever({ tipo: 'login_fim', ia, nome, ok: false, mensagem: erro } satisfies Evento);
    return;
  }
  const { ok } = await fimDoLogin(ia);
  const lista = await obterStatusAssinaturas(iaAtivaPreferencial);
  const conectado = lista.find((a) => a.ia === ia)?.conectado ?? false;
  const ativa = lista.find((a) => a.ativo)?.ia ?? iaAtivaPreferencial;
  escrever({ tipo: 'status_assinaturas', assinaturas: lista, iaAtiva: ativa } satisfies Evento);
  escrever({
    tipo: 'login_fim',
    ia,
    nome,
    ok: ok && conectado,
    mensagem: conectado
      ? `${nome} conectado. Já pode usar o BrOWSER.`
      : `Não deu para conectar o ${nome} — o código pode ter expirado. Tente de novo, ou conecte outro plano.`,
  } satisfies Evento);
  log(`login ${ia}: ${ok && conectado ? 'ok' : 'falhou'}`);
}

// ---- Pedidos do painel lateral ----
let mcp: { url: string; token: string } | undefined; // definido quando o HTTP sobe
let ocupado = false;
// `pedidoAtivo` só é sobrescrito por um pedido que realmente entrou (ver emitirResultado), então
// dois pedidos seguidos não sequestram o id um do outro.
let pedidoAtivo: string | undefined;
// Mapa ref -> campo, populado a cada ler_campos. É o que permite à ponte decidir, por código, se
// um clique é envio irreversível (src/envio.ts) sem depender de o rótulo dizer o que é.
let camposConhecidos = new Map<number, Campo>();

/**
 * Encerra o pedido em andamento.
 *
 * Emite o `parado` AQUI, e não no fim de `atenderPedido`: o `paradoEm` lá existe justamente para
 * suprimir o `resultado` (que viria de um processo morto e seria ruído). Sem este `escrever`, o
 * painel ficaria preso em "Parando…" para sempre — foi o que o teste de comportamento pegou.
 */
function encerrarPedido(pedidoId: string, ia?: Ia): void {
  if (pedidoAtivo !== pedidoId) return;
  paradoEm.add(pedidoId);
  cancelarExecucao();
  // As perguntas pendentes ficariam esperando 5 min segurando o processador da IA. Resolve todas
  // com a resposta de parada: sem isso a promise do `perguntar_ao_usuario` nunca resolveria.
  for (const [perguntaId, p] of perguntasPendentes) {
    perguntasPendentes.delete(perguntaId);
    clearTimeout(p.timer);
    p.resolver({ resposta: 'O pedido foi parado pelo usuário. Nada mais será feito nesta aba.' });
  }
  camposConhecidos = new Map();
  log(`pedido ${pedidoId}: parado pelo usuário${ia ? ` (durante ${ia})` : ''}`);
  escrever({
    tipo: 'parado',
    pedidoId,
    ...(ia ? { ia } : {}),
    texto: 'Você parou este pedido. Nada foi enviado e a página não foi alterada.',
  } satisfies Evento);
}

/** Resultado de um pedido recusado sem chegar à IA (já em andamento). Não é falha da IA. */
function emitirRecusa(pedidoId: string, texto: string) {
  escrever({ tipo: 'parado', pedidoId, texto } satisfies Evento);
  log(`pedido ${pedidoId}: recusado — ${texto}`);
}

async function rodarPedido(
  p: Pedir,
  blueprint: SiteBlueprint | null,
  avisar: (t: string, agente?: PapelAgente) => void,
  ordem?: Ia[],
  skills: Skill[] = [],
): Promise<Execucao> {
  if (!mcp) return { ok: false, texto: 'ponte ainda iniciando' };
  // ponytail: um pedido por vez (uma aba, um formulário); fila de pedidos se o lote (Q1) precisar.
  if (ocupado) return { ok: false, texto: 'Já existe um pedido em andamento.' };
  ocupado = true;
  // A conta fica aqui e não em atenderPedido de propósito: rodarPedido é o funil dos DOIS
  // caminhos (painel lateral e `/control` do spike/teste). Medir num deles só deixaria o outro
  // cego — que foi exatamente o erro da primeira versão desta instrumentação.
  relogio.zerar();
  const t0 = performance.now();
  const conversa = conversaDe(conversas, p.conversaId ?? p.pedidoId);
  registrarMensagem(conversa, p.texto);
  conversaAtual = conversa;
  try {
    const ordemFinal = ordem ?? [iaAtivaPreferencial, ...IAS.filter((i) => i !== iaAtivaPreferencial)];
    // Token novo a cada execução: o que o agy grava na config global dele fica inútil assim que
    // o pedido termina. O cancelamento é registrado junto, para o botão Parar matar o processo.
    definirCancelamento(null);
    return await executar(
      p.texto,
      sessaoMcp(),
      avisar,
      p.arquivos,
      blueprint,
      ordemFinal,
      (ia) => {
        iaEmCurso = ia;
      },
      (ia) => modelosEscolhidos[ia] ?? '',
      (ia) => conversa.sessoes[ia],
      skills,
    ).then((r) => {
      if (r.ok && r.ia && r.sessao) conversa.sessoes[r.ia] = r.sessao;
      return r;
    });
  } finally {
    conversaAtual = undefined;
    definirCancelamento(null);
    ocupado = false;
    log(relogio.resumo(performance.now() - t0));
  }
}

/** URL + token vigentes; o token gira a cada pedido. */
function sessaoMcp(): { url: string; token: string } {
  if (!mcp) throw new Error('MCP ainda não subiu');
  tokenAtivo = randomBytes(32).toString('hex');
  gravarToken();
  return { url: mcp.url, token: tokenAtivo };
}

function emitirResultado(p: Pedir, r: Execucao) {
  log(`pedido ${p.pedidoId}: ${r.ok ? 'ok' : 'falhou'} (${r.ia ?? '-'})`);
  escrever({ tipo: 'resultado', pedidoId: p.pedidoId, ...r } satisfies Evento);
}

async function atenderPedido(p: Pedir) {
  // Só assume o pedido se não houver um em andamento. Antes, o segundo pedido sobrescrevia
  // `pedidoAtivo` e só depois era rejeitado — os status do primeiro saíam com o id errado.
  if (ocupado) {
    emitirRecusa(p.pedidoId, 'Já existe um pedido em andamento.');
    return;
  }
  // Nunca cai numa conta que a pessoa não conectou: lista vazia é recusa, não "usa a padrão".
  if (p.ias && !p.ias.some((ia) => IAS.includes(ia))) {
    emitirRecusa(p.pedidoId, 'Conecte uma IA antes de fazer um pedido.');
    return;
  }
  pedidoAtivo = p.pedidoId;
  const emitir = (e: Evento) => escrever(e);
  try {
    if (p.arquivos && p.arquivos.length > 0) {
      emitir({
        tipo: 'status',
        pedidoId: p.pedidoId,
        texto: `Pré-processando ${p.arquivos.length} arquivo(s) anexado(s)…`,
        agente: 'synthesizer',
      });
    }

    // Consulta silenciosa de Blueprint comunitário / cache
    let blueprint: SiteBlueprint | null = null;
    let urlAba: string | undefined;
    // Skill de site (nível 2): escolhe pelo domínio da aba e pelo pedido, e entra no prompt como o
    // blueprint. Ela vai junto no pedido de continuação, porque a aba pode ter mudado.
    let skills: Skill[] = [];
    try {
      const infoAba = (await enviar('ler_campos', {}).catch(() => null)) as { url: string; titulo: string; campos: Campo[] } | null;
      if (infoAba?.url) {
        urlAba = infoAba.url;
        skills = escolherSkills({ url: urlAba, pedido: p.texto });
        if (skills.length) {
          emitir({
            tipo: 'status',
            pedidoId: p.pedidoId,
            texto: `Skill de site carregada (${skills.map((s) => s.nome).join(', ')})`,
            agente: 'scout',
          });
        }
        blueprint = await obterBlueprint(infoAba.url);
        if (blueprint) {
          emitir({
            tipo: 'status',
            pedidoId: p.pedidoId,
            texto: `Blueprint comunitário carregado (${blueprint.dominio})`,
            agente: 'scout',
          });
        }
      }
    } catch {}

    const r = await rodarPedido(
      p,
      blueprint,
      (texto, agente) => emitir({ tipo: 'status', pedidoId: p.pedidoId, texto, agente }),
      p.ias?.filter((ia) => IAS.includes(ia)),
      skills,
    ).catch((e): Execucao => ({ ok: false, texto: String(e) }));

    // Pedido parado no meio: a IA foi morta, então o resultado não diz nada — quem decide a
    // mensagem final é o evento `parado`.
    if (paradoEm.has(p.pedidoId)) {
      paradoEm.delete(p.pedidoId);
      log(`pedido ${p.pedidoId}: parado`);
      return;
    }

    emitirResultado(p, r);

    // Se bem-sucedido, memoriza no cache local (auto-aprendizado anônimo)
    if (r.ok && urlAba) {
      try {
        const estadoFinal = (await enviar('ler_campos', {}).catch(() => null)) as { url: string; titulo: string; campos: Campo[] } | null;
        if (estadoFinal && estadoFinal.campos.length > 0) {
          const novoBp = gerarBlueprintAnonimizado(estadoFinal);
          salvarOuAtualizarBlueprint(novoBp);
          log(`blueprint auto-aprendido e salvo: ${novoBp.dominio} (${novoBp.campos.length} campos)`);
        }
      } catch {}
    }
  } finally {
    if (pedidoAtivo === p.pedidoId) pedidoAtivo = undefined;
    camposConhecidos = new Map();
    iaEmCurso = undefined;
  }
}

// ---- MCP ----
const texto = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });

function criarMcp() {
  const s = new McpServer({ name: 'browser', version: '0.1.0' });
  // Cada chamada de ferramenta é uma ida e volta à IA: é o número que a bancada quer baixar.
  // Contado aqui, no único lugar por onde toda ferramenta é registrada.
  const registrar = s.registerTool.bind(s) as (nome: string, cfg: unknown, h: (...a: unknown[]) => unknown) => unknown;
  s.registerTool = ((nome: string, cfg: unknown, h: (...a: unknown[]) => unknown) =>
    registrar(nome, cfg, (...a: unknown[]) => {
      relogio.ferramenta(nome);
      return h(...a);
    })) as typeof s.registerTool;
  s.registerTool(
    'consultar_blueprint',
    {
      description: 'Consulta se há um mapa estrutural conhecido (blueprint) para a URL ou domínio especificado.',
      inputSchema: {
        urlOuDominio: z.string().describe('URL completa ou domínio a consultar (ex: gemini.google.com ou localhost:5173)'),
      },
    },
    async ({ urlOuDominio }) => {
      const bp = await obterBlueprint(urlOuDominio);
      return texto(bp ?? { encontrado: false, mensagem: 'Nenhum blueprint disponível para este domínio ainda.' });
    },
  );
  s.registerTool(
    'ler_campos',
    {
      description:
        'Lê a aba atual do navegador e lista os campos de formulário e botões: ref, papel, rótulo (nome), valor atual, se está marcado e as opções de selects. Chame antes de preencher e de novo no fim para conferir.',
      inputSchema: {},
    },
    async () => {
      if (pedidoAtivo) {
        escrever({
          tipo: 'status',
          pedidoId: pedidoAtivo,
          texto: 'Mapeando elementos e botões da página…',
          agente: 'scout',
        } satisfies Evento);
      }
      const leitura = (await enviar('ler_campos', {})) as { url: string; titulo: string; campos: Campo[] };
      // Guarda do clique em envio: só dá para classificar o que foi lido nesta rodada.
      camposConhecidos = new Map(leitura.campos.map((c) => [c.ref, c]));
      return texto(leitura);
    },
  );
  // Leitura única (roteiro, fase 1.2): texto e controles juntos, com hierarquia. Sai em texto
  // puro e não em JSON: é o que a IA lê a cada passo, e cada chave repetida é ficha jogada fora.
  s.registerTool(
    'ler_estrutura',
    {
      description:
        'Lê a página como ela é: texto e controles juntos, na ordem de leitura, com hierarquia (título, tabela, linha, lista, janela) e uma ref em cada coisa clicável ou preenchível. Use PRIMEIRO, antes de qualquer outra leitura: mostra de que linha é cada botão e o que está escrito ao redor. Com `filtro`, devolve só a parte da página que contém aquele texto (use em página grande ou quando a leitura vier cortada).',
      inputSchema: { filtro: z.string().optional().describe('Texto que a parte procurada contém, ex.: "Padaria Sol", "exportar"') },
    },
    async ({ filtro }) => {
      if (pedidoAtivo) escrever({ tipo: 'status', pedidoId: pedidoAtivo, texto: 'Lendo a página…', agente: 'scout' } satisfies Evento);
      const r = await enviar('ler_estrutura', filtro ? { filtro } : {});
      // Mesma guarda do ler_campos: só dá para classificar um clique no que foi lido nesta rodada.
      // Leitura filtrada acrescenta; leitura inteira substitui.
      camposConhecidos = new Map([...(filtro ? camposConhecidos : []), ...r.campos.map((c) => [c.ref, c] as const)]);
      const corte = r.truncado ? '\n… (página grande, leitura cortada: chame de novo com `filtro`)' : '';
      const vazio = filtro ? `nada na página contém "${filtro}"` : '(página sem conteúdo legível; se for tela desenhada, use ver_tela)';
      return { content: [{ type: 'text' as const, text: `${r.titulo}\n${r.url}\n\n${r.texto || vazio}${corte}` }] };
    },
  );
  s.registerTool(
    'preencher',
    {
      description:
        'Preenche um campo pelo ref obtido em ler_campos. Datas: AAAA-MM-DD. Select: texto ou valor da opção. Checkbox/radio: "true" para marcar, "false" para desmarcar. Retorna o valor que ficou no campo.',
      inputSchema: { ref: z.number().int().describe('ref do campo em ler_campos'), valor: z.string() },
    },
    async ({ ref, valor }) => {
      if (pedidoAtivo) {
        escrever({
          tipo: 'status',
          pedidoId: pedidoAtivo,
          texto: `Preenchendo: ${valor.length > 20 ? `${valor.slice(0, 18)}…` : valor}`,
          agente: 'scout',
        } satisfies Evento);
      }
      return texto(await enviar('preencher', { ref, valor }));
    },
  );
  s.registerTool(
    'clicar',
    {
      description:
        'Clica num elemento pelo ref obtido em ler_campos. NUNCA clique em botões que enviam o formulário sem confirmação explícita do usuário.',
      inputSchema: { ref: z.number().int() },
    },
    async ({ ref }) => {
      // Regra de código, não de prompt: clique em envio final é barrado antes de chegar na página.
      const campo = camposConhecidos.get(ref);
      if (!campo) return texto({ erro: `ref ${ref} desconhecida: chame ler_campos antes de clicar` });
      const nome = motivoEnvioIrreversivel(campo);
      if (nome) {
        log(`clique em "${nome}" barrado: envio irreversível`);
        return texto(recusaEnvio(nome));
      }
      if (pedidoAtivo) {
        escrever({ tipo: 'status', pedidoId: pedidoAtivo, texto: 'Navegando / abrindo menu na página…', agente: 'scout' } satisfies Evento);
      }
      return texto(await enviar('clicar', { ref }));
    },
  );
  // A ferramenta que faltava. Sem ela a IArespondia "não consigo ler a página" a pedido legítimo,
  // porque só existia ler_campos: ela via os campos do formulário, não o texto. Recusar um
  // pedido que dá para cumprir é a pior resposta que um agente pode dar.
  s.registerTool(
    'ler_pagina',
    {
      description:
        'Lê o TEXTO da aba ativa: a página inteira de uma vez, sem precisar rolar. Use para entender a página, resumir, responder perguntas sobre o que está escrito, localizar um texto antes de clicar. Para preencher formulários use ler_campos. Campo de senha nunca tem o valor lido. Se o retorno disser que o texto foi cortado, peça o trecho que falta em vez de adivinhar.',
      inputSchema: {
        limite: z
          .number()
          .int()
          .min(500)
          .max(200_000)
          .optional()
          .describe('Máximo de caracteres a devolver (padrão 40000). Aumente só se o texto vier cortado.'),
      },
    },
    async ({ limite }) => {
      if (!pedidoAtivo) return texto({ erro: 'Nenhum pedido ativo no momento' });
      const r = (await enviar('ler_pagina', limite ? { limite } : {}).catch((e) => ({
        erro: `não consegui ler a página: ${String(e)}`,
      }))) as { url: string; titulo: string; texto: string; truncado: boolean; caracteres: number; erro?: string };
      if (r.erro) return texto(r);
      return texto({
        url: r.url,
        titulo: r.titulo,
        caracteres: r.caracteres,
        truncado: r.truncado,
        texto: r.texto,
        aviso: r.truncado
          ? 'O texto veio cortado. Se a resposta depender do que ficou de fora, chame ler_pagina de novo com um limite maior.'
          : undefined,
      });
    },
  );

  s.registerTool(
    'perguntar_ao_usuario',
    {
      description:
        'Pergunta ao usuário, no painel lateral, um dado essencial que falta (CPF, telefone, uma escolha entre opções). A pergunta precisa ser entendida sem contexto: diga qual campo da página precisa do dado e, se houver, passe as opções em "opcoes". Perguntas vagas (ex.: "teste") são recusadas e não chegam ao usuário. Retorna a resposta dele.',
      inputSchema: {
        pergunta: z
          .string()
          .describe('Pergunta completa ao usuário, citando o campo da página. Ex.: "Qual opção escolher em Primary Discovery Channel?"'),
        campos: z.array(z.string()).optional().describe('Lista opcional de nomes dos campos específicos que o usuário deve preencher'),
        opcoes: z.array(z.string()).optional().describe('Lista opcional de opções de escolha para o usuário clicar'),
      },
    },
    async ({ pergunta, campos, opcoes }) => {
      if (!pedidoAtivo) return texto({ erro: 'Nenhum pedido ativo no momento' });
      const vaga = motivoPerguntaVaga({ pergunta, campos, opcoes });
      if (vaga) {
        log(`pergunta vaga recusada: ${JSON.stringify(pergunta).slice(0, 80)}`);
        return texto({ erro: vaga });
      }
      return texto(await perguntarNoPainel(pedidoAtivo, pergunta, opcoes, campos));
    },
  );

  registrarToolsNavegador(s, {
    enviar,
    status: (t) => {
      if (pedidoAtivo) escrever({ tipo: 'status', pedidoId: pedidoAtivo, texto: t, agente: 'scout' } satisfies Evento);
    },
    perguntar: async (pergunta, opcoes) =>
      pedidoAtivo ? (await perguntarNoPainel(pedidoAtivo, pergunta, opcoes)).resposta : 'Nenhum pedido ativo',
    conversa: () => conversaAtual,
    paginaMudou: () => {
      camposConhecidos = new Map();
    },
  });
  registrarToolsDrive(s, {
    enviar,
    status: (t) => {
      if (pedidoAtivo) escrever({ tipo: 'status', pedidoId: pedidoAtivo, texto: t, agente: 'scout' } satisfies Evento);
    },
    conversa: () => conversaAtual,
  });
  registrarToolsGmail(s, {
    enviar,
    status: (t) => {
      if (pedidoAtivo) escrever({ tipo: 'status', pedidoId: pedidoAtivo, texto: t, agente: 'scout' } satisfies Evento);
    },
    conversa: () => conversaAtual,
  });
  return s;
}

/** Mostra a pergunta no painel e espera a resposta (5 min; sem resposta, devolve um aviso). */
function perguntarNoPainel(
  pedidoId: string,
  pergunta: string,
  opcoes?: string[],
  campos?: string[],
): Promise<{ resposta: string; respostasCampos?: Record<string, string> }> {
  const perguntaId = randomUUID();
  escrever({ tipo: 'pergunta', pedidoId, perguntaId, pergunta, campos, opcoes } satisfies Evento);
  // Esperar a pessoa não é a IA parada: sem este pulso, o prazo de inatividade (ias.ts) matava a
  // IA enquanto a pergunta ainda estava na tela.
  marcarAtividade();
  const pulso = setInterval(marcarAtividade, 60_000);
  pulso.unref?.();
  return new Promise<{ resposta: string; respostasCampos?: Record<string, string> }>((resolve) => {
    const timer = setTimeout(() => {
      if (perguntasPendentes.delete(perguntaId)) {
        resolve({ resposta: 'O usuário não respondeu a tempo. Tente prosseguir com os dados disponíveis.' });
      }
    }, 5 * 60_000);
    timer.unref?.();
    perguntasPendentes.set(perguntaId, { resolver: resolve, timer });
  }).finally(() => {
    clearInterval(pulso);
    marcarAtividade();
  });
}

// ---- HTTP ----
// Token rotacionado a cada pedido (ver sessaoMcp). Guardar em `let` porque muda durante a vida do
// processo; a comparação continua em tempo constante.
let tokenAtivo = randomBytes(32).toString('hex');

const autorizado = (req: IncomingMessage) => {
  const a = Buffer.from(req.headers.authorization ?? '');
  const b = Buffer.from(`Bearer ${tokenAtivo}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

function gravarToken() {
  const { port } = http.address() as { port: number };
  writeFileSync(join(DIR, 'bridge.json'), JSON.stringify({ port, token: tokenAtivo, pid: process.pid }), { mode: 0o600 });
}

// Só quem vem do CLI legítimo (sem `Origin`, ou de localhost) fala com o /control. Uma página
// aberta no navegador do usuário apontando para 127.0.0.1:<porta> é barrada antes do token.
function origemConfiavel(req: IncomingMessage): boolean {
  const origem: string | undefined = req.headers.origin;
  if (!origem) return true; // CLI (spike, smoke) não manda Origin
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

// Teto generoso para os payloads grandes (anexos em base64) e hard para qualquer coisa acima:
// sem limite, um POST de 2 GB matava a ponte por exaustão de memória.
const MAX_CORPO = 128 * 1024 * 1024;

async function corpoJson(req: IncomingMessage) {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const p of req) {
    total += (p as Buffer).length;
    if (total > MAX_CORPO) throw new Error('corpo da requisição grande demais');
    partes.push(p as Buffer);
  }
  return partes.length ? JSON.parse(Buffer.concat(partes).toString()) : undefined;
}

async function atender(req: IncomingMessage, res: ServerResponse) {
  if (!autorizado(req)) return res.writeHead(401).end();
  const body = await corpoJson(req);

  if (req.url === '/mcp') {
    // Stateless: um servidor + transporte por requisição.
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => t.close());
    await criarMcp().connect(t);
    return t.handleRequest(req, res, body);
  }

  // /control é superfície de teste (`bun run spike`, smoke do CI): só existe em build de
  // desenvolvimento. No binário de release estas rotas não são compiladas.
  if (CONTROLE_ATIVO && origemConfiavel(req) && req.url === '/control' && req.method === 'POST' && body?.cmd === 'executar') {
    // Mesmo caminho do painel lateral, para o `bun run spike` testar o fluxo real.
    const pedido: Pedir = { tipo: 'pedido', pedidoId: randomUUID(), texto: String(body.args?.texto ?? ''), tabId: -1 };
    const t0 = performance.now();
    // Como no painel (atenderPedido): sem pedido ativo, `ler_pagina` e `perguntar_ao_usuario`
    // respondem "nenhum pedido ativo" e a medição sai com a IA meio cega.
    pedidoAtivo = pedido.pedidoId;
    try {
      const r = await rodarPedido(pedido, null, (t) => log(t), body.args?.ia ? [body.args.ia] : undefined);
      // A medição vai junto: a bancada (scripts/bancada.ts) compara pedidos por ela.
      const result = { ...r, medida: relogio.medida(performance.now() - t0) };
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result }));
    } finally {
      pedidoAtivo = undefined;
      camposConhecidos = new Map();
    }
  }
  if (CONTROLE_ATIVO && origemConfiavel(req) && req.url === '/control' && req.method === 'POST') {
    if (!CONTROLE.includes(body?.cmd)) return res.writeHead(400).end('comando inválido');
    try {
      const result = await enviar(body.cmd, body.args ?? {});
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result }));
    } catch (e) {
      return res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: String(e) }));
    }
  }
  res.writeHead(404).end();
}

const http = createServer((req, res) =>
  atender(req, res).catch((e) => {
    log('erro http', e?.stack ?? e);
    if (!res.headersSent) res.writeHead(500).end();
  }),
);
http.requestTimeout = 0; // `executar` pode levar minutos
http.listen(0, '127.0.0.1', () => {
  const { port } = http.address() as { port: number };
  mcp = { url: `http://127.0.0.1:${port}/mcp`, token: tokenAtivo };
  gravarToken();
  log(`ponte ouvindo em 127.0.0.1:${port}${CONTROLE_ATIVO ? ' (rotas de controle ligadas)' : ''}`);
});

lerStdin();
