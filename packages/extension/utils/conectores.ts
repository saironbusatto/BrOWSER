// Conectores do Google.
//
// O token do plano (Gemini/Antigravity, no keyring do SO) NÃO alcança o Drive: é outro client,
// outra sessão, e a extensão nunca o vê (docs/decisoes.md). Então o conector faz OAuth próprio
// via chrome.identity — o browser guarda e renova o token, e nada de refresh token passa por
// storage nosso. Mantém a promessa de "zero PII" da tela de planos.

export type Conector = {
  id: string;
  nome: string;
  descricao: string;
  escopo: string;
  provedor: 'google';
};

// Só Drive, de propósito: é o único que alimenta o pipeline de anexos que já existe
// (protocol.ts: ArquivoAnexo). Gmail/Calendar entram quando houver tela que os use.
export const CONECTORES: Conector[] = [
  {
    id: 'drive',
    nome: 'Google Drive',
    descricao: 'Anexar PDF, XML, CSV e imagens direto do seu Drive',
    escopo: 'https://www.googleapis.com/auth/drive.readonly',
    provedor: 'google',
  },
];

export function conector(id: string): Conector | undefined {
  return CONECTORES.find((c) => c.id === id);
}

const RAIZ = 'https://www.googleapis.com/drive/v3';
const CAMPOS = 'files(id,name,mimeType,size,modifiedTime)';

// Documentos nativos do Google (Docs/Sheets/Slides) só saem pelo /export, que é outro endpoint e
// outro formato. Filtra fora: o resto do fluxo de anexos (PDF/XML/CSV/imagem) já cobre o caso.
const NATIVOS = /^application\/vnd\.google-apps\./;
const PASTA = 'application/vnd.google-apps.folder';

export type ArquivoDrive = {
  id: string;
  nome: string;
  mimeType: string;
  tamanho: number;
  modificadoEm: string;
};

/** Sem client_id no manifest o OAuth do Google não abre: a UI mostra o conector desabilitado. */
export function conectorConfigurado(): boolean {
  const oauth2 = (chrome.runtime.getManifest() as { oauth2?: { client_id?: string } }).oauth2;
  return Boolean(oauth2?.client_id);
}

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const ENDPOINT_TOKEN = 'https://oauth2.googleapis.com/token';
const CHAVE_REFRESH = 'conector:refresh';

// ponytail: sem access_type=offline o Google dá token de 1 hora e obriga a autorizar de novo a
// cada hora. O refresh token fica em chrome.storage.local (nesta máquina, nunca sai no pedido) e
// some no desconectar. Se um dia der problema de segurança aqui, trocar por access_type=online
// custa uma linha e devolve o "nada guardado" ao custo de reautorização.
const ACCESS_TYPE = 'offline';

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** SHA-256 do verifier, em base64url — o code_challenge S256 que o Google exige. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64(new Uint8Array(digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function paramDaUrl(url: string, nome: string): string | null {
  // O code volta na query; o token, no fragment. Os dois vêm no redirect do chromiumapp.org.
  const m = new RegExp(`[?&#]${nome}=([^&#]+)`).exec(url);
  return m ? decodeURIComponent(m[1]!) : null;
}

export async function trocarCodePorToken(code: string, verifier: string): Promise<{ token: string; refresh: string }> {
  const corpo = new URLSearchParams({
    client_id: chrome.runtime.getManifest().oauth2!.client_id,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: chrome.identity.getRedirectURL(),
  });
  const r = await fetch(ENDPOINT_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corpo });
  const dados = (await r.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!r.ok || !dados.access_token) throw new Error(dados.error_description ?? `Google respondeu ${r.status}.`);
  return { token: dados.access_token, refresh: dados.refresh_token ?? '' };
}

async function renovar(refresh: string): Promise<string> {
  const r = await fetch(ENDPOINT_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: chrome.runtime.getManifest().oauth2!.client_id,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const dados = (await r.json()) as { access_token?: string; error_description?: string };
  if (!r.ok || !dados.access_token) throw new Error(dados.error_description ?? `Google respondeu ${r.status}.`);
  return dados.access_token;
}

/**
 * Access token do Drive.
 *
 * Não usa chrome.identity.getAuthToken: o Google descontinuou o fluxo em extensões (custom URI
 * scheme dá "400: unsupported_response_type") e o Brave ainda patcha a API para falhar. O
 * launchWebAuthFlow funciona em Chrome, Edge, Brave e Arc, que é o que importa aqui.
 */
export async function tokenGoogle(escopos: string[], interactive: boolean): Promise<string> {
  const guardado = await chrome.storage.local.get(CHAVE_REFRESH);
  const refresh = guardado[CHAVE_REFRESH] as string | undefined;
  if (refresh) {
    // access_token dura 1 hora; renova é rede pura e não mostra nada na tela.
    try {
      return await renovar(refresh);
    } catch {
      await chrome.storage.local.remove(CHAVE_REFRESH); // refresh revogado:Authorize de novo
    }
  }
  if (!interactive) throw new Error('Google Drive não está conectado.');

  const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
  const url = `${AUTH}?${new URLSearchParams({
    client_id: chrome.runtime.getManifest().oauth2!.client_id,
    redirect_uri: chrome.identity.getRedirectURL(),
    response_type: 'code',
    scope: escopos.join(' '),
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: 'S256',
    access_type: ACCESS_TYPE,
    prompt: 'consent',
  })}`;

  const voltei = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!voltei) throw new Error('Autorização cancelada.');
  if (new URL(voltei).searchParams.get('error')) {
    throw new Error(new URL(voltei).searchParams.get('error_description') ?? 'O Google recusou a autorização.');
  }
  const code = paramDaUrl(voltei, 'code');
  if (!code) throw new Error('O Google não devolveu o código de autorização.');

  const { token, refresh: novoRefresh } = await trocarCodePorToken(code, verifier);
  if (novoRefresh) await chrome.storage.local.set({ [CHAVE_REFRESH]: novoRefresh });
  return token;
}

export async function desconectarGoogle(): Promise<void> {
  await chrome.storage.local.remove(CHAVE_REFRESH);
}

export async function listarDrive(token: string, pastaId?: string): Promise<ArquivoDrive[]> {
  const r = await fetch(
    `${RAIZ}/files?${new URLSearchParams({
      q: pastaId ? `'${pastaId}' in parents and trashed = false` : 'trashed = false',
      fields: `files(${CAMPOS})`,
      orderBy: 'modifiedTime desc',
      pageSize: '50',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`Drive respondeu ${r.status}.`);
  const { files = [] } = (await r.json()) as { files: Array<RawArquivo> };
  return files
    .filter((f) => f.mimeType !== PASTA && !NATIVOS.test(f.mimeType))
    .map((f) => ({
      id: f.id,
      nome: f.name,
      mimeType: f.mimeType,
      tamanho: Number(f.size ?? 0),
      modificadoEm: f.modifiedTime ?? '',
    }));
}

type RawArquivo = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string };

/** Devolve um File pronto para processarArquivos(): o resto do pipeline não muda. */
export async function baixarDrive(token: string, arquivo: ArquivoDrive): Promise<File> {
  const r = await fetch(`${RAIZ}/files/${encodeURIComponent(arquivo.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Drive respondeu ${r.status} ao baixar ${arquivo.nome}.`);
  return new File([await r.blob()], arquivo.nome, { type: arquivo.mimeType });
}

export function formatarTamanho(bytes: number): string {
  if (!bytes) return '—';
  const un = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), un.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${un[i]}`;
}
