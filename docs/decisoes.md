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

## Decisões tomadas na revisão de segurança (28/09/2026)

Estas cinco não são mais intenção: estão no código e em teste.

1. **Envio final é bloqueio de código, não de prompt.** A ponte classifica o elemento pelo nome
   acessível e pelo papel, e recusa o clique antes de ele chegar à página (`src/envio.ts`). A
   navegação intermediária ("Próximo", "Avançar", "Continuar") fica livre — engessá-la mataria o
   produto. Quem fecha a garantia continua sendo a pessoa, clicando na página.
2. **Senha nunca é lida.** O campo é identificado e continua preenchível, mas o valor não sai:
   fora da leitura do CDP, fora do plano B, fora do retorno do `preencher` e fora de qualquer mapa.
3. **Blueprint comunitário é conteúdo de terceiros.** Todo arquivo remoto passa por
   `validarBlueprint` (forma, tamanho, domínio) e é neutralizado antes de entrar no prompt, com o
   bloco marcado como dado, não instrução. Sem isso, um PR no repositório virava injeção num agente
   que tem `clicar` e `preencher`.
4. **Botão Parar.** Derruba o processo da IA na hora, desliga a matriz e libera a aba.
5. **`/control` é inalcançável no binário de release.** A marca é resolvida em tempo de compilação
   (`src/build.ts`) e **sem fallback de ambiente** — com fallback, `BROWSE_DEV=1` religaria a rota
   no executável do usuário. `scripts/check-control.ts` prova por comportamento: release responde
   404 e dev responde, ambos com `BROWSE_DEV=1` no ambiente. O CI roda os dois lados.

## Pendências para depois (deliberadas)
- Perfis reutilizáveis, CSV/planilha, Firefox, artefato de macOS no release.
- A classificação de envio é por nome: um botão final rotulado "Continuar" num wizard ainda passa.
  Fechar isso de vez exige sinal estrutural do próprio site, não heurística do lado do BrOWSER.
- **Termos de uso e privacidade**: consolidados em [`docs/termos-e-privacidade.md`](termos-e-privacidade.md) com garantia de Zero PII (LGPD/GDPR), BYOS sem chave de API, parada obrigatória pré-submissão e isenção de responsabilidade.

