import { describe, expect, it } from 'bun:test';
import { extrairDadosDocumento, formatarContextoArquivos } from '../src/documentos';

describe('Módulo de Extração de Documentos', () => {
  it('deve extrair campos de um XML de NF-e', () => {
    const xmlMock = `
      <nfeProc>
        <NFe>
          <infNFe>
            <ide>
              <nNF>123456</nNF>
              <dhEmi>2026-09-27T10:00:00-03:00</dhEmi>
            </ide>
            <emit>
              <CNPJ>12345678000199</CNPJ>
              <xNome>Empresa Tech LTDA</xNome>
            </emit>
            <total>
              <ICMSTot>
                <vNF>1500.50</vNF>
              </ICMSTot>
            </total>
            <cobr>
              <dup>
                <dVenc>2026-10-27</dVenc>
                <vDup>1500.50</vDup>
              </dup>
            </cobr>
          </infNFe>
        </NFe>
      </nfeProc>
    `;

    const extraido = extrairDadosDocumento({
      nome: 'nota_fiscal.xml',
      tipo: 'application/xml',
      tamanho: xmlMock.length,
      conteudoTexto: xmlMock,
    });

    expect(extraido.camposIdentificados['Número da Nota']).toBe('123456');
    expect(extraido.camposIdentificados.CNPJ).toBe('12345678000199');
    expect(extraido.camposIdentificados['Razão Social / Nome']).toBe('Empresa Tech LTDA');
    expect(extraido.camposIdentificados['Valor Total da Nota']).toBe('1500.50');
    expect(extraido.camposIdentificados['Data de Vencimento']).toBe('2026-10-27');
  });

  it('deve extrair e achatar um arquivo JSON', () => {
    const jsonMock = JSON.stringify({
      cliente: {
        nome: 'João Silva',
        cpf: '111.222.333-44',
      },
      pedido: {
        total: 250.0,
      },
    });

    const extraido = extrairDadosDocumento({
      nome: 'pedido.json',
      tipo: 'application/json',
      tamanho: jsonMock.length,
      conteudoTexto: jsonMock,
    });

    expect(extraido.camposIdentificados['cliente.nome']).toBe('João Silva');
    expect(extraido.camposIdentificados['cliente.cpf']).toBe('111.222.333-44');
    expect(extraido.camposIdentificados['pedido.total']).toBe('250');
  });

  it('deve formatar o contexto de arquivos para Markdown', () => {
    const arq = {
      nome: 'dados.csv',
      tipo: 'text/csv',
      tamanho: 100,
      conteudoTexto: 'nome;email\nMaria;maria@email.com',
    };

    const md = formatarContextoArquivos([arq]);
    expect(md).toContain('DADOS DE ARQUIVOS ANEXADOS PELO USUÁRIO');
    expect(md).toContain('dados.csv');
    expect(md).toContain('Maria');
    expect(md).toContain('maria@email.com');
  });
});

describe('Anexos binários e texto longo', () => {
  const { mkdtempSync, readdirSync, readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
  const { tmpdir } = require('node:os') as typeof import('node:os');
  const { join } = require('node:path') as typeof import('node:path');
  const { salvarAnexosBinarios, apagarAnexos } = require('../src/documentos') as typeof import('../src/documentos');

  it('grava PDF dentro de anexos/ e neutraliza nome com ../', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anexos-teste-'));
    const caminhos = salvarAnexosBinarios(dir, [
      { nome: '../../.ssh/authorized_keys', tipo: 'application/pdf', tamanho: 4, dadosBase64: 'data:application/pdf;base64,JVBERg==' },
    ]);
    const rel = caminhos['../../.ssh/authorized_keys']!;
    expect(rel.startsWith('anexos/')).toBe(true);
    expect(rel).not.toContain('..');
    expect(readdirSync(join(dir, 'anexos'))).toHaveLength(1);
    expect(readFileSync(join(dir, rel), 'latin1')).toBe('%PDF');
    expect(
      formatarContextoArquivos([{ nome: '../../.ssh/authorized_keys', tipo: 'application/pdf', tamanho: 4, dadosBase64: 'x' }], caminhos),
    ).toContain(rel);
    apagarAnexos(dir);
    expect(existsSync(join(dir, 'anexos'))).toBe(false);
  });

  it('não corta dado no fim de texto longo (antes cortava em 1.500)', () => {
    const conteudoTexto = `${'enchimento\n'.repeat(2000)}CLIENTE: Joana Final`;
    const md = formatarContextoArquivos([{ nome: 'r.txt', tipo: 'text/plain', tamanho: conteudoTexto.length, conteudoTexto }]);
    expect(md).toContain('Joana Final');
  });
});
