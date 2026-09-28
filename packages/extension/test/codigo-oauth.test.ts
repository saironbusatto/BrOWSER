import { describe, expect, it } from 'bun:test';
import { codigoDaUrl, codigoNoTexto, pareceCodigo, redirectDe } from '../utils/codigo-oauth';

// URLs reais capturadas dos CLIs em 27/09/2026.
const AUTH_AGY =
  'https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=1071006060591-x.apps.googleusercontent.com&code_challenge=ZAV5XmCHkDu681NybKgR9A5Dza3cop_l1XagohAnuZU&code_challenge_method=S256&prompt=consent&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&state=WK9X_JJAnCQs-bvB_yV2uQ';
const AUTH_CLAUDE =
  'https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key&state=bTCGoiMQdakLXNARoAhiVz10-sxugyX920mdi2duNPM';
const AUTH_CODEX = 'https://auth.openai.com/codex/device';

describe('redirectDe: qual aba a extensão precisa vigiar', () => {
  it('agy: acha a página de callback do Google', () => {
    expect(redirectDe(AUTH_AGY)).toBe('https://antigravity.google/oauth-callback');
  });
  it('claude: acha a página de callback da Anthropic', () => {
    expect(redirectDe(AUTH_CLAUDE)).toBe('https://platform.claude.com/oauth/code/callback');
  });
  it('codex: device code puro, sem página de callback (a vigia não deve armar)', () => {
    expect(redirectDe(AUTH_CODEX)).toBeNull();
  });
  it('lixo não derruba', () => {
    expect(redirectDe('não é url')).toBeNull();
  });
});

describe('codigoDaUrl', () => {
  it('lê o code da query da página de callback', () => {
    expect(codigoDaUrl('https://antigravity.google/oauth-callback?code=4/0Aean-abc_DEF&state=xy')).toBe(
      '4/0Aean-abc_DEF',
    );
  });
  it('null quando não tem code', () => {
    expect(codigoDaUrl('https://antigravity.google/oauth-callback?state=xy')).toBeNull();
  });
});

describe('pareceCodigo', () => {
  it('aceita o formato dos codes de auth', () => {
    expect(pareceCodigo('4/0AeanSjYkR2pQ_long-code_aqui=')).toBe(true);
  });
  it('recusa frase, número curto e texto com espaço', () => {
    expect(pareceCodigo('Your authorization code')).toBe(false);
    expect(pareceCodigo('12345')).toBe(false);
    expect(pareceCodigo('abc def ghi jkl mno')).toBe(false);
  });
});

describe('codigoNoTexto', () => {
  it('acha o token longo no meio do texto da página', () => {
    expect(codigoNoTexto('Copie o código abaixo: 4/0AeanSjYkR2pQxyz para continuar')).toBe('4/0AeanSjYkR2pQxyz');
  });
  it('não inventa código a partir de frase', () => {
    expect(codigoNoTexto('Você já está conectado ao Google Cloud.')).toBeNull();
  });
});
