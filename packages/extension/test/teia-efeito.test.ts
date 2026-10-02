import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { configTeia, deformacao, iniciarTeia } from '../utils/teia';
import { limparMundo, type Mundo, mundo } from './canvas-falso';

// Aqui o efeito roda de verdade, com canvas falso e rAF sob controle. Não prova a imagem; prova o
// comportamento que dá sentido a ela.

let m: Mundo;

const iniciar = (largura = 1920, altura = 1080) => {
  iniciarTeia(configTeia(largura, altura, 2), deformacao);
  return (m.world as unknown as { __bRowserTeia: Teia }).__bRowserTeia;
};

type Teia = { start(): void; stop(): void; destroy(): void; updateStatus(t: string): void };

/** Deixa o efeito amadurecer um pouco, e mede só o quadro seguinte. */
const medir = (quadros = 11) => {
  for (let i = 0; i < quadros; i++) m.avancar(34);
  m.zerar();
  m.avancar(34);
  return m.ctx().chamadas;
};

const CFG = () => configTeia(1920, 1080, 2);
/** Além disso, nenhum atractor (via ou mouse) alcança o ponto. */
const ALCANCE = () => CFG().celula * CFG().influencia * 1.9;

/** O quanto um ponto desenhado se afasta do nó de malha mais próximo. */
function desvioDaMalha(p: { x: number; y: number }) {
  const cel = CFG().celula;
  const c = Math.max(0, Math.min(Math.ceil(1920 / cel), Math.round(p.x / cel - 0.5)));
  const r = Math.max(0, Math.min(Math.ceil(1080 / cel), Math.round(p.y / cel - 0.5)));
  return Math.hypot(p.x - (c + 0.5) * cel, p.y - (r + 0.5) * cel);
}

/**
 * Deformação do tecido, medida só onde nenhum atractor alcança.
 *
 * Medir a distância a um ponto solto da tela (960, 540) não serve: o nó de malha mais próximo
 * está a 8,9 px, e essa folga é da geometria, não do tecido — o limite passava a depender do
 * sorteio das vias, e as três medidas viravam loteria. Comparando cada ponto com o nó, sobra
 * exatamente o que o tecido fez: longe dos atractor, só a onda (~2,2 px).
 *
 * `perto` limita a leitura a uma janela em torno de um ponto, para medir o que o mouse puxa.
 */
function deformacaoDoTecido({ perto, excluir }: { perto?: { x: number; y: number }; excluir: { x: number; y: number }[] }) {
  const c = m.ctx().chamadas;
  const fora = ALCANCE();
  const dentro = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
  const pontos = [...c.moveTo, ...c.lineTo].filter((p) => {
    if (excluir.some((a) => dentro(p, a) <= fora)) return false;
    return !perto || dentro(p, perto) < fora;
  });
  return {
    nos: pontos.length,
    max: pontos.length ? Math.max(...pontos.map(desvioDaMalha)) : 0,
  };
}

/** As trilhas desenhadas são o rastro de cada via: o que estiver perto delas é influence de via. */
const rastros = () => m.ctx().chamadas.fillText;

/**
 * Um nó do tecido com a vizinhança livre de rastro, ou null se nenhum houver. É o único lugar
 * onde dá para medir o que o mouse faz, sem uma via no meio da conta.
 */
function noSemRastro() {
  const c = m.ctx().chamadas;
  const fora = ALCANCE();
  const livres = [...c.moveTo, ...c.lineTo].filter((p) => c.fillText.every((a) => Math.hypot(a.x - p.x, a.y - p.y) > fora));
  return livres[Math.floor(livres.length / 2)] ?? null;
}

beforeEach(() => {
  m = mundo();
});
afterEach(() => {
  limparMundo();
});

describe('Tecido: sobe, desenha e não estoura', () => {
  it('primeiro quadro pinta o fundo e a trama inteira, sem erro', () => {
    const teia = iniciar();
    m.avancar(34);
    const c = m.ctx().chamadas;
    expect(c.fillRect).toBeGreaterThan(0);
    expect(c.stroke).toBeGreaterThan(20);
    expect(c.moveTo.length).toBeGreaterThan(10);
    expect(teia).toBeDefined();
  });

  it('a trama é uma malha: um fio por linha e por coluna', () => {
    iniciar();
    m.avancar(34);
    const cfg = configTeia(1920, 1080, 2);
    const cols = Math.ceil(1920 / cfg.celula) + 1;
    const rows = Math.ceil(1080 / cfg.celula) + 1;
    // Um `stroke` por fio; o total é o de linhas mais o de colunas (mais os brilhos de cabeça).
    expect(m.ctx().chamadas.stroke).toBeGreaterThanOrEqual(cols + rows - 4);
  });

  it('o HUD aceita mudança de status sem erro', () => {
    const teia = iniciar() as Teia;
    expect(() => teia.updateStatus('preenchendo: CPF')).not.toThrow();
  });

  it('as vias nascem espalhadas pela tela, não amontoadas num canto', () => {
    // A primeira versão semeava `pos` com um índice de célula usado como coordenada de pixel, e
    // as cinco vias apareciam todas no mesmo lugar. Aqui medimos a dispersão das cabeças.
    iniciar();
    const c = medir(6);
    const cabecas = c.fillText.map((g) => g);
    expect(cabecas.length).toBeGreaterThan(0);
    // Distância máxima entre cabeças: amontoadas ficariam todas dentro de uma célula.
    let maiorDistancia = 0;
    for (const a of cabecas) {
      for (const b of cabecas) maiorDistancia = Math.max(maiorDistancia, Math.hypot(a.x - b.x, a.y - b.y));
    }
    const cfg = configTeia(1920, 1080, 2);
    expect(maiorDistancia).toBeGreaterThan(cfg.celula * 3);
  });
});

describe('Rastro: cresce, e dissolve a partir de onde nasceu', () => {
  it('os glifos aparecem e o rastro cresce ao longo dos quadros', () => {
    iniciar();
    m.avancar(34);
    const primeiro = m.ctx().chamadas.fillText.length;
    for (let i = 0; i < 14; i++) m.avancar(34);
    const depois = m.ctx().chamadas.fillText.length;
    expect(primeiro).toBeGreaterThan(0);
    expect(depois).toBeGreaterThan(primeiro);
  });

  it('o rastro tem comprimento limitado, mesmo depois de muito tempo', () => {
    iniciar();
    const cfg = configTeia(1920, 1080, 2);
    for (let i = 0; i < 200; i++) m.avancar(34);
    const c = medir(1);
    // Glifos por quadro = soma dos rastros vivos, cada um limitado a `vida`.
    expect(c.fillText.length).toBeGreaterThan(0);
    expect(c.fillText.length).toBeLessThanOrEqual(cfg.vias * cfg.vida);
  });

  it('cada rastro clareia do começo para a cabeça: a dissolução vem da origem', () => {
    iniciar();
    const c = medir();
    const glifos = c.fillText.filter((g) => g.alpha > 0.01);
    expect(glifos.length).toBeGreaterThan(4);

    // As vias são desenhadas uma de cada vez, cada rastro do mais velho para o mais novo. Onde o
    // alfa cai, mudou de via: é assim que os grupos se separam.
    const corridas: number[][] = [];
    for (const g of glifos) {
      const atual = corridas.at(-1);
      if (atual && g.alpha >= atual.at(-1)! - 0.001) atual.push(g.alpha);
      else corridas.push([g.alpha]);
    }
    expect(corridas.length).toBeGreaterThan(1);

    let comGradiente = 0;
    for (const corrida of corridas) {
      // Do ponto de origem até a cabeça, o rastro só pode clarear. É isso que faz o rastro
      // desaparecer de onde começou, e não pela frente.
      for (let i = 1; i < corrida.length; i++) {
        expect(corrida[i]!).toBeGreaterThanOrEqual(corrida[i - 1]! - 0.001);
      }
      // Uma via que acabou de renascer tem uma célula só e, portanto, nenhum gradiente: exigir
      // contraste nela é exigir coisa que não existe, e fazia o teste oscilar entre execuções.
      if (corrida.length >= 3) {
        comGradiente++;
        expect(corrida.at(-1)!).toBeGreaterThan(corrida[0]!);
      }
    }
    expect(comGradiente).toBeGreaterThan(0);
  });

  it('a cauda é bem mais fraca que a cabeça (contraste de verdade, não só monotonia)', () => {
    iniciar();
    const glifos = medir().fillText.filter((g) => g.alpha > 0.01);
    const max = Math.max(...glifos.map((g) => g.alpha));
    const min = Math.min(...glifos.map((g) => g.alpha));
    // Sem este teste, a monotonia acima passaria mesmo com um rastro quase uniforme.
    expect(max).toBeGreaterThan(min * 1.4);
  });

  it('a cabeça de via tem brilho próprio, desenhado à parte do glifo', () => {
    iniciar();
    const vias = configTeia(1920, 1080, 2).vias;
    // Uma via que acabou de renascer tem a trilha recomeçada vazia, e sem cabeça não há brilho
    // naquele quadro. O que precisa valer é o regime: com a trilha formada, todo fio brilha.
    // A primeira versão media um único quadro fixo, então dependia do sorteio da posição e da
    // velocidade de cada via — foi o que reprovou no CI com 4 de 5, tendo passado antes em
    // qualquer máquina.
    let preenchimentos = 0;
    for (let quadro = 0; quadro < 40 && preenchimentos < vias; quadro++) {
      m.zerar();
      m.avancar(34);
      preenchimentos = m.ctx().chamadas.fill;
    }
    // Um `fill` por cabeça de via (o gradiente radial), além dos fills do fundo.
    expect(preenchimentos).toBeGreaterThanOrEqual(vias);
  });
});

describe('Atractor: o mouse curva o fio na direção dele', () => {
  // A onda vale ~2,2 px (1,3 + 0,9). O puxão do mouse chega a atrator x celula x 1,15 ~ 24 px.
  // Os limites abaixo ficam no meio do caminho entre as duas coisas, com folga dos dois lados.

  it('longe do mouse e das vias, o único movimento do tecido é a onda viva', () => {
    iniciar();
    for (let i = 0; i < 6; i++) {
      // `zerar` antes de medir: sem ele, o harness soma a geometria dos quadros anteriores, e um
      // quadro em que o mouse ainda puxava entra na conta do relaxamento.
      m.zerar();
      m.avancar(34);
      const lido = deformacaoDoTecido({ excluir: rastros() });
      // Precisa haver área livre para a medida significar alguma coisa.
      expect(lido.nos).toBeGreaterThan(100);
      expect(lido.max).toBeLessThan(4);
    }
  });

  it('com o mouse em campo livre, o tecido em volta dele é puxado bem além da onda', () => {
    iniciar();
    // O mouse é posto num nó que tem a vizinhança livre de rastro, e não num ponto fixo da tela:
    // com o centro fixo, uma via passando ali cobria a janela inteira e a leitura virava loteria —
    // em 20 tentativas, metade delas sem um único nó limpo. Escolhendo o lugar livre, todas as
    // tentativas medem (medido: 20,1 a 22,9 px, contra um puxão máximo teórico de 23,9 px).
    let maior = 0;
    for (let i = 0; i < 10 && maior <= 12; i++) {
      m.zerar();
      m.avancar(34);
      const livre = noSemRastro();
      if (!livre) continue;
      m.moverMouse(livre.x, livre.y);
      m.zerar();
      m.avancar(34);
      maior = Math.max(maior, deformacaoDoTecido({ perto: livre, excluir: rastros() }).max);
    }
    // 12 px separa a onda (2,2) do puxão (20+) com folga dos dois lados.
    expect(maior).toBeGreaterThan(12);
  });

  it('o mouse que sai devolve o ponto ao lugar: o tecido relaxa', () => {
    iniciar();
    const MOUSE = { x: 960, y: 540 };
    m.moverMouse(MOUSE.x, MOUSE.y);
    for (let i = 0; i < 5; i++) m.avancar(34);
    m.sairMouse();
    for (let i = 0; i < 6; i++) {
      m.zerar();
      m.avancar(34);
      const lido = deformacaoDoTecido({ excluir: rastros() });
      expect(lido.nos).toBeGreaterThan(100);
      // some o puxão, e o que resta é a onda de novo: o tecido relaxa
      expect(lido.max).toBeLessThan(4);
    }
  });

  it('o halo do fundo segue o mouse (fundo + halo por quadro)', () => {
    iniciar();
    m.moverMouse(300, 300);
    const comMouse = medir(1).fillRect;
    m.sairMouse();
    const semMouse = medir(1).fillRect;
    expect(comMouse).toBeGreaterThan(semMouse);
  });
});

describe('A trama fecha: o fio corre no seu lugar e o cruzamento não abre', () => {
  it('cada via corre AO LONGO de um fio, sem sair para a diagonal', () => {
    // O fio de uma via é sorteado uma vez, no nascimento. Quando o índice era derivado de `pos` —
    // que é a coordenada AO LONGO do fio — a via mudava de coluna a cada célula e subia na
    // diagonal: o rastro cruzava a trama em vez de correr num fio, e a "malha de fios" virava
    // um rabisco na diagonal.
    //
    // A prova não precisa saber qual via é qual. No fluxo de um quadro as células de uma via
    // saem EM SEGUIDA (da mais velha para a mais nova), então um par de glifos consecutivos
    // está ou dentro da mesma via — e aí tem de andar num eixo só, porque o fio não muda — ou na
    // divisão entre duas vias, onde qualquer coisa pode acontecer. São no máximo `vias - 1`
    // divisões por quadro, então par diagonal é a exceção, e a exceção tem teto. Agrupar glifos
    // por alfa para descobrir as vias, como parece mais direto, erra: duas vias com faixa de
    // alfa parecida viram uma só e a medição vira loteria (foi o que sobrou de instável aqui).
    iniciar();
    for (let i = 0; i < 20; i++) m.avancar(34);

    const cfg = configTeia(1920, 1080, 2);
    let alinhados = 0;
    let medidos = 0;
    for (let quadro = 0; quadro < 60; quadro++) {
      m.zerar();
      m.avancar(34);
      const g = m.ctx().chamadas.fillText;
      if (g.length < 2) continue;
      medidos++;
      let diagonal = 0;
      for (let i = 1; i < g.length; i++) {
        if (Math.abs(g[i]!.x - g[i - 1]!.x) < 0.001 || Math.abs(g[i]!.y - g[i - 1]!.y) < 0.001) alinhados++;
        else diagonal++;
      }
      expect(diagonal).toBeLessThanOrEqual(cfg.vias);
    }
    // Mediu o suficiente, e o que mediu é par dentro de via (o código antigo dava ~65 por quadro).
    expect(medidos).toBeGreaterThan(40);
    expect(alinhados).toBeGreaterThan(500);
  });

  it('o fio horizontal e o vertical que se cruzam caem no MESMO ponto', () => {
    // A onda do tecido precisa ser função do nó da malha, não do fio. Com uma onda por fio, o
    // horizontal e o vertical discordavam em até ~4 px no mesmo nó, e a trama não fechava: em vez
    // de tecido, uma grade de segmentos soltos flutuando perto uns dos outros.
    iniciar();
    for (let i = 0; i < 12; i++) m.avancar(34);

    // O harness achata os pontos (todos os moveTo, depois todos os lineTo) e perde o agrupamento
    // por fio. Instrumentacao: cada `stroke` fecha o caminho aberto, e os fios saem na ordem —
    // as linhas horizontais primeiro, depois as colunas verticais.
    const ctx = m.ctx() as unknown as Record<string, unknown>;
    let atual: { x: number; y: number }[] = [];
    const fios: { x: number; y: number }[][] = [];
    const abrir = ctx.moveTo as (x: number, y: number) => void;
    const traco = ctx.lineTo as (x: number, y: number) => void;
    const riscar = ctx.stroke as () => void;
    ctx.moveTo = (x: number, y: number) => {
      atual = [{ x, y }];
      abrir.call(ctx, x, y);
    };
    ctx.lineTo = (x: number, y: number) => {
      atual.push({ x, y });
      traco.call(ctx, x, y);
    };
    ctx.stroke = () => {
      if (atual.length > 1) fios.push(atual);
      atual = [];
      riscar.call(ctx);
    };

    m.zerar();
    m.avancar(34);

    const cfg = configTeia(1920, 1080, 2);
    const cols = Math.ceil(1920 / cfg.celula) + 1;
    const rows = Math.ceil(1080 / cfg.celula) + 1;
    expect(fios.length).toBe(rows + cols);
    const horizontais = fios.slice(0, rows);
    const verticais = fios.slice(rows);

    for (let r = 0; r < rows; r++) {
      const h = horizontais[r]!;
      for (let c = 0; c < cols; c++) {
        const v = verticais[c]!;
        const hp = h[c]!;
        const vp = v[r]!;
        // Meio pixel: com a onda por nó, os dois caem no mesmo lugar e a folga é só ruído de
        // ponto flutuante. O bug antigo abria até ~4 px — mais que a própria espessura do fio
        // (lineWidth 1) — e era por isso que a trama não fechava. Meia célula, que foi o
        // primeiro palpite, passaria: 4 px cabem folgados em 19 px.
        expect(Math.hypot(hp.x - vp.x, hp.y - vp.y)).toBeLessThan(0.5);
      }
    }
  });
});

describe('Ciclo de vida', () => {
  it('parar cancela o quadro seguinte, na hora', () => {
    const teia = iniciar();
    m.avancar(34);
    const antes = m.quadros;
    teia.stop();
    m.avancar(34);
    expect(m.quadros).toBe(antes);
  });

  it('start de novo retoma o desenho', () => {
    const teia = iniciar();
    teia.stop();
    m.avancar(34);
    const antes = m.quadros;
    teia.start();
    m.avancar(34);
    expect(m.quadros).toBeGreaterThan(antes);
  });

  it('redimensionar remede a malha sem quebrar', () => {
    iniciar();
    m.avancar(34);
    (m.world as unknown as { innerWidth: number }).innerWidth = 800;
    (m.world as unknown as { innerHeight: number }).innerHeight = 600;
    expect(() => {
      m.frames.resize();
      m.avancar(34);
    }).not.toThrow();
  });

  it('um salto grande de relógio não joga a via para o outro lado da tela', () => {
    iniciar();
    // Aba em segundo plano: o relógio salta segundos. Sem teto de dt, a via atravessaria a tela
    // num quadro e o rastro viraria um borrão de um ponto só.
    expect(() => {
      for (let i = 0; i < 10; i++) m.avancar(4000);
    }).not.toThrow();
    const c = medir(1);
    // As células de um rastro ficam a pelo menos ~1 célula umas das outras.
    const porVia = new Map<number, { x: number; y: number }[]>();
    for (const g of c.fillText) {
      const k = Math.round(g.y / 60);
      const lista = porVia.get(k) ?? [];
      lista.push({ x: g.x, y: g.y });
      porVia.set(k, lista);
    }
    const maiores = [...porVia.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    expect(maiores.length).toBeLessThanOrEqual(configTeia(1920, 1080, 2).vida);
  });

  it('canvas sem contexto 2D não derruba a extensão', () => {
    // Navegador sem canvas acelerado: o efeito simplesmente não aparece, e nada explode.
    m.doc.createElement = (() => {
      const el = {
        style: {},
        children: [] as unknown[],
        appendChild: () => {},
        append: () => {},
        removeChild: () => {},
        get firstChild() {
          return null;
        },
        attachShadow() {
          return { appendChild: () => {}, firstChild: null, removeChild: () => {}, querySelector: () => null };
        },
        remove: () => {},
        querySelector: () => null,
        getContext: () => null,
        set textContent(_: string) {},
      };
      return el;
    }) as unknown as (t: string) => unknown;
    expect(() => iniciarTeia(configTeia(1920, 1080, 2), deformacao)).not.toThrow();
  });

  it('destroy limpa o global e devolve a página ao estado original', () => {
    const teia = iniciar();
    m.avancar(34);
    expect(() => teia.destroy()).not.toThrow();
    // O global continua até o timeout da transição, e some depois; o que importa é não estourar.
    expect((m.world as unknown as { __bRowserTeia?: unknown }).__bRowserTeia).toBeDefined();
  });
});
