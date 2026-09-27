# browser-harness × Playwright × Selenium

Objetivo: um "RPA inteligente". O LLM lê a página (textos, rótulos, campos), decide o que cada campo pede e preenche um de cada vez, conferindo o resultado de cada ação.

Este documento descreve as tecnologias usadas hoje pela skill **browser-harness** e as que eu (Claude) usaria sem ela, e compara as duas abordagens com a **extensão Chrome** que vamos construir.

---

## 1. Como um LLM preenche um formulário (vale para qualquer ferramenta)

```
1. Observar  → extrair a árvore de acessibilidade (AX tree) ou o DOM filtrado: rótulo, tipo, obrigatório, valor atual
2. Mapear    → LLM casa "informação do usuário" ↔ "campo" pelo rótulo/placeholder/contexto
3. Agir      → foco + digitar / selecionar / clicar
4. Verificar → reler o valor do campo e as mensagens de validação
5. Repetir   → até enviar (enviar só com confirmação do usuário)
```

A AX tree é a melhor entrada para o LLM porque traz o **papel** (textbox, combobox, checkbox) e o **nome acessível** (o rótulo que um humano lê), com muito menos ruído que o HTML bruto.

---

## 2. browser-harness: o que usa hoje

Versão inspecionada: `browser-harness 0.1.13` (instalada via `uv tool`, Python ≥ 3.11, cerca de 6,4 mil linhas).

| Camada | Tecnologia | Papel |
|---|---|---|
| Protocolo | **Chrome DevTools Protocol (CDP)** | Controle direto do Chrome: DOM, Input, Accessibility, Page, Network |
| Cliente CDP | `cdp-use` 1.4.5 | Bindings Python tipados do CDP |
| Transporte | `websockets` 15 | Conexão WebSocket com o endpoint de debug do Chrome |
| HTTP | `fetch-use`, `httpx` | Requisições HTTP e resolução do endpoint `/json/version` → WebSocket |
| Imagem | `pillow` | Screenshots, gravações e vídeo |
| Processo | **Daemon** + IPC por socket AF_UNIX (chmod 600; TCP loopback no Windows) | Mantém uma única conexão CDP viva entre chamadas do CLI |
| Interface do agente | CLI `browser-harness <<'PY' ... PY` | O LLM escreve Python que roda com os helpers já importados |
| Opcional | `mcp` (extra) | Expõe as funções como servidor MCP |
| Nuvem | Browser Use Cloud | Chrome remoto isolado (paralelismo, IP limpo, anti-captcha); cobrado |
| Telemetria | PostHog (opt-out) | Desligar com `BH_TELEMETRY=0` |

**Helpers:** `new_tab`, `goto_url`, `page_info`, `click_at_xy`, `type_text`, `fill_input`, `press_key`, `scroll`, `capture_screenshot`, `wait_for_load`, `wait_for_element`, `wait_for_network_idle`, `js`, `upload_file`, `iframe_target`, `cdp(...)` (CDP bruto).

**Como encontra e aciona elementos:**
1. `cdp("Accessibility.getFullAXTree")` → filtra por papel e nome
2. `DOM.getBoxModel(backendNodeId)` → centro da caixa do elemento
3. `click_at_xy(x, y)` → eventos de mouse **reais** (`Input.dispatchMouseEvent`), que atravessam iframes, shadow DOM e cross-origin no compositor
4. Verifica com `js(...)` ou `page_info()`

**Diferencial:** ele se conecta ao **Chrome que você já está usando**, com seus cookies, logins e SSO. Não há perfil novo nem navegador "de teste".

---

## 3. Sem a skill: o que eu usaria normalmente

### Playwright (1ª escolha)
| Item | Detalhe |
|---|---|
| Protocolo | CDP no Chromium; protocolos próprios (patches) no Firefox e no WebKit |
| Linguagens | TS/JS, Python, Java, .NET |
| Localizadores | `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`, que são **semânticos** e ideais para LLM |
| Auto-wait | Espera o elemento ficar visível, estável e habilitado antes de agir |
| Snapshot para o LLM | `locator.ariaSnapshot()` |
| Extras | Tracing, vídeo, interceptação de rede, contextos isolados, `storageState` (reutilizar login) |
| MCP | `@playwright/mcp` expõe tudo isso como ferramentas para o LLM. Alternativa parecida: `chrome-devtools-mcp` (Google, baseado em Puppeteer/CDP) |
| Limitação | Por padrão abre um navegador **próprio**; para usar o seu, é preciso `connectOverCDP` ou um perfil persistente |

### Selenium (legado / corporativo)
| Item | Detalhe |
|---|---|
| Protocolo | **WebDriver** (padrão W3C) via ChromeDriver/GeckoDriver; WebDriver BiDi em evolução |
| Linguagens | Java, Python, C#, JS, Ruby |
| Localizadores | CSS, XPath, id, name; nada semântico nativo |
| Espera | Manual (`WebDriverWait` + `expected_conditions`) |
| Pontos fortes | Padrão W3C, Selenium Grid, maior ecossistema legado e compatibilidade com mais navegadores |
| Limitação | Mais lento (HTTP por comando), mais instável sem esperas explícitas, pior para iframes e shadow DOM |

---

## 4. Comparativo direto

| Critério | browser-harness | Playwright | Selenium |
|---|---|---|---|
| Protocolo | CDP bruto | CDP + protocolos próprios | WebDriver (W3C) / BiDi |
| Navegadores | Chrome/Chromium | Chromium, Firefox, WebKit | Todos os principais |
| Usa o Chrome já logado do usuário | **Sim (padrão)** | Possível (`connectOverCDP`) | Difícil (perfil + driver) |
| Localização pensada para LLM | AX tree + coordenadas | `getByRole` / `getByLabel` + aria snapshot | CSS/XPath |
| Auto-wait | Helpers (`wait_for_*`) | **Nativo e robusto** | Manual |
| Eventos de entrada | Reais (CDP Input) | Reais (CDP Input) | Via driver |
| iframes / shadow / cross-origin | Coordenadas atravessam tudo | Bom (`frameLocator`, piercing) | Trabalhoso |
| Estado entre passos do agente | Daemon persistente | Sessão no processo | Sessão no driver |
| Gravação / trace | Gravação + vídeo | Trace viewer + vídeo | Plugins de terceiros |
| Detecção como bot | Baixa (Chrome real do usuário) | Média (headless detectável) | Alta (`navigator.webdriver`) |
| Paralelismo | Cloud (pago) | Nativo (contextos) | Grid |
| Maturidade / comunidade | Nova (0.1.x) | Alta | Muito alta |
| Melhor para | Agente LLM no navegador real do usuário | Automação e testes robustos, agentes | Suíte legada, grid multi-navegador |

---

## 5. E a nossa extensão Chrome?

As três ferramentas controlam o navegador **de fora** (um processo externo). Uma extensão roda **dentro** do navegador, e isso muda o desenho:

| Necessidade | Dentro da extensão (MV3) |
|---|---|
| Ler campos e rótulos | Content script: DOM + `element.labels`, `aria-*`, `placeholder`; ou `chrome.debugger` → `Accessibility.getFullAXTree` |
| Preencher | Content script definindo `value` + disparando eventos `input`/`change` (frameworks como React exigem o setter nativo); ou `chrome.debugger` → `Input.insertText` (entrada "real") |
| Clicar | `element.click()` ou `chrome.debugger` → `Input.dispatchMouseEvent` |
| Cérebro (LLM) | O service worker chama a API do LLM (a chave **nunca** fica no pacote; usar um backend próprio ou a chave informada pelo usuário) |
| Iframes | `all_frames: true` + `host_permissions` |
| UI | Side panel com os dados que o usuário quer preencher e o log de cada passo |

**Recomendação inicial:** usar content script para ler e preencher (é o mais simples e sem aviso ao usuário), e `chrome.debugger` (CDP, a mesma técnica do browser-harness) só como alternativa para sites que ignoram eventos sintéticos. `chrome.debugger` mostra a barra "extensão está depurando este navegador" e pesa na revisão da Web Store.

Playwright continua útil no repositório para os **testes E2E da própria extensão** (ele carrega extensões unpacked via `launchPersistentContext` com `--load-extension`).

---

## 6. Referências
- browser-harness: https://github.com/browser-use/browser-harness
- CDP: https://chromedevtools.github.io/devtools-protocol/
- Playwright: https://playwright.dev · Extensões: https://playwright.dev/docs/chrome-extensions
- Selenium: https://www.selenium.dev/documentation/
- WebDriver BiDi: https://w3c.github.io/webdriver-bidi/
- `chrome.debugger`: https://developer.chrome.com/docs/extensions/reference/api/debugger
