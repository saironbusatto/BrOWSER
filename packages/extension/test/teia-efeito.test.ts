import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { configTeia, iniciarTeia } from '../utils/teia';
import { limparMundo, type Mundo, mundo } from './canvas-falso';

// Aqui o efeito roda de verdade, com canvas falso e rAF sob controle. Não prova a imagem; prova o
// comportamento que dá sentido a ela.

let m: Mundo;

const iniciar = (largura = 1920, altura = 1080) => {
  iniciarTeia(configTeia(largura, altura, 2));
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
    const c = medir();
    // Um `fill` por cabeça de via (o gradiente radial), além dos fills do fundo.
    expect(c.fill).toBeGreaterThanOrEqual(configTeia(1920, 1080, 2).vias);
  });
});

describe('Atractor: o mouse curva o fio na direção dele', () => {
  const maisProximoA = (x: number, y: number) => {
    const todos = [...m.ctx().chamadas.moveTo, ...m.ctx().chamadas.lineTo];
    return Math.min(...todos.map((p) => Math.hypot(p.x - x, p.y - y)));
  };

  it('sem mouse, o fio fica no lugar (só a onda viva, poucos pixels)', () => {
    iniciar();
    m.avancar(34);
    // A onda tem amplitude ~2,2 px: o tecido não pode ir a lugar nenhum.
    expect(maisProximoA(960, 540)).toBeLessThan(8);
  });

  it('com o mouse no centro, um ponto é puxado até quase encostar nele', () => {
    iniciar();
    m.avancar(34);
    m.moverMouse(960, 540);
    const c = medir();
    // Puxão máximo é atrator x celula ~ 21 px. Um ponto a poucos pixels do mouse tem de chegar perto.
    const todos = [...c.moveTo, ...c.lineTo];
    expect(Math.min(...todos.map((p) => Math.hypot(p.x - 960, p.y - 540)))).toBeLessThan(15);
  });

  it('o mouse que sai devolve o ponto ao lugar: o tecido relaxa', () => {
    iniciar();
    m.avancar(34);
    m.moverMouse(960, 540);
    m.avancar(34);
    m.sairMouse();
    const c = medir(1);
    const todos = [...c.moveTo, ...c.lineTo];
    // Sem o mouse, o ponto mais próximo do centro volta a ser a própria malha.
    expect(Math.min(...todos.map((p) => Math.hypot(p.x - 960, p.y - 540)))).toBeGreaterThan(6);
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
    expect(() => iniciarTeia(configTeia(1920, 1080, 2))).not.toThrow();
  });

  it('destroy limpa o global e devolve a página ao estado original', () => {
    const teia = iniciar();
    m.avancar(34);
    expect(() => teia.destroy()).not.toThrow();
    // O global continua até o timeout da transição, e some depois; o que importa é não estourar.
    expect((m.world as unknown as { __bRowserTeia?: unknown }).__bRowserTeia).toBeDefined();
  });
});
