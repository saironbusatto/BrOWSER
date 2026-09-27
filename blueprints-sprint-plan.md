# Plano de Sprints: Blueprints Comunitários & Memória Persistente de Sites (bRowser)

## Objetivo
Implementar o sistema de mapas de sites estruturais (Blueprints) que permite ao bRowser memorizar e reaproveitar instantaneamente a estrutura de páginas web conhecidas, compartilhando mapas anônimos via repositório comunitário no GitHub e mantendo cache local de alta performance.

---

## Sprint 1: Especificação do Schema & Blueprints Iniciais
- [x] Criar tipos `SiteBlueprint`, `CampoBlueprint` e `AcaoGatilho` em `packages/shared/src/blueprint.ts`.
- [x] Exportar novos tipos em `packages/shared/src/index.ts`.
- [x] Criar diretório `blueprints/` na raiz do repositório.
- [x] Criar blueprint inicial para `localhost-5173.json` (formulário fixture de teste).
- [x] Criar blueprint inicial para `gemini.google.com.json` (com gatilho de ferramentas `+` e caixa de prompt).

## Sprint 2: Leitor Híbrido de Blueprints (Cache Local + GitHub CDN)
- [x] Implementar `packages/bridge/src/blueprints.ts` com busca em 2 níveis:
  - Cache local em `~/.config/browser-bridge/blueprints/{dominio}.json`
  - Fetch remoto no GitHub Raw (`raw.githubusercontent.com/.../blueprints/{dominio}.json`)
- [x] Expor ferramenta MCP `consultar_blueprint` em `packages/bridge/src/main.ts`.
- [x] Injetar blueprint conhecido automaticamente nas instruções do modelo em `packages/bridge/src/ias.ts`.

## Sprint 3: Sanitizador Automático de Blueprints
- [x] Criar gerador `gerarBlueprintAnonimizado()` em `packages/bridge/src/blueprints.ts`.
- [x] Garantir bloqueio total de PII: extração estrita de seletores, papéis ARIA e nomes de campos, sem valores digitados nem query strings de sessão.
- [x] Gravar blueprint no cache local após cada execução bem-sucedida.

## Sprint 4: Testes, Validação & Build
- [x] Criar testes unitários em `packages/bridge/test/blueprints.test.ts` (leitura, sanitização, cache).
- [x] Rodar bateria de testes com `bun test`.
- [x] Recompilar extensão (`bun run --cwd packages/extension build`) e bridge.
- [x] Atualizar branches `feat/painel-e2e`, `develop` e `main`.
