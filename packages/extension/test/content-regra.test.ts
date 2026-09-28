import { describe, expect, it } from 'bun:test';
import { opcaoEstrutural, SELETOR_CAMPOS, siteSensivel, textoEstrutural } from '../utils/content-regra';

describe('Telemetria passiva: o que pode entrar no mapa público', () => {
  it('nunca aprende login nem pagamento', () => {
    for (const host of [
      'login.microsoftonline.com',
      'accounts.google.com',
      'id.microsoftonline.com',
      'www.bb.com.br',
      'app.stripe.com',
      'www.paypal.com',
      'checkout.mercadolivre.com.br',
      'appleid.apple.com',
      'www.netflix.com',
    ]) {
      expect(siteSensivel(host)).toBe(true);
    }
  });

  it('ainda aprende os sites onde o mapa serve (fiscal, ERP, prefeitura)', () => {
    for (const host of [
      'www.gov.br',
      'app.receita.fazenda.gov.br',
      'nfe.fazenda.pr.gov.br',
      'erp.minhaempresa.com.br',
      'localhost',
      'localhost:5173',
      'www.sistemas Tribo',
    ].map((h) => h.toLowerCase())) {
      expect(siteSensivel(host)).toBe(false);
    }
  });

  it('mascara PII em rótulo em vez de descartar o campo', () => {
    expect(textoEstrutural('E-mail: joana@empresa.com.br')).toBe('E-mail: [email]');
    expect(textoEstrutural('CPF 123.456.789-00')).toBe('CPF [cpf]');
    expect(textoEstrutural('CNPJ 12.345.678/0001-99')).toBe('CNPJ [cnpj]');
    expect(textoEstrutural('Telefone (11) 98765-4321')).toBe('Telefone [telefone]');
  });

  it('preserva o rótulo normal (o mapa é isto) e normaliza espaços', () => {
    expect(textoEstrutural('  Razão   Social  ')).toBe('Razão Social');
    expect(textoEstrutural('CEP')).toBe('CEP');
    expect(textoEstrutural('Inscrição Estadual')).toBe('Inscrição Estadual');
  });

  it('descarta conteúdo, não estrutura', () => {
    expect(textoEstrutural('resultado da busca em https://exemplo.com/x')).toBeNull();
    expect(textoEstrutural('x'.repeat(200))).toBeNull();
    expect(textoEstrutural('')).toBeNull();
    expect(textoEstrutural(null)).toBeNull();
    expect(textoEstrutural(undefined)).toBeNull();
  });

  it('opção que virou só marcador é descartada (não ocupa o lugar de "São Paulo")', () => {
    expect(opcaoEstrutural('Rua das Flores, 123, CEP 01310-100')).toBeNull();
    expect(opcaoEstrutural('Conta: joana@x.com')).toBeNull();
    expect(opcaoEstrutural('São Paulo')).toBe('São Paulo');
    expect(opcaoEstrutural('Rio de Janeiro')).toBe('Rio de Janeiro');
  });

  it('o seletor nunca inclui campo de senha nem botão', () => {
    expect(SELETOR_CAMPOS).toContain(':not([type="password"])');
    expect(SELETOR_CAMPOS).toContain(':not([type="hidden"])');
    expect(SELETOR_CAMPOS).toContain(':not([type="submit"])');
  });
});
