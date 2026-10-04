import { describe, expect, it } from 'bun:test';
import { motivoEnvioIrreversivel, recusaEnvio, recusaPonto } from '../src/envio';

const botao = (nome: string) => ({ nome, papel: 'button' });
const link = (nome: string) => ({ nome, papel: 'link' });
const texto = (nome: string) => ({ nome, papel: 'textbox' });

describe('Guarda de envio irreversível', () => {
  it('recusa os finais de fluxo, em pt e en', () => {
    for (const nome of [
      'Enviar',
      'Enviar agora',
      'Submit',
      'Finalizar',
      'Concluir',
      'Pagar',
      'Pagar agora',
      'Confirmar pagamento',
      'Confirmar Compra',
      'Efetuar pagamento',
      'Transmitir',
      'Assinar contrato',
      'Cadastrar-se',
      'Criar conta',
      'Send',
      'Finish',
      'Place the order',
      'Pay now',
      'Confirm payment',
      'Checkout',
    ]) {
      expect(motivoEnvioIrreversivel(botao(nome))).toBe(nome);
    }
  });

  it('NÃO engessa a navegação intermediária (o produto depende dela)', () => {
    for (const nome of [
      'Próximo',
      'Avançar',
      'Continuar',
      'Continuar para o pagamento',
      'Voltar',
      'Buscar',
      'Pesquisar',
      'Filtrar',
      'Calcular',
      'Simular',
      'Adicionar item',
      'Selecionar',
      'Salvar rascunho',
      'Revisar',
      'Aplicar filtros',
      'Fechar',
      'Cancelar',
      'Next',
      'Back',
      'Search',
      'Filter',
    ]) {
      expect(motivoEnvioIrreversivel(botao(nome))).toBeNull();
    }
  });

  it('só age sobre ação: um campo chamado "Assinatura" ou "Envio" é texto, não botão', () => {
    expect(motivoEnvioIrreversivel(texto('Assinatura'))).toBeNull();
    expect(motivoEnvioIrreversivel({ nome: 'Envio', papel: 'textbox' })).toBeNull();
    expect(motivoEnvioIrreversivel({ nome: 'Pagar', papel: 'combobox' })).toBeNull();
  });

  it('também protege link e menuitem, que disparam ação igual', () => {
    expect(motivoEnvioIrreversivel(link('Finalizar pedido'))).toBe('Finalizar pedido');
    expect(motivoEnvioIrreversivel({ nome: 'Assinar', papel: 'menuitem' })).toBe('Assinar');
  });

  it('ignora rótulo vazio ou gigante (conteúdo, não controle)', () => {
    expect(motivoEnvioIrreversivel(botao(''))).toBeNull();
    expect(motivoEnvioIrreversivel(botao('   '))).toBeNull();
    expect(motivoEnvioIrreversivel(botao('Enviado'.repeat(30)))).toBeNull();
  });

  it('normaliza espaços antes de casar e devolve o nome já normalizado', () => {
    expect(motivoEnvioIrreversivel(botao('  Confirmar   pagamento '))).toBe('Confirmar pagamento');
  });

  it('a recusa diz o que fazer em vez de só negar', () => {
    const r = recusaEnvio('Enviar');
    expect(r.ok).toBe(false);
    expect(r.pedirConfirmacao).toBe(true);
    expect(r.motivo).toContain('Enviar');
    expect(r.motivo).toContain('perguntar');
  });
});

describe('Clique por ponto: só em área desenhada', () => {
  const sobre = (tags: string[], texto = '') => ({ cadeia: tags.map((tag) => ({ tag })), texto });

  it('canvas, imagem e svg soltos passam', () => {
    expect(recusaPonto(sobre(['canvas', 'div', 'body', 'html']))).toBeNull();
    expect(recusaPonto(sobre(['path', 'svg', 'div', 'body']))).toBeNull();
    expect(recusaPonto(sobre(['img', 'div'], 'Gráfico de vendas'))).toBeNull();
    expect(recusaPonto({ cadeia: [], texto: '' })).toBeNull();
  });

  it('botão, link e campo são recusados e mandados para o clicar com ref', () => {
    for (const tags of [['button'], ['span', 'button', 'form'], ['img', 'a', 'div'], ['input'], ['svg', 'label']]) {
      expect(recusaPonto(sobre(tags))?.motivo).toContain('ler_campos');
    }
  });

  it('papel de controle e área editável também são recusados, em qualquer ancestral', () => {
    expect(recusaPonto({ cadeia: [{ tag: 'canvas' }, { tag: 'div', papel: 'button' }], texto: '' })?.motivo).toContain('button');
    expect(recusaPonto({ cadeia: [{ tag: 'span' }, { tag: 'div', papel: 'menuitem' }], texto: '' })).not.toBeNull();
    expect(recusaPonto({ cadeia: [{ tag: 'p' }, { tag: 'div', editavel: true }], texto: '' })).not.toBeNull();
  });

  it('botão feito de <div>, sem papel: a guarda de envio olha o texto', () => {
    const r = recusaPonto(sobre(['svg', 'div', 'div'], 'Enviar pedido'));
    expect(r).toEqual(recusaEnvio('Enviar pedido'));
    expect(recusaPonto(sobre(['div'], 'Próximo'))).toBeNull();
  });
});
