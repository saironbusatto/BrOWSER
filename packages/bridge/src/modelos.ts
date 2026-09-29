// Catálogo de modelos por CLI.
//
// Por que três caminhos: cada CLI descobre modelos de um jeito, e só um funciona.
//
//   agy     `agy models` lista ao vivo, sempre o que a conta tem hoje. Vence a lista do repo.
//   claude  os aliases (haiku/sonnet/opus/fable/best) são contrato público e flutuam sozinhos
//           para o modelo mais novo da família. A lista de alias não envelhece.
//   codex   NÃO tem comando de listar (openai/codex#23279, aberto desde jan/2026). Só a lista
//           remota do repo, e ela é a única que precisa de refresh.
//
// A lista é conveniência, não portão: um id fora dela é repassado ao CLI, que decide. Se a lista
// estiver velha, o máximo que acontece é o modelo novo não aparecer no <select>.
import type { Ia, ModeloInfo } from '@browser/shared';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { comandoExecutavel } from './caminhos';

const CACHE = join(homedir(), '.config', 'browser-bridge', 'modelos.json');
// Fora de blueprints/ de propósito: lá, todo .json da pasta tem que estar no index.json
// (é a lista de domínios buscados) e um catálogo de modelo apareceria como domínio.
const GITHUB_RAW_MODELOS = 'https://raw.githubusercontent.com/saironbusatto/BrOWSER/main/modelos/modelos.json';
const TIMEOUT_MS = 4_000;

type Arquivo = {
  atualizadoEm?: string;
  padrao?: Partial<Record<Ia, string>>;
  modelos?: Partial<Record<Ia, { itens?: ModeloInfo[] }>>;
};

let cache: Arquivo | null = null;
let cacheEmMs = 0;
const TTL_MS = 6 * 60 * 60 * 1000; // 6h: o refresh do repo não muda mais que isso

/** Fallback embutido, usado quando não há cache e o GitHub não respondeu. */
const EMBUTIDO: Arquivo = {
  padrao: { agy: 'gemini-3.8-flash-low', claude: 'haiku', codex: 'gpt-5.1-codex' },
  modelos: {
    agy: { itens: [
      { id: 'gemini-3.8-flash-low', nome: 'Gemini 3.8 Flash (Low)', rapido: true },
      { id: 'gemini-3.1-pro-high', nome: 'Gemini 3.1 Pro (High)', forte: true },
      { id: 'claude-sonnet-4-6', nome: 'Claude Sonnet 4.6 (Thinking)', forte: true },
      { id: 'claude-opus-4-6-thinking', nome: 'Claude Opus 4.6 (Thinking)', forte: true },
    ] },
    claude: { itens: [
      { id: 'haiku', nome: 'Haiku — mais novo', rapido: true },
      { id: 'sonnet', nome: 'Sonnet — mais novo' },
      { id: 'opus', nome: 'Opus — mais novo', forte: true },
      { id: 'fable', nome: 'Fable 5 — mais pesado', forte: true },
      { id: 'best', nome: 'Melhor disponível na conta', forte: true },
    ] },
    codex: { itens: [{ id: 'gpt-5.1-codex', nome: 'GPT-5.1 Codex' }] },
  },
};

function lerCache(): Arquivo | null {
  try {
    if (!existsSync(CACHE)) return null;
    return JSON.parse(readFileSync(CACHE, 'utf8')) as Arquivo;
  } catch {
    return null;
  }
}

function gravarCache(a: Arquivo): void {
  try {
    writeFileSync(CACHE, JSON.stringify(a, null, 2), { mode: 0o600 });
  } catch {}
}

/** `agy models` em tempo de execução: o que a conta tem hoje, não o que o repo dizia ontem. */
function aoVivoAgy(): ModeloInfo[] | undefined {
  if (!Bun.which('agy')) return undefined;
  const r = Bun.spawnSync(comandoExecutavel(['agy', 'models']), { timeout: 8_000 });
  if (r.exitCode !== 0) return undefined;
  const itens: ModeloInfo[] = [];
  for (const linha of r.stdout.toString().split('\n')) {
    // "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)" — o id na frente, separado por espaço/tab.
    const m = linha.match(/^(\S+)\s{1,}(.+)$/);
    if (!m || m[1] === 'Fetching') continue;
    itens.push({ id: m[1], nome: m[2].trim() });
  }
  return itens.length ? itens : undefined;
}

/**
 * Modelos disponíveis de uma IA, na ordem: CLI ao vivo, cache local, GitHub, embutido.
 * A chamada é barata e não deve segurar o pedido: qualquer falha cai no próximo da fila.
 */
export async function listarModelos(ia: Ia): Promise<ModeloInfo[]> {
  const agora = Date.now();
  if (!cache || agora - cacheEmMs > TTL_MS) {
    cache = lerCache() ?? cache ?? EMBUTIDO;
    cacheEmMs = agora;
    // Só busca da rede se o cache veio do disco (ou não existe): o embutido é o último recurso.
    try {
      const res = await fetch(GITHUB_RAW_MODELOS, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) {
        const remoto = (await res.json()) as Arquivo;
        if (remoto?.modelos) {
          cache = remoto;
          gravarCache(remoto);
        }
      }
    } catch {}
  }
  if (ia === 'agy') {
    const vivo = aoVivoAgy();
    if (vivo) return vivo;
  }
  return cache.modelos?.[ia]?.itens ?? [];
}

/** Modelo padrão da IA: rápido, porque preencher formulário é trabalho mecânico. */
export function modeloPadrao(ia: Ia): string {
  return cache?.padrao?.[ia] ?? EMBUTIDO.padrao?.[ia] ?? '';
}
