import { describe, expect, it } from 'bun:test';
import type { SiteBlueprint } from '@browser/shared';
import { formatarBlueprintParaIa } from '../src/blueprints';

const bp = (campos: SiteBlueprint['campos'], gatilhos?: SiteBlueprint['gatilhos']): SiteBlueprint => ({
  dominio: 'exemplo.com',
  titulo: 'Exemplo',
  versao: '1.0.0',
  atualizadoEm: '2026-01-01T00:00:00Z',
  campos,
  gatilhos,
});

const campo = (rotulo: string, papel: string, obrigatorio = false) => ({
  idSemantico: rotulo.toLowerCase().replace(/\W+/g, '_'),
  rotulo,
  papel,
  seletorAcessivel: rotulo,
  ...(obrigatorio && { obrigatorio: true }),
});

describe('formatarBlueprintParaIa: o mapa não pode estourar o prompt', () => {
  it('o caso que quebrava: 596 campos cabem no orçamento', () => {
    const campos = Array.from({ length: 596 }, (_, i) => campo(`Item ${i}`, 'link'));
    const md = formatarBlueprintParaIa(bp(campos));
    // O Spotify real dava 25.053 chars e jogava o pedido num arquivo, custando uma tool call
    // só para ler o que já tinha vindo no prompt. O teto do stdin é 20k.
    expect(md.length).toBeLessThan(20_000);
    expect(md.length).toBeLessThan(8_000);
  });

  it('link é o primeiro a ser cortado: nenhum deles é preenchível', () => {
    const campos = [
      campo('Nome completo', 'textbox', true),
      ...Array.from({ length: 400 }, (_, i) => campo(`Link ${i}`, 'link')),
    ];
    const md = formatarBlueprintParaIa(bp(campos));
    expect(md).toContain('Nome completo');
    expect(md).not.toContain('Link 399');
  });

  it('o mapa pequeno sai inteiro — não corta o que cabe', () => {
    const campos = [campo('Nome', 'textbox'), campo('E-mail', 'textbox'), campo('Enviar', 'button')];
    const md = formatarBlueprintParaIa(bp(campos));
    expect(md).toContain('Nome');
    expect(md).toContain('E-mail');
    expect(md).toContain('Enviar');
    expect(md).not.toContain('não listados');
  });

  it('truncar calado é pior que truncar avisado: o mapa diz o que ficou de fora', () => {
    const campos = Array.from({ length: 400 }, (_, i) => campo(`Campo ${i}`, 'textbox'));
    const md = formatarBlueprintParaIa(bp(campos));
    expect(md).toMatch(/e mais \d+ campos não listados/);
  });

  it('gatilhos e ordem do mapa continuam no prompt', () => {
    const md = formatarBlueprintParaIa(
      bp([campo('Nome', 'textbox')], [{ descricao: 'abrir menu', seletorOuNome: 'hamburguer', tipo: 'click' }]),
    );
    expect(md).toContain('abrir menu');
    expect(md).toContain('hamburguer');
  });
});
