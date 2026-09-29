import { describe, expect, it } from 'bun:test';
import { extrairTextoDaPagina, LIMITE_PADRAO } from '../utils/pagina-texto';

// A função roda dentro da página, serializada pelo CDP. O projeto não tem DOM nos testes, então a
// raiz da varredura é um parâmetro: sem ele, o único jeito de testar a lógica de verdade seria
// reescrevê-la no teste — e aí o teste deixa de valer para alguma coisa.
//
// A árvore mínima abaixo implementa só o que a função usa: nodeType, textContent, tagName,
// getAttribute, hasAttribute, style e childNodes. Se um dia a função precisar de mais, o teste
// quebra em vez de passar fingindo que deu certo.

const ELEMENTO = 1;
const TEXTO = 3;

type NoFake = { tipo: 'elemento' | 'texto'; tag?: string; texto?: string; attrs?: Record<string, string>; filhos?: NoFake[] };

function elemento(tag: string, attrs: Record<string, string> = {}, filhos: (NoFake | string)[] = []): NoFake {
  return { tipo: 'elemento', tag, attrs, filhos: filhos.map((f) => (typeof f === 'string' ? texto(f) : f)) };
}
function texto(t: string): NoFake {
  return { tipo: 'texto', texto: t };
}

/** Converte a árvore manual no formato que a função percorre. */
function comoNode(n: NoFake): any {
  if (n.tipo === 'texto') return { nodeType: TEXTO, textContent: n.texto ?? '' };
  const tag = (n.tag ?? 'DIV').toUpperCase();
  return {
    nodeType: ELEMENTO,
    tagName: tag,
    getAttribute: (nome: string) => n.attrs?.[nome] ?? null,
    hasAttribute: (nome: string) => nome in (n.attrs ?? {}),
    style: {},
    childNodes: (n.filhos ?? []).map(comoNode),
    // No DOM de verdade, <input value="x"> define a PROPRIEDADE .value, e é dela que a função
    // lê. Um fake que só devolvesse getAttribute daria "" e o teste acusaria falha de senha onde
    // o problema era o fake.
    ...(tag === 'INPUT' || tag === 'TEXTAREA' ? { value: n.attrs?.value ?? '' } : {}),
    ...(tag === 'INPUT' ? { checked: n.attrs?.checked !== undefined } : {}),
  };
}

function extrair(arvore: NoFake, limite = LIMITE_PADRAO) {
  return extrairTextoDaPagina(limite, comoNode(arvore) as unknown as Node, 'Título da página');
}

describe('extrairTextoDaPagina', () => {
  it('devolve o texto e o título, e não depende de nada de fora da função', () => {
    const r = extrair(elemento('BODY', {}, [elemento('H1', {}, ['Fatura 12345']), elemento('P', {}, ['Emitente: Padaria Exemplo'])]));
    expect(r.texto).toContain('Fatura 12345');
    expect(r.texto).toContain('Emitente: Padaria Exemplo');
    expect(r.titulo).toBe('Título da página');
    // Serializada para a página, a função não pode citar import nem nada do módulo.
    expect(extrairTextoDaPagina.toString()).not.toMatch(/\bimport\b/);
  });

  it('preserva a estrutura: título, parágrafo e item de lista não viram uma linha só', () => {
    const r = extrair(
      elemento('BODY', {}, [
        elemento('H1', {}, ['Título']),
        elemento('P', {}, ['Parágrafo']),
        elemento('UL', {}, [elemento('LI', {}, ['Item 1']), elemento('LI', {}, ['Item 2'])]),
      ]),
    );
    expect(r.texto).toContain('Título');
    expect(r.texto).toContain('Item 1');
    expect(r.texto).toContain('Item 2');
    // Uma página inteira em uma linha só não dá para a IA citar trecho.
    expect(r.texto.split('\n').filter((l) => l.trim()).length).toBeGreaterThanOrEqual(4);
  });

  it('ignora script, style, conteúdo oculto e aria-hidden', () => {
    const r = extrair(
      elemento('BODY', {}, [
        elemento('P', {}, ['texto visível']),
        elemento('SCRIPT', {}, ['var segredo = 1']),
        elemento('STYLE', {}, ['.a{color:red}']),
        elemento('DIV', { 'aria-hidden': 'true' }, ['MENU OCULTO']),
        elemento('DIV', { hidden: '' }, ['BLOCO ESCONDIDO']),
      ]),
    );
    expect(r.texto).toContain('texto visível');
    expect(r.texto).not.toContain('segredo');
    expect(r.texto).not.toContain('color:red');
    expect(r.texto).not.toContain('MENU OCULTO');
    expect(r.texto).not.toContain('BLOCO ESCONDIDO');
  });
});

describe('a garantia que não pode quebrar', () => {
  const SENHA = 'SEGREDO-NAO-PODE-VAZAR';

  it('NUNCA devolve o valor de um campo de senha, e o campo continua visível para a IA', () => {
    // O teste que importa aqui é o da IA recusando preencher a senha. Se este valor vazar para o
    // texto, a IA consegue ler a senha da tela — e a promessa da política de privacidade cai.
    const r = extrair(
      elemento('BODY', {}, [
        elemento('LABEL', {}, ['Senha ', elemento('INPUT', { id: 's', type: 'password', value: SENHA })]),
        elemento('P', {}, ['texto qualquer']),
      ]),
    );
    expect(r.texto).toContain('texto qualquer'); // a página foi lida de verdade
    expect(r.texto).not.toContain(SENHA);
    // Mas a IA precisa saber que existe um campo sensível ali, para poder preenchê-lo.
    expect(r.texto).toMatch(/senha/i);
    expect(r.texto).toContain('s');
  });

  it('não vaza senha mesmo quando o campo é o único conteúdo da página', () => {
    const r = extrair(elemento('BODY', {}, [elemento('INPUT', { type: 'password', value: SENHA })]));
    expect(r.texto).not.toContain(SENHA);
  });

  it('não vaza senha escrito como text, só como password', () => {
    // Um campo type="text" tem valor legível de propósito: é dado normal de formulário. A
    // garantia é só sobre senha, e o teste existe para ninguém "endurecer" a regra achando que
    // é melhor não ler valor nenhum.
    const r = extrair(
      elemento('BODY', {}, [
        elemento('INPUT', { type: 'text', value: 'dado normal' }),
        elemento('INPUT', { type: 'password', value: SENHA }),
      ]),
    );
    expect(r.texto).toContain('dado normal');
    expect(r.texto).not.toContain(SENHA);
  });

  it('não devolve o valor de campo escondido (token de servidor) nem arquivo escolhido', () => {
    const r = extrair(
      elemento('BODY', {}, [
        elemento('INPUT', { type: 'hidden', value: 'token-do-servidor' }),
        elemento('INPUT', { type: 'file', name: 'documento' }),
      ]),
    );
    expect(r.texto).not.toContain('token-do-servidor');
    expect(r.texto).toContain('documento');
  });
});

describe('corte por tamanho', () => {
  const paginaGrande = (n: number) => elemento('BODY', {}, [elemento('P', {}, ['palavra'.repeat(n)])]);

  it('avisa que cortou, e não termina no meio de uma palavra', () => {
    const r = extrair(paginaGrande(2000), 2000);
    expect(r.truncado).toBe(true);
    expect(r.texto.length).toBeLessThanOrEqual(2400);
    expect(r.texto).toMatch(/\[texto cortado/);
  });

  it('não avisa corte quando a página cabe', () => {
    const r = extrair(paginaGrande(10), LIMITE_PADRAO);
    expect(r.truncado).toBe(false);
    expect(r.texto).not.toMatch(/\[texto cortado/);
  });
});
