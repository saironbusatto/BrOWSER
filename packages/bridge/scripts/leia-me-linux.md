# BrOWSER para Linux

Extensão para navegador (Chromium) + a ponte local, que é o programa que liga a extensão à
ferramenta de IA oficial que você já paga (Google AI Pro, ChatGPT ou Claude). Sem chave de API.

Este pacote tem o executável da ponte. A extensão vem em arquivo separado (`BrOWSER-extensao.zip`).

## Instalar

**1. Registre a ponte no navegador** (ela precisa ser registrada antes de a extensão falar com ela):

```bash
chmod +x bridge
./bridge --install
```

O comando escreve o registro de *Native Messaging* em `~/.config/google-chrome/NativeMessagingHosts/`
(também Brave, Edge, Chromium, Vivaldi e Opera, se estiverem instalados). **Reinicie o navegador**
depois disso.

Confira onde foi registrado:

```bash
cat ~/.config/google-chrome/NativeMessagingHosts/com.browser.bridge.json
```

**2. Carregue a extensão.** Descompacte o `BrOWSER-extensao.zip` e abra
`chrome://extensions` → ative **Modo do desenvolvedor** → **Carregar sem compactação** → escolha a
pasta que você descompactou.

**3. Conecte seu plano.** Abra o painel do BrOWSER (ícone na barra) → **Assinaturas** → *Conectar*.

## Desinstalar

```bash
./bridge --uninstall
```

Tira o registro de todos os navegadores, a integração com o Antigravity CLI e os dados locais
(`~/.config/browser-bridge`, onde ficam estado, log e cache de blueprints). Depois, remova a
extensão em `chrome://extensions`.

## Se algo não funcionar

O log fica em `~/.config/browser-bridge/bridge.log`. A extensão precisa estar carregada **e** o
navegador precisa ter sido reiniciado depois do `--install`; sem um dos dois, o painel avisa
"Ponte não conectada".

## Requisitos

- Navegador Chromium (Chrome, Edge, Brave, Vivaldi, Opera)
- A ferramenta de IA instalada e logada **na sua máquina**, com o login oficial dela:
  o BrOWSER usa a sua assinatura, não uma chave de API. Os comandos são `agy`, `codex` ou
  `claude`, conforme o plano que você conectar.
- Python 3 só é necessário para o login do Google AI Pro (`agy`), que exige um terminal
  interativo. As outras duas ferramentas não precisam.
