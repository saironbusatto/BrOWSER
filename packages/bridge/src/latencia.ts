// Onde o tempo de um pedido foi? Instrumentação de latência.
//
// O que interessa é a divisão browser vs. resto: o que sobra é o modelo pensando entre uma
// chamada e outra. É ela que decide o próximo passo — poucas chamadas lentas pedem lote, muitas
// chamadas pedem modelo mais leve. Medir antes de otimizar é o que separa as duas.
//
// Módulo sem efeito colateral de propósito: main.ts abre servidor e stdin no import, então o
// formatador mora aqui para poder ser testado sem subir nada.

export type Custo = { n: number; ms: number };

export class Relogio {
  private porCmd = new Map<string, Custo>();
  private msBrowser = 0;

  /** Chamar no fim de cada `enviar()`. */
  registrar(cmd: string, ms: number): void {
    this.msBrowser += ms;
    const r = this.porCmd.get(cmd) ?? { n: 0, ms: 0 };
    this.porCmd.set(cmd, { n: r.n + 1, ms: r.ms + ms });
  }

  zerar(): void {
    this.porCmd.clear();
    this.msBrowser = 0;
  }

  resumo(totalMs: number): string {
    return formatar(totalMs, this.msBrowser, this.porCmd);
  }
}

export function formatar(totalMs: number, msBrowser: number, porCmd: Map<string, Custo>): string {
  const detalhe = [...porCmd.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([k, v]) => `${k} ${v.n}x/${(v.ms / 1000).toFixed(1)}s`)
    .join(', ');
  // Math.max porque um relógio que andou para trás (ou total medido curto) não pode virar
  // "-0.3s" numa linha que alguém vai ler para decidir o próximo passo.
  const fora = Math.max(0, totalMs - msBrowser) / 1000;
  const chamadas = [...porCmd.values()].reduce((s, v) => s + v.n, 0);
  return (
    `latência ${(totalMs / 1000).toFixed(1)}s = ${fora.toFixed(1)}s fora do browser + ` +
    `${(msBrowser / 1000).toFixed(1)}s em browser | ${chamadas} chamadas (${detalhe || 'nenhuma'})`
  );
}
