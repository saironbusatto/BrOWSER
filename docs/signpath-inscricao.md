# Inscrição no SignPath Foundation

Pendente: o pedido no formulário em <https://signpath.org/apply.html>. O repositório já cumpre
tudo que depende de código; o que falta é o preenchimento e a aprovação.

Verificado em 27/09/2026. Não reenvie sem conferir: o foundation diz que processa cada pedido
com o mínimo de trabalho manual possível e não discute política em recurso.

## O que o repositório já cumpre

| Exigência dos [termos](https://signpath.org/terms.html) | Onde |
|---|---|
| Licença OSI, sem duplo uso comercial | `LICENSE` = Apache-2.0 |
| Sem código proprietário | Dependências: Bun, zod, `@modelcontextprotocol/sdk`, WXT — todas OSS |
| Mantido | CI verde em Linux e Windows a cada PR |
| **Já lançado na forma que será assinada** | [v0.1.0](https://github.com/saironbusatto/BrOWSER/releases/tag/v0.1.0) com `BrOWSER-windows.zip` (38,7 MB) |
| Funcionalidade descrita na página de download | README → "Instalar (Windows)"; release com 1.632 chars de notas |
| Política de assinatura na home page | README → "Code signing policy / Política de assinatura de código" (PT e EN) |
| Desinstalação | `bridge --uninstall`, `uninstall.ps1`, entrada em Aplicativos instalados |
| Consentimento exibido na instalação | `setup.ps1` mostra o que vai fazer e pede confirmação; modal de Termos na extensão |
| Opção de desativar coleta | Interruptor para desligar o aprendizado de formulários |

## Campos do formulário — texto pronto

**URL do repositório**
`https://github.com/saironbusatto/BrOWSER`

**Página de download / release**
`https://github.com/saironbusatto/BrOWSER/releases/tag/v0.1.0`

**Política de assinatura de código**
`https://github.com/saironbusatto/BrOWSER#code-signing-policy--pol%C3%ADtica-de-assinatura-de-c%C3%B3digo`
(é a seção no README, que os termos aceitam como página do projeto — GitHub Pages é opcional)

**Política de privacidade**
`https://github.com/saironbusatto/BrOWSER/blob/main/docs/termos-e-privacidade.md`

**Plataforma do binário a assinar**
`BrOWSER-windows.zip` → `bridge.exe` (ponte nativa). Só Windows; Linux e extensão não são
assinados por este certificado.

**Descrição curta do projeto** (o campo de texto livre)
> BrOWSER is a free assistive Chrome extension that fills web forms on the user's behalf, driven
> by AI. The user describes what they want in their own words; an AI agent reads the form fields on
> the current page, maps the values, and fills them. It never submits: the final click is always the
> user's, which is a hard rule in the product and in its terms of use. The agent runs through the
> user's own existing subscription to Google, OpenAI or Anthropic — no API key ever passes through
> the software. A small native bridge exposes the browser to the agent as MCP tools.

**Por que os papéis da equipe** (os termos exigem Authors / Reviewers / Approvers)
> Single-maintainer project. saironbusatto is the sole committer, reviewer and approver, and is
> the owner of the source repository. All access to GitHub and SignPath is behind multi-factor
> authentication.

**Third-party services whose privacy policies affect users** (exigido mesmo para software livre)
> The extension sends page content to the AI provider the user explicitly connected (Google,
> OpenAI or Anthropic) and to no one else. There is no telemetry and no analytics. The bridge
> downloads a public index of site maps from the project's own GitHub repository, without sending
> any user data. The native messaging host is local only; the MCP server listens on 127.0.0.1.

## Riscos reais antes de enviar

**1. "No hacking tools" é a cláusula que pode derrubar.** Os termos proíbem software com
funcionalidade feita para "circumvent security measures of their execution environment". O bRowser
automatiza um navegador com agente: lê campos (inclusive senha) e escreve neles. Não é scanner de
vulnerabilidade, e o `dom-fallback` que força `element.click()` quando o clique por coordenada erra
contorna problema de layout, não medida de segurança — mas é leitura de risco, e o foundation não
discute política em recurso. É a parte que decide a resposta.

**2. Reputação verificável.** Os termos: *"For executable programs that may be downloaded and
executed based on our signature, we require a certain verifiable reputation."* Projeto novo, um
mantenedor, v0.1.0. O que ajuda: o repositório é público, histórico visível, releases com notas,
Issues/PRs abertos.

**3. Metadata PE — lacuna técnica conhecida, não bloqueia o pedido.** Os termos exigem que todo
binário assinado tenha *ProductName* e *ProductVersion* preenchidos. O `bun build --compile` não
escreve resource de PE, então o `bridge.exe` hoje sai sem isso. Não bloqueia a inscrição: quem
valida isso é a configuração de artefato do SignPath, configurada no onboarding. **Quando a
aprovação vier**, o conserto é injetar o resource depois do build — `rcedit` (módulo Node, roda em
Linux via wine). Não vale fazer antes: certificado e token não existem, e um passo de CI que
depende de wine e falharia é pior que a lacuna.

## Depois de aprovado

1. Gravar `SIGNPATH_API_TOKEN` como secret do repositório, e `SIGNPATH_ORG_ID` /
   `SIGNPATH_PROJECT_SLUG` como variáveis.
2. No `.github/workflows/release.yml`, entre o build e o empacotar: subir o `bridge.exe` com
   `actions/upload-artifact@v4` e `archive: false` (a SignPath exige que o artefato seja um
   artefato do GitHub Actions — é assim que ela prova a origem), depois
   `signpath/github-action-submit-signing-request@v3` com `wait-for-completion: true`.
3. O passo tem que ser condicional (`if: secrets.SIGNPATH_API_TOKEN != ''`) para o release
   continuar funcionando enquanto não há certificado.
4. Toda release exige aprovação manual de assinatura — os termos não deixam escolher.
