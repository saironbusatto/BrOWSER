<p align="center"><img src="design/icone-512.png" width="96" alt="BrOWSER"></p>

<h1 align="center">BrOWSER</h1>

<p align="center">Extensão para Chrome, Edge e Brave que preenche formulários da página aberta a partir de um pedido em linguagem natural, usando a <b>assinatura de IA que você já paga</b> (Google AI Pro, ChatGPT ou Claude) — sem chave de API.</p>

---

## Como funciona

```
Painel lateral (extensão) ──► Ponte local (bridge) ──► Ferramenta oficial da IA (agy / codex / claude)
                                   ▲                              │
                                   └──── ferramentas MCP ◄────────┘
                                         (ler campos, preencher, clicar)
```

- A **extensão** lê e preenche a página (via `chrome.debugger`, com plano B pelo DOM).
- A **ponte** é um programa pequeno instalado no seu computador que liga a extensão à ferramenta oficial da IA, logada com a sua assinatura. Uma extensão sozinha não pode executar programas — por isso a ponte existe.
- A IA **nunca envia o formulário**: ela preenche e para; quem clica em Enviar é você.

## Instalar (Windows)

1. Baixe o pacote `BrOWSER-windows` em [Releases](https://github.com/saironbusatto/BrOWSER/releases) e extraia.
2. Rode `powershell -ExecutionPolicy Bypass -File setup.ps1`. Ele mostra tudo o que vai fazer e pede confirmação; não precisa de administrador.
3. Instale a extensão (pacote `BrOWSER-extensao` do mesmo release → `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação).
4. No painel do BrOWSER: **Assinaturas → Conectar**.

## Desinstalar

- **Windows:** Configurações → Aplicativos instalados → BrOWSER → Desinstalar (ou rode `uninstall.ps1`). Remove a ponte, os registros nos navegadores, a integração com o Antigravity CLI e os dados locais.
- **Linux/macOS:** `bridge --uninstall`.
- Depois, remova a extensão do navegador.

## Privacidade

- O BrOWSER **não envia dados para os autores do projeto**. Não há servidor nosso.
- O conteúdo da página vai para a IA que **você** conectou (Google, OpenAI ou Anthropic) **somente quando você faz um pedido** no painel.
- A ponte baixa do GitHub um índice público de mapas de sites e, se houver, o mapa do site aberto — sem enviar dados seus.
- O "aprendizado de formulários" guarda **só a estrutura** das páginas (rótulos e botões, sem valores e com dados pessoais mascarados), no seu computador. Pode ser desligado em Assinaturas.
- Política completa: [docs/termos-e-privacidade.md](docs/termos-e-privacidade.md).

## Desenvolvimento

```bash
bun install
bun run typecheck && bun test
bun run --cwd packages/extension build          # extensão em packages/extension/.output/chrome-mv3
bun run --cwd packages/bridge install-host       # registra a ponte (Linux/macOS, a partir do código)
bun run spike <agy|codex|claude>                 # teste de ponta a ponta no formulário de exemplo
```

Decisões do projeto: [docs/decisoes.md](docs/decisoes.md).

## Code signing policy / Política de assinatura de código

> Status: **solicitação à SignPath Foundation em preparação** — os binários atuais ainda não são assinados.

**EN.** Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org) (once approved). Only artifacts built by this repository's GitHub Actions workflows from this repository's source code are signed.

- Committers and reviewers: [saironbusatto](https://github.com/saironbusatto)
- Approvers: [saironbusatto](https://github.com/saironbusatto)
- All team members use multi-factor authentication on GitHub and SignPath.

**Privacy policy.** This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. Page content is sent only to the AI provider the user connected (Google, OpenAI or Anthropic), and only when the user submits a request in the side panel. The bridge downloads a public index of site maps from this GitHub repository without sending user data.

**PT.** Assinatura de código gratuita fornecida pela SignPath.io, com certificado da SignPath Foundation (após aprovação). Só são assinados os artefatos compilados pelos workflows deste repositório a partir deste código-fonte. Papéis e privacidade como acima.

## Licença

[Apache-2.0](LICENSE)
