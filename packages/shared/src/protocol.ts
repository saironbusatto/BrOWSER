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
  // `type=password` (ou outro campo de segredo). O valor NUNCA é lido: o campo continua
  // preenchível, mas `valor` fica de fora e a ponte sabe que é sensível ao Mostrar.
  sensivel?: boolean;
};

export type Comandos = {
  abrir: { args: { url: string }; result: { tabId: number } };
  ler_campos: { args: Record<string, never>; result: { url: string; titulo: string; campos: Campo[] } };
  preencher: { args: { ref: number; valor: string }; result: { valor: string } };
  clicar: { args: { ref: number }; result: { ok: true } };
  // Texto da página inteira. A IA só tinha os campos, e por isso recusava "resume esta página".
  ler_pagina: {
    args: { limite?: number };
    result: { url: string; titulo: string; texto: string; truncado: boolean; caracteres: number };
  };
  // ---- Nível 1: o navegador inteiro (docs/estudo-alcance-do-agente.md) ----
  // Sempre na aba alvo. Para onde ir é decidido na ponte (navegacao.ts); a extensão só recusa o
  // que não é http/https, como segunda trava.
  navegar: { args: { url: string }; result: InfoAba };
  voltar: { args: Record<string, never>; result: InfoAba };
  listar_abas: { args: Record<string, never>; result: { abas: (InfoAba & { id: number; alvo: boolean })[] } };
  abrir_aba: { args: { url: string }; result: InfoAba & { id: number } };
  usar_aba: { args: { id: number }; result: InfoAba };
  ver_tela: { args: Record<string, never>; result: { mime: string; base64: string } };
  esperar: { args: { texto?: string; segundos?: number }; result: { achou: boolean; esperouMs: number } };
  teclar: { args: { tecla: Tecla }; result: { ok: true } };
  rolar: { args: { direcao: 'cima' | 'baixo' | 'topo' | 'fim' }; result: { y: number; alturaTotal: number } };
  // Interno da ponte (não vai para o MCP): os links da página, para a regra de navegação.
  links: { args: Record<string, never>; result: { links: string[] } };
  // Só para o runner do teste conferir o resultado; não é exposto no MCP.
  avaliar: { args: { expr: string }; result: unknown };
  // Dev: recarrega a extensão após um build (a ponte reinicia junto).
  recarregar: { args: Record<string, never>; result: { ok: true } };
  // Dev/teste: faz a aba alvo usar o plano B (DOM) como se o chrome.debugger estivesse bloqueado.
  forcar_modo_dom: { args: Record<string, never>; result: { ok: true } };
};

export type InfoAba = { url: string; titulo: string };

// Sem Enter de propósito: Enter num formulário envia, e isso furaria a trava de envio final
// (envio.ts), que só olha cliques. Para confirmar, a IA clica, e o clique passa pela trava.
export const TECLAS = [
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Backspace',
] as const;
export type Tecla = (typeof TECLAS)[number];

export type Cmd = keyof Comandos;

export type Pedido<C extends Cmd = Cmd> = { id: number; cmd: C; args: Comandos[C]['args'] };

export type Resposta = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

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

// extensão -> ponte: o usuário pediu para PARAR o pedido em andamento
export type Parar = {
  tipo: 'parar';
  pedidoId: string;
};

// extensão -> ponte: o usuário escreveu um pedido no painel lateral
export type Pedir = {
  tipo: 'pedido';
  pedidoId: string;
  texto: string;
  tabId: number;
  arquivos?: ArquivoAnexo[];
  // Contas que a pessoa conectou pelo BrOWSER, a ativa primeiro (ordem do failover). O painel
  // sempre manda; ausente só no caminho de teste/spike, que usa a ordem padrão.
  ias?: Ia[];
  // Conversa do painel (a lixeira começa outra). Com ela a ponte retoma a sessão do CLI, e a
  // segunda mensagem sabe o que a primeira pediu.
  conversaId?: string;
};

// extensão -> ponte: o usuário respondeu a uma pergunta da IA
export type RespostaUsuario = {
  tipo: 'resposta_usuario';
  pedidoId: string;
  perguntaId: string;
  resposta: string;
  respostasCampos?: Record<string, string>;
};

// extensão -> ponte: telemetria passiva de formulário aprendida pelo content script
export type TelemetriaBlueprint = {
  tipo: 'telemetria_blueprint';
  blueprint: import('./blueprint').SiteBlueprint;
};

export type ItemAssinatura = {
  ia: Ia;
  nome: string; // "Google AI Pro", "ChatGPT Plus / Pro", "Claude Pro" — o que a pessoa reconhece
  instalado: boolean;
  conectado: boolean;
  ativo: boolean;
  detalhe?: string; // "demorou para responder", "CLI ausente" — senão "desconectado" caluniando
  // Preenchidos por main.ts depois de obterStatusAssinaturas: cada card leva só os modelos da
  // própria IA (agy não oferece modelo do claude). Opcional porque assinaturas.ts monta o card
  // antes de o catálogo ser consultado.
  modelo?: string;
  modelos?: ModeloInfo[];
};

/** Uma opção do <select> de modelo. */
export type ModeloInfo = {
  id: string;
  nome: string;
  rapido?: boolean; // default sugerido: barato para preencher formulário
  forte?: boolean; // raciocínio pesado, para quando compensa esperar
};

// extensão -> ponte: consultar status das assinaturas
export type ConsultarAssinaturas = {
  tipo: 'consultar_assinaturas';
};

// extensão -> ponte: escolher o modelo da assinatura ativa.
// Aceita id fora da lista: o campo de texto sempre passa. A lista é conveniência, não portão.
export type DefinirModelo = {
  tipo: 'definir_modelo';
  ia: Ia;
  modelo: string;
};

// extensão -> ponte: disparar login oficial de uma assinatura
export type ConectarAssinatura = {
  tipo: 'conectar_assinatura';
  ia: Ia;
};

// extensão -> ponte: definir assinatura preferencial ativa
export type AtivarAssinatura = {
  tipo: 'ativar_assinatura';
  ia: Ia;
};

// extensão -> ponte: o usuário colou o código que a página de login exibiu (fluxo sem device code)
export type ResponderCodigo = {
  tipo: 'login_codigo';
  ia: Ia;
  codigo: string;
};

// extensão -> ponte: sair de todas as contas conectadas
export type DesconectarTodos = {
  tipo: 'desconectar_todos';
};

// extensão -> ponte: sair de UMA conta, sem tocar nas outras.
export type DesconectarAssinatura = {
  tipo: 'desconectar_assinatura';
  ia: Ia;
};

export type MensagemExtensao =
  | Pedir
  | RespostaUsuario
  | Parar
  | TelemetriaBlueprint
  | ConsultarAssinaturas
  | ConectarAssinatura
  | DesconectarAssinatura
  | AtivarAssinatura
  | DefinirModelo
  | ResponderCodigo
  | DesconectarTodos;

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
  | { tipo: 'resultado'; pedidoId: string; ok: boolean; ia?: Ia; texto: string }
  // A pessoa apertou Parar: não é falha da IA, é a soberania do usuário (Termos §7.3).
  | { tipo: 'parado'; pedidoId: string; ia?: Ia; texto: string }
  | { tipo: 'status_assinaturas'; assinaturas: ItemAssinatura[]; iaAtiva: Ia }
  // O CLI oficial do login foi escondido: a ponte manda para o painel só o que importa
  // (link + código), e o painel devolve o código colado quando o fluxo não tem device code.
  | { tipo: 'login_ia'; ia: Ia; nome: string; url: string; codigo?: string; pedeCodigo: boolean; expiraEmSegundos?: number }
  | { tipo: 'login_fim'; ia: Ia; nome: string; ok: boolean; mensagem: string }
  | { tipo: 'logout_fim'; ok: number; falhou: string[] };

export * from './blueprint';
