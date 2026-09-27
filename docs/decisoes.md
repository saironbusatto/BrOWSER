# Decisões do projeto (27/09/2026)

Resultado da sessão de perguntas e respostas (grilling). Alterar só com uma nova decisão registrada aqui.

## Produto
- Extensão para a família Chromium (Chrome, Edge, Brave) que preenche formulários a partir de linguagem natural.
- Diferencial: preenchimento em lote + perfis reutilizáveis + várias IAs. **MVP: só entrada em linguagem natural**; perfis e CSV vêm depois.
- Sempre para antes de enviar e pede o "ok" do usuário.
- Público final: usuário leigo. **Primeira fase: uso pessoal**; a distribuição será decidida depois do teste de viabilidade.

## Acesso às IAs
- Pela assinatura, **sem chave de API e sem bypass de login**: extrair ou redirecionar o login da assinatura para fora dos apps oficiais viola os termos de uso e gerou banimentos de contas em 2026.
- O "cérebro" são as ferramentas de linha de comando oficiais, com login feito pelo próprio usuário. Prioridade: `agy` (Gemini / Antigravity CLI) → `codex` (OpenAI) → `claude` (Claude Code).
- A troca de ferramenta acontece só quando der erro de cota; a ordem pode ser mudada no painel. A IA seguinte relê a página e continua.

## Arquitetura
```
Painel lateral → Native Messaging → PONTE (executável único, Bun)
   PONTE ─ dispara agy/codex/claude em segundo plano
   IA ─ MCP HTTP localhost + token → PONTE → extensão → chrome.debugger (CDP)
                                                       ↘ content script (plano B)
```
- Tudo em TypeScript. Monorepo com Bun workspaces: `packages/extension` (WXT), `packages/bridge`, `packages/shared`, `fixtures/form`.

## Teste de viabilidade
- Branch `spike/viabilidade` → PR para a `develop`. Resultado em `docs/spike-resultado.md`.
- `bun run spike <agy|codex|claude>`, testando o `agy` primeiro.
- Formulário de teste: texto, e-mail, data, select, radio, checkbox, campo em iframe, campo React controlado.
- **Aprovado** = pelo menos 2 das 3 ferramentas preenchem tudo a partir de uma frase, param antes de enviar e usam a assinatura.

## Pendências para depois (deliberadas)
- ⚠️ **Permissões da IA**: no teste ela roda com as permissões padrão de cada ferramenta (risco de prompt injection chegar ao shell). **Restringir às ferramentas do MCP antes de distribuir.**
- Instalador para o leigo (no teste, um script registra a ponte no Chrome).
- Perfis, CSV/planilha, Firefox, revisão dos termos de uso antes de distribuir.
