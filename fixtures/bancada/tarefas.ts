// Tarefas da bancada (scripts/bancada.ts). Cada uma é um tipo de trabalho que a IA faz no
// navegador, com um resultado que dá para conferir por código. Páginas locais, sem dado real.
//
// Para acrescentar: uma página .html nesta pasta que guarde o resultado em `window.estado` e uma
// entrada aqui. Não mude tarefa que já tem linha de base anotada no roteiro: o número antigo
// deixa de ser comparável.

export type Tarefa = {
  id: string;
  /** O que esta tarefa exercita, para ler o resultado sem abrir a página. */
  exercita: string;
  /** Página aberta antes do pedido (em `a`, http://127.0.0.1:PORTA). */
  pagina: string;
  /** `b` é o mesmo servidor por outro nome (http://localhost:PORTA): outra origem, "outro site". */
  pedido: (b: string) => string;
  /** Avaliada na aba cujo endereço contém `em`; tem de devolver true. Ou um padrão na resposta. */
  confere: { em: string; expr: string } | { resposta: RegExp };
};

const digitos = "(s) => String(s ?? '').replace(/\\D/g, '')";

export const TAREFAS: Tarefa[] = [
  {
    id: 'formulario',
    exercita: 'formulário comprido: texto, select, data, rádio, caixa de marcar; sem enviar',
    pagina: 'formulario.html',
    pedido: () =>
      'Preencha o cadastro do fornecedor: razão social Metalúrgica Araucária Ltda, nome fantasia Araucária, CNPJ 45.987.321/0001-55, inscrição estadual 903.44512-08, e-mail de cobrança financeiro@araucaria.example, telefone (41) 3322-1188, CEP 80010-000, cidade Curitiba, estado Paraná, início do contrato em 01/11/2026, regime Lucro Presumido, e retém ISS na fonte. Não envie.',
    confere: {
      em: 'formulario.html',
      expr: `(() => { const v = valores(); const d = ${digitos};
        return v.razao === 'Metalúrgica Araucária Ltda' && v.fantasia === 'Araucária' && d(v.cnpj) === '45987321000155'
          && d(v.ie) === '9034451208' && v.email === 'financeiro@araucaria.example' && d(v.telefone) === '4133221188'
          && d(v.cep) === '80010000' && v.cidade === 'Curitiba' && v.uf === 'PR' && v.inicio === '2026-11-01'
          && v.regime === 'presumido' && v.retem === 'true' && !estado.enviado; })()`,
    },
  },
  {
    id: 'tabela',
    exercita: 'ação por linha: seis botões "Excluir" iguais, e uma "Padaria Lua" para confundir',
    pagina: 'tabela.html',
    pedido: () => 'Exclua a nota fiscal da Padaria Sol.',
    confere: { em: 'tabela.html', expr: `JSON.stringify(estado.excluidas) === '[1043]' && estado.editadas.length === 0` },
  },
  {
    id: 'menu',
    exercita: 'menu escondido atrás de um botão, depois janela de confirmação',
    pagina: 'menu.html',
    pedido: () => 'Arquive o projeto Atlas.',
    confere: {
      em: 'menu.html',
      expr: `JSON.stringify(estado.arquivados) === '["Atlas"]' && !estado.exportados.length && !estado.duplicados.length`,
    },
  },
  {
    id: 'extracao',
    exercita: 'ler e somar dados espalhados em três páginas, com meses misturados',
    pagina: 'extracao.html',
    pedido: () => 'Qual é a soma dos valores das notas emitidas em setembro de 2026? A lista tem três páginas. Responda com o valor.',
    confere: { resposta: /4[.\s]?317[,.]50?\b/ },
  },
  {
    id: 'div-botao',
    exercita: 'cartão clicável feito de <div>, sem papel: não aparece na leitura de campos',
    pagina: 'div-botao.html',
    pedido: () => 'Escolha o plano Profissional.',
    confere: { em: 'div-botao.html', expr: `estado.plano === 'Profissional'` },
  },
  {
    id: 'lento',
    exercita: 'página que só mostra o dado e o campo 3 segundos depois de abrir',
    pagina: 'lento.html',
    pedido: () => 'Confirme o protocolo desta solicitação.',
    confere: { em: 'lento.html', expr: `estado.confirmado === 'BR-7F3K9-2026'` },
  },
  {
    id: 'canvas',
    exercita: 'tela desenhada: a área só existe como pixel',
    pagina: 'canvas.html',
    pedido: () => 'Selecione a área azul da planta.',
    confere: { em: 'canvas.html', expr: `estado.area === 'azul'` },
  },
  {
    id: 'dois-sites',
    exercita: 'ler num site e preencher em outro, sem enviar',
    pagina: 'cliente.html',
    pedido: (b) =>
      `Abra uma proposta de crédito para este cliente em ${b}/proposta.html, com o CNPJ, o nome do contato e o limite de crédito que estão na ficha. Não envie.`,
    confere: {
      em: 'proposta.html',
      expr: `(() => { const v = valores(); const d = ${digitos};
        return d(v.cnpj) === '12345678000190' && v.contato.trim() === 'Lúcia Prado' && /^8500(00)?$/.test(d(v.limite)) && !estado.enviado; })()`,
    },
  },
  {
    id: 'lista-longa',
    exercita: '240 registros que a tela mostra de 12 em 12: o dado inteiro só existe na resposta do servidor',
    pagina: 'virtual.html',
    pedido: () => 'Quanto a Clínica Vida ainda deve? Some o valor das notas dela que estão em aberto e responda com o total.',
    confere: { resposta: /16[.\s]?157[,.]39/ },
  },
];
