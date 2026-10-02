// Tecido da realidade: a malha de fios que o BrOWSER deforma enquanto trabalha.
//
// A função `iniciarTeia` é injetada na página com `(${fn.toString()})()`, então ela roda
// isolada: nada de import, nada de constante do módulo. Por isso ela recebe a configuração por
// parâmetro — o cálculo de espaçamento e de raio vive em `configTeia`, do lado do host, onde dá
// para testar.
//
// A ideia: um tecido de fios de 1 cm, horizontais e verticais, respirando devagar. O BrOWSER
// em movimento é um atractor — as linhas cedem na direção dele, como massa diante de um astro. O
// mouse é o segundo atractor, para a pessoa sentir que a página é dela. Cada atractor deixa uma
// trilha de caracteres que se dissolve a partir de onde nasceu, e é a dissolução mais lenta que
// parece o tecido voltando ao lugar.

export type ConfigTeia = {
  celula: number; // espaçamento entre fios, em px de CSS
  influencia: number; // raio do poço, em múltiplos de `celula`
  atrator: number; // deslocamento máximo, em frações de `celula`
  katakana: string; // glifos
  vida: number; // comprimento da trilha, em células
  quad: number; // alvo de quadros por segundo
  vias: number; // quantos fios viajam
  dpr: number; // devicePixelRatio, limitado
};

const KATAKANA = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ';

// 1 cm vale 96/2.54 px de CSS. Em tela menor o número de células cai sozinho, que é o
// comportamento pedido: o espaçamento é o mesmo, a quantidade é que é proporcional.
export function configTeia(largura: number, altura: number, dpr: number = 1): ConfigTeia {
  const CM = 96 / 2.54;
  // Teto e piso: abaixo de ~13 px o fio vira serrilha e o glifo não cabe; acima de ~46 px são
  // poucas células e o tecido perde a densidade de "realidade".
  const celula = Math.min(Math.max(CM, 13), 46);
  const menorLado = Math.min(largura, altura);
  return {
    celula,
    influencia: Math.max(2.4, Math.min(4.2, menorLado / (celula * 7))),
    atrator: 0.55,
    katakana: KATAKANA,
    vida: Math.round(Math.max(18, Math.min(40, (altura / celula) * 0.7))),
    quad: 30,
    vias: Math.max(3, Math.min(7, Math.round((Math.max(largura, altura) / celula) * 0.09))),
    dpr: Math.min(dpr || 1, 2),
  };
}

/**
 * Deformação de um ponto do tecido por um atractor.
 *
 * Perto do centro o fio é puxado na direção do atractor (a massa converge). Numa faixa em volta,
 * um empurrão leve para fora desenha o anel de matéria em torno do poço — é o que faz a coisa
 * parecer um astro e não uma ventoinha. Longe, nada.
 */
export function deformacao(dx: number, dy: number, raio: number): number {
  const d = Math.hypot(dx, dy) / raio;
  if (d >= 1.9) return 0;
  if (d < 1) return -(1 - d * d); // converge para o centro
  const t = (d - 1) / 0.9;
  return 0.16 * Math.sin(t * Math.PI); // anel
}

// ── Tudo abaixo roda dentro da página ──

/**
 * @param deforma A mesma `deformacao` do módulo, recebida por parâmetro como a config.
 *
 * Ela entra por parâmetro pelo mesmo motivo da config: o corpo desta função é serializado com
 * `toString()` e avaliado dentro da página, onde nenhum identificador do módulo existe. Deixando
 * `deformacao` ser chamada pelo nome, a página levantava `ReferenceError: deformacao is not
 * defined` no primeiro `ponto()` de cada quadro — e como o erro subia até `passo()`, nenhum fio,
 * nenhum rastro e nenhum brilho chegavam a ser desenhados. Só o fundo e o HUD apareciam, e o
 * defeito era invisível para os testes, que importam o módulo e portanto têm `deformacao` no
 * escopo. É a razão de `test/teia.test.ts` avaliar esta função num escopo isolado, e não só
 * compilar.
 */
export function iniciarTeia(cfg: ConfigTeia, deforma: (dx: number, dy: number, raio: number) => number) {
  // `w` é a referência capturada na criação, e o cleanup adiado depende dela: `window` no
  // bare só é resolvido no momento da leitura, e o setTimeout de destroy() roda 500ms depois —
  // quando o global já pode ter sumido (no teste, o mock é derrubado antes dos 500ms). Ler
  // `window` ali dentro dava ReferenceError e o erro aparecia atribuído ao teste que estivesse
  // rodando, o que faz um teste de timeout parecer quebrado sem ele ter nada a ver.
  const w = window as unknown as {
    __bRowserTeia?: { start(): void; stop(): void; destroy(): void; updateStatus(t: string): void };
    removeEventListener?: (t: string, f: (e: Event) => void, o?: unknown) => void;
  };
  if (w.__bRowserTeia) {
    w.__bRowserTeia.start();
    return;
  }

  const ID = 'browser-teia-host';
  let host = document.getElementById(ID);
  if (!host) {
    host = document.createElement('div');
    host.id = ID;
    host.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;transition:opacity .45s ease;opacity:0;';
    document.documentElement.appendChild(host);
  }
  const shadow = host.shadowRoot || (host.attachShadow ? host.attachShadow({ mode: 'open' }) : host);
  while (shadow.firstChild) shadow.removeChild(shadow.firstChild);

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; pointer-events: none; }
    .teia { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; box-sizing: border-box; overflow: hidden; }
    .teia canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .hud {
      position: absolute; top: 18px; left: 50%; transform: translateX(-50%);
      background: rgba(10,14,28,.72); backdrop-filter: blur(10px);
      border: 1px solid rgba(120,170,255,.28); border-radius: 9999px;
      padding: 8px 20px; color: #bcd6ff; display: flex; align-items: center; gap: 10px;
      font: 500 12.5px/1.4 -apple-system, BlinkMacSystemFont, 'SF Mono', 'Cascadia Mono', 'Noto Sans Mono CJK JP', monospace;
      letter-spacing: .4px; pointer-events: none; user-select: none; white-space: nowrap;
      box-shadow: 0 6px 26px rgba(0,0,0,.45);
    }
    .hud b { color: #eaf2ff; font-weight: 700; }
    .hud .sep { color: rgba(140,180,255,.3); }
    .hud .pip { width: 7px; height: 7px; border-radius: 50%; background: #8fc4ff; box-shadow: 0 0 12px #6aa8ff; animation: pip 1.6s ease-in-out infinite; }
    @keyframes pip { 0%,100% { transform: scale(.7); opacity: .5 } 50% { transform: scale(1.35); opacity: 1 } }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'teia';
  const canvas = document.createElement('canvas');
  const hud = document.createElement('div');
  hud.className = 'hud';
  const pip = document.createElement('span');
  pip.className = 'pip';
  const titulo = document.createElement('b');
  titulo.textContent = 'BrOWSER';
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = '|';
  const status = document.createElement('span');
  status.textContent = 'tecendo o real…';
  hud.append(pip, titulo, sep, status);
  container.append(canvas, hud);
  shadow.appendChild(container);

  const c2d = canvas.getContext('2d');
  if (!c2d) return;
  // Alias não-nulo: TS não estreita o tipo através das muchas funções que capturam `ctx`.
  const ctx: CanvasRenderingContext2D = c2d;

  const F = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Noto Sans Mono CJK JP", "MS Gothic", monospace';
  const G = cfg.katakana;
  const QT_VIAS = cfg.vias;
  const CEL = cfg.celula;
  const RAIO = CEL * cfg.influencia;
  const ATRA = cfg.atrator;
  const PASSO = Math.max(1, 1000 / cfg.quad);
  const t0 = window.performance.now();

  let W = 0;
  let H = 0;
  let cols = 0;
  let rows = 0;
  let anim = 0;
  let mouse = { x: -1e4, y: -1e4, ativo: false };

  // Trilha: o glifo e o instante de nascimento de cada célula. A ordem de inserção é a ordem de
  // percorrimento, então a célula mais antiga é a do começo da corrida — é ela que morre primeiro,
  // e a dissolução viaja do início até a cabeça, exatamente como o rastro foi feito.
  type Celula = { x: number; y: number; t: number; g: string };
  type Via = {
    eixo: 0 | 1;
    fio: number; // índice do fio, fixo enquanto a via vive
    pos: number;
    dir: 1 | -1;
    vel: number;
    trilha: Celula[];
    ponto: boolean;
  };
  const vias: Via[] = [];

  function nascimentar(): Via {
    const eixo: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    // `pos` é uma coordenada em pixels, ao longo do fio. Seedar com um índice de célula (e não
    // com a posição) botava as cinco vias no canto superior esquerdo, todas no mesmo lugar.
    const alcance = eixo === 0 ? H : W;
    // O fio é sorteado uma vez, aqui, e derivado de `pos`: `pos` é a coordenada AO LONGO
    // do fio, então derivar o índice dela fazia a via migrar de coluna a cada célula — o rastro
    // subia na diagonal, atravessando a trama em vez de correr ao longo de um fio.
    const total = eixo === 0 ? rows : cols;
    return {
      eixo,
      fio: Math.floor(Math.random() * total),
      pos: Math.random() * alcance,
      dir: Math.random() < 0.5 ? 1 : -1,
      // 6 a 20 células por segundo. Mais devagar que isto e o rastro, que tem `vida` células,
      // levaria segundos para encher; era 1 a 2, e o efeito vivia parecendo parado.
      vel: (6 + Math.random() * 14) * CEL,
      trilha: [],
      ponto: false,
    };
  }

  function measure() {
    const dpr = cfg.dpr;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / CEL) + 1;
    rows = Math.ceil(H / CEL) + 1;
    while (vias.length < QT_VIAS) vias.push(nascimentar());
    // Uma das vias é o ponto brilhante: é a que o olho segue, e a que mais deforma.
    if (vias[0]) vias[0].ponto = true;
  }

  let ultimoPasso = window.performance.now();

  function passo(t: number) {
    const agora = t;
    // dt com teto: aba em segundo plano derruba o relógio e, sem o teto, a via atravessaria a tela
    // inteira num quadro só, com o rastro virando um borrão.
    const dt = Math.min(0.05, (agora - ultimoPasso) / 1000);
    ultimoPasso = agora;
    const s = (agora - t0) / 1000;

    // Fundo: azul profundo, mais um halo suave onde o mouse está — a névoa do sonho.
    const fundo = ctx.createLinearGradient(0, 0, 0, H);
    fundo.addColorStop(0, '#060a16');
    fundo.addColorStop(0.5, '#0a1226');
    fundo.addColorStop(1, '#05080f');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, W, H);
    if (mouse.ativo) {
      const raio = RAIO * 3.2;
      const halo = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, raio);
      halo.addColorStop(0, 'rgba(90,140,235,.16)');
      halo.addColorStop(1, 'rgba(90,140,235,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
    }

    // Avança as vias e constrói a trilha.
    for (const v of vias) {
      const alcance = v.eixo === 0 ? H : W;
      v.pos += v.dir * v.vel * dt;
      if (v.pos < -CEL || v.pos > alcance + CEL) {
        const nova = nascimentar();
        Object.assign(v, nova, { ponto: v.ponto });
        continue;
      }
      // Índice do fio, o mesmo que nasceu com a via. Só o limite é reamarrado, porque um
      // redimensionar pode ter encolhido a malha e deixado o índice antigo fora dela.
      const total = v.eixo === 0 ? rows : cols;
      const linha = Math.max(0, Math.min(total - 1, v.fio));
      const x = v.eixo === 0 ? (linha + 0.5) * CEL : v.pos;
      const y = v.eixo === 0 ? v.pos : (linha + 0.5) * CEL;
      const p = v.trilha.at(-1);
      if (!p || Math.hypot(x - p.x, y - p.y) >= CEL) {
        v.trilha.push({ x, y, t: agora, g: G.charAt((Math.random() * G.length) | 0) });
        if (v.trilha.length > cfg.vida) v.trilha.shift();
      }
    }

    ctx.globalCompositeOperation = 'lighter';

    // Tecido: fios horizontais e verticais, cruzando. Cada ponto é puxado pelos dois
    // atractor (o BrOWSER e o mouse) e ainda respira numa onda lenta — o tecido é vivo.
    //
    // A onda é função do NÓ da malha, e não do fio: o horizontal e o vertical que se cruzam num
    // nó têm de cair no mesmo lugar, ou a trama não fecha. Com uma onda por fio, os dois
    // discordavam em até ~4 px no mesmo ponto e o tecido virava uma grade de segmentos soltos,
    // sem trama. Uma onda só, as duas caem no mesmo lugar e o tecido fica tecido.
    ctx.lineWidth = 1;
    for (let r = 0; r < rows; r++) {
      const y0 = (r + 0.5) * CEL;
      ctx.beginPath();
      let primeiro = true;
      // A claridade do fio é o pico de luz ao longo dele, não a do último ponto: com o valor do
      // último, o fio piscava inteiro conforme a ponta entrava e saía do poço.
      let luz = 0;
      for (let c = 0; c < cols; c++) {
        const x0 = (c + 0.5) * CEL;
        const p = ponto(x0, y0, s);
        if (p.luz > luz) luz = p.luz;
        if (primeiro) {
          ctx.moveTo(p.x, p.y);
          primeiro = false;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = fio(0.26 + luz * 0.5, luz);
      ctx.stroke();
    }
    for (let c = 0; c < cols; c++) {
      const x0 = (c + 0.5) * CEL;
      ctx.beginPath();
      let primeiro = true;
      let luz = 0;
      for (let r = 0; r < rows; r++) {
        const y0 = (r + 0.5) * CEL;
        const p = ponto(x0, y0, s);
        if (p.luz > luz) luz = p.luz;
        if (primeiro) {
          ctx.moveTo(p.x, p.y);
          primeiro = false;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = fio(0.2 + luz * 0.45, luz, true);
      ctx.stroke();
    }

    // Trilhas: do mais velho pro mais novo, para o aditivo empilhar certo.
    ctx.font = `${Math.round(CEL * 0.72)}px ${F}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of vias) {
      for (const [i, c] of v.trilha.entries()) {
        const idade = (agora - c.t) / 1000;
        // O rastro já é um gradiente pela posição na trilha (frescor); este termo dá o dissolver
        // temporal em cima, para a dissolução não depender só do corte do fim da corrida.
        const a = Math.max(0, 1 - idade / 1.2);
        if (a <= 0.01) continue;
        const frescor = i / Math.max(1, v.trilha.length - 1);
        ctx.fillStyle = `rgba(${140 + 90 * frescor},${200 + 40 * frescor},255,${a * (0.5 + frescor * 0.5)})`;
        ctx.fillText(c.g, c.x, c.y);
      }
      // A cabeça da via é o ponto brilhante, e é ela que mais curva o tecido em volta.
      const cab = v.trilha.at(-1);
      if (!cab) continue;
      const brilho = v.ponto ? 1 : 0.55;
      const r0 = (v.ponto ? 0.34 : 0.2) * CEL;
      const g = ctx.createRadialGradient(cab.x, cab.y, 0, cab.x, cab.y, r0 * 4);
      g.addColorStop(0, `rgba(230,242,255,${0.85 * brilho})`);
      g.addColorStop(0.4, `rgba(140,190,255,${0.35 * brilho})`);
      g.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cab.x, cab.y, r0 * 4, 0, 6.2832);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // Deslocamento de um nó do tecido, e o quanto ele está perto de um atractor (a "luz" que
  // o faz brilhar mais, para o olho ir junto com a curvatura).
  //
  // `s` é o tempo do quadro, o mesmo para todos os nós: é o que garante que o nó tenha UM lugar
  // só. Deixar a onda ser calculada dentro também funciona, mas seriam ~3000 chamadas de relógio
  // por quadro; e passar a onda por fora obrigava cada fio a inventar a sua, e o cruzamento não
  // fechava.
  function ponto(x0: number, y0: number, s: number): { x: number; y: number; luz: number } {
    let dx = 0;
    // Duas ondas cruzadas, de frequências incomensuráveis: o nó vagueia sem nunca repetir o
    // mesmo desenho, e a amplitude (~2,2 px) fica bem abaixo do meio espaçamento, então a malha
    // continua legível como malha.
    let dy = Math.sin((x0 + s * 26) * 0.012) * 1.3 + Math.sin((y0 - s * 18) * 0.009) * 0.9;
    let luz = 0;
    for (const v of vias) {
      const cab = v.trilha.at(-1);
      if (!cab) continue;
      const ex = x0 - cab.x;
      const ey = y0 - cab.y;
      const d = Math.hypot(ex, ey);
      if (d >= RAIO * 1.9) continue;
      const k = deforma(ex, ey, RAIO) * ATRA * CEL;
      if (d < 0.5) continue;
      dx += (ex / d) * k;
      dy += (ey / d) * k;
      luz += (1 - d / (RAIO * 1.9)) * (v.ponto ? 0.8 : 0.35);
    }
    if (mouse.ativo) {
      const ex = x0 - mouse.x;
      const ey = y0 - mouse.y;
      const d = Math.hypot(ex, ey);
      if (d < RAIO * 1.9) {
        if (d > 0.5) {
          const k = deforma(ex, ey, RAIO) * ATRA * CEL * 1.15;
          dx += (ex / d) * k;
          dy += (ey / d) * k;
        }
        luz += 1 - d / (RAIO * 1.9);
      }
    }
    return { x: x0 + dx, y: y0 + dy, luz: Math.min(1.4, luz) };
  }

  function fio(alpha: number, luz: number, vertical = false): string {
    const a = Math.max(0, Math.min(1, alpha));
    // Fio horizontal é um tom mais frio, o vertical mais ciano: a trama precisa se ler como trama.
    return vertical
      ? `rgba(${120 + 90 * luz},${215 - 40 * luz},255,${a})`
      : `rgba(${95 + 80 * luz},${165 + 60 * luz},${255 - 20 * luz},${a * 0.9})`;
  }

  // O limitador de quadros é do `laco` e só dele. Antes, `ultimo` era consumido aqui e dentro de
  // `passo`, e o intervalo acabava contado duas vezes — com 30 fps pedidos e 60 Hz de rAF, a
  // tranche desenhava na frequência errada e o orçamento de CPU ia embora.
  let ultimo = window.performance.now();
  let accum = 0;
  function laco(agora: number) {
    // `window.*` e não o global solto: esta função roda dentro de uma página que pode ter
    // sombreado `requestAnimationFrame` no escopo global, e aí o efeito inteiro pararia.
    anim = window.requestAnimationFrame(laco);
    accum += agora - ultimo;
    ultimo = agora;
    if (accum < PASSO) return;
    accum = 0;
    passo(agora);
  }

  const aoMover = (e: Event) => {
    const p = e as PointerEvent;
    mouse = { x: p.clientX, y: p.clientY, ativo: true };
  };
  const aoSair = () => {
    mouse = { x: -1e4, y: -1e4, ativo: false };
  };
  const aoRedimensionar = () => measure();

  w.__bRowserTeia = {
    start() {
      host!.style.opacity = '1';
      if (!anim) {
        measure();
        ultimo = window.performance.now();
        anim = window.requestAnimationFrame(laco);
      }
    },
    updateStatus(texto: string) {
      if (texto) status.textContent = texto;
    },
    stop() {
      // O esmaecimento é a transição de opacidade do CSS, e não precisa de quadros: cancelar na
      // hora economiza CPU e faz o efeito sumir no instante do clique, em vez de meio segundo
      // depois. O último quadro fica no canvas, apagando sozinho.
      if (anim) {
        window.cancelAnimationFrame(anim);
        anim = 0;
      }
      accum = 0;
      host!.style.opacity = '0';
    },
    destroy() {
      this.stop();
      setTimeout(() => {
        host!.remove();
        delete w.__bRowserTeia;
        // Via `w`, não via `window`: o callback é adiado e a referência capturada continua válida.
        w.removeEventListener?.('pointermove', aoMover);
        w.removeEventListener?.('pointerleave', aoSair);
        w.removeEventListener?.('resize', aoRedimensionar);
      }, 500);
    },
  };

  window.addEventListener('pointermove', aoMover, { passive: true });
  window.addEventListener('pointerleave', aoSair);
  window.addEventListener('resize', aoRedimensionar);

  w.__bRowserTeia.start();
}

/** Caminho que o `Runtime.evaluate` injeta para atualizar o texto do HUD. */
export function gerarScriptStatus(texto: string): string {
  return `(window.__bRowserTeia?.updateStatus(${JSON.stringify(texto)}),0);`;
}

export const SCRIPT_PARAR_TEIA = `(window.__bRowserTeia?.stop(),0);`;

// ── Injeção: as expressões que o `Runtime.evaluate` envia para a aba ──
//
// Vivem aqui, e não no background, porque é este módulo que define o contrato: quem chama a
// injeção de fora (o service worker, e o harness visual de scripts/teia-visual.ts) tem de mandar
// exatamente as mesmas expressões que a extensão manda. Reproduzir a receita em dois lugares já
// custou um defeito silencioso — o harness dizia que a teia desenhava, a extensão não desenhava.

/**
 * Publica as funções do módulo como globais da aba.
 *
 * `Runtime.evaluate` roda um trecho por vez e não guarda estado entre chamadas, então a
 * alternativa seria concatenar tudo em uma string só — que quebra a linha de 80 colunas e
 * deixa a matemática testável do lado do host inacessível ao teia.test.ts. Globais na aba é o
 * que permite a config ser calculada no lugar certo: dentro da página, que é quem tem `window`.
 */
export function expressoesInjetar(pares: [string, (...a: never[]) => unknown][]): string {
  return pares.map(([nome, fn]) => `globalThis[${JSON.stringify(nome)}]=${fn.toString()};`).join('\n');
}

/** As funções que precisam existir na aba antes de `iniciarTeia` poder rodar. */
export const PARES_TEIA: [string, (...a: never[]) => unknown][] = [
  ['__bRowserConfigTeia', configTeia],
  ['__bRowserDeformacao', deformacao],
  ['__bRowserIniciarTeia', iniciarTeia],
];

/**
 * Injetada na aba: é a ÚNICA parte que mede a tela, então é a única que pode ler `window`. Fica
 * separada porque é serializada via toString() e não pode capturar nada do módulo.
 *
 * `deformacao` entra por parâmetro, e não como chamada solta pelo nome: `iniciarTeia` é
 * serializada e avaliada aqui dentro, onde identificadores do módulo não existem. Referenciá-la
 * pelo nome levantava `ReferenceError` a cada quadro, e o efeito inteiro não desenhava.
 */
function medirEIniciar() {
  const w = window as unknown as {
    innerWidth: number;
    innerHeight: number;
    devicePixelRatio: number;
    __bRowserConfigTeia: (l: number, a: number, d: number) => unknown;
    __bRowserDeformacao: (dx: number, dy: number, raio: number) => number;
    __bRowserIniciarTeia: (cfg: unknown, deforma: (dx: number, dy: number, r: number) => number) => void;
  };
  w.__bRowserIniciarTeia(w.__bRowserConfigTeia(w.innerWidth, w.innerHeight, w.devicePixelRatio), w.__bRowserDeformacao);
}

/** A expressão que mede a tela e sobe o efeito, depois de `expressoesInjetar`. */
export function expressaoIniciar(): string {
  return `(${medirEIniciar.toString()})()`;
}
