// utils/matrix.ts
export function iniciarMatrixOverlay() {
  if ((window as any).__bRowserMatrix) {
    (window as any).__bRowserMatrix.start();
    return;
  }

  const ID = 'browser-matrix-host';
  let host = document.getElementById(ID);
  if (!host) {
    host = document.createElement('div');
    host.id = ID;
    host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;transition:opacity 0.4s ease;opacity:0;';
    document.documentElement.appendChild(host);
  }

  // Se já tem shadowRoot, usa ela. Senão cria.
  const shadow = host.shadowRoot || (host.attachShadow ? host.attachShadow({ mode: 'open' }) : host);
  while (shadow.firstChild) {
    shadow.removeChild(shadow.firstChild);
  }

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      pointer-events: none;
    }
    .matrix-container {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      box-sizing: border-box;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', 'Courier New', monospace;
      /* Glow cibernético nas bordas da tela */
      box-shadow: inset 0 0 35px rgba(0, 255, 65, 0.45), inset 0 0 10px rgba(0, 255, 65, 0.7);
      border: 1px solid rgba(0, 255, 65, 0.5);
    }

    /* Brackets cibernéticos nos 4 cantos da tela */
    .corner {
      position: absolute;
      width: 26px;
      height: 26px;
      border: 3px solid #00ff41;
      pointer-events: none;
      filter: drop-shadow(0 0 6px rgba(0, 255, 65, 0.9));
    }
    .corner-tl { top: 14px; left: 14px; border-right: none; border-bottom: none; }
    .corner-tr { top: 14px; right: 14px; border-left: none; border-bottom: none; }
    .corner-bl { bottom: 14px; left: 14px; border-right: none; border-top: none; }
    .corner-br { bottom: 14px; right: 14px; border-left: none; border-top: none; }

    /* Linhas de scanline suaves */
    .scanlines {
      position: absolute;
      inset: 0;
      background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
      background-size: 100% 4px;
      pointer-events: none;
      opacity: 0.5;
    }

    /* HUD pill flutuante no topo */
    .hud-badge {
      position: absolute;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 15, 12, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 255, 65, 0.7);
      border-radius: 9999px;
      padding: 8px 22px;
      color: #00ff41;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      letter-spacing: 0.4px;
      box-shadow: 0 4px 25px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 255, 65, 0.4);
      pointer-events: none;
      user-select: none;
      white-space: nowrap;
    }

    .pulse-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #00ff41;
      box-shadow: 0 0 10px #00ff41;
      animation: matrix-pulse 1.3s infinite ease-in-out;
    }

    @keyframes matrix-pulse {
      0%, 100% { transform: scale(0.85); opacity: 0.6; }
      50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 15px #00ff41; }
    }

    .hud-title {
      font-weight: 700;
      color: #ffffff;
      text-shadow: 0 0 8px rgba(0, 255, 65, 0.7);
    }

    .hud-sep {
      color: rgba(0, 255, 65, 0.4);
    }

    .hud-status {
      color: #a3e635;
      font-weight: 500;
    }

    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0.55;
    }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'matrix-container';

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const scanlines = document.createElement('div');
  scanlines.className = 'scanlines';
  container.appendChild(scanlines);

  const corners = ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br'];
  for (const c of corners) {
    const corner = document.createElement('div');
    corner.className = 'corner ' + c;
    container.appendChild(corner);
  }

  const hud = document.createElement('div');
  hud.className = 'hud-badge';

  const dot = document.createElement('div');
  dot.className = 'pulse-dot';

  const title = document.createElement('span');
  title.className = 'hud-title';
  title.textContent = 'BrOWSER AI';

  const sep = document.createElement('span');
  sep.className = 'hud-sep';
  sep.textContent = '|';

  const status = document.createElement('span');
  status.className = 'hud-status';
  status.textContent = 'Assumindo controle da página…';

  hud.appendChild(dot);
  hud.appendChild(title);
  hud.appendChild(sep);
  hud.appendChild(status);
  container.appendChild(hud);
  shadow.appendChild(container);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let animationId: number | null = null;
  const fontSize = 16;
  let drops: number[] = [];
  const chars = '0123456789ABCDEFｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ'.split('');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const cols = Math.floor(canvas.width / fontSize);
    drops = Array.from({ length: cols }, () => Math.floor(Math.random() * (canvas.height / fontSize)));
  }

  window.addEventListener('resize', resize);
  resize();

  let lastTime = 0;
  const fpsInterval = 1000 / 30; // 30 FPS

  function draw(time: number) {
    animationId = requestAnimationFrame(draw);
    if (!time) time = performance.now();
    const elapsed = time - lastTime;
    if (elapsed < fpsInterval) return;
    lastTime = time - (elapsed % fpsInterval);

    ctx!.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx!.fillRect(0, 0, canvas.width, canvas.height);

    ctx!.font = fontSize + 'px monospace';

    for (let i = 0; i < drops.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)] ?? '';
      const x = i * fontSize;
      const y = (drops[i] ?? 0) * fontSize;

      if (y > 0) {
        ctx!.fillStyle = '#eaffea';
        ctx!.shadowColor = '#00ff41';
        ctx!.shadowBlur = 10;
        ctx!.fillText(char, x, y);

        ctx!.fillStyle = '#00ff41';
        ctx!.shadowBlur = 4;
        ctx!.fillText(char, x, y - fontSize);
      }

      if (y > canvas.height && Math.random() > 0.95) {
        drops[i] = 0;
      }
      drops[i] = (drops[i] ?? 0) + 1;
    }
  }

  (window as any).__bRowserMatrix = {
    start() {
      host.style.opacity = '1';
      if (!animationId) {
        resize();
        lastTime = performance.now();
        animationId = requestAnimationFrame(draw);
      }
    },
    updateStatus(texto: string) {
      const el = shadow.querySelector('.hud-status');
      if (el && texto) el.textContent = texto;
    },
    stop() {
      host.style.opacity = '0';
      setTimeout(() => {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }, 400);
    },
    destroy() {
      this.stop();
      setTimeout(() => {
        host.remove();
        delete (window as any).__bRowserMatrix;
      }, 450);
    }
  };

  (window as any).__bRowserMatrix.start();
}

export function gerarScriptUpdate(texto: string) {
  return `window.__bRowserMatrix?.updateStatus(${JSON.stringify(texto)});`;
}

export const SCRIPT_PARAR_MATRIX = `window.__bRowserMatrix?.stop();`;
