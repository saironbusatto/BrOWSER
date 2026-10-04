import { describe, expect, it } from 'bun:test';
import { linhaDoCampo, montarEstrutura, type NoAX } from '../utils/arvore';

// Monta nós de acessibilidade a partir de uma árvore escrita à mão: [papel, nome?, extras?, filhos?].
type Mini = [string, string?, Partial<NoAX>?, Mini[]?];
function arvore(raiz: Mini): NoAX[] {
  const nos: NoAX[] = [];
  let seq = 0;
  const criar = ([papel, nome, extras, filhos]: Mini): string => {
    const nodeId = String(++seq);
    const no: NoAX = {
      nodeId,
      role: { value: papel },
      backendDOMNodeId: 100 + seq,
      ...(nome !== undefined && { name: { value: nome } }),
      ...extras,
    };
    nos.push(no);
    no.childIds = (filhos ?? []).map(criar);
    return nodeId;
  };
  criar(raiz);
  return nos;
}
const texto = (s: string): Mini => ['StaticText', s];
const celula = (s: string): Mini => ['cell', s, {}, [texto(s)]];

describe('montarEstrutura: a página como a IA precisa ler', () => {
  it('tabela: cada botão aparece dentro da linha a que pertence', () => {
    const linha = (n: string, cliente: string): Mini => [
      'row',
      `${n} ${cliente} Editar Excluir`,
      {},
      [
        celula(n),
        celula(cliente),
        [
          'cell',
          '',
          {},
          [
            ['button', 'Editar'],
            ['button', 'Excluir'],
          ],
        ],
      ],
    ];
    const r = montarEstrutura(
      arvore([
        'RootWebArea',
        'Notas',
        {},
        [
          ['heading', 'Notas fiscais', {}, [texto('Notas fiscais')]],
          ['table', '', {}, [linha('1043', 'Padaria Sol'), linha('1045', 'Padaria Lua')]],
        ],
      ]),
    );
    const linhas = r.texto.split('\n');
    expect(linhas[0]).toBe('título: Notas fiscais');
    expect(linhas[1]).toBe('tabela');
    expect(linhas[2]).toBe('  linha: 1043 | Padaria Sol');
    expect(linhas[3]).toMatch(/^ {4}botão "Editar" \[ref=\d+\]$/);
    expect(linhas[4]).toMatch(/^ {4}botão "Excluir" \[ref=\d+\]$/);
    expect(linhas[5]).toBe('  linha: 1045 | Padaria Lua');
    // Os controles saem também como lista: é por ela que a ponte confere cada clique.
    expect(r.campos.map((c) => c.nome)).toEqual(['Editar', 'Excluir', 'Editar', 'Excluir']);
    expect(new Set(r.campos.map((c) => c.ref)).size).toBe(4);
  });

  it('contêiner sem significado some, e o texto solto fica na ordem em que aparece', () => {
    const r = montarEstrutura(
      arvore([
        'RootWebArea',
        '',
        {},
        [
          ['generic', '', {}, [texto('Antes')]],
          ['button', 'Salvar'],
          ['generic', '', { ignored: true }, [['paragraph', '', {}, [texto('Depois'), texto('do botão')]]]],
        ],
      ]),
    );
    expect(r.texto).toBe('Antes\nbotão "Salvar" [ref=104]\nDepois do botão');
  });

  it('campos: valor, obrigatório, marcado, opções do select; senha nunca tem valor', () => {
    const r = montarEstrutura(
      arvore([
        'form',
        'Cadastro',
        {},
        [
          ['textbox', 'Razão social', { value: { value: 'Araucária' }, properties: [{ name: 'required', value: { value: true } }] }],
          ['checkbox', 'Retém ISS', { properties: [{ name: 'checked', value: { value: 'false' } }] }],
          [
            'combobox',
            'Estado',
            { value: { value: 'Selecione' } },
            [
              [
                'MenuListPopup',
                '',
                {},
                [
                  ['option', 'São Paulo'],
                  ['option', 'Paraná'],
                ],
              ],
            ],
          ],
          ['textbox', 'Senha', { value: { value: 'hunter2' }, properties: [{ name: 'protected', value: { value: true } }] }],
        ],
      ]),
    );
    expect(r.texto).toContain('formulário "Cadastro"');
    expect(r.texto).toContain('campo "Razão social" [ref=102] = "Araucária" (obrigatório)');
    expect(r.texto).toContain('caixa "Retém ISS" [ref=103] (desmarcado)');
    expect(r.texto).toContain('seleção "Estado" [ref=104] = "Selecione" opções: São Paulo | Paraná');
    expect(r.texto).toContain('campo "Senha" [ref=108] (senha: valor oculto)');
    expect(r.texto).not.toContain('hunter2');
    expect(r.campos.find((c) => c.nome === 'Senha')).toEqual({ ref: 108, papel: 'textbox', nome: 'Senha', sensivel: true });
  });

  it('cartão clicável sem papel entra como "clicável", e para a guarda de envio vale como botão', () => {
    const nos = arvore(['RootWebArea', '', {}, [['generic', '', { ignored: true }, [texto('Profissional'), texto('R$ 79/mês')]]]]);
    const r = montarEstrutura(nos, { clicaveis: new Set([nos[1]!.backendDOMNodeId!]) });
    expect(r.texto).toBe(`clicável "Profissional R$ 79/mês" [ref=${nos[1]!.backendDOMNodeId}]`);
    expect(r.campos[0]!.papel).toBe('button');
  });

  it('filtro: só a parte da página que interessa, com o que há dentro e o caminho até ela', () => {
    const item = (nome: string): Mini => ['listitem', '', {}, [texto(`Projeto ${nome}`), ['button', `Mais opções do projeto ${nome}`]]];
    const nos = arvore([
      'RootWebArea',
      '',
      {},
      [
        ['heading', 'Projetos', {}, [texto('Projetos')]],
        ['list', '', {}, [item('Boreal'), item('Atlas')]],
      ],
    ]);
    const r = montarEstrutura(nos, { filtro: 'ATLÁS' });
    expect(r.texto).toBe('lista\n  item: Projeto Atlas\n    botão "Mais opções do projeto Atlas" [ref=110]');
    expect(montarEstrutura(nos, { filtro: 'não existe' }).texto).toBe('');
  });

  it('janela e menu aparecem com nome; página grande é cortada em linha inteira e avisa', () => {
    const r = montarEstrutura(
      arvore([
        'RootWebArea',
        '',
        {},
        [['dialog', 'Confirmar', {}, [texto('Arquivar o projeto?'), ['button', 'Cancelar'], ['button', 'Arquivar projeto']]]],
      ]),
    );
    expect(r.texto.split('\n')[0]).toBe('janela "Confirmar"');
    expect(r.texto).toContain('  Arquivar o projeto?');

    const muitos: Mini[] = Array.from({ length: 50 }, (_, i) => ['button', `Botão ${i}`] as Mini);
    const curto = montarEstrutura(arvore(['RootWebArea', '', {}, muitos]), { limite: 200 });
    expect(curto.truncado).toBe(true);
    expect(curto.texto.length).toBeLessThanOrEqual(200);
    expect(curto.texto.endsWith(']')).toBe(true);
  });

  it('lista de opções mostra as opções como linhas; texto invisível e peças internas não entram', () => {
    const r = montarEstrutura(
      arvore([
        'RootWebArea',
        '',
        {},
        [
          [
            'listbox',
            'Plano',
            {},
            [
              ['option', 'Básico'],
              ['option', 'Pro'],
            ],
          ],
          ['StaticText', 'oculto', { ignored: true }],
          ['InlineTextBox', 'x'],
          ['img', 'Logo'],
        ],
      ]),
    );
    expect(r.texto).toBe(
      'lista de opções "Plano" [ref=102] opções: Básico | Pro\n  opção "Básico" [ref=103]\n  opção "Pro" [ref=104]\nimagem "Logo"',
    );
  });
});

describe('montarEstrutura: o que atrapalhava a IA no formulário', () => {
  it('campo de data volta a ser um campo só, com o formato que o preencher aceita', () => {
    const nos = arvore([
      'RootWebArea',
      '',
      {},
      [
        [
          'Date',
          'Início do contrato',
          {},
          [['spinbutton', 'Dia'], texto('/'), ['spinbutton', 'Mês'], ['button', 'Mostrar seletor de datas']],
        ],
      ],
    ]);
    const data = nos[1]!.backendDOMNodeId!;
    const r = montarEstrutura(nos, { nativos: new Map([[data, { tipo: 'date', valor: '2026-11-01' }]]) });
    expect(r.texto).toBe(`data (AAAA-MM-DD) "Início do contrato" [ref=${data}] = "2026-11-01"`);
    expect(r.campos).toEqual([{ ref: data, papel: 'date', nome: 'Início do contrato', valor: '2026-11-01' }]);
  });

  it('rótulo ao lado do campo que ele nomeia não aparece duas vezes; célula vazia de verdade vira —', () => {
    const r = montarEstrutura(
      arvore([
        'form',
        '',
        {},
        [
          ['LabelText', '', {}, [texto('CNPJ'), ['textbox', 'CNPJ']]],
          ['LabelText', '', {}, [['checkbox', 'Retém ISS na fonte'], texto('Retém ISS na fonte')]],
          ['group', 'Regime', {}, [texto('Regime'), ['radio', 'Simples']]],
          ['table', '', {}, [['row', '', {}, [celula('A'), ['cell', '', {}, []]]]]],
        ],
      ]),
    );
    expect(r.texto).toBe(
      [
        'formulário',
        '  campo "CNPJ" [ref=104]',
        '  caixa "Retém ISS na fonte" [ref=106]',
        '  grupo "Regime"',
        '    opção "Simples" [ref=110]',
        '  tabela',
        '    linha: A | —',
      ].join('\n'),
    );
  });
});

describe('linhaDoCampo', () => {
  it('papel desconhecido usa o próprio nome do papel; muitas opções são cortadas', () => {
    expect(linhaDoCampo({ ref: 1, papel: 'meter', nome: 'Nível' })).toBe('meter "Nível" [ref=1]');
    const opcoes = Array.from({ length: 40 }, (_, i) => String(i));
    expect(linhaDoCampo({ ref: 2, papel: 'combobox', nome: 'N', opcoes })).toEndWith('29 | …');
  });
});
