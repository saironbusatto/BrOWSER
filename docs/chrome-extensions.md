# Extensões Chrome — Guia de Referência (Manifest V3)

Fonte oficial (sempre a verdade final): https://developer.chrome.com/docs/extensions

| Tópico | Link |
|---|---|
| Começar (Hello World) | https://developer.chrome.com/docs/extensions/get-started |
| Conceitos de desenvolvimento | https://developer.chrome.com/docs/extensions/develop |
| Referência do manifest | https://developer.chrome.com/docs/extensions/reference/manifest |
| Referência de APIs (`chrome.*`) | https://developer.chrome.com/docs/extensions/reference/api |
| Permissões | https://developer.chrome.com/docs/extensions/reference/permissions-list |
| Exemplos oficiais | https://github.com/GoogleChrome/chrome-extensions-samples |
| Publicar na Chrome Web Store | https://developer.chrome.com/docs/webstore |
| Migração MV2 → MV3 | https://developer.chrome.com/docs/extensions/develop/migrate |

> MV2 está descontinuado. Tudo abaixo é **Manifest V3**.

---

## 1. Anatomia de uma extensão

```
minha-extensao/
├── manifest.json      # obrigatório — descreve tudo
├── background.js      # service worker (eventos, sem DOM)
├── content.js         # roda dentro das páginas visitadas
├── popup.html/.js     # UI ao clicar no ícone
├── options.html/.js   # página de configurações
└── icons/16.png 48.png 128.png
```

| Peça | Onde roda | Acesso a DOM da página | Acesso a `chrome.*` |
|---|---|---|---|
| Service worker (`background`) | Contexto isolado, sem janela | Não | Todas (conforme permissões) |
| Content script | Dentro da aba, "mundo isolado" | Sim | Limitado (`runtime`, `storage`, `i18n`, `dom`) |
| Popup / Options / Side panel | Página da extensão | Só da própria página | Todas |

**Service worker é efêmero**: o Chrome o encerra após ~30s ocioso. Não guarde estado em variáveis globais — use `chrome.storage`. Registre listeners no topo do arquivo (síncrono), nunca dentro de callbacks/`await`.

---

## 2. manifest.json mínimo

```json
{
  "manifest_version": 3,
  "name": "bRowser",
  "version": "0.1.0",
  "description": "Descrição curta",
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://*/*"], "js": ["content.js"], "run_at": "document_idle" }
  ],
  "permissions": ["storage"],
  "host_permissions": []
}
```

Chaves úteis: `options_page` / `options_ui`, `side_panel`, `commands` (atalhos), `web_accessible_resources`, `content_security_policy`, `minimum_chrome_version`, `default_locale` (+ pasta `_locales/`).

---

## 3. Permissões

- `permissions`: APIs (`storage`, `tabs`, `scripting`, `alarms`, `contextMenus`, `notifications`, `sidePanel`, `declarativeNetRequest`...).
- `host_permissions`: sites (`"https://exemplo.com/*"`, `"<all_urls>"`).
- `optional_permissions` / `optional_host_permissions`: pedidas em tempo de execução via `chrome.permissions.request()`.
- **`activeTab`**: acesso temporário à aba atual quando o usuário clica na extensão — sem alerta assustador na instalação. Prefira isso a `<all_urls>`.

Regra: peça o mínimo. Permissões amplas atrasam a revisão na Web Store.

---

## 4. Comunicação entre partes

```js
// content.js → service worker
const resp = await chrome.runtime.sendMessage({ type: 'PING' });

// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') sendResponse({ ok: true, tab: sender.tab?.id });
  // return true;  // só se for responder de forma assíncrona
});

// service worker/popup → content script de uma aba
await chrome.tabs.sendMessage(tabId, { type: 'DO_THING' });
```

Conexões longas: `chrome.runtime.connect()` / `onConnect` (ports).
Página web ↔ extensão: `externally_connectable` no manifest, ou `window.postMessage` via content script.

---

## 5. APIs mais usadas

| API | Para quê |
|---|---|
| `chrome.storage.local/sync/session` | Persistir dados (sync = entre dispositivos, ~100KB) |
| `chrome.tabs` | Consultar/criar/atualizar abas |
| `chrome.scripting` | Injetar JS/CSS programaticamente (`executeScript`, `insertCSS`) |
| `chrome.action` | Ícone, badge, popup |
| `chrome.alarms` | Timers (substitui `setInterval` no service worker) |
| `chrome.contextMenus` | Menu do botão direito |
| `chrome.declarativeNetRequest` | Bloquear/modificar requisições (substitui `webRequest` blocking) |
| `chrome.sidePanel` | Painel lateral |
| `chrome.offscreen` | Documento oculto com DOM (áudio, clipboard, DOMParser) |
| `chrome.runtime` | Mensagens, `onInstalled`, `getURL` |
| `chrome.commands` | Atalhos de teclado |
| `chrome.i18n` | Tradução |

Todas as APIs MV3 retornam Promise (dá pra usar `await`).

---

## 6. Restrições de segurança do MV3

- **Sem código remoto**: todo JS deve estar no pacote. Nada de `<script src="https://cdn...">` ou `eval()`.
- CSP padrão bloqueia inline scripts em páginas da extensão — use arquivos `.js` separados.
- Content scripts: trate o DOM da página como não confiável (nada de `innerHTML` com dados da página).
- Valide mensagens recebidas (`sender.id`, `sender.origin`).

---

## 7. Rodar e debugar localmente

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione a pasta com o `manifest.json`
4. Após editar: botão ⟳ na extensão (content scripts exigem recarregar a aba também)

Debug:
- Service worker: link "service worker" no card da extensão → DevTools
- Popup: botão direito no popup → Inspecionar
- Content script: DevTools da página → aba Console, selecione o contexto da extensão no dropdown
- Erros: botão "Erros" no card em `chrome://extensions`

---

## 8. Publicação

1. Conta de desenvolvedor na Chrome Web Store (taxa única de US$5)
2. Compactar a pasta em `.zip` (manifest na raiz)
3. Dashboard: https://chrome.google.com/webstore/devconsole
4. Preencher listagem, ícones, screenshots, **política de privacidade** (se lidar com dados do usuário) e justificar cada permissão
5. Revisão: horas a alguns dias

---

## 9. Compatibilidade futura (Firefox/Edge)

Edge usa o mesmo formato. Firefox suporta MV3 com namespace `browser.*` (também aceita `chrome.*`). Para multi-navegador: https://github.com/mozilla/webextension-polyfill ou frameworks como WXT (https://wxt.dev) / Plasmo.
