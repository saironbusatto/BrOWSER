import { describe, expect, it } from 'bun:test';
import { anotar, MAX_REGISTROS, novaConversa, pedidoEmAndamento, type Registro } from '../utils/conversa-log';

describe('Conversa no background', () => {
  it('anotar não mexe na conversa anterior', () => {
    const c = novaConversa();
    const d = anotar(c, { tipo: 'eu', texto: 'oi' });
    expect(c.registros).toHaveLength(0);
    expect(d.registros).toHaveLength(1);
    expect(d.conversaId).toBe(c.conversaId);
  });

  it('acima do teto, saem os registros mais velhos', () => {
    let c = novaConversa();
    for (let i = 0; i < MAX_REGISTROS + 5; i++) c = anotar(c, { tipo: 'eu', texto: String(i) });
    expect(c.registros).toHaveLength(MAX_REGISTROS);
    expect(c.registros[0]).toEqual({ tipo: 'eu', texto: '5' });
  });

  it('o painel reabre ocupado só se o último pedido ainda não terminou', () => {
    const inicio = (id: string): Registro => ({ tipo: 'inicio', pedidoId: id });
    const fim = (id: string): Registro => ({ tipo: 'resultado', pedidoId: id, ok: true, texto: 'ok' });
    expect(pedidoEmAndamento([inicio('a'), fim('a')])).toBeUndefined();
    expect(pedidoEmAndamento([inicio('a'), fim('a'), inicio('b')])).toBe('b');
    expect(pedidoEmAndamento([inicio('a'), { tipo: 'parado', pedidoId: 'a', texto: 'x' }])).toBeUndefined();
    // Resultado atrasado de um pedido velho não encerra o pedido novo.
    expect(pedidoEmAndamento([inicio('a'), inicio('b'), fim('a')])).toBe('b');
  });
});
