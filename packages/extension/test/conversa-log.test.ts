import { describe, expect, it } from 'bun:test';
import {
  anotar,
  anotarNaConversa,
  ehEventoDoPedido,
  lerConversa,
  MAX_REGISTROS,
  novaConversa,
  pedidoEmAndamento,
  type Registro,
  recomecarConversa,
} from '../utils/conversa-log';

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

describe('Conversa guardada no chrome.storage.session', () => {
  // storage.session falso: o que o background grava é o que o painel vai ler ao reabrir.
  const guardado: Record<string, unknown> = {};
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      session: {
        get: async (k: string) => ({ [k]: guardado[k] }),
        set: async (o: Record<string, unknown>) => {
          // Escrita lenta de propósito: duas anotações seguidas se atropelariam sem a fila.
          await new Promise((r) => setTimeout(r, 5));
          Object.assign(guardado, structuredClone(o));
        },
      },
    },
  };

  it('anotações seguidas, sem esperar uma pela outra, não se perdem', async () => {
    const id = (await lerConversa()).conversaId;
    await Promise.all([
      anotarNaConversa({ tipo: 'eu', texto: 'um' }),
      anotarNaConversa({ tipo: 'inicio', pedidoId: 'p1' }),
      anotarNaConversa({ tipo: 'status', pedidoId: 'p1', texto: 'lendo' }),
    ]);
    const salvo = guardado.conversa as { conversaId: string; registros: Registro[] };
    expect(salvo.conversaId).toBe(id);
    expect(salvo.registros.map((r) => r.tipo)).toEqual(['eu', 'inicio', 'status']);
  });

  it('recomeçar troca o id (a IA esquece) e zera os registros', async () => {
    const antes = (await lerConversa()).conversaId;
    const nova = await recomecarConversa();
    expect(nova.conversaId).not.toBe(antes);
    expect((guardado.conversa as { registros: unknown[] }).registros).toHaveLength(0);
  });

  it('só eventos de pedido entram no registro', () => {
    expect(ehEventoDoPedido({ tipo: 'status' })).toBe(true);
    expect(ehEventoDoPedido({ tipo: 'resultado' })).toBe(true);
    expect(ehEventoDoPedido({ tipo: 'status_assinaturas' })).toBe(false);
    expect(ehEventoDoPedido({ tipo: 'login_ia' })).toBe(false);
  });
});
