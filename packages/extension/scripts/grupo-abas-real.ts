// bun run grupo:real
//
// O grupo de abas da IA num Chromium de verdade: os módulos REAIS (utils/grupo-abas.ts e
// utils/acoes-aba.ts) empacotados numa extensão de teste e exercitados contra as APIs do Chrome.
//
// Por que isto existe: tabGroups, sidePanel.close e a ordem dos eventos de aba não têm como ser
// simulados com fidelidade. Foi rodando aqui que apareceu o bug de a IA não conseguir listar as
// abas do grupo depois de a pessoa tirar a aba da vez dele — os testes de unidade passavam.
//
// Não usa a extensão completa porque ela exige a ponte nativa, e registrar a ponte num Chromium
// de teste mexeria na configuração do usuário. Usa o Chromium do Playwright (o Chrome estável
// ignora --load-extension desde a versão 137). GRUPO_CHROME aponta para outro.
//
// Sai com 1 se algum cenário falhar.
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
const dir = mkdtempSync(join(tmpdir(), 'grupo-real-'));
const ext = join(dir, 'ext');

// Expõe os módulos reais no service worker. IIFE: como script clássico, um `var grupo` do módulo
// viraria global e colidiria com o que o teste expõe.
writeFileSync(
  join(dir, 'entrada.ts'),
  `import * as acoes from '${utils}/acoes-aba';
import * as grupo from '${utils}/grupo-abas';
let alvo: number | undefined;
const deps: acoes.DepsAba = {
  abaAlvo: async () => {
    if (alvo === undefined) throw new Error('sem alvo');
    if (await grupo.foraDoGrupo(alvo)) throw new Error('a pessoa tirou esta aba do grupo BrOWSER');
    return alvo;
  },
  trocarAlvo: async (id) => { alvo = id; },
  cdp: async () => { throw new Error('sem cdp no teste'); },
  semDebugger: () => true,
};
Object.assign(globalThis, { acoes, grupo, deps, definirAlvo: (id: number) => { alvo = id; }, alvoAtual: () => alvo });
grupo.vigiarPainel();
`,
);
const build = await Bun.build({ entrypoints: [join(dir, 'entrada.ts')], outdir: ext, naming: 'sw.js', target: 'browser', format: 'iife' });
if (!build.success) throw new Error(build.logs.join('\n'));
writeFileSync(
  join(ext, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'grupo-real',
    version: '1',
    permissions: ['sidePanel', 'tabs', 'tabGroups', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
    background: { service_worker: 'sw.js' },
    side_panel: { default_path: 'painel.html' },
    action: {},
  }),
);
writeFileSync(join(ext, 'painel.html'), '<!doctype html><meta charset="utf-8">painel');
writeFileSync(
  join(ext, 'gesto.html'),
  '<!doctype html><meta charset="utf-8"><button id="b">abrir</button><script src="gesto.js"></script>',
);
// sidePanel.open exige gesto: o clique do Playwright é real (Input do CDP), então vale.
writeFileSync(
  join(ext, 'gesto.js'),
  `document.getElementById('b').onclick = async () => { const w = await chrome.windows.getCurrent(); chrome.sidePanel.open({ windowId: w.id }); };`,
);

const srv = Bun.serve({
  port: 0,
  fetch: (r) => {
    const caminho = new URL(r.url).pathname;
    const corpo = caminho === '/link' ? '<a id="l" href="/f" target="_blank">abre</a>' : '<p>página';
    return new Response(`<!doctype html><title>${caminho}</title>${corpo}`, { headers: { 'content-type': 'text/html' } });
  },
});
const W = `http://127.0.0.1:${srv.port}`;
const ctx = await chromium.launchPersistentContext(join(dir, 'perfil'), {
  executablePath: process.env.GRUPO_CHROME || chromiumDoPlaywright(),
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const idExt = new URL(sw.url()).host;
const ev = <T = any>(f: string) => sw.evaluate(`(async () => { ${f} })()`) as Promise<T>;
const tenta = (f: string) => ev<string>(`try { ${f}; return 'ok'; } catch (e) { return String(e); }`);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idDa = (url: string) => ev<number>(`return (await chrome.tabs.query({ url: '${url}' }))[0].id`);
const paineis = async () => (await ev<unknown[]>(`return chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })`)).length;
let falhas = 0;
const confere = (nome: string, ok: boolean, extra: unknown = '') => {
  if (!ok) falhas++;
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : ` ${JSON.stringify(extra)}`}`);
};

try {
  await (await ctx.newPage()).goto(`${W}/a`);
  await (await ctx.newPage()).goto(`${W}/b`);
  const A = await idDa(`${W}/a`);
  const B = await idDa(`${W}/b`);

  const g = await ev<number>(`const g = await grupo.trazerParaOGrupo(${A}); definirAlvo(${A}); return g;`);
  const info = await ev<{ title: string }>(`return chrome.tabGroups.get(${g})`);
  confere(
    'pedido cria o grupo BrOWSER com a aba do pedido',
    info.title === 'BrOWSER' && (await ev<boolean>(`return grupo.noGrupo(${A})`)),
    info,
  );

  const lista = await ev<{ abas: { id: number }[]; foraDoGrupo: number }>(`return acoes.listarAbas(deps)`);
  confere(
    'listar_abas mostra só o grupo; das outras, só a contagem',
    lista.abas.length === 1 && lista.abas[0]!.id === A && lista.foraDoGrupo >= 1,
    lista,
  );

  const recusa = await tenta(`await acoes.usarAba(deps, ${B})`);
  confere('usar_aba numa aba da pessoa é recusada', recusa.includes('arrasta a aba para dentro do grupo'), recusa);

  await ev(`await chrome.tabs.group({ groupId: ${g}, tabIds: [${B}] })`);
  confere(
    'arrastar a aba para o grupo libera o uso',
    (await tenta(`await acoes.usarAba(deps, ${B})`)) === 'ok' && (await ev<number>(`return alvoAtual()`)) === B,
  );

  const nova = await ev<{ id: number }>(`return acoes.abrirAba(deps, '${W}/c')`);
  confere(
    'abrir_aba nasce no grupo e vira a aba da vez',
    (await ev<boolean>(`return grupo.noGrupo(${nova.id})`)) && (await ev<number>(`return alvoAtual()`)) === nova.id,
  );

  await ev(`await acoes.fecharAba(deps, ${nova.id})`);
  const alvoDepois = await ev<number>(`return alvoAtual()`);
  confere('fechar a aba da vez passa para outra do grupo', [A, B].includes(alvoDepois), alvoDepois);

  await ev(`await chrome.tabs.ungroup([${alvoDepois}])`);
  const parou = await tenta(`await deps.abaAlvo()`);
  confere('aba tirada do grupo não é mais usada', parou.includes('tirou esta aba do grupo'), parou);
  confere('mesmo assim, listar_abas funciona para a IA achar outra', (await tenta(`await acoes.listarAbas(deps)`)) === 'ok');

  const resta = (await ev<{ abas: { id: number }[] }>(`return acoes.listarAbas(deps)`)).abas.map((t) => t.id);
  await ev(`definirAlvo(${resta[0]})`);
  const ultima = await tenta(`await acoes.fecharAba(deps, ${resta[0]})`);
  confere('a última aba do grupo não fecha', ultima.includes('última aba'), ultima);

  const gesto = await ctx.newPage();
  await gesto.goto(`chrome-extension://${idExt}/gesto.html`);
  await ev(
    `const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await chrome.tabs.group({ groupId: ${g}, tabIds: [t.id] })`,
  );
  await gesto.click('#b');
  await espera(800);
  const aberto = await paineis();

  // A IA abre aba nova: o Chrome ativa a aba ao criar, antes de ela entrar no grupo. O painel não
  // pode recolher nessa janela de tempo (foi o bug relatado no Brave).
  await ev(`await acoes.abrirAba(deps, '${W}/e')`);
  await espera(1000);
  confere('a IA abrir aba no grupo não recolhe o painel', (await paineis()) === 1);

  // Link com target=_blank numa aba do grupo: o Chrome põe a aba nova no mesmo grupo.
  const comLink = ctx.pages().find((p) => p.url() === `${W}/e`)!;
  await comLink.goto(`${W}/link`);
  await comLink.click('#l');
  await espera(1000);
  confere('link aberto em aba nova a partir do grupo não recolhe o painel', (await paineis()) === 1);

  // Aba de login aberta pelo painel: fica fora do grupo, mas o painel não pode recolher nela.
  const login = await ev<number>(
    `const t = await chrome.tabs.create({ url: '${W}/login', active: false }); await grupo.marcarAbaDoPainel(t.id); await chrome.tabs.update(t.id, { active: true }); return t.id;`,
  );
  await espera(1000);
  confere(
    'aba de login aberta pelo painel não recolhe o painel',
    (await paineis()) === 1 && !(await ev<boolean>(`return grupo.noGrupo(${login})`)),
  );

  const fora = await ctx.newPage();
  await fora.goto(`${W}/d`);
  await fora.bringToFront();
  await espera(1000);
  confere('o painel recolhe ao ir para uma aba fora do grupo', aberto === 1 && (await paineis()) === 0, { aberto });
} finally {
  await ctx.close();
  srv.stop();
}

console.log(falhas ? `\n${falhas} cenário(s) falharam` : '\ntodos os cenários passaram');
process.exit(falhas ? 1 : 0);
