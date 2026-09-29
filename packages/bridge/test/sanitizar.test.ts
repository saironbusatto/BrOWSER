import { describe, expect, it } from 'bun:test';
import type { SiteBlueprint } from '@browser/shared';
import { sanitizarBlueprint, sanitizarRotulo } from '../src/sanitizar';

// Forma real de uma página de busca do Google lida pela ponte (dados fictícios).
const paginaDeBusca: SiteBlueprint = {
  dominio: 'www.google.com',
  versao: '1.0.0',
  titulo: 'nobara wallpaper - Pesquisa Google',
  atualizadoEm: '2026-09-27T00:00:00Z',
  gatilhos: [],
  campos: [
    { idSemantico: 'x', rotulo: 'Google Apps', papel: 'button', seletorAcessivel: 'Google Apps' },
    { idSemantico: 'x', rotulo: 'Pesquisar', papel: 'combobox', seletorAcessivel: 'Pesquisar' },
    { idSemantico: 'x', rotulo: 'Pesquisar por voz', papel: 'button', seletorAcessivel: 'Pesquisar por voz' },
    { idSemantico: 'x', rotulo: 'Conta do Google: Fulano Teste (fulano.teste@example.com)', papel: 'button', seletorAcessivel: 'Conta do Google: Fulano Teste (fulano.teste@example.com)' },
    { idSemantico: 'x', rotulo: '01310-100 - Bela Vista, São Paulo - SP - Com base nos seus lugares (Casa)', papel: 'button', seletorAcessivel: '01310-100 - Bela Vista' },
    { idSemantico: 'x', rotulo: 'Nobara Linux | O Projeto Nobara Nobara Linux https://nobaraproject.org', papel: 'link', seletorAcessivel: 'Nobara' },
    { idSemantico: 'x', rotulo: 'The BEST Tweaks for Gaming and Multimedia Performance YouTube · Canal Qualquer Mais de 10 mil visualizações', papel: 'link', seletorAcessivel: 'The BEST' },
    { idSemantico: 'x', rotulo: 'Traduzir esta página', papel: 'link', seletorAcessivel: 'Traduzir esta página' },
    { idSemantico: 'x', rotulo: 'Traduzir esta página', papel: 'link', seletorAcessivel: 'Traduzir esta página' },
    { idSemantico: 'x', rotulo: 'Page 2', papel: 'link', seletorAcessivel: 'Page 2' },
    { idSemantico: 'x', rotulo: 'Page 3', papel: 'link', seletorAcessivel: 'Page 3' },
    {
      idSemantico: 'x', rotulo: 'Endereço de entrega', papel: 'combobox', seletorAcessivel: 'Endereço de entrega',
      opcoes: ['Selecione', 'Rua Exemplo, 123 - CEP 01310-100', 'fulano.teste@example.com', 'Retirar na loja'],
    },
  ],
};

describe('Sanitizador de blueprints (estrutura sim, dado do usuário não)', () => {
  const r = sanitizarBlueprint(paginaDeBusca);
  const json = JSON.stringify(r);

  it('não deixa passar e-mail, nome da conta, CEP, bairro, URL nem a busca do usuário', () => {
    for (const vazamento of ['fulano.teste@example.com', 'Fulano Teste', '01310-100', 'Bela Vista', 'https://', 'Nobara', 'Tweaks', 'nobara wallpaper']) {
      expect(json).not.toContain(vazamento);
    }
  });

  it('mantém o mapa do site: botões, menus e busca continuam lá', () => {
    const rotulos = r.campos.map((c) => c.rotulo);
    expect(rotulos).toContain('Google Apps');
    expect(rotulos).toContain('Pesquisar');
    expect(rotulos).toContain('Pesquisar por voz');
    expect(rotulos).toContain('Conta do Google: [conta]');
    expect(rotulos).toContain('[localização]');
    expect(rotulos).toContain('Endereço de entrega');
  });

  it('colapsa repetições e paginação', () => {
    expect(r.campos.filter((c) => c.rotulo === 'Traduzir esta página')).toHaveLength(1);
    expect(r.campos.filter((c) => c.rotulo === 'paginação')).toHaveLength(1);
  });

  it('descarta opções de select com dado pessoal e mantém as genéricas', () => {
    const endereco = r.campos.find((c) => c.rotulo === 'Endereço de entrega')!;
    expect(endereco.opcoes).toEqual(['Selecione', 'Retirar na loja']);
  });

  it('título fica sem a busca do usuário', () => {
    expect(r.titulo).toBe('Pesquisa Google');
  });

  it('não altera o blueprint de entrada', () => {
    expect(paginaDeBusca.campos).toHaveLength(12);
    expect(paginaDeBusca.campos[3].rotulo).toContain('fulano.teste@example.com');
  });

  it('mascara documentos e telefone em rótulos curtos', () => {
    expect(sanitizarRotulo('CPF 123.456.789-09')).toBe('CPF [cpf]');
    expect(sanitizarRotulo('CNPJ 12.345.678/0001-90')).toBe('CNPJ [cnpj]');
    expect(sanitizarRotulo('Ligar (31) 98765-4321')).toBe('Ligar [telefone]');
    expect(sanitizarRotulo('Nome completo')).toBe('Nome completo');
  });
});

// Segunda camada: o blueprint é montado a partir do ler_campos, que vê a página inteira. Em app
// logada o conteúdo da conta tem forma de rótulo curto e vira "campo" do mapa. Medido: 26 de 27
// nomes do Spotify passavam antes destes padrões.
describe('conteúdo de conta logada não vira campo do mapa', () => {
  // [rótulo, sobrevive?]
  const CASOS: [string, boolean][] = [
    // Duração e contador de faixa
    ['3:45', false],
    ['1:02:33', false],
    ['2 Somebody Told Me', false],
    ['Ver todos os 67 itens', false],
    ['10 mil visualizações', false],
    // Faixa, artista, álbum
    ['Elliot Smith - Figure 8 - 2000', false],
    // Endereço e conta
    ['Rua das Flores, 123 - São Paulo', false],
    ['Avenida Paulista, 1578', false],
    ['Perfil de saironbusatto', false],
    // Controle: tem de continuar
    ['Tocar', true],
    ['Compartilhar', true],
    ['Reproduzir', true],
    ['Aleatório', true],
    ['Pular para o conteúdo principal', true],
    ['Inscrever-se no Premium', true],
    ['Buscar música, artista, podcast', true],
    ['Endereço de entrega', true],
    ['Fazer login', true],
  ];

  for (const [rotulo, sobrevive] of CASOS) {
    it(`${sobrevive ? 'mantém' : 'derruba'} "${rotulo}"`, () => {
      expect(sanitizarRotulo(rotulo) !== null).toBe(sobrevive);
    });
  }

  it('a rua sem número é campo, não endereço', () => {
    // "Endereço de entrega" não pode cair: é rótulo de campo de formulário.
    expect(sanitizarRotulo('Endereço de entrega')).not.toBeNull();
  });

  // Lacuna conhecida e assumida: ver o comentário em sanitizar.ts. Estes dois passam, e o teste
  // existe para documentar isso — se um dia alguém fechar a lacuna, ele quebra aqui e obriga a
  // decidir conscientemente.
  it('LACUNA: título de faixa e par artista-faixa não são separáveis de um menu', () => {
    expect(sanitizarRotulo('Never Gonna Give You Up')).not.toBeNull();
    expect(sanitizarRotulo('Marcos - Medalhão')).not.toBeNull();
  });
});
