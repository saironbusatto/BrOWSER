import { describe, expect, it } from 'bun:test';
import {
  camposHtml,
  inputLivreHtml,
  juntarResposta,
  mostrarBotaoEnviar,
  opcoesHtml,
  type Pergunta,
  respostaDeOpcao,
} from '../entrypoints/sidepanel/perguntas';

const base: Pergunta = { pedidoId: 'p1', perguntaId: 'q1', pergunta: 'Qual o seu CPF?' };

describe('Pergunta: o que o card mostra', () => {
  it('sem campos e sem opções, mostra um input livre', () => {
    expect(inputLivreHtml(base)).toContain('free-answer');
  });

  it('com campos, mostra um input por campo e nada de input livre', () => {
    expect(inputLivreHtml({ ...base, campos: ['CPF', 'Nome'] })).toBe('');
    const html = camposHtml(['CPF', 'Nome']);
    expect((html.match(/data-campo=/g) ?? []).length).toBe(2);
  });

  it('com opções, escolhe-se clicando: sem input livre e sem botão de enviar', () => {
    const p = { ...base, opcoes: ['Google', 'Indicação'] };
    expect(inputLivreHtml(p)).toBe('');
    expect(mostrarBotaoEnviar(p)).toBe(false);
    expect(opcoesHtml(p.opcoes)).toContain('data-opcao="Google"');
  });

  it('sem opções, há botão de enviar (a pessoa digita e confirma)', () => {
    expect(mostrarBotaoEnviar(base)).toBe(true);
    expect(mostrarBotaoEnviar({ ...base, campos: ['CPF'] })).toBe(true);
  });
});

describe('Pergunta: o nome do campo sobrevive à viagem pelo DOM', () => {
  it('o rótulo com aspas e acento é escapado no source (e o browser renderiza certo)', () => {
    const campo = `Pet's "nome" completo`;
    const html = camposHtml([campo]);
    // No atributo E no texto: escapado, para não fechar o atributo nem virar marcação.
    expect(html).toContain('data-campo="Pet&#039;s &quot;nome&quot; completo"');
    expect(html).toContain('>Pet&#039;s &quot;nome&quot; completo</label>');
    expect(html).not.toMatch(/<label[^>]*>Pet's/);
  });

  it('a chave enviada à IA é a que a pessoa viu (o bug do data-campo escapado)', () => {
    // Simula a ida e volta: o navegador devolve o valor do atributo já decodificado.
    const campo = `Endereço do titular`;
    const html = camposHtml([campo]);
    const atributo = html.match(/data-campo="([^"]*)"/)![1]!;
    const lidoDoDom = atributo
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    expect(lidoDoDom).toBe(campo);
    expect(juntarResposta([{ campo: lidoDoDom, valor: 'x' }]).respostasCampos).toHaveProperty(campo);
  });

  it('uma opção com aspas não escapa do atributo', () => {
    const html = opcoesHtml([`diz "sim"`]);
    expect(html).toContain('data-opcao="diz &quot;sim&quot;"');
    expect(html).not.toMatch(/data-opcao="diz "sim""/);
  });
});

describe('juntarResposta: o que a IA recebe de volta', () => {
  it('mapeia cada campo preenchido pelo rótulo', () => {
    const r = juntarResposta([
      { campo: 'CPF', valor: '123.456.789-00' },
      { campo: 'Nome', valor: 'Joana' },
    ]);
    expect(r.respostasCampos).toEqual({ CPF: '123.456.789-00', Nome: 'Joana' });
    expect(r.texto).toBe('CPF: 123.456.789-00, Nome: Joana');
  });

  it('campo em branco fica explícito no resumo (a IA não deve supor que não foi perguntado)', () => {
    const r = juntarResposta([{ campo: 'CPF', valor: '' }]);
    expect(r.respostasCampos.CPF).toBe('');
    expect(r.texto).toBe('CPF: (em branco)');
  });

  it('input livre (sem campo) vai no resumo e não cria mapa', () => {
    const r = juntarResposta([{ valor: 'Minha resposta' }]);
    expect(r.texto).toBe('Minha resposta');
    expect(r.respostasCampos).toEqual({});
  });

  it('nada digitado diz que pode seguir, sem texto vazio', () => {
    expect(juntarResposta([]).texto).toBe('Continuar sem dados');
    expect(juntarResposta([{ campo: 'CPF', valor: '' }, { valor: '' }]).texto).toBe('CPF: (em branco)');
  });

  it('opção clicada é a resposta, sem mapa de campos', () => {
    expect(respostaDeOpcao('Google')).toEqual({ texto: 'Google', respostasCampos: {} });
  });
});
