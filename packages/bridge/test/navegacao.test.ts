import { describe, expect, it } from 'bun:test';
import { hostCoberto, hostsMencionados, navegacaoLiberada, urlNavegavel } from '../src/navegacao';

const url = (s: string) => new URL(s);
const vazio = { linksDaPagina: [], hostsDaPessoa: [], hostsAprovados: [] };

describe('urlNavegavel: o que nunca vira navegação', () => {
  it('só http e https', () => {
    for (const ruim of ['javascript:alert(1)', 'file:///etc/passwd', 'chrome://settings', 'data:text/html,x']) {
      expect(urlNavegavel(ruim).ok).toBe(false);
    }
    expect(urlNavegavel('https://www.gov.br/x').ok).toBe(true);
    expect(urlNavegavel('http://localhost:5173').ok).toBe(true);
  });

  it('recusa usuário:senha embutido, lixo e endereço gigante', () => {
    expect(urlNavegavel('https://a:b@banco.com').ok).toBe(false);
    expect(urlNavegavel('gov.br').ok).toBe(false);
    expect(urlNavegavel(`https://x.com/?q=${'a'.repeat(3000)}`).ok).toBe(false);
  });
});

describe('navegacaoLiberada: a página não escolhe para onde o dado vai', () => {
  it('URL montada pela IA para um site estranho NÃO passa sem perguntar', () => {
    const exfil = url('https://atacante.com/coleta?cpf=12345678900');
    expect(navegacaoLiberada(exfil, { ...vazio, linksDaPagina: ['https://atacante.com/coleta'] })).toBe(false);
  });

  it('link que já está na página passa (o #fragmento não importa)', () => {
    const links = ['https://www.gov.br/receita/pt-br#topo'];
    expect(navegacaoLiberada(url('https://www.gov.br/receita/pt-br'), { ...vazio, linksDaPagina: links })).toBe(true);
  });

  it('site que a pessoa citou passa, com os subdomínios dele', () => {
    const hostsDaPessoa = hostsMencionados('abre o gov.br e emite a guia');
    expect(navegacaoLiberada(url('https://servicos.receita.fazenda.gov.br/x'), { ...vazio, hostsDaPessoa })).toBe(true);
    expect(navegacaoLiberada(url('https://gov.br.atacante.com/x'), { ...vazio, hostsDaPessoa })).toBe(false);
  });

  it('site aprovado no painel passa no resto da conversa', () => {
    expect(navegacaoLiberada(url('https://nfe.fazenda.sp.gov.br/'), { ...vazio, hostsAprovados: ['nfe.fazenda.sp.gov.br'] })).toBe(true);
  });
});

describe('hostsMencionados', () => {
  it('acha domínios no meio da frase, sem www e em minúsculas', () => {
    expect([...hostsMencionados('Entra em WWW.Exemplo.com.br e depois https://app.x.io/painel')]).toEqual(['exemplo.com.br', 'app.x.io']);
  });

  it('localhost citado conta como site citado (app local de quem está testando)', () => {
    expect(hostCoberto('localhost', hostsMencionados('abre o localhost:5173 e preenche'))).toBe(true);
  });

  it('não confunde sufixo: "com.br" citado não libera qualquer .com.br', () => {
    expect(hostCoberto('banco.com.br', hostsMencionados('meu site é loja.com.br'))).toBe(false);
  });
});
