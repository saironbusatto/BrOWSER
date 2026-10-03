import { describe, expect, it } from 'bun:test';
import {
  bandejaHtml,
  chipHtml,
  classificarArquivos,
  ehArquivoTexto,
  mensagemAnexos,
  rotuloAnexo,
  TAMANHO_MAXIMO,
} from '../entrypoints/sidepanel/anexos';

const xml = { nome: 'nota.xml', tipo: 'application/xml', tamanho: 2048, conteudoTexto: '<nNF>1</nNF>' };
const png = { nome: 'comprovante.png', tipo: 'image/png', tamanho: 5 * 1024 * 1024, dadosBase64: 'iVBOR' };

describe('Anexos: o que entra e o que não entra', () => {
  it('recusa o que passa de 25 MB, dizendo o limite', () => {
    const r = classificarArquivos([{ nome: 'grande.pdf', tipo: 'application/pdf', tamanho: TAMANHO_MAXIMO + 1 }]);
    expect(r.aceitos).toHaveLength(0);
    expect(r.recusados[0]?.nome).toBe('grande.pdf');
    expect(r.recusados[0]?.motivo).toContain('25');
  });

  it('aceita exatamente no limite (off-by-one clássico)', () => {
    const r = classificarArquivos([{ nome: 'ok.pdf', tipo: 'application/pdf', tamanho: TAMANHO_MAXIMO }]);
    expect(r.aceitos).toHaveLength(1);
    expect(r.recusados).toHaveLength(0);
  });

  it('separa aceitos de recusados em vez de misturar', () => {
    const r = classificarArquivos([
      { nome: 'a.xml', tipo: 'application/xml', tamanho: 10 },
      { nome: 'b.bin', tipo: 'application/octet-stream', tamanho: TAMANHO_MAXIMO * 2 },
    ]);
    expect(r.aceitos.map((a) => a.nome)).toEqual(['a.xml']);
    expect(r.recusados.map((a) => a.nome)).toEqual(['b.bin']);
  });
});

describe('Anexos: texto vs binário', () => {
  it('XML/JSON/CSV/TXT/HTML/MD são lidos como texto', () => {
    for (const nome of ['a.xml', 'a.json', 'a.csv', 'a.txt', 'a.html', 'a.md', 'A.XML']) {
      expect(ehArquivoTexto(nome, 'application/octet-stream')).toBe(true);
    }
  });

  it('mime type também decide (arquivo sem extensão óbvia)', () => {
    expect(ehArquivoTexto('anexo', 'text/csv')).toBe(true);
    expect(ehArquivoTexto('anexo', 'application/json')).toBe(true);
    expect(ehArquivoTexto('anexo', 'application/xml')).toBe(true);
  });

  it('PDF e imagem não são lidos como texto (vão como base64)', () => {
    expect(ehArquivoTexto('nota.pdf', 'application/pdf')).toBe(false);
    expect(ehArquivoTexto('foto.jpg', 'image/jpeg')).toBe(false);
  });
});

describe('Anexos: o chip é seguro com nome de arquivo hostil', () => {
  it('o nome do usuário entra escapado em title e conteúdo', () => {
    const html = chipHtml({ ...xml, nome: '"><img src=x onerror=alert(1)>.xml' }, 0);
    expect(html).not.toContain('<img');
    expect(html).toContain('&quot;&gt;&lt;img');
  });

  it('o índice vai no data-remove, o que o painel usa para remover', () => {
    expect(chipHtml(xml, 3)).toContain('data-remove="3"');
  });

  it('bandeja vazia devolve string vazia (o painel esconde o elemento)', () => {
    expect(bandejaHtml([])).toBe('');
    expect(bandejaHtml([xml, png])).toContain('nota.xml');
    expect(bandeiaCount(bandejaHtml([xml, png]))).toBe(2);
  });
});

function bandeiaCount(html: string): number {
  return (html.match(/class="attachment-chip"/g) ?? []).length;
}

describe('Anexos: mensagens para a pessoa', () => {
  it('avisa o que entrou e o que ficou de fora, por nome', () => {
    const m = mensagemAnexos(2, [{ nome: 'grande.pdf' }])!;
    expect(m).toBe('2 arquivos anexados; não deu para anexar grande.pdf');
    expect(m).toContain('grande.pdf');
  });

  it('sem nada a dizer, não devolve mensagem (o toast não abre à toa)', () => {
    expect(mensagemAnexos(0, [])).toBeNull();
  });

  it('só os recusados também avisa', () => {
    expect(mensagemAnexos(0, [{ nome: 'x.bin' }])).toContain('x.bin');
  });
});

describe('Anexos: rótulo', () => {
  it('escolhe o ícone pelo tipo e formata o tamanho em KB', () => {
    expect(rotuloAnexo(xml).icone).toBe('📄');
    expect(rotuloAnexo(png).icone).toBe('📎');
    expect(rotuloAnexo({ ...xml, nome: 'a.json' }).icone).toBe('📦');
    expect(rotuloAnexo({ ...xml, nome: 'a.pdf' }).icone).toBe('📑');
    expect(rotuloAnexo(xml).kb).toBe('2.0 KB');
  });
});
