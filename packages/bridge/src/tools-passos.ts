// `fazer_passos`: vários passos numa chamada (roteiro, fase 1.3).
//
// É a ideia central do browser-harness (o agente manda um roteiro inteiro, não um clique por vez)
// com as travas do BrOWSER: aqui não há código livre nem JavaScript na página. É uma lista fechada
// de passos, cada controle é apontado pelo NOME que aparece na leitura, e cada clique passa pela
// mesma guarda de envio do `clicar`. Para no primeiro passo que não der certo e mostra a página.
//
// Também é o motor da memória de procedimento (fase 1.5): uma receita guardada é uma lista destas.

import { type Campo, TECLAS } from '@browser/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { motivoEnvioIrreversivel } from './envio';
import { agirEVer, descreverMudanca, type Leitura } from './mudancas';
import type { DepsPagina } from './tools-pagina';

export const PASSO = z.object({
  acao: z.enum(['clicar', 'preencher', 'esperar', 'teclar']),
  alvo: z.string().optional().describe('clicar/preencher: nome do controle como aparece em ler_estrutura, ex.: "Arquivar"'),
  dentro: z
    .string()
    .optional()
    .describe('texto da linha, item ou janela onde o controle está, quando o nome se repete, ex.: "Padaria Sol"'),
  valor: z.string().optional().describe('preencher: o valor (mesmas regras do preencher)'),
  texto: z.string().optional().describe('esperar: texto que tem de aparecer na página'),
  tecla: z.enum(TECLAS).optional().describe('teclar: a tecla'),
});
export type Passo = z.infer<typeof PASSO>;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** O controle chamado `alvo` entre os que estão escritos em `leitura.texto`. Um só, ou o motivo. */
export function acharAlvo(leitura: Leitura, alvo: string): { campo: Campo } | { erro: string } {
  const naTela = new Set([...leitura.texto.matchAll(/\[ref=(\d+)\]/g)].map((m) => Number(m[1])));
  const visiveis = leitura.campos.filter((c) => naTela.has(c.ref));
  const procurado = semAcento(alvo);
  const exatos = visiveis.filter((c) => semAcento(c.nome) === procurado);
  const achados = exatos.length ? exatos : visiveis.filter((c) => semAcento(c.nome).includes(procurado));
  if (achados.length === 1) return { campo: achados[0]! };
  if (!achados.length) return { erro: `não achei nenhum controle chamado "${alvo}"` };
  return { erro: `há ${achados.length} controles chamados "${alvo}": diga em "dentro" de qual linha, item ou janela é` };
}

// Controle que ainda não apareceu (página carregando, janela abrindo): tenta de novo por ~5 s antes
// de desistir. É a espera automática do Playwright; sem ela a receita de um site lento falhava no
// primeiro passo e a IA gastava mais chamadas do que sem receita.
const ESPERAS_MS = [300, 700, 1500, 2500];
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function registrarToolsPassos(s: McpServer, d: DepsPagina, pausa: (ms: number) => Promise<unknown> = dormir): void {
  s.registerTool(
    'fazer_passos',
    {
      description:
        'Faz VÁRIOS passos numa chamada só, na ordem: clicar, preencher, esperar um texto, teclar. Cada controle é apontado pelo nome (como aparece em ler_estrutura), não pela ref, então serve também para o que só aparece depois de um clique (item de menu, botão de uma janela). Use quando já souber a sequência, ex.: abrir o menu de um item, escolher a opção, confirmar. Para no primeiro passo que não der certo e mostra como a página ficou. Botão de envio final continua barrado.',
      inputSchema: { passos: z.array(PASSO).min(1).max(30) },
    },
    async ({ passos }) => {
      const ler = (filtro?: string) => d.enviar('ler_estrutura', filtro ? { filtro } : {});
      const feito: string[] = [];
      const inicio = await ler();
      let atual: Leitura = inicio;
      let parou = '';

      for (const [i, p] of passos.entries()) {
        const n = i + 1;
        d.status(`Passo ${n} de ${passos.length}…`);
        let acao: (() => Promise<unknown>) | undefined;
        let rotulo = '';
        let nomeDoAlvo: string | undefined;

        if (p.acao === 'clicar' || p.acao === 'preencher') {
          if (!p.alvo || (p.acao === 'preencher' && p.valor === undefined)) parou = `passo ${n}: falta "${p.alvo ? 'valor' : 'alvo'}"`;
          else {
            let r = acharAlvo(p.dentro ? await ler(p.dentro) : atual, p.alvo);
            for (const ms of ESPERAS_MS) {
              if (!('erro' in r) || r.erro.startsWith('há ')) break; // achou, ou o problema é ambiguidade
              await pausa(ms);
              atual = await ler().catch(() => atual);
              r = acharAlvo(p.dentro ? await ler(p.dentro) : atual, p.alvo);
            }
            if ('erro' in r) parou = `passo ${n}: ${r.erro}${p.dentro ? ` dentro de "${p.dentro}"` : ''}`;
            else {
              const { campo } = r;
              nomeDoAlvo = campo.nome;
              // A mesma guarda do `clicar`: nome de envio final não passa, venha por onde vier.
              const envio = p.acao === 'clicar' ? motivoEnvioIrreversivel(campo) : null;
              if (envio) {
                d.log(`passo com clique em "${envio}" barrado: envio irreversível`);
                parou = `passo ${n}: "${envio}" é botão de envio final e não foi clicado. Quem aperta é a pessoa: use perguntar_ao_usuario para ela conferir`;
              } else if (p.acao === 'clicar') {
                rotulo = `cliquei em "${campo.nome}"`;
                acao = () => d.enviar('clicar', { ref: campo.ref });
              } else {
                rotulo = `preenchi "${campo.nome}"`;
                acao = () => d.enviar('preencher', { ref: campo.ref, valor: p.valor! });
              }
            }
          }
        } else if (p.acao === 'esperar') {
          rotulo = `esperei ${p.texto ? `"${p.texto}"` : 'a página'}`;
          acao = async () => {
            const r = await d.enviar('esperar', p.texto ? { texto: p.texto } : {});
            if (p.texto && !r.achou) throw new Error(`o texto "${p.texto}" não apareceu`);
          };
        } else if (p.tecla) {
          rotulo = `apertei ${p.tecla}`;
          acao = () => d.enviar('teclar', { tecla: p.tecla! });
        } else parou = `passo ${n}: falta "tecla"`;

        if (!acao) break;
        try {
          const v = await agirEVer(d.enviar, acao);
          if (v.depois) atual = v.depois;
          feito.push(`${n}. ${rotulo}`);
          d.anotar(p.acao, p.acao === 'teclar' ? p.tecla : p.acao === 'esperar' ? undefined : nomeDoAlvo);
        } catch (e) {
          parou = `passo ${n} (${p.acao}${p.alvo ? ` "${p.alvo}"` : ''}): ${e instanceof Error ? e.message : String(e)}`;
          atual = await ler().catch(() => atual);
          break;
        }
      }

      d.definirCampos(new Map(atual.campos.map((c) => [c.ref, c])));
      const partes = [
        feito.length ? `Feito:\n${feito.join('\n')}` : '',
        parou ? `PAROU no ${parou}. Os passos seguintes não foram feitos.` : '',
        descreverMudanca(inicio, atual),
      ];
      return { content: [{ type: 'text' as const, text: partes.filter(Boolean).join('\n\n') }] };
    },
  );
}
