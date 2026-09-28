// Escolha do botão que o painel mostra enquanto um pedido roda.
//
// Extraído do painel para ter regra própria e testada: o botão de enviar e o de parar dividem o
// mesmo lugar, e o erro clássico aqui é o painel mandar `parar` quando não há pedido nenhum, ou
// ficar travado em "parar" depois que a IA acabou.

export type EstadoBotao =
  | { tipo: 'ocioso' }
  | { tipo: 'rodando' }
  | { tipo: 'parando' } // pedido recebido, ponte ainda não confirmou
  | { tipo: 'erro'; erro: string };

/** A partir do estado, o que o painel deve mostrar. Função pura: dá para testar sem DOM. */
export function botaoVisivel(estado: EstadoBotao): {
  enviar: { visivel: true; desabilitado: boolean; titulo: string };
  parar: { visivel: boolean; desabilitado: boolean; titulo: string };
} {
  switch (estado.tipo) {
    case 'ocioso':
      return {
        enviar: { visivel: true, desabilitado: false, titulo: 'Enviar mensagem' },
        parar: { visivel: false, desabilitado: true, titulo: 'Parar agora' },
      };
    case 'rodando':
      return {
        enviar: { visivel: true, desabilitado: true, titulo: 'A IA está trabalhando…' },
        parar: { visivel: true, desabilitado: false, titulo: 'Parar agora (a IA não vai clicar em nada)' },
      };
    case 'parando':
      return {
        enviar: { visivel: true, desabilitado: true, titulo: 'Parando…' },
        // Desabilitado para não acumular cliques: um só `parar` já foi enviado.
        parar: { visivel: true, desabilitado: true, titulo: 'Parando…' },
      };
    case 'erro':
      return {
        enviar: { visivel: true, desabilitado: false, titulo: 'Enviar mensagem' },
        parar: { visivel: false, desabilitado: true, titulo: 'Parar agora' },
      };
  }
}
