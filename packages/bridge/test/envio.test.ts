import { describe, expect, it } from 'bun:test';
import { motivoEnvioIrreversivel, recusaEnvio } from '../src/envio';

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
