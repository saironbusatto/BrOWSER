# Resultado do teste de viabilidade (27/09/2026)

**Veredito: ✅ APROVADO (2 de 3).** O Gemini e o OpenAI, as prioridades 1 e 2, preenchem o formulário completo **pela assinatura, sem chave de API**, via MCP da ponte + extensão. O Claude falhou por uma causa de ambiente ainda não identificada (ver pendências).

## Quadro

| IA | Ferramenta (versão) | Conta | Resultado | Tempo |
|---|---|---|---|---|
| Gemini 3.8 Flash | `agy` 1.2.12 | Google AI Pro | ✅ 9/9 campos, não enviou, pediu confirmação | 65 s |
| OpenAI | `codex` 0.156.1 | ChatGPT | ✅ 9/9 | 23 s |
| Claude | `claude` 2.1.283 | Pro/Max | ❌ 2 campos; depois o Chrome recusa o `chrome.debugger` | 22 s |

Formulário de teste: `fixtures/form` (texto, e-mail, data, select, radio, checkbox, CEP em iframe, telefone em React controlado).
Como rodar: `bun run spike <agy|codex|claude>`, com a extensão carregada no Chrome.

## O que foi validado
- **Arquitetura da Q12 funciona:** o Chrome inicia a ponte via Native Messaging, e a ponte oferece o MCP HTTP em 127.0.0.1 com token (requisição sem token recebe 401).
- **Assinatura sem chave de API:** o runner remove as chaves `*_API_KEY` do ambiente antes de chamar as ferramentas.
- **`chrome.debugger` como padrão (Q13):** digitação real (`Input.insertText`) funciona com React controlado; iframe do mesmo site ok; data e select via setter + eventos.
- **Parada antes de enviar (Q5):** as duas IAs aprovadas não clicaram em "Enviar" e pediram confirmação.

## Descobertas
- **`agy` libera mais modelos:** a assinatura Google AI Pro também dá acesso, dentro do `agy`, a Claude Sonnet/Opus 4.6 e GPT-OSS 120B. Isso pode simplificar o rodízio (Q8).
- **O `agy` não aceita MCP por sessão:** o runner usa `agy mcp add` (config global) a cada execução.
- **O `codex` exige aprovar as ferramentas MCP:** `mcp_servers.browser.default_tools_approval_mode="approve"`. Aprova só as nossas ferramentas; o shell continua bloqueado.
- **O `claude` chama ferramentas em paralelo:** os comandos agora são executados em fila na extensão (foco + digitação de dois campos ao mesmo tempo se misturavam).
- **Campo de data:** a árvore de acessibilidade expõe as peças internas do navegador (Dia/Mês/Ano); elas são escondidas e o input entra como um campo único.
- **Recarga remota da extensão:** o comando `recarregar` no `/control` evita clicar ⟳ a cada build.

## Pendências
1. **Falha do Claude (aberta).** Por volta da 3ª chamada, todo comando CDP na aba retorna *"Cannot access a chrome-extension:// URL of different extension"*, e só com o processo `claude` rodando. Hipóteses descartadas, com teste:
   - integração Claude in Chrome (`--no-chrome` + extensão desativada);
   - menu de autofill do Bitwarden (`webNavigation.getAllFrames` no erro mostra só os frames do formulário);
   - chamadas em paralelo (a mesma rajada sem IA funciona);
   - aba errada (a aba alvo no erro é a correta).
   Próximo passo: investigar junto com o plano B por content script, que não depende do `chrome.debugger`.
2. **Plano B por content script (Q13):** ainda não implementado.
3. **Iframes de outro domínio (OOPIF):** exigem uma sessão CDP própria; ainda não suportado.
4. **Registro da ponte:** só Linux/Chrome (`bun run --cwd packages/bridge install-host`).
5. ⚠️ **Permissões da IA** (Q14): o `agy` roda com `--dangerously-skip-permissions`. Restringir (`--sandbox`) antes de distribuir.
