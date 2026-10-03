import { describe, expect, test } from 'bun:test';
import { instrucoes } from '../src/ias';
import { escolherSkills, formatarSkillsParaIa } from '../src/skills';

describe('escolherSkills: a skill entra quando o domínio ou o pedido batem', () => {
  test('domínio da aba do Drive escolhe a skill, com subdomínio e sem acento no pedido', () => {
    expect(escolherSkills({ url: 'https://drive.google.com/drive/u/0/my-drive' }).map((s) => s.nome)).toEqual(['drive-google']);
    expect(escolherSkills({ url: 'https://www.drive.google.com/' }).map((s) => s.nome)).toEqual(['drive-google']);
  });

  test('outro site não recebe skill nenhuma', () => {
    expect(escolherSkills({ url: 'https://gemini.google.com/app', pedido: 'resuma a página' })).toEqual([]);
  });

  test('o pedido alone aciona (a pessoa pode estar em outra aba)', () => {
    expect(escolherSkills({ url: 'https://exemplo.com', pedido: 'AchAR no Drive o contrato' }).map((s) => s.nome)).toEqual([
      'drive-google',
    ]);
  });

  test('site parecido não engana o casamento por sufixo', () => {
    expect(escolherSkills({ url: 'https://drive.google.com.ataque.net/', pedido: 'x' })).toEqual([]);
  });

  test('sem url e sem pedido não quebra nem devolve skill', () => {
    expect(escolherSkills({})).toEqual([]);
    expect(escolherSkills({ url: 'nao é url', pedido: '' })).toEqual([]);
  });
});

describe('formatarSkillsParaIa: o texto entra no prompt como instrução do site', () => {
  test('sem skill não devolve nada (o prompt não muda)', () => {
    expect(formatarSkillsParaIa([])).toBe('');
  });

  test('a skill entra com nome e corpo, e o corpo não estoura o orçamento', () => {
    const [skill] = escolherSkills({ url: 'https://drive.google.com/' });
    const md = formatarSkillsParaIa([skill]);
    expect(md).toContain('COMO USAR ESTE SITE');
    expect(md).toContain('drive-google');
    expect(md).toContain('Perguntar ao Gemini');
    expect(md.length).toBeLessThan(5000);
  });
});

describe('instrucoes: a skill do site chega junto do blueprint', () => {
  test('pedido na aba do Drive carrega o bloco da skill', () => {
    const skills = escolherSkills({ url: 'https://drive.google.com/drive/u/0', pedido: 'qual o CPF do fulano' });
    const prompt = instrucoes('qual o CPF do fulano', undefined, null, {}, false, skills);
    expect(prompt).toContain('### 📘 COMO USAR ESTE SITE');
    expect(prompt).toContain('busca própria ou assistente de IA');
  });

  test('continuação também recarrega: a aba pode ter mudado', () => {
    const skills = escolherSkills({ url: 'https://drive.google.com/' });
    expect(instrucoes('agora o segundo', undefined, null, {}, true, skills)).toContain('COMO USAR ESTE SITE');
  });

  test('sem skill o prompt não ganha o bloco', () => {
    expect(instrucoes('x', undefined, null, {}, true)).not.toContain('COMO USAR ESTE SITE');
  });
});
