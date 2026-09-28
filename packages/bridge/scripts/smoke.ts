// bun packages/bridge/scripts/smoke.ts <executável da ponte> [--codex]
// Sobe a ponte como o navegador faria (Native Messaging por stdin/stdout) com uma extensão falsa
// do outro lado e confere: token, ferramentas MCP e uma chamada atravessando o Native Messaging.
// A ponte roda com HOME temporário: não mexe no bridge.json da ponte real do usuário.
// --codex: confere também que o codex (shim .cmd no Windows) é iniciável pelo comandoExecutavel.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { comandoExecutavel } from '../src/caminhos';

const exe = process.argv[2];
if (!exe || !existsSync(exe)) {
  console.error('uso: bun packages/bridge/scripts/smoke.ts <executável da ponte> [--codex]');
  process.exit(2);
}

const casa = mkdtempSync(join(tmpdir(), 'ponte-smoke-'));
function falhar(msg: string): never {
  console.error(`❌ ${msg}`);
  rmSync(casa, { recursive: true, force: true });
  process.exit(1);
}

const estado = join(casa, '.config', 'browser-bridge', 'bridge.json');
const ponte = Bun.spawn([exe, 'chrome-extension://kofljccjbobcbcfnnolfgbobkckmiboe/'], {
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'inherit',
  env: { ...process.env, HOME: casa, USERPROFILE: casa },
});

// Extensão falsa: responde a cada comando devolvendo o que recebeu.
const eventos: { tipo: string; [k: string]: unknown }[] = [];
(async () => {
  let buf = Buffer.alloc(0);
  for await (const pedaco of ponte.stdout) {
    buf = Buffer.concat([buf, Buffer.from(pedaco)]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
      const tam = buf.readUInt32LE(0);
      const msg = JSON.parse(buf.subarray(4, 4 + tam).toString());
      buf = buf.subarray(4 + tam);
      if (msg.id === undefined) {
        eventos.push(msg);
        continue; // evento, não comando
      }
      // ler_campos precisa devolver campos com nome e papel: é assim que a ponte decide o que é
      // botão de envio. Sem isso, o teste da guarda de clique não teria o que classificar.
      const result =
        msg.cmd === 'ler_campos'
          ? {
              url: 'https://exemplo.com/form',
              titulo: 'Formulário',
              campos: [
                { ref: 1, papel: 'textbox', nome: 'Nome completo' },
                { ref: 2, papel: 'button', nome: 'Próximo passo' },
                { ref: 3, papel: 'button', nome: 'Enviar' },
              ],
            }
          : { eco: msg.cmd, args: msg.args };
      const corpo = Buffer.from(JSON.stringify({ id: msg.id, ok: true, result }));
      const cab = Buffer.alloc(4);
      cab.writeUInt32LE(corpo.length);
      ponte.stdin.write(Buffer.concat([cab, corpo]));
      ponte.stdin.flush();
    }
  }
})();

function mandarParaPonte(msg: Record<string, unknown>) {
  const corpo = Buffer.from(JSON.stringify(msg));
  const cab = Buffer.alloc(4);
  cab.writeUInt32LE(corpo.length);
  ponte.stdin.write(Buffer.concat([cab, corpo]));
  ponte.stdin.flush();
}

for (let i = 0; i < 100 && !existsSync(estado); i++) await Bun.sleep(100);
if (!existsSync(estado)) falhar('a ponte não gravou bridge.json');
const { port, token } = JSON.parse(readFileSync(estado, 'utf8'));
const url = `http://127.0.0.1:${port}/mcp`;

const semToken = await fetch(url, { method: 'POST' });
if (semToken.status !== 401) falhar(`sem token deveria dar 401, deu ${semToken.status}`);
console.log('✅ sem token → 401');

const cliente = new Client({ name: 'smoke', version: '0' });
await cliente.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const nomes = (await cliente.listTools()).tools.map((t) => t.name);
for (const n of ['ler_campos', 'preencher', 'clicar']) if (!nomes.includes(n)) falhar(`ferramenta ${n} ausente: ${nomes}`);
console.log(`✅ ferramentas MCP: ${nomes.join(', ')}`);

const r = (await cliente.callTool({ name: 'preencher', arguments: { ref: 7, valor: 'teste' } })) as { content: { text: string }[] };
const eco = JSON.parse(r.content[0]!.text);
if (eco.eco !== 'preencher' || eco.args.valor !== 'teste') falhar(`eco inesperado: ${r.content[0]!.text}`);
console.log('✅ chamada MCP atravessou o Native Messaging e voltou');

// ---- Guarda de envio final: barrado antes de chegar à extensão ----
// Esta é a garantia que o README e os Termos vendem. Ela precisa ser provada com a ponte real, e
// não com um teste de unidade: o caminho é ler_campos -> classificar -> recusar.
await cliente.callTool({ name: 'ler_campos', arguments: {} });

const enviar = (await cliente.callTool({ name: 'clicar', arguments: { ref: 3 } })) as { content: { text: string }[] };
const respostaEnviar = JSON.parse(enviar.content[0]!.text);
if (respostaEnviar.ok !== false) falhar(`clique em "Enviar" deveria ser barrado, veio: ${enviar.content[0]!.text}`);
if (!respostaEnviar.motivo?.includes('Enviar')) falhar(`a recusa não nomeia o botão: ${enviar.content[0]!.text}`);
console.log('✅ clique em "Enviar" barrado antes de chegar à página');

const proximo = (await cliente.callTool({ name: 'clicar', arguments: { ref: 2 } })) as { content: { text: string }[] };
const respostaProximo = JSON.parse(proximo.content[0]!.text);
if (respostaProximo.eco !== 'clicar') falhar(`"Próximo passo" é navegação e tem de passar: ${proximo.content[0]!.text}`);
console.log('✅ clique em "Próximo passo" passa (navegar não pode ser barrado)');

// Ref que nunca apareceu em ler_campos: a ponte não sabe o que é, então recusa em vez de clicar às
// cegas num elemento desconhecido.
const desconhecida = (await cliente.callTool({ name: 'clicar', arguments: { ref: 4242 } })) as { content: { text: string }[] };
const respostaDesconhecida = JSON.parse(desconhecida.content[0]!.text);
if (!respostaDesconhecida.erro) falhar(`ref fora da leitura deveria ser recusada: ${desconhecida.content[0]!.text}`);
console.log('✅ ref não lida é recusada (a IA precisa ler a página antes de clicar)');

// ---- Botão Parar ----
// Sem isto, o painel fica preso em "Parando…": o `parado` precisa sair da ponte, não só o processo
// morrer. Foi um bug real desta implementação.
const pedidoId = crypto.randomUUID();
mandarParaPonte({ tipo: 'pedido', pedidoId, texto: 'qualquer coisa', tabId: -1 });
await Bun.sleep(300); // deixa a ponte instalar o pedido como ativo
mandarParaPonte({ tipo: 'parar', pedidoId });
for (let i = 0; i < 40 && !eventos.some((e) => e.tipo === 'parado'); i++) await Bun.sleep(100);
const parado = eventos.find((e) => e.tipo === 'parado');
if (!parado) falhar('a ponte não emitiu o evento `parado` — o painel ficaria travado em "Parando…"');
if (parado.pedidoId !== pedidoId) falhar(`evento parado com id errado: ${JSON.stringify(parado)}`);
console.log('✅ `parar` emite o evento `parado` com o pedido certo');

if (process.argv.includes('--codex')) {
  const cmd = comandoExecutavel(['codex', '--version']);
  const v = Bun.spawnSync(cmd);
  if (v.exitCode !== 0) falhar(`codex não iniciou via ${JSON.stringify(cmd)}: ${v.stderr}`);
  console.log(`✅ codex iniciável (${cmd[0]}): ${v.stdout.toString().trim()}`);
}

ponte.stdin.end(); // navegador fechou a conexão: a ponte deve encerrar sozinha
const saida = await Promise.race([ponte.exited, Bun.sleep(5000).then(() => 'timeout')]);
if (saida === 'timeout') falhar('a ponte não encerrou ao fechar o stdin');
console.log('✅ ponte encerrou ao fechar a conexão');
rmSync(casa, { recursive: true, force: true });
process.exit(0);
