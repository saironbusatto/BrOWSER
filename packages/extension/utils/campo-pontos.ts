// Fundo do painel: grade de pontos amarelos (campos por preencher) que ficam verdes num raio em
// volta do cursor (preenchidos). As cores vêm do ícone "Br": r amarelo, B verde.
// Só redesenha quando o mouse se move; com "reduzir movimento" fica estático.

const ESPACO = 18; // px entre pontos
const RAIO = 90; // px de alcance do verde em volta do cursor
const TAMANHO_BASE = 1.1;
const TAMANHO_ATIVO = 2.3;

type Rgb = [number, number, number];

function hexParaRgb(hex: string): Rgb {
  const h = hex.trim().replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const misturar = (a: number, b: number, t: number) => a + (b - a) * t;
const suavizar = (t: number) => t * t * (3 - 2 * t); // smoothstep: borda do raio sem degrau

export function iniciarCampoPontos(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const movimentoReduzido = matchMedia('(prefers-reduced-motion: reduce)');
  let cursor: { x: number; y: number } | null = null;
  let agendado = false;
  let base: Rgb = [244, 180, 15];
  let ativo: Rgb = [63, 203, 90];
  let alfaBase = 0.3;

  const lerCores = () => {
    const css = getComputedStyle(document.documentElement);
    base = hexParaRgb(css.getPropertyValue('--ponto-base') || '#F4B40F');
    ativo = hexParaRgb(css.getPropertyValue('--ponto-ativo') || '#3FCB5A');
    alfaBase = parseFloat(css.getPropertyValue('--ponto-alfa')) || 0.3;
  };

  const ajustarEscala = () => {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width === Math.round(width * dpr) && canvas.height === Math.round(height * dpr)) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const desenhar = () => {
    agendado = false;
    ajustarEscala(); // garante a escala mesmo se nenhum evento de DPR/resize chegou
    const { width, height } = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    const alvo = movimentoReduzido.matches ? null : cursor;
    for (let y = ESPACO / 2; y < height; y += ESPACO) {
      for (let x = ESPACO / 2; x < width; x += ESPACO) {
        const d = alvo ? Math.hypot(x - alvo.x, y - alvo.y) : Infinity;
        const t = d < RAIO ? suavizar(1 - d / RAIO) : 0;
        const [r, g, b] = [0, 1, 2].map((i) => Math.round(misturar(base[i]!, ativo[i]!, t)));
        ctx.fillStyle = `rgba(${r},${g},${b},${misturar(alfaBase, 0.95, t)})`;
        ctx.beginPath();
        ctx.arc(x, y, misturar(TAMANHO_BASE, TAMANHO_ATIVO, t), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const agendar = () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(desenhar);
  };

  const redimensionar = () => {
    ajustarEscala();
    agendar();
  };

  const aoMover = (e: PointerEvent) => {
    if (movimentoReduzido.matches) return;
    const r = canvas.getBoundingClientRect();
    cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
    agendar();
  };
  const aoSair = () => {
    cursor = null;
    agendar();
  };
  const aoMudarTema = () => {
    lerCores();
    agendar();
  };

  lerCores();
  const observador = new ResizeObserver(redimensionar);
  observador.observe(canvas);

  // Zoom ou troca de monitor mudam o devicePixelRatio sem mudar o tamanho em CSS: o
  // ResizeObserver não dispara e o canvas ficaria na escala velha (verde fora do cursor).
  let dprAtual: MediaQueryList | undefined;
  const aoMudarDpr = () => {
    dprAtual?.removeEventListener('change', aoMudarDpr);
    dprAtual = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprAtual.addEventListener('change', aoMudarDpr);
    redimensionar();
  };
  aoMudarDpr();
  window.addEventListener('pointermove', aoMover, { passive: true });
  document.documentElement.addEventListener('pointerleave', aoSair);
  const temas = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'].map((q) => matchMedia(q));
  temas.forEach((m) => {
    m.addEventListener('change', aoMudarTema);
  });
  movimentoReduzido.addEventListener('change', agendar);

  return () => {
    observador.disconnect();
    dprAtual?.removeEventListener('change', aoMudarDpr);
    window.removeEventListener('pointermove', aoMover);
    document.documentElement.removeEventListener('pointerleave', aoSair);
    temas.forEach((m) => {
      m.removeEventListener('change', aoMudarTema);
    });
    movimentoReduzido.removeEventListener('change', agendar);
  };
}
