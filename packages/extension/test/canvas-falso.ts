// Harness de canvas: o suficiente para `iniciarTeia` rodar de verdade fora do navegador.
//
// Não dá para testar o desenho com jsdom (não tem canvas 2D). Mas o que precisa ser provado não é
// a imagem: é que a função não estoura, que a trama se move, que o rastro cresce e morre pela
// cabeça, e que o mouse realmente curva o fio. Tudo isso precisa de `requestAnimationFrame` sob
// controle, que é o que este arquivo dá.

export type Chamadas = {
  fillText: { x: number; y: number; g: string; alpha: number }[];
  moveTo: { x: number; y: number }[];
  lineTo: { x: number; y: number }[];
  fillRect: number;
  stroke: number;
  fill: number;
};

class Ctx2D {
  chamadas: Chamadas = { fillText: [], moveTo: [], lineTo: [], fillRect: 0, stroke: 0, fill: 0 };
  // Só `fillStyle` tem accessor: é o canal por onde o teste lê o alfa de cada glifo. Declarar um
  // campo com o mesmo nome sobrescreveria o accessor (useDefineForClassFields) e o setter nunca
  // rodaria — foi exatamente o que aconteceu na primeira versão deste harness.
  private _fillStyle: unknown = '';
  strokeStyle: unknown = '';
  lineWidth = 1;
  font = '';
  textAlign = '';
  textBaseline = '';
  globalAlpha = 1;
  globalCompositeOperation = '';
  // Guarda o último `fillStyle` textual: é dele que `fillText` lê o alfa da célula, que é o
  // que o teste do fade do rastro mede.
  private rgbaAtual = 'rgba(255,255,255,1)';

  /** Só os gradientes importam; devolvem algo que aceite addColorStop. */
  createLinearGradient() {
    return { addColorStop: () => {} };
  }
  createRadialGradient() {
    return { addColorStop: () => {} };
  }
  setTransform() {}
  clearRect() {}
  beginPath() {}
  fillRect() {
    this.chamadas.fillRect++;
  }
  moveTo(x: number, y: number) {
    this.chamadas.moveTo.push({ x, y });
  }
  lineTo(x: number, y: number) {
    this.chamadas.lineTo.push({ x, y });
  }
  arc() {}
  stroke() {
    this.chamadas.stroke++;
  }
  fill() {
    this.chamadas.fill++;
  }
  fillText(g: string, x: number, y: number) {
    // O `fillStyle` corrente carrega o alfa da célula: é dele que se lê o fade.
    const m = /rgba\([^)]*?,\s*([\d.]+)\)/.exec(String(this.rgbaAtual));
    this.chamadas.fillText.push({ x, y, g, alpha: m ? Number(m[1]) : 1 });
  }
  set fillStyle(v: unknown) {
    this._fillStyle = v;
    if (typeof v === 'string') this.rgbaAtual = v;
  }
  get fillStyle(): unknown {
    return this._fillStyle;
  }
}

class El {
  style: Record<string, string> = { cssText: '' };
  children: El[] = [];
  shadowRoot: El | null = null;
  textContent = '';
  tag = '';
  constructor(tag = 'div') {
    this.tag = tag;
  }
  appendChild(el: El | El[]) {
    for (const e of Array.isArray(el) ? el : [el]) this.children.push(e);
    return el;
  }
  append(...els: El[]) {
    this.children.push(...els);
  }
  removeChild(el: El) {
    this.children = this.children.filter((c) => c !== el);
  }
  get firstChild(): El | null {
    return this.children[0] ?? null;
  }
  attachShadow() {
    this.shadowRoot = new El('shadow');
    return this.shadowRoot;
  }
  remove() {}
  querySelector(sel: string): El | null {
    const achar = (n: El): El | null => {
      for (const c of n.children) {
        if (c.tag === sel) return c;
        const r = achar(c);
        if (r) return r;
      }
      return null;
    };
    return achar(this);
  }
  getContext() {
    return new Ctx2D();
  }
}

export type Mundo = {
  world: Record<string, unknown>;
  doc: Record<string, unknown>;
  quadros: number;
  avancar(ms: number): void;
  ctx: () => Ctx2D;
  /** Zera o registrador: para medir um quadro só, e não a soma desde o início. */
  zerar(): void;
  moverMouse(x: number, y: number): void;
  sairMouse(): void;
  frames: { resize(): void; pointerleave(): void };
  host: El;
};

/** Levanta um DOM/canvas/window falsos e devolve o mundo para dirigir. */
export function mundo(largura = 1920, altura = 1080): Mundo {
  const docRoot = new El('html');
  const canvas = new El('canvas');
  // Um único contexto para o canvas, e o mesmo devolvido em toda chamada: assim as medições
  // somam os quadros em vez de criar um registrador novo a cada `getContext`.
  const ctxUnico = new Ctx2D();
  canvas.getContext = (() => ctxUnico) as unknown as El['getContext'];

  const doc: Record<string, unknown> = {
    createElement: (t: string) => (t === 'canvas' ? canvas : new El(t)),
    getElementById: () => null,
    documentElement: docRoot,
    title: 'x',
  };

  let relogio = 0;
  const fila: { t: number; fn: FrameRequestCallback }[] = [];
  const ouvintes: Record<string, ((e: unknown) => void)[]> = {};

  const world: Record<string, unknown> = {
    innerWidth: largura,
    innerHeight: altura,
    devicePixelRatio: 2,
    performance: { now: () => relogio },
    addEventListener: (t: string, f: (e: unknown) => void) => {
      if (!ouvintes[t]) ouvintes[t] = [];
      ouvintes[t]!.push(f);
    },
    removeEventListener: () => {},
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      fila.push({ t: relogio + 33, fn });
      return fila.length;
    },
    cancelAnimationFrame: () => {
      fila.length = 0;
    },
  };

  (globalThis as Record<string, unknown>).window = world;
  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).performance = { now: () => relogio };

  return {
    world,
    doc,
    quadros: 0,
    ctx: () => ctxUnico,
    zerar: () => {
      ctxUnico.chamadas = { fillText: [], moveTo: [], lineTo: [], fillRect: 0, stroke: 0, fill: 0 };
    },
    // Avança o relógio e roda o que estiver na fila: como advance é chamado N vezes, isso simula
    // N quadros, e é assim que se prova que o rastro cresce e depois morre.
    avancar(ms = 33) {
      relogio += ms;
      const due = fila.splice(0, fila.length);
      for (const { fn } of due) {
        this.quadros++;
        fn(relogio as unknown as number);
      }
    },
    moverMouse(x: number, y: number) {
      for (const f of ouvintes.pointermove ?? []) f({ clientX: x, clientY: y });
    },
    sairMouse() {
      for (const f of ouvintes.pointerleave ?? []) f({});
    },
    frames: {
      resize: () => {
        for (const f of ouvintes.resize ?? []) f({});
      },
      pointerleave: () => {
        for (const f of ouvintes.pointerleave ?? []) f({});
      },
    },
    host: docRoot,
  };
}

export function limparMundo() {
  for (const k of ['window', 'document', 'performance']) delete (globalThis as Record<string, unknown>)[k];
}

export { Ctx2D, El };
