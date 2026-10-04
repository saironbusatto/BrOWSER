// "O que mudou?" depois de uma ação (roteiro, fase 1.3).
//
// `clicar` respondia só "ok", e a IA relia a página inteira para saber o que tinha acontecido:
// era daí que vinha o ciclo clicar -> ler -> clicar -> ler. Aqui a ponte lê antes, age, espera a
// página assentar e devolve só a diferença. Devolver a página inteira a cada ação é o erro
// conhecido de quem fez isso antes (estoura o contexto em página grande).

import type { Cmd, Comandos } from '@browser/shared';

type Enviar = <C extends Cmd>(cmd: C, args: Comandos[C]['args']) => Promise<Comandos[C]['result']>;
export type Leitura = Comandos['ler_estrutura']['result'];

const MAX_MUDANCA = 6000;
const MAX_SUMIDAS = 12;
// ponytail: "assentou" = duas leituras seguidas iguais, com pausas crescentes (até ~2,3 s). Não vê
// requisição em andamento que ainda não mexeu na tela; se fizer falta, trocar pela regra do
// browser-harness (wait_for_network_idle: nada em andamento e 500 ms sem evento de rede).
export const PAUSAS_MS = [150, 250, 400, 600, 900];

const linhasDe = (t: string) => t.split('\n').filter((l) => l.trim());
const recuo = (l: string) => l.length - l.trimStart().length;
const cortar = (t: string) =>
  t.length > MAX_MUDANCA ? `${t.slice(0, MAX_MUDANCA)}\n… (cortado: chame ler_estrutura, com filtro se precisar)` : t;

/** A diferença entre duas leituras, em texto para a IA. `ignorarRefs`: campos que a própria ação alterou. */
export function descreverMudanca(antes: Leitura, depois: Leitura, ignorarRefs: number[] = []): string {
  if (antes.url !== depois.url) return cortar(`A página agora é: ${depois.titulo}\n${depois.url}\n\n${depois.texto}`);
  const daAcao = (l: string) => ignorarRefs.some((r) => l.includes(`[ref=${r}]`));
  const tinha = new Set(linhasDe(antes.texto).map((l) => l.trim()));
  const tem = new Set(linhasDe(depois.texto).map((l) => l.trim()));

  // Linha nova vem com o caminho até ela (a linha da tabela, a janela): sem isso, um botão novo
  // aparece solto e a IA não sabe de onde é.
  const apareceu: string[] = [];
  const caminho: { linha: string; dita: boolean }[] = [];
  for (const l of linhasDe(depois.texto)) {
    while (caminho.length && recuo(caminho.at(-1)!.linha) >= recuo(l)) caminho.pop();
    const nova = !tinha.has(l.trim()) && !daAcao(l);
    if (nova) {
      for (const c of caminho) {
        if (!c.dita) apareceu.push(c.linha);
        c.dita = true;
      }
      apareceu.push(l);
    }
    caminho.push({ linha: l, dita: nova });
  }
  const sumiu = linhasDe(antes.texto)
    .filter((l) => !tem.has(l.trim()) && !daAcao(l))
    .map((l) => l.trim());

  if (!apareceu.length && !sumiu.length) return 'Nada mais mudou na página.';
  const partes: string[] = [];
  if (apareceu.length) partes.push(`Apareceu:\n${apareceu.join('\n')}`);
  if (sumiu.length)
    partes.push(
      `Sumiu:\n${sumiu.slice(0, MAX_SUMIDAS).join('\n')}${sumiu.length > MAX_SUMIDAS ? `\n… e mais ${sumiu.length - MAX_SUMIDAS}` : ''}`,
    );
  return cortar(partes.join('\n\n'));
}

/** Lê, age, espera assentar, lê de novo. `depois` é a leitura nova (para a guarda dos cliques). */
export async function agirEVer<T>(
  enviar: Enviar,
  acao: () => Promise<T>,
  ignorarRefs: number[] = [],
  pausa: (ms: number) => Promise<unknown> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ resultado: T; depois?: Leitura; mudou: string }> {
  const ler = () =>
    enviar('ler_estrutura', {}).then(
      (l) => (typeof l?.texto === 'string' ? l : undefined),
      () => undefined, // aba no meio de uma navegação, ou extensão que não sabe ler estrutura
    );
  const antes = await ler();
  const resultado = await acao();
  if (!antes) return { resultado, mudou: '' };
  let depois: Leitura | undefined;
  for (const ms of PAUSAS_MS) {
    await pausa(ms);
    const l = await ler();
    if (!l) continue;
    const igual = depois !== undefined && l.url === depois.url && l.texto === depois.texto;
    depois = l;
    if (igual) break;
  }
  if (!depois) return { resultado, mudou: 'A página ainda está carregando: chame ler_estrutura.' };
  return { resultado, depois, mudou: descreverMudanca(antes, depois, ignorarRefs) };
}
