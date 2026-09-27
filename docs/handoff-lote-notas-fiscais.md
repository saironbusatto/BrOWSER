# Handoff: lote de notas fiscais em PDF → preenchimento de formulário em lote

Sessão de pesquisa (27/09/2026). Nenhuma linha de código foi alterada — este doc registra um
plano de 3 passos que ainda não começou. Contexto de produto que já existe: `decisoes.md`.
Plano multiagente que já existe e **cobre parte deste trabalho**: `../multi-agent-pipeline.md`
(Fase 3 = processador de documentos, ainda `[ ]`).

## O caso de uso que define tudo

Uma pessoa joga **N notas fiscais em PDF** (N = 1 ou 100) no painel lateral do bRowser, e ele
lê cada uma e preenche o formulário do site N vezes.

Três consequências que invalidam o plano original ("colocar o Docling dentro"):

1. **O custo é multiplicado por N.** 100 docs ≠ 1 doc.
2. **O gargalo não é o parser.** Nenhum repositório de PDF resolve o gargalo real (passo 3).
3. **Metade do problema já está pronta.** Ver "O que já existe".

## O que já existe (não refazer)

| Peça | Onde | Estado |
|---|---|---|
| Tools MCP: `ler_campos` / `preencher` / `clicar` | `packages/bridge/src/main.ts:199-225` | pronto |
| Blueprints: cache local + CDN GitHub, sanitizado, sem PII | `packages/bridge/src/blueprints.ts` | Sprints 1–4 ✅ |
| Namespace semântico de campos | `packages/shared/src/blueprint.ts:8-17` | ✅ |
| Extractor XML de NF-e por regex (bate exato) | `packages/bridge/src/documentos.ts:47-108` | ✅ + teste |
| Anexos chegam na IA via pasta `anexos/` | `packages/bridge/src/ias.ts:98-107` | ✅ (commit `5c5c39b`) |

O `CampoBlueprint.tipoEsperado` já é literalmente o namespace de NF-e:
`'cnpj' | 'cpf' | 'email' | 'telefone' | 'data' | 'texto' | 'moeda'`, e `idSemantico`
já exemplifica `'cnpj_emitente' | 'razao_social'`. **O lado `camposDoForm → site` está pronto.
Falta o lado `nota → campos` e a junção.**

## O bloqueio real (por isso o passo 3 é o mais importante)

`packages/bridge/src/main.ts:119-123`:

```ts
// ponytail: um pedido por vez (uma aba, um formulário); fila de pedidos se o lote (Q1) precisar.
if (ocupado) return { ok: false, texto: 'Já existe um pedido em andamento.' };
```

**100 notas ⇒ 99 pedidos rejeitados.** O comentário `ponytail:` já admite a dívida. Além disso,
`ias.ts:63` corta o prompt em 60 000 caracteres, e o commit `5c5c39b` põe os PDFs em `anexos/`
para a IA ler via `Read(./anexos/**)` — ou seja, hoje 100 notas viram **100 tool-calls de Read da
IA**. Isso é lento, caro e não-determinístico, e é o oposto do que uma NF-e pede (extração
determinística de campos).

## Passo 1 — `documentos.ts`: PDF → registro, determinístico

Sem LLM, sem VLM. NF-e é emitida por sistema SEFAZ: **tem camada de texto quase sempre**.
OCR é caso minoria.

- `pdftotext -layout` primeiro — **já instalado** neste box (`/usr/bin/pdftotext`).
  100 arquivos ≈ 10s total, zero install.
- Heurística de fallback: se render < ~200 chars/página, é escaneado → cai pra `pymupdf4llm`
  (1 arquivo `.py` de ~15 linhas em `bridge/scripts/`, `Bun.spawn`, sem GPU, 0.17s/pg).
- Em cima do texto extraído, **reusar o `extrairXml` de hoje** com regex por rótulo
  (`CNPJ:`, `Valor Total`, `Vencimento`).
- Saída: `{cnpj, valorTotal, dataVenc, ...}` por nota. Cache por hash do arquivo em
  `~/.config/browser-bridge/`.
- Smoke check: 1 NF-e real do usuário + `test_documentos.py`.

`docling` entra **aqui**, como mais um `else if` de fallback, se algum dia um PDF furar o
pymupdf4llm. Não antes. Razão: 100 docs × inferência de VLM = GPU + minutos, versus 10s de
`pdftotext` — e o Docling *descarta* fórmulas em vez de inventar, o que é um feature para
fidelidade e um bug para um form que precisa do número.

**Pre-condição a verificar no passo 1:** Python 3.14.7 neste box. Confirmar se `torch`/`pymupdf`
têm wheel para 3.14 antes de assumir o fallback. Ambiente atual: `docling` ❌, `pymupdf` ❌,
`pdftotext` ✅, `python3` 3.14.7 ✅.

## Passo 2 — preencher por `idSemantico`, não por `ref`

`preencher` hoje só aceita `ref: number` (= `backendDOMNodeId` do CDP, **efêmero**). Para 100
notas num form só:

- `ler_campos` **uma vez** → resolver `idSemantico → ref` num mapa (o blueprint já sabe casar
  por `rotulo`/`seletorAcessivel`).
- Preencher pelo semântico. Re-ler só se o site recarregar o DOM.
- Efeito: a IA é chamada ~2 vezes no total (confirmar o mapeamento + tratar erro), não 100.

## Passo 3 — o loop de lote em `main.ts`

Trocar o `if (ocupado) return erro` por uma fila. O ciclo `preencher → submeter → form limpo →
próxima nota` reaproveita o `gatilhos?` do `SiteBlueprint` (que já abre gaveta/menu).
Manter o `clicar` de submit sempre atrás de confirmação explícita do usuário — regra já
registrada em `decisoes.md` ("sempre para antes de enviar").

## Ordem de ataque

**3 → 2 → 1.** O passo 1 é o menor (~40 linhas) e é o menos bloqueante. O passo 3 é o que faz
o caso de uso existir. Começar pelo 1 entrega um parser bonito que ainda rejeita 99 das 100 notas.

## Suggested skills pro próximo agente

- `ponytail` — o passo 1 é candidato a over-engineering; manter no nível `full`.
- `tdd` ou `test-driven-development` — o projeto já tem `bun test` com `documentos.test.ts`
  como referência de estilo; o passo 1 mexe num arquivo com teste existente.
- `brainstorming` — se o passo 3 (fila, concorrência, semântica de erro) for gerar design novo
  em vez de implementar o que está escrito acima.
- `codebase-design` — útil na fronteira do passo 2: decidir se `idSemantico` vira chave de
  preenchimento na tool MCP `preencher` ou fica no prompt como instrução.
