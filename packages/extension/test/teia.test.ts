import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  configTeia,
  deformacao,
  expressaoIniciar,
  expressoesInjetar,
  gerarScriptStatus,
  iniciarTeia,
  PARES_TEIA,
  SCRIPT_PARAR_TEIA,
} from '../utils/teia';
import { limparMundo, mundo } from './canvas-falso';

describe('Malha: espaçamento de 1 cm, proporcional ao tamanho da tela', () => {
  const CM = 96 / 2.54;

  it('usa 1 cm como espaçamento, dentro dos limites', () => {
    const telas: [number, number][] = [
      [1920, 1080],
      [2560, 1440],
      [1366, 768],
      [3840, 2160],
    ];
    for (const [w, h] of telas) {
      expect(configTeia(w, h).celula).toBe(Math.min(Math.max(CM, 13), 46));
    }
  });

  it('1 cm em CSS px vale 96/2.54', () => {
    expect(configTeia(1920, 1080).celula).toBeCloseTo(37.795, 2);
  });

  it('tela menor tem o mesmo espaçamento e, portanto, menos células', () => {
    const grande = Math.ceil(2560 / configTeia(2560, 1440).celula);
    const pequeno = Math.ceil(1366 / configTeia(1366, 768).celula);
    expect(pequeno).toBeLessThan(grande);
    expect(configTeia(1366, 768).celula).toBe(configTeia(2560, 1440).celula);
  });

  it('janela muito estreita não vira serrilha nem grade grossa', () => {
    const c = configTeia(320, 480).celula;
    expect(c).toBeGreaterThanOrEqual(13);
    expect(c).toBeLessThanOrEqual(46);
  });

  it('o rastro e o número de fios crescem com a tela, sem estourar', () => {
    const p = configTeia(1366, 768);
    const g = configTeia(2560, 1440);
    expect(g.vida).toBeGreaterThan(p.vida);
    expect(g.vias).toBeGreaterThanOrEqual(p.vias);
    expect(configTeia(7680, 4320).vias).toBeLessThanOrEqual(7);
    expect(configTeia(320, 480).vias).toBeGreaterThanOrEqual(3);
  });

  it('dpr limitado a 2: monitor 3x não multiplica o custo por três', () => {
    expect(configTeia(1920, 1080, 3).dpr).toBe(2);
    expect(configTeia(1920, 1080, 1).dpr).toBe(1);
    expect(configTeia(1920, 1080).dpr).toBe(1); // ausente = 1
  });
});

describe('Deformação: o fio cede como massa diante de um astro', () => {
  const r = 100;

  it('no centro converge para o atractor (sinal negativo = puxado)', () => {
    expect(deformacao(0, 0, r)).toBeLessThan(0);
    expect(deformacao(1, 0, r)).toBeLessThan(0);
  });

  it('forma um poço: mais força no centro, decaindo até zero na borda', () => {
    const perto = Math.abs(deformacao(20, 0, r));
    const medio = Math.abs(deformacao(60, 0, r));
    const longe = Math.abs(deformacao(95, 0, r));
    expect(perto).toBeGreaterThan(medio);
    expect(medio).toBeGreaterThan(longe);
  });

  it('o anel em volta empurra para fora — é o que faz parecer astro, não ventoinha', () => {
    const anel = deformacao(140, 0, r);
    expect(anel).toBeGreaterThan(0);
  });

  it('longe do poço o fio não se mexe', () => {
    expect(deformacao(200, 0, r)).toBe(0);
    expect(deformacao(0, 999, r)).toBe(0);
  });

  it('é contínuo: não há salto entre o centro e o anel', () => {
    let anterior = deformacao(0, 0, r);
    for (let d = 2; d < 190; d += 2) {
      const atual = deformacao(d, 0, r);
      expect(Math.abs(atual - anterior)).toBeLessThan(0.2);
      anterior = atual;
    }
  });
});

describe('Injeção: a função tem de rodar isolada dentro da página', () => {
  const fonte = iniciarTeia.toString();

  it('não carrega import nem require (é serializada e injetada crua)', () => {
    expect(fonte).not.toMatch(/\brequire\s*\(/);
    expect(fonte).not.toMatch(/^\s*import\s/m);
    expect(fonte).not.toMatch(/\bfrom\s+['"]/);
  });

  it('é JavaScript válido por conta própria', () => {
    expect(() => new Function(`return (${fonte})`)).not.toThrow();
  });

  it('não usa identificadores do módulo: a config e a deformação chegam por parâmetro', () => {
    expect(fonte).toContain('cfg');
    expect(fonte).toContain('deforma');
    // Qualquer constante de fora do corpo da função quebraria em Runtime.evaluate.
    expect(fonte).not.toMatch(/\bKATAKANA\b/);
    expect(fonte).not.toMatch(/\bconfigTeia\b/);
    // Chamada pelo nome, e não pelo parâmetro: é o que sobreviveu aqui e morria na página.
    expect(fonte).not.toMatch(/\bdeformacao\s*\(/);
  });

  it('desenha a trama num escopo onde nada do módulo existe (a página de verdade)', () => {
    // Compilar não prova nada disso: identificador livre só é resolvido na chamada, e aí o escopo
    // já é o global — que, na página, não tem nada do módulo. `new Function` reproduz exatamente
    // essa situação, porque a função nasce no escopo global. Chamar `iniciarTeia` importada, como
    // fazia o resto da suíte, não pegaria nada: o módulo inteiro está no escopo e `deformacao`
    // resolvia.
    //
    // Foi esta a lacuna: a página recebia "ReferenceError: deformacao is not defined" a cada
    // quadro, o erro subia de `ponto()` até `passo()`, e nenhum fio, rastro ou brilho era
    // desenhado — só o fundo e o HUD. Os testes passavam limpos porque enxergavam o módulo.
    const naPage = new Function(`return (${fonte})`)() as (cfg: unknown, deforma: (dx: number, dy: number, raio: number) => number) => void;

    const m = mundo(1920, 1080);
    try {
      naPage(configTeia(1920, 1080, 2), deformacao);
      // O ReferenceError vinha no desenho, não na entrada: é preciso rodar quadro.
      m.avancar(34);
      m.avancar(34);
      const c = m.ctx().chamadas;
      expect(c.stroke).toBeGreaterThan(20);
      expect(c.fillText.length).toBeGreaterThan(0);
    } finally {
      limparMundo();
    }
  });

  it('os scripts de status e parada são expressões, não declarações soltas', () => {
    // `Runtime.evaluate` com uma declaração simples cai no "Identifier has been declared" quando
    // a ponte reenvia; como expressão com vírgula, devolve valor e reexecuta à vontade.
    expect(gerarScriptStatus('preenchendo')).toBe('(window.__bRowserTeia?.updateStatus("preenchendo"),0);');
    expect(SCRIPT_PARAR_TEIA).toBe('(window.__bRowserTeia?.stop(),0);');
    expect(() => new Function(SCRIPT_PARAR_TEIA)).not.toThrow();
    // Compilam como expressão, que é o que o Runtime.evaluate recebe.
    expect(() => new Function(`void ${SCRIPT_PARAR_TEIA}`)).not.toThrow();
  });

  it('o texto de status chega íntegro, escapado, sem virar código', () => {
    // O status vem da ponte e vai dentro de uma expressão avaliada na página. Se a aspa não fosse
    // escapada, um `");` no texto viraria execução. O teste prova o round-trip: executa o script
    // e confere que o que chega é a string original, e não código.
    const perigoso = '"); alert(1); ("';
    let recebido: string | undefined;
    (globalThis as Record<string, unknown>).window = {
      __bRowserTeia: {
        updateStatus: (t: string) => {
          recebido = t;
        },
      },
    };
    try {
      const script = gerarScriptStatus(perigoso);
      // Executa do mesmo jeito que o background executa (Runtime.evaluate com a expressão crua):
      // se a aspa não estivesse escapada, isto seria SyntaxError ou executing o payload.
      new Function(script)();
      expect(recebido).toBe(perigoso);
    } finally {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('o script de status é idempotente: reexecutar não redeclara nada', () => {
    (globalThis as Record<string, unknown>).window = { __bRowserTeia: { updateStatus: () => {} } };
    try {
      const script = gerarScriptStatus('a');
      expect(() => {
        new Function(script)();
        new Function(script)();
      }).not.toThrow();
    } finally {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('o nome do host é reaproveitado entre chamadas em vez de duplicar camadas', () => {
    // Várias abas do BrOWSER no mesmo pedido não podem empilhar dois canvas.
    expect(fonte).toContain('document.getElementById(ID)');
    expect(fonte).toContain('__bRowserTeia');
  });
});

describe('Injeção: as expressões que o Runtime.evaluate envia', () => {
  it('publica as três funções como globais, incluindo a deformação', () => {
    // `deformacao` fora daqui é o defeito que apagou a teia na tela: injetada só a
    // `iniciarTeia`, a chamada por nome dela levantava ReferenceError dentro da página.
    const expr = expressoesInjetar(PARES_TEIA);
    for (const nome of ['__bRowserConfigTeia', '__bRowserDeformacao', '__bRowserIniciarTeia']) {
      expect(expr).toContain(`globalThis["${nome}"]=`);
    }
    expect(PARES_TEIA.map(([n]) => n)).toEqual(['__bRowserConfigTeia', '__bRowserDeformacao', '__bRowserIniciarTeia']);
  });

  it('as expressões são executáveis de verdade, não só texto', () => {
    expect(() => new Function(expressoesInjetar(PARES_TEIA))).not.toThrow();
    expect(() => new Function(expressaoIniciar())).not.toThrow();
    // Compilam como expressão, que é o que o Runtime.evaluate recebe.
    expect(() => new Function(`void ${expressaoIniciar()}`)).not.toThrow();
  });

  it('a expressão de inicio mede a tela e passa a deformação por parâmetro', () => {
    const expr = expressaoIniciar();
    expect(expr).toContain('innerWidth');
    expect(expr).toContain('__bRowserDeformacao');
    // Se `deformacao` fosse chamada pelo nome dentro da página, isto seria a linha do defeito.
    expect(expr).not.toMatch(/\bdeformacao\s*\(/);
  });
});
