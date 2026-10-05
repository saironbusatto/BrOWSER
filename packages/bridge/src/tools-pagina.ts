// Tools MCP da página em que a IA está: ler, preencher e clicar. Saíram do main.ts pelo limite de
// 800 linhas; o main entrega o que só ele sabe (o envio à extensão, o status no painel e o mapa
// de campos lidos, que é o que a guarda de envio consulta).

import type { Campo, Cmd, Comandos } from '@browser/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { motivoEnvioIrreversivel, recusaEnvio } from './envio';
import { agirEVer } from './mudancas';
import type { PassoGuardado } from './receitas';

export type DepsPagina = {
  enviar: <C extends Cmd>(cmd: C, args: Comandos[C]['args']) => Promise<Comandos[C]['result']>;
  status: (texto: string) => void;
  /** Anota o passo na trilha do pedido (receitas.ts). Só ação e nome do controle, nunca valor. */
  anotar: (acao: PassoGuardado['acao'], alvo?: string) => void;
  temPedido: () => boolean;
  /** Campos lidos nesta rodada: só dá para classificar um clique no que foi lido. */
  campos: () => Map<number, Campo>;
  definirCampos: (campos: Map<number, Campo>) => void;
  log: (...a: unknown[]) => void;
};

const texto = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const puro = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const curto = (v: string) => (v.length > 20 ? `${v.slice(0, 18)}…` : v);

/**
 * Faz a ação e diz o que mudou na página (mudancas.ts). A leitura nova vira o mapa de campos:
 * o que apareceu depois do clique já pode ser clicado, e passa pela guarda de envio.
 */
export async function verMudanca<T>(
  d: DepsPagina,
  acao: () => Promise<T>,
  ignorarRefs: number[] = [],
): Promise<{ resultado: T; mudou: string }> {
  const v = await agirEVer(d.enviar, acao, ignorarRefs);
  if (v.depois) d.definirCampos(new Map(v.depois.campos.map((c) => [c.ref, c])));
  return v;
}

export function registrarToolsPagina(s: McpServer, d: DepsPagina): void {
  s.registerTool(
    'ler_campos',
    {
      description:
        'Lê a aba atual do navegador e lista os campos de formulário e botões: ref, papel, rótulo (nome), valor atual, se está marcado e as opções de selects. Chame antes de preencher e de novo no fim para conferir.',
      inputSchema: {},
    },
    async () => {
      d.status('Mapeando elementos e botões da página…');
      const leitura = (await d.enviar('ler_campos', {})) as { url: string; titulo: string; campos: Campo[] };
      // Guarda do clique em envio: só dá para classificar o que foi lido nesta rodada.
      d.definirCampos(new Map(leitura.campos.map((c) => [c.ref, c])));
      return texto(leitura);
    },
  );

  // Leitura única (roteiro, fase 1.2): texto e controles juntos, com hierarquia. Sai em texto
  // puro e não em JSON: é o que a IA lê a cada passo, e cada chave repetida é ficha jogada fora.
  s.registerTool(
    'ler_estrutura',
    {
      description:
        'Lê a página como ela é: texto e controles juntos, na ordem de leitura, com hierarquia (título, tabela, linha, lista, janela) e uma ref em cada coisa clicável ou preenchível. Use PRIMEIRO, antes de qualquer outra leitura: mostra de que linha é cada botão e o que está escrito ao redor. Com `filtro`, devolve só a parte da página que contém aquele texto (use em página grande ou quando a leitura vier cortada).',
      inputSchema: { filtro: z.string().optional().describe('Texto que a parte procurada contém, ex.: "Padaria Sol", "exportar"') },
    },
    async ({ filtro }) => {
      d.status('Lendo a página…');
      const r = await d.enviar('ler_estrutura', filtro ? { filtro } : {});
      // Leitura filtrada acrescenta ao que já se conhece; leitura inteira substitui.
      d.definirCampos(new Map([...(filtro ? d.campos() : []), ...r.campos.map((c) => [c.ref, c] as const)]));
      const corte = r.truncado ? '\n… (página grande, leitura cortada: chame de novo com `filtro`)' : '';
      const vazio = filtro ? `nada na página contém "${filtro}"` : '(página sem conteúdo legível; se for tela desenhada, use ver_tela)';
      return puro(`${r.titulo}\n${r.url}\n\n${r.texto || vazio}${corte}`);
    },
  );

  s.registerTool(
    'preencher',
    {
      description:
        'Preenche UM campo pelo ref. Para mais de um campo use preencher_varios. Datas: AAAA-MM-DD. Select: texto ou valor da opção. Checkbox/radio: "true" para marcar, "false" para desmarcar. Retorna o valor que ficou no campo.',
      inputSchema: { ref: z.number().int().describe('ref do campo'), valor: z.string() },
    },
    async ({ ref, valor }) => {
      d.status(`Preenchendo: ${curto(valor)}`);
      const r = await d.enviar('preencher', { ref, valor });
      d.anotar('preencher', d.campos().get(ref)?.nome);
      return texto(r);
    },
  );

  // Formulário de 12 campos eram 12 idas e voltas à IA (bancada, tarefa `formulario`).
  s.registerTool(
    'preencher_varios',
    {
      description:
        'Preenche VÁRIOS campos numa chamada só: use sempre que houver mais de um campo a preencher. Mesmas regras do preencher (datas AAAA-MM-DD; select pelo texto da opção; caixa e opção de rádio com "true"/"false"). Devolve o valor que ficou em cada campo e o que mais mudou na página (erro de validação, campo que apareceu): não precisa reler para conferir.',
      inputSchema: {
        campos: z
          .array(z.object({ ref: z.number().int(), valor: z.string() }))
          .min(1)
          .max(80),
      },
    },
    async ({ campos }) => {
      d.status(`Preenchendo ${campos.length} campos…`);
      const v = await verMudanca(
        d,
        async () => {
          const linhas: string[] = [];
          for (const c of campos) {
            // Um campo que falha não derruba os outros: a IA recebe o motivo e conserta só aquele.
            const r = await d.enviar('preencher', c).then(
              (ok) => {
                d.anotar('preencher', d.campos().get(c.ref)?.nome);
                return `ref ${c.ref}: "${ok.valor}"`;
              },
              (e) => `ref ${c.ref}: NÃO preenchido (${e instanceof Error ? e.message : String(e)})`,
            );
            linhas.push(r);
          }
          return linhas;
        },
        campos.map((c) => c.ref),
      );
      return puro(`Ficou assim:\n${v.resultado.join('\n')}\n\n${v.mudou}`.trim());
    },
  );

  s.registerTool(
    'clicar',
    {
      description:
        'Clica num elemento pelo ref. Já devolve o que mudou na página depois do clique (menu ou janela que abriu, linha que sumiu, página nova), com as refs novas: não releia a página só para ver o resultado. NUNCA clique em botões que enviam o formulário sem confirmação explícita do usuário.',
      inputSchema: { ref: z.number().int() },
    },
    async ({ ref }) => {
      // Regra de código, não de prompt: clique em envio final é barrado antes de chegar na página.
      const campo = d.campos().get(ref);
      if (!campo) return texto({ erro: `ref ${ref} desconhecida: chame ler_estrutura antes de clicar` });
      const nome = motivoEnvioIrreversivel(campo);
      if (nome) {
        d.log(`clique em "${nome}" barrado: envio irreversível`);
        return texto(recusaEnvio(nome));
      }
      d.status('Navegando / abrindo menu na página…');
      const v = await verMudanca(d, () => d.enviar('clicar', { ref }));
      d.anotar('clicar', campo.nome);
      // Sem leitura (aba sem modo completo, extensão antiga): devolve o que a extensão respondeu.
      return v.mudou ? puro(`Clique feito em "${campo.nome}".\n\n${v.mudou}`) : texto(v.resultado);
    },
  );

  // A ferramenta que faltava. Sem ela a IA respondia "não consigo ler a página" a pedido legítimo,
  // porque só existia ler_campos: ela via os campos do formulário, não o texto. Recusar um
  // pedido que dá para cumprir é a pior resposta que um agente pode dar.
  s.registerTool(
    'ler_pagina',
    {
      description:
        'Lê o TEXTO da aba ativa: a página inteira de uma vez, sem precisar rolar. Use para texto longo (resumir um artigo, responder sobre o que está escrito) ou quando ler_estrutura vier cortada. Campo de senha nunca tem o valor lido. Se o retorno disser que o texto foi cortado, peça o trecho que falta em vez de adivinhar.',
      inputSchema: {
        limite: z
          .number()
          .int()
          .min(500)
          .max(200_000)
          .optional()
          .describe('Máximo de caracteres a devolver (padrão 40000). Aumente só se o texto vier cortado.'),
      },
    },
    async ({ limite }) => {
      if (!d.temPedido()) return texto({ erro: 'Nenhum pedido ativo no momento' });
      const r = (await d.enviar('ler_pagina', limite ? { limite } : {}).catch((e) => ({
        erro: `não consegui ler a página: ${String(e)}`,
      }))) as { url: string; titulo: string; texto: string; truncado: boolean; caracteres: number; erro?: string };
      if (r.erro) return texto(r);
      return texto({
        url: r.url,
        titulo: r.titulo,
        caracteres: r.caracteres,
        truncado: r.truncado,
        texto: r.texto,
        aviso: r.truncado
          ? 'O texto veio cortado. Se a resposta depender do que ficou de fora, chame ler_pagina de novo com um limite maior.'
          : undefined,
      });
    },
  );
}
