import { describe, expect, it } from 'bun:test';
import { IAS, type ItemAssinatura } from '@browser/shared';
import { contaAtiva, largarConta, lerContas, usarConta, visaoConta } from '../entrypoints/sidepanel/contas';

const item = (ia: ItemAssinatura['ia'], conectado: boolean): ItemAssinatura => ({
  ia,
  nome: ia,
  instalado: true,
  conectado,
  ativo: false,
});

describe('Contas: primeira experiência', () => {
  it('CLI logado na máquina não basta: sem a pessoa conectar, nada aparece ligado', () => {
    const assinaturas = [item('agy', true), item('codex', true)];
    expect(contaAtiva([], assinaturas)).toBeUndefined();
    expect(visaoConta('agy', [], assinaturas)).toEqual({ conectado: false, ativo: false });
  });

  it('a primeira liberada que o CLI confirma é a ativa; as outras só conectadas', () => {
    const assinaturas = [item('agy', false), item('codex', true), item('claude', true)];
    const liberadas = usarConta(usarConta([], 'claude'), 'agy'); // agy na frente, mas deslogou
    expect(contaAtiva(liberadas, assinaturas)).toBe('claude');
    expect(visaoConta('agy', liberadas, assinaturas)).toEqual({ conectado: false, ativo: false });
    expect(visaoConta('claude', liberadas, assinaturas)).toEqual({ conectado: true, ativo: true });
    expect(visaoConta('codex', liberadas, assinaturas).conectado).toBe(false);
  });

  it('usar e largar não duplicam nem mexem na lista original', () => {
    const base = ['agy', 'codex'] as const;
    expect(usarConta(base, 'codex')).toEqual(['codex', 'agy']);
    expect(largarConta(base, 'agy')).toEqual(['codex']);
    expect(base).toEqual(['agy', 'codex']);
  });

  it('storage estragado vira lista vazia ou filtrada', () => {
    expect(lerContas(undefined, IAS)).toEqual([]);
    expect(lerContas('agy', IAS)).toEqual([]);
    expect(lerContas(['agy', 'gpt', 'agy', 3], IAS)).toEqual(['agy']);
  });
});
