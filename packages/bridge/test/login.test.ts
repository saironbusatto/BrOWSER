import { describe, expect, it } from 'bun:test';
import { extrairLogin, iniciarLogin, responderCodigo, fimDoLogin, comandoLogout } from '../src/assinaturas';

// Saída real capturada de `codex login --device-auth`, com os ANSI que ele emite (27/09/2026).
const SAIDA_CODEX = `
\x1b[90mWelcome to Codex [v\x1b[0m0.156.1\x1b[90m]\x1b[0m
\x1b[90mOpenAI's command-line coding agent\x1b[0m

Follow these steps to sign in with ChatGPT using device code authorization:

1. Open this link in your browser and sign in to your account
   \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m

2. Enter this one-time code \x1b[90m(expires in 15 minutes)\x1b[0m
   \x1b[90m1R1Y-NFXEE\x1b[0m
`;

// Saída real de `claude auth login --claudeai` rodado sem TTY (27/09/2026).
const SAIDA_CLAUDE = `Opening browser to sign in…
If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&state=bTCGoiMQdakLXNARoAhiVz10-sxugyX920mdi2duNPM
Paste code here if prompted > `;

// Saída real de `agy -p "ok"` sem TTY, e no **stderr** (27/09/2026). O Google OAuth do agy é o
// device-code manual: URL + "paste the authorization code" + 60s de janela.
const SAIDA_AGY = `Authentication required. Please visit the URL to log in:
  https://accounts.google.com/o/oauth2/auth?access_type=offline&client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com&code_challenge=ZAV5XmCHkDu681NybKgR9A5Dza3cop_l1XagohAnuZU&code_challenge_method=S256&prompt=consent&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&state=WK9X_JJAnCQs-bvB_yV2uQ

Waiting for authentication (timeout 60s)...
Or, paste the authorization code here and press Enter:

Error: authentication interrupted.
error: authentication failed or timed out
`;

describe('extrairLogin sobre saída real dos CLIs', () => {
  it('codex: tira a URL e o código de 4/5 chars, sem ANSI vazando', () => {
    const d = extrairLogin('codex', SAIDA_CODEX)!;
    expect(d).not.toBeNull();
    expect(d.url).toBe('https://auth.openai.com/codex/device');
    expect(d.codigo).toBe('1R1Y-NFXEE');
    expect(d.pedeCodigo).toBe(false);
    expect(d.expiraEmSegundos).toBe(900);
  });

  it('claude: tira a URL do "visit:" e pede o código colado, sem confundir com o do codex', () => {
    const d = extrairLogin('claude', SAIDA_CLAUDE)!;
    expect(d.url).toContain('claude.com/cai/oauth/authorize');
    expect(d.pedeCodigo).toBe(true);
    // O code_challenge tem _ e o state tem minúsculas: nada deve virar "código".
    expect(d.codigo).toBeUndefined();
  });

  it('agy: tira a URL do Google OAuth e avisa que a janela é de 60s', () => {
    const d = extrairLogin('agy', SAIDA_AGY)!;
    expect(d).not.toBeNull();
    expect(d.url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?/);
    // O state tem _ e o code_challenge tem _l1: nada pode virar "código" de device code.
    expect(d.codigo).toBeUndefined();
    expect(d.pedeCodigo).toBe(true);
    expect(d.expiraEmSegundos).toBe(60);
  });

  it('não devolve nada enquanto a URL ainda não apareceu no output', () => {
    expect(extrairLogin('codex', 'Welcome to Codex\n')).toBeNull();
    expect(extrairLogin('agy', 'Fetching available models...\n')).toBeNull();
  });
});

describe('Ciclo de vida do login', () => {
  it('responder código sem login em andamento não explode', () => {
    expect(responderCodigo('claude', 'ABCD-1234')).toContain('não há login esperando código');
  });

  it('fimDoLogin resolve como falho quando não há processo', async () => {
    expect((await fimDoLogin('codex')).ok).toBe(false);
  });
});

describe('comandoLogout: como sair de cada conta', () => {
  it('codex e claude têm comando de logout próprio', () => {
    expect(comandoLogout('codex')).toEqual(['codex', 'logout']);
    expect(comandoLogout('claude')).toEqual(['claude', 'auth', 'logout']);
  });

  it('agy não tem flag de logout: limpa a chave do keyring', () => {
    // ponytail: se um dia o agy ganhar `agy logout`, é só trocar esta linha.
    expect(comandoLogout('agy')).toEqual([
      'secret-tool', 'clear', 'service', 'gemini', 'username', 'antigravity',
    ]);
  });

  it('toda IA tem um caminho de logout (nenhum fica sem saída)', () => {
    for (const ia of ['agy', 'codex', 'claude'] as const) {
      expect(comandoLogout(ia)).not.toBeNull();
    }
  });

  it('as duas CLIs com logout próprio estão no PATH', () => {
    expect(Bun.which('codex')).not.toBeNull();
    expect(Bun.which('claude')).not.toBeNull();
  });

  it('o logout do agy depende de secret-tool, que é só Unix', () => {
    // Não exige que exista: no Windows a ponte cai no erro "não está instalado", que é o
    // comportamento honesto. Aqui só fixamos que essa é a dependência, para o dia em que o agy
    // ganhar logout próprio a gente saiba o que trocar.
    expect(comandoLogout('agy')![0]).toBe('secret-tool');
  });
});
