// bun run teia:visual
//
// O efeito da teia no Chrome de verdade: injeta as mesmas expressões que a extensão injeta, olha
// o resultado e tira a foto.
//
// Por que isto existe: a suíte roda a teia num canvas falso, e o canvas falso não erra do mesmo
// jeito que o navegador. A suíte chamou `iniciarTeia` importando o módulo — e lá `deformacao`
// existe no escopo. Na página, não existe: `iniciarTeia` é serializada com `toString()`, e a
// chamada por nome alevantava `ReferenceError` a cada quadro, que subia até `passo()` e abortava
// o desenho. Os 303 testes passavam, e a tela não tinha fio nenhum. Só de rodar num navegador de
// verdade é que isso aparece, porque só ele resolve identificador livre no escopo global — que é
// onde a função serializada de fato roda.
//
// As expressões vêm de `expressoesInjetar`/`expressaoIniciar`, as mesmas do `background.ts`: este
// script não reescreve a receita da injeção, senão passaria aqui e a extensão continuaria quebrada.
//
// Fica em packages/extension/ e não em scripts/ porque precisa da lib DOM (a teia roda na
// página) sem afrouxar o tsconfig raiz, que é `lib: ESNext` para a ponte, que não é navegador.
//
// Sai com 1 se o efeito não desenhar. As fotos ficam em .teia-visual/, fora do git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { expressaoIniciar, expressoesInjetar, gerarScriptStatus, PARES_TEIA, SCRIPT_PARAR_TEIA } from '../utils/teia';

const raiz = join(import.meta.dir, '..', '..', '..');
const saida = join(raiz, '.teia-visual');
mkdirSync(saida, { recursive: true });

// playwright-core não baixa navegador: usa o Chrome do sistema. TEIA_CHROME aponta para outro.
const CHROME = process.env.TEIA_CHROME || '/usr/bin/google-chrome';
const LARGURA = 1280;
const ALTURA = 720;
const alturaHud = 130; // ~60 px de CSS; com dpr 2, o dobro em pixels de dispositivo.

const pagina = `<!doctype html><meta charset="utf-8">
<title>teia</title>
<style>body{margin:0;background:#f2f2f0;color:#111;font:15px system-ui;padding:20px}
h1{font-size:17px}input{padding:7px;font:inherit;margin:6px}
#selo{position:fixed;right:12px;bottom:12px;width:120px;height:120px;background:#e11d48;border-radius:8px}</style>
<h1>Página clara de teste — precisa aparecer atrás</h1>
<p>Campo: <input placeholder="digite aqui"></p>
<div id="selo"></div>`;

/**
 * O quanto a página aparece através do tecido.
 *
 * A tela tem que mostrar o que está sendo preenchido: o efeito é pano de vidro sobre a página,
 * não cortina. O que decide isso é o ALFA do canvas — é o navegador que compõe o canvas sobre a
 * página, e alfa baixo é o que deixa a página aparecer. `getImageData` devolve o pixel do
 * próprio canvas, que é exatamente o canal certo para isto.
 *
 * Com o fundo opaco antigo, alfa 255 em toda a parte. Com o véu, quase todo o canvas fica baixo
 * (só o véu) e só os fios e o brilho ficam altos.
 */
async function transparencia(page: Page) {
  return page.evaluate(() => {
    const h = document.getElementById('browser-teia-host');
    const c = h?.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) return { opaco: -1, alfaMedio: -1 };
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let opaco = 0;
    let soma = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]!;
      soma += a;
      if (a >= 250) opaco++;
    }
    return { opaco: opaco / n, alfaMedio: soma / n / 255 };
  });
}

/**
 * Conta os pixels acesos do canvas, que é o que distingue "o efeito desenhou a trama" de "o
 * efeito subiu e não desenhou nada".
 *
 * O `ReferenceError` da deformação derrubava o `passo()` no primeiro laço da trama: o fundo era
 * pintado, o HUD aparecia, e nenhum fio. A tela ficava bonita e vazia. Contar pixel aceso é o
 * que pega esse caso — o olho e o print passam, a contagem não. A faixa do HUD é excluída,
 * porque ali há texto e brilho por desenho, e não é trama.
 */
async function pixelsAcesos(page: Page) {
  return page.evaluate((alturaHud: number) => {
    const host = document.getElementById('browser-teia-host');
    const canvas = host?.shadowRoot?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return { total: -1, foraDoHud: -1 };
    const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let foraDoHud = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        // Soma dos canais bem acima do fundo (~#060a16): fio e glifo.
        if (img[i]! + img[i + 1]! + img[i + 2]! > 210) {
          total++;
          if (y > alturaHud) foraDoHud++;
        }
      }
    }
    return { total, foraDoHud };
  }, alturaHud);
}

const navegador = await chromium.launch({ executablePath: CHROME });
const ctx = await navegador.newContext({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Qualquer erro na página é a falha que estamos caçando: ReferenceError, uma vez por quadro.
const erros: string[] = [];
page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
page.on('pageerror', (e) => erros.push(String(e)));

await page.setContent(pagina);

// Exatamente o que o background manda por Runtime.evaluate, na mesma ordem.
await page.evaluate(expressoesInjetar(PARES_TEIA));
await page.evaluate(expressaoIniciar());
await page.evaluate(gerarScriptStatus('verificando o real…'));

await page.mouse.move(640, 360);
await page.waitForTimeout(2500);
await page.screenshot({ path: join(saida, 'com-mouse.png') });

const comMouse = await pixelsAcesos(page);
const vidro = await transparencia(page);

// E o caminho de parar, que o background usa quando a IA termina.
await page.evaluate(SCRIPT_PARAR_TEIA);
await page.waitForTimeout(700);
const parado = await page.evaluate(() => {
  // O global é criado pela própria teia dentro da página; o TS não tem como saber dele.
  const w = window as unknown as { __bRowserTeia?: unknown };
  const host = document.getElementById('browser-teia-host');
  return { teia: !!w.__bRowserTeia, opacidade: host ? host.style.opacity : 'sem-host' };
});

await navegador.close();

// ── veredito ──
const falhas: string[] = [];
if (erros.length) falhas.push(`${erros.length} erro(s) de console; o primeiro: ${erros[0]}`);
if (comMouse.total < 0) falhas.push('o canvas da teia não apareceu na página');
// Só o fundo pintado dá ~0 pixel aceso; a trama acesa dá dezenas de milhares.
if (comMouse.foraDoHud < 5000) falhas.push(`pouca trama acesa fora do HUD: ${comMouse.foraDoHud} px`);
// O tecido tem que ser vidro, não cortina: se quase tudo for opaco, a página some de novo.
if (vidro.opaco > 0.02) falhas.push(`canvas ${(vidro.opaco * 100).toFixed(1)}% opaco: a página não aparece atrás`);
if (vidro.alfaMedio > 0.55) falhas.push(`alfa medio ${vidro.alfaMedio.toFixed(2)}: véu forte demais, virou cortina`);
if (!parado.teia) falhas.push('parar removeu o global antes da hora');
if (parado.opacidade !== '0') falhas.push(`parar não esmaeceu o host: opacidade ${parado.opacidade}`);

console.log(`pixels acesos: ${comMouse.total} (fora do HUD: ${comMouse.foraDoHud})`);
console.log(`canvas: ${(vidro.opaco * 100).toFixed(1)}% opaco, alfa medio ${vidro.alfaMedio.toFixed(2)}`);
console.log(`erros de console: ${erros.length}`);
console.log(`após parar: teia=${parado.teia} opacidade=${parado.opacidade}`);
console.log(`fotos em ${saida}/`);

if (falhas.length) {
  for (const f of falhas) console.error(`✗ ${f}`);
  writeFileSync(join(saida, 'erros.txt'), erros.join('\n'));
  process.exit(1);
}
console.log('✓ a teia desenhou a trama no navegador de verdade');
