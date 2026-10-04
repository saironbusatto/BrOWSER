// Comandos dos conectores (Drive e Gmail pela API). Fora do background.ts para ele não passar
// das 800 linhas; o próximo conector entra aqui.

import type { Cmd, Comandos } from '@browser/shared';
import { buscarNoDrive, conector, conectorConfigurado, textoDoDrive, tokenDoConector } from './conectores';
import { buscarNoGmail, lerEmail } from './gmail';

/**
 * Token de um conector SEM abrir janela: no meio de um pedido, um popup de login do Google
 * surgiria do nada. Sem conexão, a IA ouve isso e segue pela tela do site (skill do Drive).
 */
async function tokenSemJanela(id: 'drive' | 'gmail'): Promise<string> {
  const nome = conector(id)!.nome;
  if (!conectorConfigurado()) throw new Error(`o conector do ${nome} não existe nesta instalação; use o ${nome} pela interface`);
  return tokenDoConector(id, false).catch(() => {
    throw new Error(
      `o ${nome} não está conectado no BrOWSER; use o ${nome} pela interface (ou peça para a pessoa ligar o ${nome} em Planos)`,
    );
  });
}

export const CMDS_CONECTOR = ['buscar_drive', 'ler_drive', 'buscar_gmail', 'ler_gmail'] as const satisfies Cmd[];
type CmdConector = (typeof CMDS_CONECTOR)[number];
export const ehCmdConector = (cmd: string): cmd is CmdConector => (CMDS_CONECTOR as readonly string[]).includes(cmd);

export async function executarConector(cmd: CmdConector, args: unknown): Promise<unknown> {
  switch (cmd) {
    case 'buscar_drive': {
      const a = args as Comandos['buscar_drive']['args'];
      return { arquivos: await buscarNoDrive(await tokenSemJanela('drive'), a.texto, a.limite) };
    }
    case 'ler_drive':
      return textoDoDrive(await tokenSemJanela('drive'), (args as Comandos['ler_drive']['args']).id);
    case 'buscar_gmail': {
      const a = args as Comandos['buscar_gmail']['args'];
      return { emails: await buscarNoGmail(await tokenSemJanela('gmail'), a.consulta, a.limite) };
    }
    case 'ler_gmail':
      return lerEmail(await tokenSemJanela('gmail'), (args as Comandos['ler_gmail']['args']).id);
  }
}
