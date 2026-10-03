// Tools MCP do Drive pela API (conector do Google, só leitura).
//
// "Qual o CPF de fulano no meu Drive" não se responde abrindo contrato por contrato: a busca do
// Drive já indexou o texto de tudo. Estas tools usam isso direto pela API, sem depender da
// interface (que é o que a skill do Drive ensina pela tela, para quando o conector não está ligado).
//
// Os links que a API devolve entram em `linksConhecidos` da conversa: vieram do Google, não foram
// montados pela IA, então abrir um resultado com `navegar` não vira pergunta (navegacao.ts).

import type { Cmd, Comandos } from '@browser/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Conversa } from './conversas';

export type DepsDrive = {
  enviar: <C extends Cmd>(cmd: C, args: Comandos[C]['args']) => Promise<Comandos[C]['result']>;
  status: (texto: string) => void;
  conversa: () => Conversa | undefined;
};

const texto = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const erro = (e: unknown) => texto({ erro: e instanceof Error ? e.message : String(e) });

export function registrarToolsDrive(s: McpServer, d: DepsDrive): void {
  const conhecer = (link: string) => {
    if (link) d.conversa()?.linksConhecidos.add(link);
  };

  s.registerTool(
    'buscar_no_drive',
    {
      description:
        'Busca no CONTEÚDO dos arquivos do Google Drive da pessoa (não só no nome), pela API. Use primeiro para achar um dado (CPF, CNPJ, contrato, valor, prazo) em vez de abrir arquivo por arquivo. Devolve nome, tipo e link de cada arquivo. Se o Drive não estiver conectado no BrOWSER, use a busca do Drive pela interface.',
      inputSchema: {
        texto: z.string().min(1).describe('O que procurar: nome, CPF, número do contrato… Funciona como a busca do Drive.'),
        limite: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ texto: procurado, limite }) => {
      d.status(`Buscando “${procurado.slice(0, 40)}” no Drive…`);
      try {
        const r = await d.enviar('buscar_drive', { texto: procurado, ...(limite && { limite }) });
        for (const a of r.arquivos) conhecer(a.link);
        return texto(r);
      } catch (e) {
        return erro(e);
      }
    },
  );

  s.registerTool(
    'ler_arquivo_drive',
    {
      description:
        'Lê o texto de um arquivo do Drive pelo id (vindo de buscar_no_drive). Docs, Planilhas e Apresentações do Google e arquivos de texto voltam como texto. PDF e Word voltam só com o link: abra com navegar e leia com ler_pagina.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      d.status('Lendo o arquivo no Drive…');
      try {
        const r = await d.enviar('ler_drive', { id });
        conhecer(r.link);
        return texto(r);
      } catch (e) {
        return erro(e);
      }
    },
  );
}
