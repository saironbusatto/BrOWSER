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

export async function tokenGoogle(escopos: string[], interactive: boolean): Promise<string> {
  // O Chrome puro devolve a string; o wrapper `browser` do WXT embrulha em { token }. Aceita os
  // dois porque a extensão muda de runtime sem o código mudar (bug silencioso se só um passar).
  const r: unknown = await chrome.identity.getAuthToken({ scopes: escopos, interactive });
  const token = typeof r === 'string' ? r : (r as { token?: string } | undefined)?.token;
  if (!token) throw new Error('Google não devolveu token.');
  return token;
}

export async function desconectarGoogle(token: string): Promise<void> {
  await chrome.identity.removeCachedAuthToken({ token });
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
