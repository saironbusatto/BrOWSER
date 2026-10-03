// Tools MCP do nível 1: a IA usa o navegador inteiro, não só a aba em que a pessoa estava.
//
// Duas fronteiras, as duas em código:
//   - QUAIS abas: o grupo "BrOWSER" (extensão, utils/grupo-abas.ts). Dentro dele a IA faz o que
//     quiser; fora, a extensão recusa. A pessoa dá permissão arrastando a aba para o grupo.
//   - PARA ONDE o dado vai: a regra de navegação (navegacao.ts). O grupo não resolve isso: dentro
//     dele a IA ainda poderia abrir coletor.com/?d=<dado>. O que não dá para provar seguro vira
//     pergunta no painel, e "não respondeu" conta como não.

import { type Cmd, type Comandos, TECLAS } from '@browser/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Conversa } from './conversas';
import { navegacaoLiberada, urlNavegavel } from './navegacao';

export type DepsNavegador = {
  enviar: <C extends Cmd>(cmd: C, args: Comandos[C]['args']) => Promise<Comandos[C]['result']>;
  status: (texto: string) => void;
  /** Pergunta no painel e devolve a opção escolhida (ou um texto de "não respondeu"). */
  perguntar: (pergunta: string, opcoes: string[]) => Promise<string>;
  conversa: () => Conversa | undefined;
  /** A página mudou: os refs lidos antes não valem mais (e o clique exige ler de novo). */
  paginaMudou: () => void;
};

const PERMITIR = 'Permitir';
const NAO_PERMITIR = 'Não permitir';
const texto = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const semWww = (h: string) => h.toLowerCase().replace(/^www\./, '');

/** Decide se a IA pode ir para `bruta`; pergunta à pessoa quando a regra não libera sozinha. */
async function liberarNavegacao(d: DepsNavegador, bruta: string): Promise<{ url: string } | { erro: string }> {
  const v = urlNavegavel(bruta);
  if (!v.ok) return { erro: v.motivo };
  const c = d.conversa();
  if (!c) return { erro: 'Nenhum pedido ativo no momento' };
  const { links } = await d.enviar('links', {}).catch(() => ({ links: [] as string[] }));
  // Links da página + os que vieram da API do Drive (tools-drive.ts): nenhum foi montado pela IA.
  const contexto = { linksDaPagina: [...links, ...c.linksConhecidos], hostsDaPessoa: c.hostsDaPessoa, hostsAprovados: c.hostsAprovados };
  if (navegacaoLiberada(v.url, contexto)) return { url: v.url.href };
  const host = semWww(v.url.hostname);
  const resposta = await d.perguntar(`A IA quer abrir ${host}, um site que você não citou. Permitir?`, [PERMITIR, NAO_PERMITIR]);
  if (resposta !== PERMITIR)
    return { erro: `A pessoa não permitiu abrir ${host}. Não tente de novo; siga sem esse site ou pergunte o que ela prefere.` };
  c.hostsAprovados.add(host);
  return { url: v.url.href };
}

export function registrarToolsNavegador(s: McpServer, d: DepsNavegador): void {
  s.registerTool(
    'navegar',
    {
      description:
        'Abre um endereço (https://…) na aba em que você está trabalhando. Links que estão na página e sites que a pessoa citou abrem direto; qualquer outro site pede permissão a ela no painel. Depois de navegar, chame ler_campos ou ler_pagina de novo: as refs antigas não valem mais.',
      inputSchema: { url: z.string().describe('Endereço completo, com https://') },
    },
    async ({ url }) => {
      const ok = await liberarNavegacao(d, url);
      if ('erro' in ok) return texto(ok);
      d.status(`Abrindo ${semWww(new URL(ok.url).hostname)}…`);
      const r = await d.enviar('navegar', { url: ok.url });
      d.paginaMudou();
      return texto(r);
    },
  );

  s.registerTool(
    'voltar',
    { description: 'Volta para a página anterior da aba (como o botão Voltar do navegador).', inputSchema: {} },
    async () => {
      d.status('Voltando à página anterior…');
      const r = await d.enviar('voltar', {});
      d.paginaMudou();
      return texto(r);
    },
  );

  s.registerTool(
    'listar_abas',
    {
      description:
        'Lista as abas do seu grupo "BrOWSER" (o seu espaço de trabalho), com título e endereço. As outras abas são da pessoa: só a quantidade aparece.',
      inputSchema: {},
    },
    async () => texto(await d.enviar('listar_abas', {})),
  );

  s.registerTool(
    'abrir_aba',
    {
      description:
        'Abre um endereço numa aba nova e passa a trabalhar nela (a aba anterior continua aberta). Mesma regra de permissão do navegar.',
      inputSchema: { url: z.string().describe('Endereço completo, com https://') },
    },
    async ({ url }) => {
      const ok = await liberarNavegacao(d, url);
      if ('erro' in ok) return texto(ok);
      d.status(`Abrindo ${semWww(new URL(ok.url).hostname)} numa aba nova…`);
      const r = await d.enviar('abrir_aba', { url: ok.url });
      d.paginaMudou();
      return texto(r);
    },
  );

  s.registerTool(
    'usar_aba',
    {
      description:
        'Passa a trabalhar noutra aba do seu grupo (id vindo de listar_abas). Abas fora do grupo são da pessoa: se precisar de uma, peça para ela arrastar a aba para o grupo BrOWSER.',
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => {
      d.status('Trocando de aba…');
      const r = await d.enviar('usar_aba', { id });
      d.paginaMudou();
      return texto(r);
    },
  );

  s.registerTool(
    'fechar_aba',
    {
      description:
        'Fecha uma aba do seu grupo que não serve mais (resultado de busca já lido, página aberta por engano). A última aba do grupo não fecha.',
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => {
      const r = await d.enviar('fechar_aba', { id });
      d.paginaMudou();
      return texto(r);
    },
  );

  s.registerTool(
    'ver_tela',
    {
      description:
        'Tira uma foto do que está visível na aba. Use quando o texto não basta: layout, imagem, gráfico, botão sem rótulo, mensagem de erro que só aparece visualmente.',
      inputSchema: {},
    },
    async () => {
      d.status('Olhando a tela…');
      const r = await d.enviar('ver_tela', {});
      return { content: [{ type: 'image' as const, data: r.base64, mimeType: r.mime }] };
    },
  );

  s.registerTool(
    'esperar',
    {
      description:
        'Espera a página: até um texto aparecer (ex.: "Pedido gerado", resultado de busca) ou, sem texto, só alguns segundos. Máximo 15 s.',
      inputSchema: {
        texto: z.string().optional().describe('Texto que indica que a página terminou de carregar'),
        segundos: z.number().min(1).max(15).optional(),
      },
    },
    async ({ texto: procurado, segundos }) => {
      d.status(procurado ? `Esperando aparecer “${procurado.slice(0, 30)}”…` : 'Esperando a página…');
      return texto(await d.enviar('esperar', { ...(procurado && { texto: procurado }), ...(segundos && { segundos }) }));
    },
  );

  s.registerTool(
    'teclar',
    {
      description:
        'Aperta uma tecla na página: navegar em listas e menus (setas), trocar de campo (Tab), fechar janelas (Escape). Enter não existe aqui de propósito: para confirmar, clique no botão.',
      inputSchema: { tecla: z.enum(TECLAS) },
    },
    async ({ tecla }) => texto(await d.enviar('teclar', { tecla })),
  );

  s.registerTool(
    'rolar',
    {
      description: 'Rola a página (cima, baixo, topo, fim). Útil para listas que carregam ao rolar, antes de ver_tela.',
      inputSchema: { direcao: z.enum(['cima', 'baixo', 'topo', 'fim']) },
    },
    async ({ direcao }) => texto(await d.enviar('rolar', { direcao })),
  );
}
