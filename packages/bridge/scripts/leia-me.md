# BrOWSER para Linux

Extensão para navegador (Chromium) + a ponte local, que é o programa que liga a extensão à
ferramenta de IA oficial que você já paga (Google AI Pro, ChatGPT ou Claude). **Sem chave de API.**

Neste pacote já vêm a ponte, a extensão e o instalador. Nada além do navegador e da
ferramenta de IA que você escolher.

## Antes de tudo: o diagnóstico

Diga se esta máquina tem o que o BrOWSER precisa, **antes** de instalar:

```bash
./bridge --doctor
```

Ele confere navegador, registro da ponte, ferramentas de IA instaladas e conectadas, e o que
falta. Sai com código 1 se ainda não dá para usar.

## Instalar

```bash
./install.sh
```

O script mostra o que vai fazer e pede confirmação. Ele:

1. copia a ponte e a extensão para `~/.local/share/BrOWSER/`;
2. registra a ponte nos navegadores Chromium instalados (também Brave, Edge, Chromium, Vivaldi
   e Opera) — só em `~/.config`, sem root e sem tocar em nada do sistema.

**Falta um passo, e é com você:** o Chrome não deixa um programa instalar extensão sem
confirmação. Depois de rodar o instalador:

1. **Reinicie o navegador** (o registro foi feito depois que ele abriu).
2. Abra `chrome://extensions` → ative **Modo do desenvolvedor** → **Carregar sem compactação** →
   escolha a pasta `~/.local/share/BrOWSER/extensao`.
3. Abra o painel do BrOWSER (ícone na barra) → **Assinaturas** → *Conectar*.

Confira o que foi registrado:

```bash
cat ~/.config/google-chrome/NativeMessagingHosts/com.browser.bridge.json
```

## Desinstalar

```bash
~/.local/share/BrOWSER/install.sh --desinstalar
```

Tira o registro de todos os navegadores, a integração com o Antigravity CLI, os dados locais
(`~/.config/browser-bridge`, onde ficam estado, log e cache de blueprints) e a pasta de instalação.
Depois, remova a extensão em `chrome://extensions` — esse passo não pode ser automatizado.

## Se algo não funcionar

O log fica em `~/.config/browser-bridge/bridge.log`. A extensão precisa estar carregada **e** o
navegador precisa ter sido reiniciado depois do `--install`; sem um dos dois, o painel avisa
"Ponte não conectada".

## Requisitos

- Navegador Chromium (Chrome, Edge, Brave, Vivaldi, Opera)
- A ferramenta de IA **da sua assinatura**, instalada e logada na sua máquina, com o login
  oficial dela. O BrOWSER não usa chave de API: são `agy` (Google AI Pro), `codex` (ChatGPT) ou
  `claude` (Claude Pro/Max), conforme o plano que você conectar no painel.
- Python 3 só é necessário para o login do Google AI Pro (`agy`), que exige um terminal
  interativo. ChatGPT e Claude não precisam.

Nenhuma dessas ferramentas é instalada por este pacote: cada uma tem o seu instalador oficial, e
escolher qual delas usar é seu. `./bridge --doctor` diz o que falta.

## macOS

Este release não traz binário para macOS. O código suporta, mas ainda não é publicado — se você
precisa, o caminho hoje é compilar a ponte a partir do código.
