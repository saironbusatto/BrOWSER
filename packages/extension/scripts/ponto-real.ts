// bun run ponto:real
//
// O clique por ponto num Chromium de verdade: utils/acoes-aba.ts e utils/ponto.ts reais, com
// chrome.debugger real, contra uma página com canvas, botão e um iframe de OUTRA origem.
//
// Por que isto existe: escala da foto (tela 2x), elementFromPoint, descida por iframe de outro
// processo e Input.dispatchMouseEvent não têm como ser simulados; o jsdom nem faz layout.
// Mesmo molde e mesmos motivos de grupo-abas-real.ts. Sai com 1 se algum cenário falhar.
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

function chromiumDoPlaywright(): string {
  const base = join(homedir(), '.cache', 'ms-playwright');
  const versoes = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort();
  if (!versoes.length) throw new Error('sem Chromium do Playwright: rode `bunx playwright install chromium`');
  return join(base, versoes.at(-1)!, 'chrome-linux64', 'chrome');
}

const utils = join(import.meta.dir, '..', 'utils');
const dir = mkdtempSync(join(tmpdir(), 'ponto-real-'));
const ext = join(dir, 'ext');

writeFileSync(
  join(dir, 'entrada.ts'),
  `import * as acoes from '${utils}/acoes-aba';
let alvo: number | undefined;
let anexada: number | undefined;
const deps: acoes.DepsAba = {
  abaAlvo: async () => alvo!,
  trocarAlvo: async (id) => { alvo = id; },
  cdp: async (metodo, params) => {
    if (anexada !== alvo) { await chrome.debugger.attach({ tabId: alvo! }, '1.3'); anexada = alvo; }
    return (await chrome.debugger.sendCommand({ tabId: alvo! }, metodo, params)) as any;
  },
  semDebugger: () => false,
};
Object.assign(globalThis, { acoes, deps, definirAlvo: (id: number) => { alvo = id; } });
`,
);
const build = await Bun.build({ entrypoints: [join(dir, 'entrada.ts')], outdir: ext, naming: 'sw.js', target: 'browser', format: 'iife' });
if (!build.success) throw new Error(build.logs.join('\n'));
writeFileSync(
  join(ext, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'ponto-real',
    version: '1',
    permissions: ['tabs', 'tabGroups', 'scripting', 'debugger'],
    host_permissions: ['<all_urls>'],
    background: { service_worker: 'sw.js' },
  }),
);

// Cada alvo anota o clique que recebeu: [x, y dentro dele, isTrusted].
const ANOTAR = `<script>window.cliques = []; window.teclas = [];
for (const el of document.querySelectorAll('[data-anota]')) el.addEventListener('click', (e) => cliques.push([el.dataset.anota, Math.round(e.offsetX), Math.round(e.offsetY), e.isTrusted]));
addEventListener('keydown', (e) => teclas.push(e.key));</script>`;
const CSS = '<style>body{margin:0} [data-anota]{position:absolute;display:block} canvas{background:#cde}</style>';
const srv = Bun.serve({
  port: 0,
  fetch: (r) => {
    const { pathname, port } = new URL(r.url);
    const corpo =
      pathname === '/dentro'
        ? `<canvas data-anota="canvas-dentro" width="200" height="150" style="left:0;top:0"></canvas>
           <button data-anota="botao-dentro" style="left:10px;top:170px;width:100px;height:30px">Pagar</button>`
        : `<canvas data-anota="canvas" width="300" height="200" style="left:50px;top:50px"></canvas>
           <button data-anota="botao" style="left:50px;top:300px;width:100px;height:30px">Salvar</button>
           <div data-anota="div" style="left:200px;top:300px;width:100px;height:30px">Enviar</div>
           <p style="position:absolute;top:400px">${'Texto corrido da página, que é conteúdo e não rótulo de botão. '.repeat(3)}</p>
           <iframe src="http://localhost:${port}/dentro" style="position:absolute;left:400px;top:50px;width:300px;height:250px;border:2px solid"></iframe>`;
    return new Response(`<!doctype html><meta charset="utf-8">${CSS}${corpo}${ANOTAR}`, { headers: { 'content-type': 'text/html' } });
  },
});
// Janela de 1600 de largura em tela 2x: a captura sai com 3200 px e a foto tem de chegar com 1280
// (escala 0,8). Sem a emulação de viewport do Playwright: ela vale só para a sessão dele, e o
// chrome.debugger da extensão fotografaria outra tela.
const ctx = await chromium.launchPersistentContext(join(dir, 'perfil'), {
  executablePath: process.env.GRUPO_CHROME || chromiumDoPlaywright(),
  headless: true,
  viewport: null,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--window-size=1600,900', '--force-device-scale-factor=2'],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const ev = <T = any>(f: string) => sw.evaluate(`(async () => { ${f} })()`) as Promise<T>;
const tenta = (f: string) => ev<string>(`try { ${f}; return 'ok'; } catch (e) { return String(e); }`);
let falhas = 0;
const confere = (nome: string, ok: boolean, extra: unknown = '') => {
  if (!ok) falhas++;
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : ` ${JSON.stringify(extra)}`}`);
};
const E = 0.8; // px de CSS -> px da foto
const descrever = (x: number, y: number) =>
  ev<{ cadeia: { tag: string }[]; texto: string }>(`return acoes.descreverPonto(deps, ${x * E}, ${y * E})`);

try {
  const pagina = await ctx.newPage();
  await pagina.goto(`http://127.0.0.1:${srv.port}/`);
  await pagina.frames()[1]!.waitForLoadState();
  await ev(`definirAlvo((await chrome.tabs.query({ url: 'http://127.0.0.1/*' }))[0].id)`);
  const dentro = pagina.frames()[1]!;
  const cliques = (f = pagina.mainFrame()) => f.evaluate('window.cliques') as Promise<[string, number, number, boolean][]>;

  // Anexar o debugger abre a barra de aviso do navegador, que encolhe a tela: espera assentar.
  await ev(`await deps.cdp('Page.enable')`);
  await new Promise((r) => setTimeout(r, 800));
  const foto = await ev<{ mime: string; largura: number; altura: number; real: number[] }>(
    `const f = await acoes.verTela(deps);
     const b = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + f.base64)).blob());
     return { mime: f.mime, largura: f.largura, altura: f.altura, real: [b.width, b.height] };`,
  );
  const [telaL, telaA, dpr] = (await pagina.evaluate('[innerWidth, innerHeight, devicePixelRatio]')) as number[];
  confere(
    'ver_tela: tela 2x de 1600 px chega como JPEG de 1280, na proporção da tela, e diz o tamanho certo',
    telaL === 1600 &&
      dpr === 2 &&
      foto.largura === 1280 &&
      Math.abs(foto.altura - telaA! * E) <= 1 &&
      foto.real.join() === `1280,${foto.altura}` &&
      foto.mime === 'image/jpeg',
    { foto, telaL, telaA, dpr },
  );

  const noCanvas = await descrever(200, 150);
  confere('descrever: no canvas, o elemento embaixo é o canvas', noCanvas.cadeia[0]?.tag === 'canvas', noCanvas);
  await ev(`await acoes.clicarPonto(deps, ${200 * E}, ${150 * E})`);
  confere(
    'clicar_ponto: o canvas recebe um clique de verdade, no lugar apontado',
    JSON.stringify(await cliques()) === '[["canvas",150,100,true]]',
    await cliques(),
  );

  const noBotao = await descrever(70, 310);
  confere(
    'descrever: no botão, a cadeia tem o <button> (a ponte recusa)',
    noBotao.cadeia.some((n) => n.tag === 'button'),
    noBotao,
  );
  const noDiv = await descrever(220, 310);
  confere(
    'descrever: <div> com cara de botão devolve o rótulo "Enviar"',
    noDiv.cadeia[0]?.tag === 'div' && noDiv.texto === 'Enviar',
    noDiv,
  );

  // Iframe em 400,50 com borda de 2: o canvas de dentro começa em 402,52.
  const canvasDentro = await descrever(502, 127);
  confere('descrever: atravessa o iframe de outra origem e acha o canvas dele', canvasDentro.cadeia[0]?.tag === 'canvas', canvasDentro);
  await ev(`await acoes.clicarPonto(deps, ${502 * E}, ${127 * E})`);
  confere(
    'clicar_ponto: o clique chega dentro do iframe, no ponto certo',
    JSON.stringify(await cliques(dentro)) === '[["canvas-dentro",100,75,true]]',
    await cliques(dentro),
  );
  const botaoDentro = await descrever(432, 232);
  confere(
    'descrever: botão dentro do iframe também aparece (pagamento embutido não escapa)',
    botaoDentro.cadeia.some((n) => n.tag === 'button'),
    botaoDentro,
  );

  const fora = await tenta(`await acoes.clicarPonto(deps, 1500, 100)`);
  confere('ponto fora da foto é erro, não clique', fora.includes('fora da foto'), fora);

  await ev(`await acoes.teclar(deps, 'Delete')`);
  // O foco ficou no iframe, onde foi o último clique: é lá que a tecla tem de cair.
  confere('teclar Delete chega a quem está com o foco', ((await dentro.evaluate('window.teclas')) as string[]).includes('Delete'));
} finally {
  await ctx.close();
  srv.stop();
}

console.log(falhas ? `\n${falhas} cenário(s) falharam` : '\ntodos os cenários passaram');
process.exit(falhas ? 1 : 0);
