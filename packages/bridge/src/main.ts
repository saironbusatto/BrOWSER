// Ponte: host de Native Messaging (iniciado pelo Chrome) + servidor MCP HTTP em 127.0.0.1.
// stdout é exclusivo do protocolo do Chrome: todo log vai para arquivo.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Cmd, Comandos, Resposta } from '@browser/shared';

export const DIR = join(homedir(), '.config', 'browser-bridge');
const TIMEOUT_MS = 30_000;
const CONTROLE: Cmd[] = ['abrir', 'avaliar', 'ler_campos']; // comandos do runner do teste

mkdirSync(DIR, { recursive: true, mode: 0o700 });
const log = (...a: unknown[]) => appendFileSync(join(DIR, 'bridge.log'), `${new Date().toISOString()} ${a.join(' ')}\n`);

// ---- Native Messaging: mensagens com prefixo uint32 little-endian ----
let seq = 0;
const pendentes = new Map<number, { ok: (v: unknown) => void; falha: (e: Error) => void }>();

function enviar<C extends Cmd>(cmd: C, args: Comandos[C]['args']): Promise<Comandos[C]['result']> {
  const id = ++seq;
  const corpo = Buffer.from(JSON.stringify({ id, cmd, args }));
  const cab = Buffer.alloc(4);
  cab.writeUInt32LE(corpo.length);
  process.stdout.write(Buffer.concat([cab, corpo]));
  return new Promise((ok, falha) => {
    pendentes.set(id, { ok: ok as (v: unknown) => void, falha });
    setTimeout(() => pendentes.delete(id) && falha(new Error(`timeout em ${cmd}`)), TIMEOUT_MS);
  });
}

async function lerStdin() {
  let buf = Buffer.alloc(0);
  for await (const pedaco of Bun.stdin.stream()) {
    buf = Buffer.concat([buf, Buffer.from(pedaco)]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
      const tam = buf.readUInt32LE(0);
      const r = JSON.parse(buf.subarray(4, 4 + tam).toString()) as Resposta;
      buf = buf.subarray(4 + tam);
      const p = pendentes.get(r.id);
      pendentes.delete(r.id);
      if (!p) continue;
      r.ok ? p.ok(r.result) : p.falha(new Error(r.error));
    }
  }
  log('stdin fechado: Chrome desconectou, encerrando');
  process.exit(0);
}

// ---- MCP ----
const texto = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });

function criarMcp() {
  const s = new McpServer({ name: 'browser', version: '0.1.0' });
  s.registerTool('ler_campos', {
    description: 'Lê a aba atual do navegador e lista os campos de formulário e botões: ref, papel, rótulo (nome), valor atual, se está marcado e as opções de selects. Chame antes de preencher e de novo no fim para conferir.',
    inputSchema: {},
  }, async () => texto(await enviar('ler_campos', {})));
  s.registerTool('preencher', {
    description: 'Preenche um campo pelo ref obtido em ler_campos. Datas: AAAA-MM-DD. Select: texto ou valor da opção. Checkbox/radio: "true" para marcar, "false" para desmarcar. Retorna o valor que ficou no campo.',
    inputSchema: { ref: z.number().int().describe('ref do campo em ler_campos'), valor: z.string() },
  }, async ({ ref, valor }) => texto(await enviar('preencher', { ref, valor })));
  s.registerTool('clicar', {
    description: 'Clica num elemento pelo ref obtido em ler_campos. NUNCA clique em botões que enviam o formulário sem confirmação explícita do usuário.',
    inputSchema: { ref: z.number().int() },
  }, async ({ ref }) => texto(await enviar('clicar', { ref })));
  return s;
}

// ---- HTTP ----
const token = randomBytes(32).toString('hex');
const autorizado = (req: IncomingMessage) => {
  const a = Buffer.from(req.headers.authorization ?? '');
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function corpoJson(req: IncomingMessage) {
  const partes: Buffer[] = [];
  for await (const p of req) partes.push(p as Buffer);
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
  if (req.url === '/control' && req.method === 'POST') {
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

const http = createServer((req, res) => atender(req, res).catch((e) => {
  log('erro http', e?.stack ?? e);
  if (!res.headersSent) res.writeHead(500).end();
}));
http.listen(0, '127.0.0.1', () => {
  const { port } = http.address() as { port: number };
  writeFileSync(join(DIR, 'bridge.json'), JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
  log(`ponte ouvindo em 127.0.0.1:${port}`);
});

lerStdin();
