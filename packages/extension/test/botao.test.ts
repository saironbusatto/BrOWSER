import { describe, expect, it } from 'bun:test';
import { botaoVisivel, type EstadoBotao } from '../entrypoints/sidepanel/botao';

describe('Botão enviar/parar', () => {
  it('ocioso: só enviar, habilitado', () => {
    const v = botaoVisivel({ tipo: 'ocioso' });
    expect(v.enviar.visivel).toBe(true);
    expect(v.enviar.desabilitado).toBe(false);
    expect(v.parar.visivel).toBe(false);
  });

  it('rodando: enviar visível mas travado, parar disponível', () => {
    const v = botaoVisivel({ tipo: 'rodando' });
    expect(v.enviar.desabilitado).toBe(true);
    expect(v.parar.visivel).toBe(true);
    expect(v.parar.desabilitado).toBe(false);
  });

  it('parando: um clique só, sem repetir o pedido de parar', () => {
    const v = botaoVisivel({ tipo: 'parando' });
    expect(v.parar.visivel).toBe(true);
    expect(v.parar.desabilitado).toBe(true);
  });

  it('erro volta a liberar o envio (a pessoa pode tentar de novo)', () => {
    const v = botaoVisivel({ tipo: 'erro', erro: 'x' });
    expect(v.enviar.desabilitado).toBe(false);
    expect(v.parar.visivel).toBe(false);
  });

  it('nunca há dois botões clicáveis ao mesmo tempo (evita pedido novo no meio de um pedido)', () => {
    const estados: EstadoBotao[] = [{ tipo: 'ocioso' }, { tipo: 'rodando' }, { tipo: 'parando' }, { tipo: 'erro', erro: 'x' }];
    for (const e of estados) {
      const v = botaoVisivel(e);
      const pararClicavel = v.parar.visivel && !v.parar.desabilitado;
      const enviarClicavel = v.enviar.visivel && !v.enviar.desabilitado;
      expect(pararClicavel && enviarClicavel).toBe(false);
    }
  });

  it('no único estado sem ação possível ("parando"), a UI diz isso explicitamente', () => {
    // Durante o parada nenhum botão responde de propósito. O que não pode é a pessoa achar que
    // pode enviar de novo: os dois ficam desabilitados E o título diz "Parando…".
    const v = botaoVisivel({ tipo: 'parando' });
    expect(v.enviar.desabilitado).toBe(true);
    expect(v.parar.desabilitado).toBe(true);
    expect(v.enviar.titulo).toBe('Parando…');
    expect(v.parar.titulo).toBe('Parando…');
  });

  it('nos outros três estados há sempre exatamente um caminho para agir', () => {
    for (const e of [{ tipo: 'ocioso' } as EstadoBotao, { tipo: 'rodando' } as EstadoBotao, { tipo: 'erro', erro: 'x' } as EstadoBotao]) {
      const v = botaoVisivel(e);
      const clicaveis = [v.enviar, v.parar].filter((b) => b.visivel && !b.desabilitado);
      expect(clicaveis.length).toBe(1);
    }
  });

  it('parado e erro são o mesmo para o usuário: pode tentar de novo', () => {
    for (const e of [{ tipo: 'ocioso' } as EstadoBotao, { tipo: 'erro', erro: 'x' } as EstadoBotao]) {
      const v = botaoVisivel(e);
      expect(v.enviar.desabilitado).toBe(false);
      expect(v.parar.visivel).toBe(false);
    }
  });

  it('o botão de parar sempre deixa claro que a IA não clica em nada', () => {
    expect(botaoVisivel({ tipo: 'rodando' }).parar.titulo).toContain('não vai clicar');
  });
});
