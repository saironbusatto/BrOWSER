// Protocolo ponte <-> extensão (Native Messaging, JSON com prefixo de 4 bytes).

export const HOST_NAME = 'com.browser.bridge';

export type Campo = {
  ref: number; // backendDOMNodeId do CDP
  papel: string; // role da árvore de acessibilidade
  nome: string; // nome acessível (rótulo)
  valor?: string;
  marcado?: boolean;
  obrigatorio?: boolean;
  opcoes?: string[]; // só para <select>
};

export type Comandos = {
  abrir: { args: { url: string }; result: { tabId: number } };
  ler_campos: { args: Record<string, never>; result: { url: string; titulo: string; campos: Campo[] } };
  preencher: { args: { ref: number; valor: string }; result: { valor: string } };
  clicar: { args: { ref: number }; result: { ok: true } };
  // Só para o runner do teste conferir o resultado; não é exposto no MCP.
  avaliar: { args: { expr: string }; result: unknown };
  // Dev: recarrega a extensão após um build (a ponte reinicia junto).
  recarregar: { args: Record<string, never>; result: { ok: true } };
};

export type Cmd = keyof Comandos;

export type Pedido<C extends Cmd = Cmd> = { id: number; cmd: C; args: Comandos[C]['args'] };

export type Resposta =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

// ---- Eventos (têm `tipo`; os comandos acima têm `cmd`) ----

export const IAS = ['agy', 'codex', 'claude'] as const; // ordem padrão do failover (Q8)
export type Ia = (typeof IAS)[number];

// ---- Arquivos e Anexos ----
export type ArquivoAnexo = {
  nome: string;
  tipo: string; // mime type (ex: application/pdf, text/xml, image/png)
  tamanho: number;
  conteudoTexto?: string; // para XML, JSON, CSV, TXT
  dadosBase64?: string; // para PDF, imagens binárias
};

// extensão -> ponte: o usuário escreveu um pedido no painel lateral
export type Pedir = {
  tipo: 'pedido';
  pedidoId: string;
  texto: string;
  tabId: number;
  arquivos?: ArquivoAnexo[];
};

// extensão -> ponte: o usuário respondeu a uma pergunta da IA
export type RespostaUsuario = {
  tipo: 'resposta_usuario';
  pedidoId: string;
  perguntaId: string;
  resposta: string;
  respostasCampos?: Record<string, string>;
};

export type MensagemExtensao = Pedir | RespostaUsuario;

// Papéis no pipeline multiagente concorrente
export type PapelAgente = 'scout' | 'synthesizer' | 'geral';

// ponte -> extensão -> painel
export type Evento =
  | { tipo: 'status'; pedidoId: string; texto: string; agente?: PapelAgente }
  | {
      tipo: 'pergunta';
      pedidoId: string;
      perguntaId: string;
      pergunta: string;
      campos?: string[];
      opcoes?: string[];
    }
  | { tipo: 'resultado'; pedidoId: string; ok: boolean; ia?: Ia; texto: string };

export * from './blueprint';
