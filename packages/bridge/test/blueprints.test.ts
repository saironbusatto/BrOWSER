import { describe, expect, it } from 'bun:test';
import type { Campo } from '@browser/shared';
import {
  carregarBlueprintLocal,
  formatarBlueprintParaIa,
  gerarBlueprintAnonimizado,
  mesclarBlueprints,
  normalizarDominio,
  obterBlueprint,
  salvarOuAtualizarBlueprint,
} from '../src/blueprints';

describe('Módulo de Blueprints de Sites (Memória Persistente Comunitária)', () => {
  it('deve normalizar domínios e URLs para chaves seguras de blueprint', () => {
    expect(normalizarDominio('http://localhost:5173/formulario')).toBe('localhost-5173');
    expect(normalizarDominio('localhost:3000')).toBe('localhost-3000');
    expect(normalizarDominio('https://gemini.google.com/app/123?token=abc')).toBe('gemini.google.com');
    expect(normalizarDominio('app.receita.fazenda.gov.br/portal')).toBe('app.receita.fazenda.gov.br');
  });

  it('deve carregar blueprints padrão empacotados no projeto', async () => {
    const bpLocalhost = carregarBlueprintLocal('http://localhost:5173');
    expect(bpLocalhost).not.toBeNull();
    expect(bpLocalhost?.dominio).toBe('localhost-5173');
    expect(bpLocalhost?.campos.length).toBeGreaterThan(0);

    const bpGemini = await obterBlueprint('https://gemini.google.com');
    expect(bpGemini).not.toBeNull();
    expect(bpGemini?.dominio).toBe('gemini.google.com');
    expect(bpGemini?.gatilhos?.length).toBeGreaterThan(0);
  });

  it('deve gerar blueprint anonimizado garantindo ZERO vazamento de dados do usuário (PII)', () => {
    const camposComDadosSensiveis: (Campo & { valor?: string })[] = [
      {
        ref: 0,
        papel: 'caixa de texto',
        nome: 'CNPJ do Contribuinte',
        obrigatorio: true,
        valor: '12.345.678/0001-99', // DADO SENSÍVEL
      },
      {
        ref: 1,
        papel: 'caixa de texto',
        nome: 'CPF do Responsável',
        obrigatorio: false,
        valor: '123.456.789-00', // DADO SENSÍVEL
      },
      {
        ref: 2,
        papel: 'caixa de texto',
        nome: 'E-mail Corporativo',
        obrigatorio: true,
        valor: 'diretoria@minhaempresa.com.br', // DADO SENSÍVEL
      },
      {
        ref: 3,
        papel: 'caixa de texto',
        nome: 'Valor Total (R$)',
        obrigatorio: false,
        valor: '999999.00', // DADO SENSÍVEL
      },
    ];

    const blueprint = gerarBlueprintAnonimizado({
      url: 'https://erp.empresa.com.br/financeiro/faturamento?usuario=sairon&sessao=xyz',
      titulo: 'Portal ERP Financeiro - Faturamento',
      campos: camposComDadosSensiveis,
    });

    const jsonSerializado = JSON.stringify(blueprint);

    // Domínio limpo sem query params ou dados de sessão
    expect(blueprint.dominio).toBe('erp.empresa.com.br');
    expect(blueprint.campos.length).toBe(4);

    // Validação de tipos inferidos
    expect(blueprint.campos[0].tipoEsperado).toBe('cnpj');
    expect(blueprint.campos[0].idSemantico).toBe('cnpj_do_contribuinte');
    expect(blueprint.campos[1].tipoEsperado).toBe('cpf');
    expect(blueprint.campos[2].tipoEsperado).toBe('email');
    expect(blueprint.campos[3].tipoEsperado).toBe('moeda');

    // GARANTIA DE PRIVACIDADE:
    // NENHUM valor digitado, CPF ou e-mail deve existir no blueprint gerado!
    expect(jsonSerializado).not.toContain('12.345.678/0001-99');
    expect(jsonSerializado).not.toContain('123.456.789-00');
    expect(jsonSerializado).not.toContain('diretoria@minhaempresa.com.br');
    expect(jsonSerializado).not.toContain('999999.00');
    expect(jsonSerializado).not.toContain('usuario=sairon');
    expect(jsonSerializado).not.toContain('sessao=xyz');
    expect(jsonSerializado).not.toContain('"valor"');
  });

  it('deve formatar blueprint para Markdown de forma legível para a IA', () => {
    const blueprint = {
      $schema: 'https://browser.ai/schemas/blueprint.v1.json',
      dominio: 'portal.exemplo.com',
      versao: '1.0.0',
      titulo: 'Portal de Exemplo',
      atualizadoEm: new Date().toISOString(),
      gatilhos: [
        {
          descricao: 'Menu Ferramentas',
          seletorOuNome: 'Abrir Ferramentas',
          tipo: 'click' as const,
        },
      ],
      campos: [
        {
          idSemantico: 'nome_cliente',
          rotulo: 'Nome do Cliente',
          papel: 'caixa de texto',
          obrigatorio: true,
          seletorAcessivel: 'Nome do Cliente',
        },
      ],
    };

    const md = formatarBlueprintParaIa(blueprint);
    expect(md).toContain('MAPA DO SITE CONHECIDO (SITE BLUEPRINT)');
    expect(md).toContain('portal.exemplo.com');
    expect(md).toContain('Menu Ferramentas');
    expect(md).toContain('Nome do Cliente');
    expect(md).toContain('(obrigatório)');
  });

  it('deve mesclar blueprints recebidos via telemetria passiva sem duplicar campos', () => {
    const blueprintAntigo = {
      $schema: 'https://browser.ai/schemas/blueprint.v1.json',
      dominio: 'teste-shadow.local',
      versao: '1.0.0',
      titulo: 'App Legado',
      atualizadoEm: '2026-09-01T00:00:00Z',
      gatilhos: [],
      campos: [
        {
          idSemantico: 'nome',
          rotulo: 'Nome',
          papel: 'textbox',
          seletorAcessivel: 'Nome',
        },
      ],
    };

    const telemetriaNova = {
      $schema: 'https://browser.ai/schemas/blueprint.v1.json',
      dominio: 'teste-shadow.local',
      versao: '1.0.0',
      titulo: 'App Legado v2',
      atualizadoEm: '2026-09-27T00:00:00Z',
      gatilhos: [
        {
          descricao: 'Gravar Cadastro',
          seletorOuNome: 'Gravar Cadastro',
          tipo: 'click' as const,
        },
      ],
      campos: [
        {
          idSemantico: 'nome',
          rotulo: 'Nome',
          papel: 'textbox',
          seletorAcessivel: 'Nome',
          obrigatorio: true,
        },
        {
          idSemantico: 'email',
          rotulo: 'E-mail',
          papel: 'textbox',
          seletorAcessivel: 'E-mail',
          tipoEsperado: 'email' as const,
        },
      ],
    };

    const mesclado = mesclarBlueprints(blueprintAntigo, telemetriaNova);

    // Não duplica o campo 'nome', atualiza para obrigatorio: true
    expect(mesclado.campos.length).toBe(2);
    expect(mesclado.campos.find((c) => c.idSemantico === 'nome')?.obrigatorio).toBe(true);
    expect(mesclado.campos.find((c) => c.idSemantico === 'email')?.tipoEsperado).toBe('email');
    // Adiciona o novo gatilho
    expect(mesclado.gatilhos?.length).toBe(1);
    expect(mesclado.gatilhos?.[0].descricao).toBe('Gravar Cadastro');

    // Testa persistência
    salvarOuAtualizarBlueprint(mesclado);
    const carregado = carregarBlueprintLocal('teste-shadow.local');
    expect(carregado).not.toBeNull();
    expect(carregado?.campos.length).toBe(2);
  });
});

describe('Índice público de blueprints', () => {
  it('blueprints/index.json lista exatamente os arquivos da pasta (senão o domínio nunca é buscado)', () => {
    const { readdirSync, readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const pasta = join(import.meta.dir, '../../../blueprints');
    const arquivos = readdirSync(pasta)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    const indice = (JSON.parse(readFileSync(join(pasta, 'index.json'), 'utf8')).dominios as string[]).slice().sort();
    expect(indice).toEqual(arquivos);
  });
});
