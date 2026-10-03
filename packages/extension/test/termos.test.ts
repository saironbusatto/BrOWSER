import { describe, expect, it } from 'bun:test';
import { registroDeAceite, termosAceitos, VERSAO_TERMOS } from '../entrypoints/sidepanel/termos';

describe('Termos: portão da primeira vez', () => {
  it('instalação nova (nada guardado) fica trancada', () => {
    expect(termosAceitos(undefined)).toBe(false);
  });

  it('aceite registrado na versão atual libera', () => {
    expect(termosAceitos(registroDeAceite(new Date('2026-10-03T12:00:00Z')))).toBe(true);
  });

  it('aceite de versão antiga ou registro estragado não libera', () => {
    expect(termosAceitos({ versao: VERSAO_TERMOS - 1, em: '2026-01-01' })).toBe(false);
    expect(termosAceitos(true)).toBe(false);
    expect(termosAceitos({ versao: VERSAO_TERMOS })).toBe(false);
  });
});
