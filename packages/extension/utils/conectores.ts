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
// Já vem com o wrapper `files(...)`: embrulhar de novo gera `files(files(...))`, que o Drive
// rejeita com 400. É o valor cru do parâmetro `fields`.
const CAMPOS = 'files(id,name,mimeType,size,modifiedTime)';

// Documentos nativos (Docs/Sheets/Slides) não têm bytes próprios: `alt=media` é mecanismo de blob
// (a doc define blob como "raw binary file ... as opposed to a Google Workspace document"), então
// eles saem pelo /export. PDF é o único mimeType que a doc de download confirma em todas as
// amostras. Vids e Form não exportam: a doc diz que Vids devolve `fileNotExportable`.
const NATIVOS = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation)$/;
const PASTA = 'application/vnd.google-apps.folder';

export type ArquivoDrive = {
  id: string;
  nome: string;
  mimeType: string;
  tamanho: number;
  modificadoEm: string;
  pasta: boolean; // navegável, não baixável
  exportavel: boolean; // Google nativo: só sai por /export
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

// A credencial do Google que aceita a redirect chromiumapp.org é do tipo "Web", e essa é
// confidencial: o /token exige client_secret. Não existe "cliente público" no Google Cloud (existe
// no IBM/Keycloak), então o secret vai no bundle. O que de fato protege a posse do authorization
// code continua sendo o PKCE — o secret aqui é segunda camada, não a primeira.
const CLIENT_SECRET = import.meta.env.VITE_BROWSER_GOOGLE_SECRET ?? '';

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
  if (CLIENT_SECRET) corpo.set('client_secret', CLIENT_SECRET);
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
      ...(CLIENT_SECRET && { client_secret: CLIENT_SECRET }),
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

/**
 * Erro do Drive, com a mensagem que o Google mandou.
 *
 * A doc é explícita: em 400 o corpo traz "an error message stating what's wrong".
 * Sem ler o corpo, um `fields` malformado e um token expirado viram o mesmo
 * "Drive respondeu 400" — e ai não há como diagnosticar sem chutar o parâmetro.
 */
async function erroDrive(r: Response, acao: string): Promise<Error> {
  let detalhe = '';
  try {
    const corpo = (await r.json()) as { error?: { message?: string } };
    detalhe = corpo.error?.message ?? '';
  } catch {}
  return new Error(`Drive ${acao} (${r.status})${detalhe ? `: ${detalhe}` : ''}`);
}

/**
 * Lista o conteúdo de uma pasta. Sem `pastaId` é a raiz ("Meu Drive").
 *
 * Pastas vêm junto, marcadas, porque sem elas não há como navegar — esconder era o que deixava a
 * lista vazia. O `q` usa `'<id>' in parents`, que a doc descreve como o filtro de pasta.
 */
export async function listarDrive(token: string, pastaId?: string): Promise<ArquivoDrive[]> {
  const r = await fetch(
    `${RAIZ}/files?${new URLSearchParams({
      q: pastaId ? `'${pastaId}' in parents and trashed = false` : 'trashed = false',
      fields: CAMPOS,
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw await erroDrive(r, 'não listou');
  const { files = [] } = (await r.json()) as { files: Array<RawArquivo> };
  return files.map((f) => ({
    id: f.id,
    nome: f.name,
    mimeType: f.mimeType,
    tamanho: Number(f.size ?? 0),
    modificadoEm: f.modifiedTime ?? '',
    pasta: f.mimeType === PASTA,
    // O único byte que não sai nem por alt=media é o Workspace document; Forms/Vids não exportam
    // e aparecem com download quebrado, que é melhor que sumirem da lista.
    exportavel: NATIVOS.test(f.mimeType),
  }));
}

/** Mãe de um item, para montar o caminho de navegação (breadcrumb). */
export async function paisDo(token: string, arquivoId: string): Promise<{ id: string; nome: string }[]> {
  const r = await fetch(
    `${RAIZ}/files/${encodeURIComponent(arquivoId)}?${new URLSearchParams({
      fields: 'parents(id,name)',
      supportsAllDrives: 'true',
    })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw await erroDrive(r, 'não leu o caminho da pasta');
  const { parents = [] } = (await r.json()) as { parents: { id: string; name: string }[] };
  // A raiz ("Meu Drive") não tem pai; a ordem do Drive vai do pai para a raiz, então inverte.
  return parents
    .filter((p) => p.id !== 'root')
    .map((p) => ({ id: p.id, nome: p.name }))
    .reverse();
}

type RawArquivo = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string };

/**
 * Devolve um File pronto para processarArquivos(): o resto do pipeline não muda.
 *
 * Blob vai por alt=media. Documento nativo vai por /export em PDF — único mimeType que a doc de
 * download confirma, e o caminho que todos os exemplos da doc usam. O nome ganha .pdf, senão o
 * processarArquivos classifica por extensão e manda XML para o modelo.
 */
export async function baixarDrive(token: string, arquivo: ArquivoDrive): Promise<File> {
  const exportar = arquivo.exportavel;
  const url = exportar
    ? `${RAIZ}/files/${encodeURIComponent(arquivo.id)}/export?mimeType=application/pdf`
    : `${RAIZ}/files/${encodeURIComponent(arquivo.id)}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    // Vids e Forms devolvem fileNotExportable; a doc diz isso explicitamente.
    if (exportar && r.status === 403) {
      throw new Error(`"${arquivo.nome}" não pode ser exportado pelo Google (Forms e Vids não são exportáveis).`);
    }
    throw await erroDrive(r, `não baixou ${arquivo.nome}`);
  }
  const nome = exportar ? `${arquivo.nome.replace(/\.g\w+$/, '')}.pdf` : arquivo.nome;
  const tipo = exportar ? 'application/pdf' : arquivo.mimeType;
  return new File([await r.blob()], nome, { type: tipo });
}

export function formatarTamanho(bytes: number): string {
  if (!bytes) return '—';
  const un = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), un.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${un[i]}`;
}

// ---- Busca no conteúdo (tools buscar_no_drive / ler_arquivo_drive da ponte) ----
//
// A pergunta "qual o CPF de fulano no meu Drive" não se responde abrindo contrato por contrato: o
// Drive já indexou o texto de tudo. `fullText contains` busca no CONTEÚDO (e no nome), pela API,
// sem depender da interface — que é o que a skill do Drive ensina a fazer pela tela.

const LIMITE_TEXTO = 60_000;
// Nativos do Google saem por /export no formato que a IA lê melhor.
const EXPORTAR_COMO: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};
const TEXTO_PURO = /^(text\/|application\/(json|xml|csv))/;

export type ResultadoBusca = { id: string; nome: string; tipo: string; modificadoEm: string; link: string };

/** `q` do Drive. Aspas e barras escapadas: um nome como D'Ávila quebrava a consulta ou virava filtro. */
export function consultaConteudo(texto: string): string {
  const seguro = texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `fullText contains '${seguro}' and trashed = false`;
}

export async function buscarNoDrive(token: string, texto: string, limite = 20): Promise<ResultadoBusca[]> {
  const r = await fetch(
    `${RAIZ}/files?${new URLSearchParams({
      q: consultaConteudo(texto),
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
      pageSize: String(limite),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw await erroDrive(r, 'não buscou');
  const { files = [] } = (await r.json()) as {
    files: { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }[];
  };
  return files.map((f) => ({ id: f.id, nome: f.name, tipo: f.mimeType, modificadoEm: f.modifiedTime ?? '', link: f.webViewLink ?? '' }));
}

export type TextoDrive = { nome: string; tipo: string; link: string; texto?: string; truncado?: boolean; motivo?: string };

/**
 * Texto de um arquivo do Drive. PDF, Word e imagem não têm texto pela API (precisariam de
 * conversor): devolve o link, e a IA abre com `navegar` e lê pela página, como uma pessoa faria.
 */
export async function textoDoDrive(token: string, id: string): Promise<TextoDrive> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const base = `${RAIZ}/files/${encodeURIComponent(id)}`;
  const m = await fetch(`${base}?${new URLSearchParams({ fields: 'id,name,mimeType,webViewLink', supportsAllDrives: 'true' })}`, auth);
  if (!m.ok) throw await erroDrive(m, 'não achou o arquivo');
  const meta = (await m.json()) as { name: string; mimeType: string; webViewLink?: string };
  const info = { nome: meta.name, tipo: meta.mimeType, link: meta.webViewLink ?? '' };

  const formato = EXPORTAR_COMO[meta.mimeType];
  const url = formato
    ? `${base}/export?${new URLSearchParams({ mimeType: formato })}`
    : TEXTO_PURO.test(meta.mimeType)
      ? `${base}?alt=media`
      : '';
  if (!url) {
    return {
      ...info,
      motivo:
        'Este tipo de arquivo (PDF, Word, imagem) não vira texto pela API. Abra o link com navegar e leia com ler_pagina ou ver_tela.',
    };
  }
  const r = await fetch(url, auth);
  if (!r.ok) throw await erroDrive(r, `não leu ${meta.name}`);
  const texto = await r.text();
  return texto.length > LIMITE_TEXTO ? { ...info, texto: texto.slice(0, LIMITE_TEXTO), truncado: true } : { ...info, texto };
}
