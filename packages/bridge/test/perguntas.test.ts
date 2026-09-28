import { describe, expect, it } from 'bun:test';
import { motivoPerguntaVaga } from '../src/perguntas';

describe('perguntas da IA ao usuário', () => {
  it('recusa pergunta vaga (o caso real: "teste")', () => {
    for (const pergunta of ['teste', 'ok', '?', '   ', 'CPF?', 'qual opção?']) {
      expect(motivoPerguntaVaga({ pergunta })).toContain('Reescreva');
    }
  });

  it('deixa passar pergunta que se sustenta sozinha', () => {
    expect(motivoPerguntaVaga({ pergunta: "Qual opção escolher em 'Primary Discovery Channel'?" })).toBeNull();
    expect(motivoPerguntaVaga({ pergunta: 'Qual é o seu CPF para o campo "CPF do titular"?' })).toBeNull();
  });

  it('a recusa cita a pergunta vaga para a IA saber o que corrigir', () => {
    expect(motivoPerguntaVaga({ pergunta: 'teste' })).toContain('"teste"');
  });
});
